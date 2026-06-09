/**
 * Service IMAP — CRUD chiffré des comptes IMAP utilisés pour la collecte des réponses
 * (module R-01 Inbox CRM). Symétrique au service SMTP : credentials AES-256-GCM,
 * jamais retournés en clair par les endpoints.
 */
import { prisma } from "@crm/db";
import { encryptOrNull } from "@/lib/crypto";

export interface ImapConfigInput {
  label: string;
  host: string;
  port: number;
  login: string;
  password: string;
  isActive?: boolean;
}

export interface ImapConfigUpdateInput {
  label?: string;
  host?: string;
  port?: number;
  login?: string;
  password?: string | null;
  isActive?: boolean;
}

const PUBLIC_SELECT = {
  id: true,
  label: true,
  host: true,
  port: true,
  isActive: true,
  lastSyncAt: true,
  createdAt: true,
  oauthProvider: true,
  oauthMailbox: true,
} as const;

export async function listImapConfigs() {
  return prisma.imapConfig.findMany({
    select: PUBLIC_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function getImapConfig(id: string) {
  return prisma.imapConfig.findUnique({ where: { id }, select: PUBLIC_SELECT });
}

export async function createImapConfig(input: ImapConfigInput) {
  return prisma.imapConfig.create({
    data: {
      label: input.label,
      host: input.host,
      port: input.port,
      loginEnc: encryptOrNull(input.login)!,
      passwordEnc: encryptOrNull(input.password)!,
      isActive: input.isActive ?? true,
    },
    select: PUBLIC_SELECT,
  });
}

export async function updateImapConfig(id: string, input: ImapConfigUpdateInput) {
  const data: Record<string, unknown> = {
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.host !== undefined ? { host: input.host } : {}),
    ...(input.port !== undefined ? { port: input.port } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
  if (input.login !== undefined) {
    data.loginEnc = encryptOrNull(input.login);
  }
  if (input.password !== undefined && input.password !== null && input.password !== "") {
    data.passwordEnc = encryptOrNull(input.password);
  }
  return prisma.imapConfig.update({
    where: { id },
    data,
    select: PUBLIC_SELECT,
  });
}

export async function deleteImapConfig(id: string) {
  await prisma.imapConfig.delete({ where: { id } });
}

/**
 * Test minimaliste de connexion IMAP (login uniquement).
 * Utilise imapflow côté server-only ; importé dynamiquement pour éviter
 * d'embarquer la lib dans des bundles client.
 */
export async function testImapConnection(input: {
  host: string;
  port: number;
  login: string;
  password: string;
}): Promise<{ ok: boolean; message: string }> {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: input.host,
    port: input.port,
    secure: input.port === 993,
    auth: { user: input.login, pass: input.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true, message: "Connexion IMAP réussie" };
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    throw new Error(describeImapError(e));
  }
}

/**
 * Construit un message d'erreur exploitable à partir d'une erreur imapflow.
 * imapflow met souvent `.message` à vide sur un échec d'auth ; l'info utile est
 * alors dans `.authenticationFailed`, `.responseText`, `.response` ou `.code`
 * (codes socket Node : ENOTFOUND / ECONNREFUSED / ETIMEDOUT…).
 */
function describeImapError(e: unknown): string {
  const err = (e ?? {}) as {
    message?: string;
    code?: string;
    authenticationFailed?: boolean;
    responseText?: string;
    response?: string;
    serverResponseCode?: string;
  };
  const serverText = (err.responseText || err.response || "").trim();

  if (err.authenticationFailed || err.serverResponseCode === "AUTHENTICATIONFAILED") {
    return `Authentification refusée par le serveur IMAP — identifiant ou mot de passe incorrect${
      serverText ? ` (réponse serveur : ${serverText})` : ""
    }.`;
  }

  switch (err.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Hôte IMAP introuvable — vérifiez l'adresse du serveur.";
    case "ECONNREFUSED":
      return "Connexion refusée — vérifiez l'hôte et le port.";
    case "ETIMEDOUT":
    case "ETIMEOUT":
      return "Délai de connexion dépassé — hôte/port injoignable ou bloqué par un pare-feu.";
    case "ECONNRESET":
      return "Connexion réinitialisée par le serveur (port ou mode TLS incorrect ?).";
  }

  const raw = (err.message || "").trim();
  if (/certificate|self.signed|altname|depth zero/i.test(raw)) {
    return `Erreur de certificat TLS : ${raw}`;
  }

  return raw || serverText || err.code || "Erreur IMAP inconnue (connexion échouée sans détail du serveur).";
}

export type ImapSearchHit = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
};

/**
 * Recherche live sur le serveur IMAP (commande SEARCH TEXT).
 * Retourne les en-têtes des messages correspondants sans les importer en base.
 */
export async function searchImapMailbox(query: string, limit = 30): Promise<{
  ok: boolean;
  message: string;
  hits: ImapSearchHit[];
}> {
  const q = query.trim();
  if (!q) return { ok: false, message: "Requête vide", hits: [] };

  const cfg = await prisma.imapConfig.findFirst({
    where: { isActive: true },
    orderBy: { lastSyncAt: "desc" },
  });
  if (!cfg) return { ok: false, message: "Aucun compte IMAP actif configuré", hits: [] };

  const { decryptOrNull } = await import("@/lib/crypto");
  const login = decryptOrNull(cfg.loginEnc);
  const password = decryptOrNull(cfg.passwordEnc);
  if (!login || !password) {
    return { ok: false, message: "Identifiants IMAP illisibles", hits: [] };
  }

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: login, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ text: q }, { uid: true });
      const slice = (uids as number[]).slice(-limit).reverse();
      const hits: ImapSearchHit[] = [];
      if (slice.length > 0) {
        for await (const msg of client.fetch(slice, { uid: true, envelope: true }, { uid: true })) {
          hits.push({
            uid: msg.uid,
            subject: msg.envelope?.subject ?? null,
            from: msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? null,
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          });
        }
      }
      return {
        ok: true,
        message: `${hits.length} message(s) trouvé(s) sur le serveur IMAP`,
        hits,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return { ok: false, message: describeImapError(e), hits: [] };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

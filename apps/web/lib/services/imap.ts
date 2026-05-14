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
    throw e instanceof Error ? e : new Error(String(e));
  }
}

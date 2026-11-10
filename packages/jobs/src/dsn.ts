/**
 * M-11 — Détection et analyse des rapports de non-remise (DSN, « bounces »).
 *
 * Fonctions PURES (aucun accès base, aucune variable d'environnement) : testées sur des
 * exemples de DSN réels (Postfix, Gmail, Exchange Online, Exim, qmail) dans test/dsn.test.ts.
 *
 * Un message est un rapport de non-remise si :
 *  - il est en `multipart/report; report-type=delivery-status` (RFC 3464), ou
 *  - il porte l'en-tête Exchange `X-MS-Exchange-Message-Is-Ndr`, ou
 *  - l'expéditeur est un robot de messagerie (MAILER-DAEMON, postmaster…) ET l'objet ou le corps
 *    ressemble à une non-remise (objet typique ou code d'état SMTP), ou
 *  - il porte `X-Failed-Recipients` (Exim) avec un objet de non-remise.
 *
 * Classement (règle documentée dans docs/BACKLOG.md, M-11) :
 *  - code d'état étendu 5.x.x (`Status:` ou dans le texte) → rejet DÉFINITIF (hard),
 *    sauf 5.2.2 (boîte pleine) et 5.7.x (refus de politique / réputation de l'expéditeur :
 *    l'adresse n'est pas en cause) → temporaire (soft) ;
 *  - 4.x.x, `Action: delayed` → temporaire (soft) ;
 *  - sans code étendu : `Action: failed` ou code SMTP 5xx → hard (552 → soft) ; 4xx → soft ;
 *  - rien d'exploitable → soft (prudence : on ne met jamais en liste noire sans preuve) ;
 *  - 2.x.x (`Action: delivered/relayed`) → DSN de succès : ce n'est ni une réponse ni un bounce.
 */
import type { ParsedMail } from "mailparser";

export type BounceType = "hard" | "soft";

export interface DsnReport {
  /** null = DSN de succès (remis / relayé) : à ignorer, mais ce n'est PAS une réponse. */
  bounceType: BounceType | null;
  /** Code d'état étendu RFC 3463 (ex. "5.1.1"), si présent. */
  status: string | null;
  /** Champ Action du rapport (failed, delayed, delivered…). */
  action: string | null;
  /** Code de réponse SMTP (ex. "550"), si présent. */
  smtpCode: string | null;
  /** Diagnostic du serveur distant, adresses email masquées (pas de PII en clair), tronqué. */
  diagnostic: string | null;
  /** Destinataire en échec — PII : sert uniquement au calcul de l'emailHash, jamais loggué ni stocké. */
  recipient: string | null;
  /** Message-ID du message d'origine (les identifiants du CRM `crm-…` en premier). */
  originalMessageIds: string[];
  /** Explication lisible de la règle appliquée. */
  reason: string;
}

const DAEMON_LOCAL_PART = /^(mailer-daemon|mail-daemon|mailerdaemon|postmaster|mail-delivery-system|maildelivery|mail-delivery|mdaemon|bounces?|nobody-bounce)$/i;

const BOUNCE_SUBJECT =
  /(undeliver|undelivered|delivery status notification|delivery (?:has )?failed|delivery failure|returned mail|failure notice|mail delivery failed|returning message to sender|could not be delivered|message not delivered|delayed mail|warning: could not send|non remis|non distribu|échec de (?:la )?(?:remise|distribution)|message non délivré|remise différée)/i;

const REPORT_PARTS = new Set([
  "message/delivery-status",
  "message/global-delivery-status",
  "message/rfc822",
  "message/global",
  "text/rfc822-headers",
  "message/global-headers",
]);

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function headerText(parsed: ParsedMail, name: string): string | null {
  const v = parsed.headers.get(name);
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
  return String(v);
}

function contentType(parsed: ParsedMail): { value: string; reportType: string } {
  const ct = parsed.headers.get("content-type") as { value?: string; params?: Record<string, string> } | string | undefined;
  if (!ct) return { value: "", reportType: "" };
  if (typeof ct === "string") {
    const m = ct.match(/report-type\s*=\s*"?([\w-]+)/i);
    return { value: ct.split(";")[0]!.trim().toLowerCase(), reportType: (m?.[1] ?? "").toLowerCase() };
  }
  return { value: (ct.value ?? "").toLowerCase(), reportType: (ct.params?.["report-type"] ?? "").toLowerCase() };
}

function senderLocalPart(parsed: ParsedMail): string {
  const addr = parsed.from?.value?.[0]?.address ?? "";
  return addr.split("@")[0] ?? "";
}

/** Texte à analyser : corps texte, parties de rapport (delivery-status, en-têtes d'origine) et source brute. */
function haystack(parsed: ParsedMail, raw?: Buffer | string): string {
  const parts: string[] = [];
  if (parsed.text) parts.push(parsed.text);
  for (const a of parsed.attachments ?? []) {
    if (REPORT_PARTS.has((a.contentType ?? "").toLowerCase())) parts.push(a.content.toString("utf8"));
  }
  if (raw) parts.push(typeof raw === "string" ? raw : raw.toString("utf8"));
  return parts.join("\n");
}

/** Déplie les en-têtes multi-lignes (RFC 5322) pour que les regex ligne à ligne fonctionnent. */
function unfold(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
}

export function maskEmails(s: string): string {
  return s.replace(EMAIL_RE, "<adresse masquée>");
}

function normalizeId(raw: string): string {
  return raw.trim().replace(/^<|>$/g, "");
}

/** Les DSN de succès ou d'échec : est-ce un rapport de non-remise ? */
export function isDeliveryReport(parsed: ParsedMail, raw?: Buffer | string): boolean {
  const ct = contentType(parsed);
  if (ct.value === "multipart/report" && ct.reportType.includes("delivery-status")) return true;
  if (parsed.headers.has("x-ms-exchange-message-is-ndr")) return true;
  const subject = parsed.subject ?? "";
  const subjectBounce = BOUNCE_SUBJECT.test(subject);
  if (DAEMON_LOCAL_PART.test(senderLocalPart(parsed))) {
    if (subjectBounce) return true;
    const text = unfold(haystack(parsed, raw));
    if (/^\s*(Status|Action|Final-Recipient)\s*:/im.test(text)) return true;
    if (/\b[45]\d\d[ -]+[45]\.\d{1,3}\.\d{1,3}\b/.test(text)) return true;
  }
  if (subjectBounce && parsed.headers.has("x-failed-recipients")) return true;
  return false;
}

/** Classe un code d'état étendu RFC 3463 (ex. "5.1.1"). */
export function classifyStatus(status: string): { type: BounceType | null; reason: string } {
  const [klass, subject] = status.split(".");
  if (klass === "2") return { type: null, reason: `Statut ${status} : message remis (DSN de succès)` };
  if (klass === "4") return { type: "soft", reason: `Statut ${status} : échec temporaire` };
  if (klass === "5") {
    if (status.startsWith("5.2.2")) return { type: "soft", reason: `Statut ${status} : boîte pleine, traitée comme temporaire` };
    if (subject === "7") return { type: "soft", reason: `Statut ${status} : refus de politique (réputation, filtrage) — l'adresse n'est pas en cause` };
    return { type: "hard", reason: `Statut ${status} : rejet définitif` };
  }
  return { type: "soft", reason: `Statut ${status} non reconnu : traité comme temporaire` };
}

/** Analyse un message ; renvoie null si ce n'est pas un rapport de non-remise. */
export function detectDsn(parsed: ParsedMail, raw?: Buffer | string): DsnReport | null {
  if (!isDeliveryReport(parsed, raw)) return null;
  const text = unfold(haystack(parsed, raw));

  const statusM = text.match(/^\s*Status:\s*([245]\.\d{1,3}\.\d{1,3})/im);
  const actionM = text.match(/^\s*Action:\s*([a-z-]+)/im);
  const diagM = text.match(/^\s*Diagnostic-Code:\s*([^\n]+)/im);
  const smtpEnhancedM = text.match(/\b([45]\d\d)[ -]+([45]\.\d{1,3}\.\d{1,3})\b/);
  const smtpBareM = text.match(/\b([45][0-5]\d)[ -](?=[A-Za-z<#])/);

  const status = statusM?.[1] ?? smtpEnhancedM?.[2] ?? null;
  const action = actionM?.[1]?.toLowerCase() ?? null;
  const smtpCode = smtpEnhancedM?.[1] ?? (diagM?.[1]?.match(/\b([245]\d\d)\b/)?.[1] ?? smtpBareM?.[1] ?? null);

  let bounceType: BounceType | null;
  let reason: string;
  if (status) {
    ({ type: bounceType, reason } = classifyStatus(status));
  } else if (action === "delivered" || action === "relayed" || action === "expanded") {
    bounceType = null;
    reason = `Action ${action} : message remis (DSN de succès)`;
  } else if (action === "delayed") {
    bounceType = "soft";
    reason = "Action delayed : remise différée";
  } else if (action === "failed") {
    bounceType = "hard";
    reason = "Action failed sans code étendu : rejet définitif";
  } else if (smtpCode?.startsWith("5")) {
    bounceType = smtpCode === "552" ? "soft" : "hard";
    reason = smtpCode === "552" ? "Code SMTP 552 : boîte pleine, traitée comme temporaire" : `Code SMTP ${smtpCode} : rejet définitif`;
  } else if (smtpCode?.startsWith("4")) {
    bounceType = "soft";
    reason = `Code SMTP ${smtpCode} : échec temporaire`;
  } else {
    bounceType = "soft";
    reason = "Rapport de non-remise sans code exploitable : traité comme temporaire (prudence)";
  }

  // Destinataire en échec.
  const finalRcpt = text.match(/^\s*(?:Final|Original)-Recipient:\s*(?:rfc822|utf-8)?\s*;\s*<?([^\s<>;]+@[^\s<>;]+)>?/im)?.[1];
  const failedHdr = headerText(parsed, "x-failed-recipients")?.split(",")[0]?.trim();
  const angle = text.match(/^\s*<([^\s<>]+@[^\s<>]+)>\s*:/m)?.[1];
  const embeddedTo = text.match(/^\s*To:\s*(?:"[^"]*"\s*)?<?([^\s<>,]+@[^\s<>,]+)>?/im)?.[1];
  const ownTo = parsed.to && !Array.isArray(parsed.to) ? parsed.to.value?.[0]?.address : undefined;
  let recipient = (finalRcpt ?? failedHdr ?? angle ?? null)?.toLowerCase() ?? null;
  if (!recipient && embeddedTo && embeddedTo.toLowerCase() !== ownTo?.toLowerCase()) recipient = embeddedTo.toLowerCase();

  // Message-ID d'origine : en-têtes du message joint, X-Original-Message-ID, In-Reply-To / References du DSN.
  const own = parsed.messageId ? normalizeId(parsed.messageId) : null;
  const ids: string[] = [];
  for (const m of text.matchAll(/^\s*(?:X-Original-)?Message-ID:\s*(<[^>\s]+>|\S+)/gim)) ids.push(normalizeId(m[1]!));
  const refs = parsed.references;
  if (Array.isArray(refs)) ids.push(...refs.map(normalizeId));
  else if (typeof refs === "string") ids.push(...refs.split(/\s+/).filter(Boolean).map(normalizeId));
  if (typeof parsed.inReplyTo === "string") ids.push(normalizeId(parsed.inReplyTo));
  const unique = Array.from(new Set(ids.filter((id) => id && id !== own)));
  unique.sort((a, b) => Number(b.startsWith("crm-")) - Number(a.startsWith("crm-")));

  const diagnostic = diagM?.[1]
    ? maskEmails(diagM[1].replace(/^\s*(smtp|x-[\w-]+)\s*;\s*/i, "").replace(/\s+/g, " ").trim()).slice(0, 300)
    : null;

  return { bounceType, status, action, smtpCode, diagnostic, recipient, originalMessageIds: unique, reason };
}

export type CrmMessageRef =
  | { kind: "campaign"; campaignId: string; leadId: string; variant: string }
  | { kind: "sequence"; sequenceId: string; leadId: string; stepIndex: number };

/**
 * Décode un Message-ID émis par le CRM :
 *  - campagne : `crm-<campaignId>-<leadId>-<variant>@domaine` (campaignSend.ts) ;
 *  - séquence : `crm-seq-<sequenceId>-<leadId>-<étape>@domaine` (sequenceTick.ts).
 * Les identifiants cuid ne contiennent pas de tiret.
 */
export function parseCrmMessageId(id: string | null | undefined): CrmMessageRef | null {
  if (!id) return null;
  const local = normalizeId(id).split("@")[0] ?? "";
  const seq = local.match(/^crm-seq-([a-z0-9]+)-([a-z0-9]+)-(\d+)$/i);
  if (seq) return { kind: "sequence", sequenceId: seq[1]!, leadId: seq[2]!, stepIndex: Number(seq[3]) };
  const camp = local.match(/^crm-([a-z0-9]+)-([a-z0-9]+)-([A-Z])$/i);
  if (camp && camp[1] !== "seq") return { kind: "campaign", campaignId: camp[1]!, leadId: camp[2]!, variant: camp[3]!.toUpperCase() };
  return null;
}

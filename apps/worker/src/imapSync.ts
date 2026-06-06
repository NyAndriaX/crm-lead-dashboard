/**
 * Job `imap-sync` — collecte des réponses entrantes (R-01 / R-02).
 *
 * - Se connecte à chaque ImapConfig actif via imapflow.
 * - Récupère les messages reçus depuis lastSyncAt (ou les 7 derniers jours au premier passage).
 * - Parse le MIME via mailparser.
 * - Détection auto-reply (Auto-Submitted / X-Autoreply / Precedence / Subject heuristics).
 * - Matching lead :
 *     1. In-Reply-To / References → InboxMessage outbound préalable
 *     2. Sender emailHash → Lead.emailHash
 *     3. sinon orphan (leadId null, à associer manuellement)
 * - Chaîne R-06 à la réception (si lead matché, non auto-reply, non blacklisté) :
 *     - Lead.status → EN_DISCUSSION (si statut antérieur de prospection)
 *     - Lead.lastReplyAt = now
 *     - EmailEvent REPLIED
 *     - SequenceLead.status active → "stopped" (stoppedReason="reply")
 *     - LeadHistory ("reply_received")
 */
import * as crypto from "node:crypto";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { prisma, notifyUser, getAccessToken, decryptToken } from "@crm/db";
import type { WorkerJobContext } from "@crm/queue";
import { categorizeReply, type ReplyCategory } from "./replyCategorizer";
import { maybeAutoRespond } from "./autoResponder";
import { autopilotPipelineOnReply, type ReplyOutcome } from "./pipelineAutopilot";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return key;
}
function getHmacSecret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant");
  return s;
}
function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}
function decrypt(payload: Buffer): string {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
function emailHash(email: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}

type ImapRow = {
  id: string;
  label: string;
  host: string;
  port: number;
  loginEnc: Buffer;
  passwordEnc: Buffer;
  lastSyncAt: Date | null;
  // OAuth Microsoft 365
  oauthProvider: string | null;
  oauthTenantId: string | null;
  oauthClientId: string | null;
  oauthClientSecretEnc: Buffer | null;
  oauthRefreshTokenEnc: Buffer | null;
  oauthMailbox: string | null;
};

function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.trim().replace(/^<|>$/g, "");
}

function extractRefIds(parsed: ParsedMail): string[] {
  const ids: string[] = [];
  const inReplyTo = parsed.inReplyTo;
  if (typeof inReplyTo === "string") {
    const id = normalizeMessageId(inReplyTo);
    if (id) ids.push(id);
  }
  const references = parsed.references;
  if (Array.isArray(references)) {
    for (const r of references) {
      const id = normalizeMessageId(r);
      if (id) ids.push(id);
    }
  } else if (typeof references === "string") {
    references.split(/\s+/).forEach((r) => {
      const id = normalizeMessageId(r);
      if (id) ids.push(id);
    });
  }
  return Array.from(new Set(ids));
}

function isAutoReply(parsed: ParsedMail): boolean {
  const headers = parsed.headers;
  const autoSubmitted = (headers.get("auto-submitted") as string | undefined)?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = (headers.get("precedence") as string | undefined)?.toLowerCase();
  if (precedence === "bulk" || precedence === "auto_reply" || precedence === "list") {
    if (precedence === "auto_reply") return true;
  }
  if (headers.has("x-autoreply") || headers.has("x-auto-response-suppress")) return true;
  const subject = (parsed.subject ?? "").toLowerCase();
  if (/^(auto[- ]?reply|out[- ]of[- ]office|absent|absence|vacation|on vacation|congés)/i.test(subject)) {
    return true;
  }
  return false;
}

function senderEmail(parsed: ParsedMail): string | null {
  const from = parsed.from;
  if (!from) return null;
  const value = from.value?.[0];
  if (!value?.address) return null;
  return value.address.trim().toLowerCase();
}

function senderRaw(parsed: ParsedMail): string {
  const from = parsed.from;
  return from?.text ?? "";
}

function recipientRaw(parsed: ParsedMail): string {
  const to = parsed.to;
  if (!to) return "";
  if (Array.isArray(to)) return to.map((t) => t.text).join(", ");
  return to.text ?? "";
}

async function matchLeadId(parsed: ParsedMail): Promise<string | null> {
  // 1. Threading par Message-ID / In-Reply-To / References
  const refIds = extractRefIds(parsed);
  if (refIds.length > 0) {
    const prior = await prisma.inboxMessage.findFirst({
      where: { messageId: { in: refIds }, leadId: { not: null } },
      select: { leadId: true },
    });
    if (prior?.leadId) return prior.leadId;
  }
  // 2. Adresse expéditeur → emailHash
  const addr = senderEmail(parsed);
  if (addr) {
    const lead = await prisma.lead.findFirst({
      where: { emailHash: emailHash(addr), deletedAt: null },
      select: { id: true },
    });
    if (lead) return lead.id;
  }
  return null;
}

const CATEGORY_LABEL: Record<ReplyCategory, string> = {
  interesse: "Intéressé",
  pas_interesse: "Pas intéressé",
  hors_sujet: "Hors sujet",
  rappel: "Demande de rappel",
  auto_reply: "Auto-reply",
};

async function notifyLeadAssignee(args: {
  leadId: string;
  category: ReplyCategory;
  fromAddress: string | null;
  subject: string | null;
}): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    select: { assignedToId: true, firstName: true, lastName: true, company: true },
  });
  if (!lead?.assignedToId) return;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || "Un lead";
  await notifyUser({
    userId: lead.assignedToId,
    type: "reply_received",
    title: `Nouvelle réponse — ${CATEGORY_LABEL[args.category]}`,
    body: `${name}${args.subject ? ` : "${args.subject.slice(0, 80)}"` : ""}`,
    link: `/leads/${args.leadId}`,
  });
}

async function onReplyReceived(args: {
  leadId: string;
  fromAddress: string | null;
  subject: string | null;
  inboundBodyText: string | null;
  inboundBodyHtml: string | null;
  receivedAt: Date;
  isAutoReply: boolean;
  category: ReplyCategory;
  inboundMessageId: string | null;
}): Promise<void> {
  if (args.isAutoReply) {
    // R-08 : on n'arrête pas les séquences et on ne change pas le statut.
    await prisma.leadHistory.create({
      data: {
        leadId: args.leadId,
        type: "auto_reply_received",
        payload: { from: args.fromAddress ?? null, subject: args.subject ?? null } as object,
      },
    });
    return;
  }

  // Progression autonome pipeline + statut (RDV, deal conclu, refus, etc.).
  let pipelineResult: { outcome: ReplyOutcome; statusChanged: boolean; stageChanged: boolean } = {
    outcome: "none",
    statusChanged: false,
    stageChanged: false,
  };
  try {
    pipelineResult = await autopilotPipelineOnReply({
      leadId: args.leadId,
      category: args.category,
      subject: args.subject,
      bodyText: args.inboundBodyText,
      bodyHtml: args.inboundBodyHtml,
      receivedAt: args.receivedAt,
    });
  } catch (e) {
    console.warn(
      `[imap-sync] pipeline-autopilot KO leadId=${args.leadId}:`,
      e instanceof Error ? e.message : e,
    );
  }

  await prisma.emailEvent.create({
    data: {
      leadId: args.leadId,
      eventType: "REPLIED",
      occurredAt: args.receivedAt,
      meta: { from: args.fromAddress ?? null, subject: args.subject ?? null, category: args.category } as object,
    },
  });

  await prisma.sequenceLead.updateMany({
    where: { leadId: args.leadId, status: "active" },
    data: { status: "stopped", stoppedReason: "reply" },
  });

  await prisma.leadHistory.create({
    data: {
      leadId: args.leadId,
      type: "reply_received",
      payload: {
        from: args.fromAddress ?? null,
        subject: args.subject ?? null,
        category: args.category,
        pipelineOutcome: pipelineResult.outcome,
        statusChanged: pipelineResult.statusChanged,
        stageChanged: pipelineResult.stageChanged,
      } as object,
    },
  });

  // R-05 : notifie le commercial assigné (best-effort).
  try {
    await notifyLeadAssignee({
      leadId: args.leadId,
      category: args.category,
      fromAddress: args.fromAddress,
      subject: args.subject,
    });
  } catch (e) {
    console.warn(`[imap-sync] notif assignée KO leadId=${args.leadId}:`, e instanceof Error ? e.message : e);
  }

  // A4 (F7) : agent IA d'auto-réponse (mode par compte utilisateur assigné au lead).
  try {
    const r = await maybeAutoRespond({
      leadId: args.leadId,
      category: args.category,
      inboundSubject: args.subject,
      inboundBodyText: args.inboundBodyText,
      inboundBodyHtml: args.inboundBodyHtml,
      inboundMessageId: args.inboundMessageId,
    });
    if (r.acted) {
      console.log(`[imap-sync] auto-responder (${r.mode}) leadId=${args.leadId} cat=${args.category}`);
    } else if (r.reason && r.reason !== "category_skipped") {
      console.log(`[imap-sync] auto-responder skipped leadId=${args.leadId} reason=${r.reason}`);
    }
  } catch (e) {
    console.warn(`[imap-sync] auto-responder KO leadId=${args.leadId}:`, e instanceof Error ? e.message : e);
  }
}

async function ingestParsedMessage(parsed: ParsedMail): Promise<{
  saved: boolean;
  leadMatched: boolean;
}> {
  const messageId = normalizeMessageId(parsed.messageId ?? null);
  if (!messageId) return { saved: false, leadMatched: false };

  // Idempotence : si on a déjà ce Message-ID en base, on saute.
  const existing = await prisma.inboxMessage.findFirst({
    where: { messageId, direction: "inbound" },
    select: { id: true },
  });
  if (existing) return { saved: false, leadMatched: false };

  const fromAddress = senderEmail(parsed);
  const fromText = senderRaw(parsed) || fromAddress || "(inconnu)";
  const toText = recipientRaw(parsed) || "(inconnu)";
  const subject = parsed.subject ?? null;
  const bodyText = parsed.text ?? null;
  const bodyHtml = typeof parsed.html === "string" ? parsed.html : null;
  const receivedAt = parsed.date ?? new Date();
  const auto = isAutoReply(parsed);
  const leadId = await matchLeadId(parsed);
  const refIds = extractRefIds(parsed);
  const inReplyTo = refIds[0] ?? null;

  let openAiUserId: string | null = null;
  if (leadId) {
    const leadRow = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true },
    });
    openAiUserId = leadRow?.assignedToId ?? null;
  }

  // R-04 : catégorisation IA ou heuristique (avant l'écriture pour persister la catégorie).
  const { category, source: catSource } = await categorizeReply({
    userId: openAiUserId,
    subject, bodyText, bodyHtml, isAutoReply: auto,
  });

  await prisma.inboxMessage.create({
    data: {
      leadId,
      messageId,
      inReplyTo,
      direction: "inbound",
      fromEnc: encrypt(fromText),
      toEnc: encrypt(toText),
      subject,
      bodyText,
      bodyHtml,
      category,
      isAutoReply: auto,
      receivedAt,
    },
  });

  if (leadId) {
    await onReplyReceived({
      leadId,
      fromAddress,
      subject,
      inboundBodyText: bodyText,
      inboundBodyHtml: bodyHtml,
      receivedAt,
      isAutoReply: auto,
      category,
      inboundMessageId: messageId,
    });
  }

  void catSource; // info uniquement (loggable si besoin)

  return { saved: true, leadMatched: Boolean(leadId) };
}

async function buildImapAuth(
  row: ImapRow,
): Promise<{ user: string; pass?: string; accessToken?: string }> {
  if (
    row.oauthProvider === "microsoft" &&
    row.oauthTenantId &&
    row.oauthClientId &&
    row.oauthClientSecretEnc &&
    row.oauthRefreshTokenEnc
  ) {
    const clientSecret = decryptToken(row.oauthClientSecretEnc);
    const refreshToken = decryptToken(row.oauthRefreshTokenEnc);
    const resp = await getAccessToken(
      { tenantId: row.oauthTenantId, clientId: row.oauthClientId, clientSecret },
      refreshToken,
    );
    const mailbox = row.oauthMailbox ?? decrypt(Buffer.from(row.loginEnc));
    return { user: mailbox, accessToken: resp.access_token };
  }
  const login = decrypt(Buffer.from(row.loginEnc));
  const pass = decrypt(Buffer.from(row.passwordEnc));
  return { user: login, pass };
}

async function syncOneAccount(row: ImapRow): Promise<{
  account: string;
  fetched: number;
  saved: number;
  matched: number;
  error?: string;
}> {
  const auth = await buildImapAuth(row);
  const since = row.lastSyncAt ?? new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const imapAuth = auth.accessToken
    ? { user: auth.user, accessToken: auth.accessToken }
    : { user: auth.user, pass: auth.pass! };
  const client = new ImapFlow({
    host: row.host,
    port: row.port,
    secure: row.port === 993,
    auth: imapAuth,
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  // Prevent unhandled 'error' EventEmitter events from crashing the worker process.
  // Errors are already caught by the try/catch below via the thrown Promise rejection.
  client.on("error", (err: Error) => {
    console.error(`[imap-sync] account=${row.label} socket error:`, err.message ?? err);
  });

  let fetched = 0;
  let saved = 0;
  let matched = 0;
  const startedAt = new Date();

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const search = await client.search({ since });
      const uids = Array.isArray(search) ? search : [];
      if (uids.length > 0) {
        for await (const msg of client.fetch(uids, { source: true, envelope: true }) as AsyncIterable<FetchMessageObject>) {
          fetched++;
          if (!msg.source) continue;
          try {
            const parsed = await simpleParser(msg.source);
            const r = await ingestParsedMessage(parsed);
            if (r.saved) saved++;
            if (r.leadMatched) matched++;
          } catch (e) {
            console.error(`[imap-sync] parse error account=${row.label} uid=${msg.uid}:`, e instanceof Error ? e.message : e);
          }
        }
      }
    } finally {
      lock.release();
    }
    await prisma.imapConfig.update({
      where: { id: row.id },
      data: { lastSyncAt: startedAt },
    });
    await client.logout();
    return { account: row.label, fetched, saved, matched };
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[imap-sync] account=${row.label} error:`, msg);
    return { account: row.label, fetched, saved, matched, error: msg };
  }
}

export async function runImapSync(_ctx: WorkerJobContext): Promise<unknown> {
  const accounts = await prisma.imapConfig.findMany({
    where: { isActive: true },
    select: {
      id: true,
      label: true,
      host: true,
      port: true,
      loginEnc: true,
      passwordEnc: true,
      lastSyncAt: true,
      oauthProvider: true,
      oauthTenantId: true,
      oauthClientId: true,
      oauthClientSecretEnc: true,
      oauthRefreshTokenEnc: true,
      oauthMailbox: true,
    },
  });

  console.log(`[imap-sync] start activeAccounts=${accounts.length}`);
  if (accounts.length === 0) {
    console.log("[imap-sync] no active IMAP accounts");
    return { ok: true, accounts: 0, results: [] };
  }

  const results: Awaited<ReturnType<typeof syncOneAccount>>[] = [];
  for (const acc of accounts) {
    results.push(
      await syncOneAccount({
        ...acc,
        loginEnc: Buffer.from(acc.loginEnc),
        passwordEnc: Buffer.from(acc.passwordEnc),
        oauthClientSecretEnc: acc.oauthClientSecretEnc ? Buffer.from(acc.oauthClientSecretEnc) : null,
        oauthRefreshTokenEnc: acc.oauthRefreshTokenEnc ? Buffer.from(acc.oauthRefreshTokenEnc) : null,
      }),
    );
  }

  const totals = {
    fetched: results.reduce((a, b) => a + b.fetched, 0),
    saved: results.reduce((a, b) => a + b.saved, 0),
    matched: results.reduce((a, b) => a + b.matched, 0),
    errors: results.filter((r) => r.error).length,
  };

  console.log(
    `[imap-sync] done accounts=${accounts.length} fetched=${totals.fetched} saved=${totals.saved} matched=${totals.matched} errors=${totals.errors}`,
  );

  return {
    ok: true,
    accounts: accounts.length,
    totals,
    results,
  };
}

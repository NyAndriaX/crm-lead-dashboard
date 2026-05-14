/**
 * Job `campaign-send` — pipeline emailing (MVP intégré) :
 * envoi par lots, throttle, warm-up (plafond journalier progressif), A/B sujet+corps,
 * pixel ouverture, liens trackés, List-Unsubscribe, bounce sur échec SMTP, stats campagne.
 */
import * as crypto from "node:crypto";
import nodemailer from "nodemailer";
import {
  prisma,
  buildLeadWhereFromSegmentFilters,
  signEmailTrackToken,
  type LeadSegmentFilters,
} from "@crm/db";
import { getWorkerAgenda, enqueueOneOff, type WorkerJobContext } from "@crm/queue";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const BATCH = 20;

function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY invalide");
  return key;
}
function decrypt(payload: Buffer): string {
  if (payload.length < IV_LEN + TAG_LEN) throw new Error("Payload chiffré invalide");
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
function decryptOrNull(v: Buffer | Uint8Array | null | undefined): string | null {
  if (v == null) return null;
  return decrypt(Buffer.from(v));
}

type CampaignCfg = {
  throttleMinDelayMs?: number;
  bodyHtmlOverride?: string | null;
  ab?: { enabled?: boolean; subjectB?: string | null; bodyHtmlB?: string | null; splitPercent?: number };
  warmup?: { enabled?: boolean; startPerDay?: number; growth?: number };
};

function mergeStats(prev: unknown, patch: Record<string, number>): Record<string, number> {
  const base: Record<string, number> =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, number>) }
      : { sent: 0, failed: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 };
  for (const [k, v] of Object.entries(patch)) {
    base[k] = (base[k] ?? 0) + v;
  }
  return base;
}

function personalize(html: string, lead: { firstName: string | null; lastName: string | null; company: string | null; email: string | null }) {
  return html
    .replace(/\{\{prenom\}\}/gi, lead.firstName ?? "")
    .replace(/\{\{nom\}\}/gi, lead.lastName ?? "")
    .replace(/\{\{entreprise\}\}/gi, lead.company ?? "")
    .replace(/\{\{email\}\}/gi, lead.email ?? "")
    .replace(/\{\{actu\}\}/gi, "")
    .replace(/\{\{custom\}\}/gi, "");
}

function injectTracking(html: string, openUrl: string): string {
  const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:none" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${pixel}</body>`);
  return `${html}${pixel}`;
}

function rewriteLinks(html: string, baseUrl: string, campaignId: string, leadId: string, variant: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    const tok = signEmailTrackToken({ k: "click", c: campaignId, l: leadId, v: variant, u: url });
    const redir = `${baseUrl.replace(/\/$/, "")}/api/emailing/track/click?t=${encodeURIComponent(tok)}`;
    return `href="${redir}"`;
  });
}

function warmupDailyCap(cfg: CampaignCfg | null, campaignCreatedAt: Date): number {
  const w = cfg?.warmup;
  if (!w?.enabled) return Number.MAX_SAFE_INTEGER;
  const start = Math.max(1, w.startPerDay ?? 30);
  const growth = w.growth ?? 1.2;
  const day = Math.max(0, Math.floor((Date.now() - campaignCreatedAt.getTime()) / 86_400_000));
  return Math.min(50_000, Math.floor(start * growth ** day));
}

function pickVariant(leadId: string, cfg: CampaignCfg | null): "A" | "B" {
  const ab = cfg?.ab;
  if (!ab?.enabled) return "A";
  const pct = ab.splitPercent ?? 50;
  const n = parseInt(leadId.slice(-4), 16) % 100;
  return n < pct ? "A" : "B";
}

async function enqueueNext(type: string, payload: object, runAt: Date) {
  await enqueueOneOff(getWorkerAgenda(), type, payload, { runAt, priority: 1 });
}

export async function runCampaignSend(ctx: WorkerJobContext): Promise<unknown> {
  const payload = (ctx.payload ?? {}) as { campaignId?: string; offset?: number };
  const campaignId = payload.campaignId;
  const offset = Number(payload.offset ?? 0);
  if (!campaignId) return { error: "campaignId manquant" };

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, segment: true, smtpConfig: true },
  });
  if (!campaign || !campaign.template || !campaign.segment || !campaign.smtpConfig) {
    return { error: "Campagne ou relations incomplètes" };
  }
  if (campaign.status === "PAUSED" || campaign.status === "CANCELLED") {
    return { skipped: true, reason: campaign.status };
  }
  if (campaign.status === "DONE") return { skipped: true, reason: "DONE" };

  const cfg = (campaign.config ?? null) as CampaignCfg | null;
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const throttle = cfg?.throttleMinDelayMs ?? 12_000;

  if (campaign.status === "SCHEDULED") {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
  }

  const filters = (campaign.segment.filters ?? {}) as LeadSegmentFilters;
  const whereLead = {
    ...buildLeadWhereFromSegmentFilters({ ...filters, includeDeleted: false }),
    emailHash: { not: null },
  };

  const total = await prisma.lead.count({ where: whereLead });
  const leads = await prisma.lead.findMany({
    where: whereLead,
    orderBy: { id: "asc" },
    skip: offset,
    take: BATCH,
  });

  const smtpRow = await prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfig.id } });
  if (!smtpRow) return { error: "SMTP introuvable" };
  const login = decryptOrNull(smtpRow.loginEnc);
  const pass = decryptOrNull(smtpRow.passwordEnc);
  if (!login || !pass) return { error: "Identifiants SMTP illisibles" };

  const secure = smtpRow.port === 465;
  const transporter = nodemailer.createTransport({
    host: smtpRow.host,
    port: smtpRow.port,
    secure,
    auth: { user: login, pass },
    tls: { rejectUnauthorized: false },
  });

  const fromAddr = smtpRow.fromEmail ?? login;
  const fromName = smtpRow.fromName ?? "CRM";

  const capWarm = warmupDailyCap(cfg, campaign.createdAt);
  const capCampaign = campaign.dailyLimit ?? smtpRow.dailyLimit;
  let remainingSmtp = Math.max(0, smtpRow.dailyLimit - smtpRow.sentToday);
  let effectiveCap = Math.min(remainingSmtp, capCampaign, capWarm);

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const scNow = await prisma.smtpConfig.findUnique({
      where: { id: smtpRow.id },
      select: { sentToday: true, dailyLimit: true },
    });
    if (scNow) {
      remainingSmtp = Math.max(0, scNow.dailyLimit - scNow.sentToday);
      effectiveCap = Math.min(remainingSmtp, capCampaign, capWarm);
    }
    if (effectiveCap <= 0) break;
    if (!lead.emailHash) continue;
    const onBlack = await prisma.blacklist.findUnique({ where: { emailHash: lead.emailHash } });
    if (onBlack) continue;

    const email = decryptOrNull(lead.emailEnc);
    if (!email) continue;

    const variant = pickVariant(lead.id, cfg);
    const subjA = campaign.subject ?? campaign.template.subject;
    const subjB = cfg?.ab?.enabled ? cfg.ab.subjectB ?? subjA : subjA;
    const subject = variant === "B" ? (subjB ?? subjA) : subjA;

    let body =
      variant === "B" && cfg?.ab?.enabled && (cfg.ab.bodyHtmlB?.trim() ?? "")
        ? (cfg.ab.bodyHtmlB as string)
        : null;
    if (body == null) {
      body =
        cfg?.bodyHtmlOverride?.trim()
          ? cfg.bodyHtmlOverride
          : campaign.template.bodyHtml;
    }
    body = personalize(body, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      email,
    });

    const openTok = signEmailTrackToken({ k: "open", c: campaignId, l: lead.id, v: variant });
    const openUrl = `${baseUrl}/api/emailing/track/open?t=${encodeURIComponent(openTok)}`;
    const unsubTok = signEmailTrackToken({ k: "unsub", c: campaignId, l: lead.id, v: variant });
    const listUnsub = `<${baseUrl}/api/emailing/unsub?t=${encodeURIComponent(unsubTok)}>`;

    body = rewriteLinks(body, baseUrl, campaignId, lead.id, variant);
    body = injectTracking(body, openUrl);

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: email,
        subject,
        html: body,
        headers: {
          "List-Unsubscribe": listUnsub,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await prisma.emailEvent.create({
        data: {
          campaignId,
          leadId: lead.id,
          eventType: "SENT",
          token: openTok.slice(0, 120),
          meta: { variant } as object,
        },
      });
      await prisma.smtpConfig.update({
        where: { id: smtpRow.id },
        data: { sentToday: { increment: 1 } },
      });
      sent++;
      effectiveCap--;
    } catch (e) {
      failed++;
      await prisma.emailEvent.create({
        data: {
          campaignId,
          leadId: lead.id,
          eventType: "BOUNCE",
          meta: { error: e instanceof Error ? e.message : String(e), soft: true } as object,
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { emailStatus: "SOFT_BOUNCE" },
      });
    }

    await new Promise((r) => setTimeout(r, throttle));
  }

  const newOffset = offset + leads.length;
  const cur = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { stats: true } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { stats: mergeStats(cur?.stats, { sent, failed }) as object },
  });

  if (newOffset < total && (await prisma.campaign.findUnique({ where: { id: campaignId } }))?.status === "SENDING") {
    await enqueueNext("campaign-send", { campaignId, offset: newOffset }, new Date(Date.now() + 1500));
  } else {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "DONE" },
    });
  }

  return { offset: newOffset, total, sent, failed, batchSize: leads.length };
}

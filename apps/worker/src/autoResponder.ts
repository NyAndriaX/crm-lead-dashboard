/**
 * Agent IA d'auto-réponse aux emails entrants — A4 (feature F7).
 *
 * Selon la catégorie détectée (replyCategorizer) :
 *  - "pas_interesse"        → message de clôture poli, lead passé PERDU
 *  - "interesse" / "rappel" → email proposant un créneau de RDV
 *  - "hors_sujet" / "auto_reply" → rien
 *
 * Mode via la configuration de la campagne d'origine (Communication → Emailing → campagne) :
 *  - "off"   (défaut) : ne fait rien
 *  - "draft" : génère le message + InboxMessage outbound marqué brouillon
 *              + notification pour validation humaine (PAS d'envoi SMTP)
 *  - "auto"  : envoie réellement via SMTP
 *
 * L'intervention manuelle reste possible à tout moment (F5).
 */
import * as crypto from "node:crypto";
import nodemailer from "nodemailer";
import {
  prisma,
  notifyUser,
  resolveAutoResponderUserId,
  DEFAULT_AUTO_RESPONDER_MEETING_URL,
  type AutoResponderMode,
} from "@crm/db";
import { aiComplete } from "./ai";
import type { ReplyCategory } from "./replyCategorizer";

const ALGO = "aes-256-gcm";
function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return key;
}
function decryptOrNull(v: Buffer | Uint8Array | null | undefined): string | null {
  if (v == null) return null;
  const buf = Buffer.from(v);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const d = crypto.createDecipheriv(ALGO, getEncKey(), iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
function encryptValue(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type Mode = AutoResponderMode;

function fallbackReply(args: {
  category: ReplyCategory;
  firstName: string | null;
  company: string | null;
  clientExcerpt: string | null;
  meetingUrl: string;
}): { subject: string; html: string } | null {
  const who = args.firstName ? args.firstName : "Bonjour";
  const echo = args.clientExcerpt ? ` J'ai bien noté : "${escapeHtml(args.clientExcerpt)}".` : "";
  if (args.category === "pas_interesse") {
    return {
      subject: "Re: votre retour",
      html: `<p>Bonjour ${who},</p><p>Merci pour votre retour, c'est noté.${echo} Je n'insiste pas. ` +
        `Je reste disponible si vos besoins évoluent à l'avenir.</p><p>Très bonne continuation,<br/>L'équipe commerciale</p>`,
    };
  }
  if (args.category === "interesse" || args.category === "rappel") {
    const link = args.meetingUrl;
    return {
      subject: "Re: échangeons 30 min ?",
      html: `<p>Bonjour ${who},</p><p>Ravi de votre intérêt ! J'ai bien noté votre message.${echo} ` +
        `Pour avancer concrètement, proposez-vous un créneau de 30 minutes via ce lien : <a href="${link}">${link}</a>.</p>` +
        `<p>À très vite,<br/>L'équipe commerciale</p>`,
    };
  }
  return null; // hors_sujet / auto_reply → pas de réponse
}

async function pickActiveSmtp() {
  return prisma.smtpConfig.findFirst({ where: { isActive: true }, orderBy: { sentToday: "asc" } });
}

/**
 * Tente une auto-réponse. Best-effort : ne jette jamais (ne casse pas
 * l'ingestion IMAP si l'IA ou le SMTP échoue).
 */
export async function maybeAutoRespond(args: {
  leadId: string;
  category: ReplyCategory;
  inboundSubject: string | null;
  inboundBodyText: string | null;
  inboundBodyHtml: string | null;
  inboundMessageId: string | null;
  campaignId?: string | null;
}): Promise<{ acted: boolean; mode: Mode; reason?: string }> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: args.leadId },
      select: {
        id: true,
        deletedAt: true,
        emailEnc: true,
        firstName: true,
        lastName: true,
        company: true,
        assignedToId: true,
      },
    });
    if (!lead || lead.deletedAt) return { acted: false, mode: "off", reason: "lead_missing" };

    if (!args.campaignId) {
      return { acted: false, mode: "off", reason: "no_campaign" };
    }

    const camp = await prisma.campaign.findUnique({
      where: { id: args.campaignId },
      select: { config: true, createdById: true },
    });
    const cfg = (camp?.config ?? {}) as Record<string, unknown>;
    const ar = (cfg.autoResponder ?? null) as { mode?: string; meetingUrl?: string } | null;
    if (!ar?.mode || ar.mode === "off") {
      return { acted: false, mode: "off", reason: "campaign_auto_responder_off" };
    }

    const m = ar.mode as Mode;
    const meetingUrl = ar.meetingUrl?.trim() || DEFAULT_AUTO_RESPONDER_MEETING_URL;
    const responderUserId =
      camp?.createdById ??
      lead.assignedToId ??
      (await resolveAutoResponderUserId(lead.assignedToId));

    if (m === "off") return { acted: false, mode: m, reason: "auto_responder_off" };
    if (args.category === "hors_sujet" || args.category === "auto_reply") {
      return { acted: false, mode: m, reason: "category_skipped" };
    }

    const email = decryptOrNull(lead.emailEnc);
    if (!email) return { acted: false, mode: m, reason: "no_email" };

    const inboundText = args.inboundBodyText
      ?? (args.inboundBodyHtml ? stripHtmlToText(args.inboundBodyHtml) : null);
    const clientExcerpt = inboundText ? inboundText.slice(0, 260) : null;
    const fb = fallbackReply({
      category: args.category,
      firstName: lead.firstName,
      company: lead.company,
      clientExcerpt,
      meetingUrl,
    });
    if (!fb) return { acted: false, mode: m, reason: "no_template" };

    // Rédaction IA (fallback = template déterministe ci-dessus).
    const ai = await aiComplete({
      userId: responderUserId,
      campaignId: args.campaignId,
      feature: "auto_reply",
      maxTokens: 500,
      temperature: 0.6,
      json: true,
      fallback: () => JSON.stringify(fb),
      messages: [
        {
          role: "system",
          content:
            "Tu es un SDR B2B francophone. On te donne la catégorie d'une réponse reçue " +
            "et le message du client (extrait). Rédige une réponse email courte, professionnelle et " +
            "chaleureuse. Réponds en tenant compte des préoccupations/demandes spécifiques du client. " +
            "Ne rien inventer. Si catégorie 'pas_interesse' : remercie, n'insiste pas, laisse la porte " +
            `ouverte. Si 'interesse'/'rappel' : propose un RDV via ce lien : ${meetingUrl}. ` +
            'Réponds UNIQUEMENT en JSON {"subject": string, "html": string}. Pas de markdown.',
        },
        {
          role: "user",
          content:
            `Catégorie : ${args.category}\nContact : ${lead.firstName ?? ""} ${lead.lastName ?? ""}\n` +
            `Entreprise : ${lead.company ?? "(inconnue)"}\n` +
            `Sujet reçu : ${args.inboundSubject ?? "(sans sujet)"}\n` +
            `Message du client (extrait) :\n${(inboundText ?? "(vide)").slice(0, 2000)}`,
        },
      ],
    });
    let subject = fb.subject;
    let html = fb.html;
    try {
      const parsed = JSON.parse(ai.text) as { subject?: string; html?: string };
      if (parsed.subject) subject = parsed.subject;
      if (parsed.html) html = parsed.html;
    } catch {
      /* garde le fallback */
    }

    const smtp = await pickActiveSmtp();
    const fromAddr = smtp ? smtp.fromEmail ?? decryptOrNull(smtp.loginEnc) ?? "no-reply@crm" : "no-reply@crm";
    const fromName = smtp?.fromName ?? "Équipe commerciale";
    const senderDomain = (String(fromAddr).split("@")[1] ?? "crm").replace(/[^a-zA-Z0-9.\-]/g, "");
    const messageId = `<crm-auto-${args.leadId}-${Date.now()}@${senderDomain}>`;
    const headers: Record<string, string> = {};
    if (args.inboundMessageId) {
      headers["In-Reply-To"] = `<${args.inboundMessageId}>`;
      headers["References"] = `<${args.inboundMessageId}>`;
    }

    let sent = false;
    if (m === "auto" && smtp) {
      const login = decryptOrNull(smtp.loginEnc);
      const pass = decryptOrNull(smtp.passwordEnc);
      if (login && pass) {
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth: { user: login, pass },
          tls: { rejectUnauthorized: false },
        });
        await transporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: email,
          subject,
          html,
          messageId,
          headers,
        });
        await prisma.smtpConfig.update({ where: { id: smtp.id }, data: { sentToday: { increment: 1 } } });
        sent = true;
      }
    }

    // Trace dans l'inbox (outbound). En mode draft, marqué non envoyé.
    await prisma.inboxMessage.create({
      data: {
        leadId: args.leadId,
        messageId: messageId.replace(/^<|>$/g, ""),
        inReplyTo: args.inboundMessageId,
        direction: "outbound",
        fromEnc: encryptValue(`"${fromName}" <${fromAddr}>`),
        toEnc: encryptValue(email),
        subject: m === "draft" ? `[BROUILLON IA] ${subject}` : subject,
        bodyHtml: html,
        category: args.category,
        receivedAt: new Date(),
      },
    });

    await prisma.leadHistory.create({
      data: {
        leadId: args.leadId,
        type: m === "auto" ? "auto_reply_sent" : "auto_reply_drafted",
        payload: { category: args.category, aiSource: ai.source, sent } as object,
      },
    });

    // En mode draft : notifier pour validation humaine.
    if (m === "draft") {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "MANAGER", "COMMERCIAL"] }, isActive: true },
        select: { id: true },
        take: 5,
      });
      for (const a of admins) {
        await notifyUser({
          userId: a.id,
          type: "auto_reply_draft",
          title: "Brouillon de réponse IA à valider",
          body: `Réponse "${args.category}" préparée pour un lead. À relire avant envoi.`,
          link: `/leads/${args.leadId}`,
        });
      }
    }

    return { acted: true, mode: m };
  } catch (e) {
    console.warn(`[auto-responder] KO leadId=${args.leadId}:`, e instanceof Error ? e.message : e);
    return { acted: false, mode: "off", reason: "error" };
  }
}

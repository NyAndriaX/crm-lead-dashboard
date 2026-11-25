/**
 * Agent IA d'auto-réponse aux emails entrants — A4 (feature F7).
 *
 * Selon la catégorie détectée (replyCategorizer) :
 *  - "pas_interesse"        → message de clôture poli, lead passé PERDU
 *  - "interesse" / "rappel" → email proposant un créneau de RDV
 *  - "hors_sujet" / "auto_reply" → rien
 *
 * Réglages : Configuration › Intelligence artificielle › Réponse automatique (table aiConfig) ;
 * repli sur les variables AUTO_RESPONDER_MODE / AUTO_RESPONDER_MEETING_URL si rien n'est réglé.
 *  - "off"   (défaut) : ne fait rien
 *  - "draft" : génère le message (InboxMessage outbound isDraft) + notification ; l'utilisateur
 *              l'envoie, le modifie ou le supprime depuis la conversation (Réponses / fiche lead)
 *  - "auto"  : envoie réellement avec le compte d'envoi choisi
 *
 * L'intervention manuelle reste possible à tout moment (F5).
 */
import * as crypto from "node:crypto";
import { prisma, createAccountTransport } from "@crm/db";
import { aiAutoReply } from "./ai";
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

type Mode = "off" | "draft" | "auto";

type AutoReplySettings = { mode: Mode; meetingUrl: string | null; smtpConfigId: string | null };

function asMode(v: string | null | undefined): Mode {
  const m = (v ?? "off").toLowerCase();
  return m === "auto" ? "auto" : m === "draft" ? "draft" : "off";
}

/** Réglages de l'interface (aiConfig), sinon variables d'environnement historiques. */
export async function autoReplySettings(): Promise<AutoReplySettings> {
  const row = await prisma.aiConfig.findUnique({
    where: { id: "default" },
    select: { autoReplyMode: true, autoReplyMeetingUrl: true, autoReplySmtpConfigId: true },
  });
  const envMode = asMode(process.env.AUTO_RESPONDER_MODE);
  return {
    mode: row && row.autoReplyMode !== "off" ? asMode(row.autoReplyMode) : envMode,
    meetingUrl: row?.autoReplyMeetingUrl?.trim() || process.env.AUTO_RESPONDER_MEETING_URL?.trim() || null,
    smtpConfigId: row?.autoReplySmtpConfigId ?? null,
  };
}

function fallbackReply(args: {
  category: ReplyCategory;
  firstName: string | null;
  company: string | null;
  meetingUrl: string | null;
  signature: string;
}): { subject: string; html: string } | null {
  const who = args.firstName ? args.firstName : "";
  const hello = who ? `Bonjour ${who},` : "Bonjour,";
  if (args.category === "pas_interesse") {
    return {
      subject: "Re: votre retour",
      html: `<p>${hello}</p><p>Merci pour votre retour, c'est noté — je n'insiste pas. ` +
        `Je reste disponible si vos besoins évoluent à l'avenir.</p><p>Très bonne continuation,<br/>${args.signature}</p>`,
    };
  }
  if (args.category === "interesse" || args.category === "rappel") {
    const ask = args.meetingUrl
      ? `proposez-vous un créneau de 30 minutes via ce lien : <a href="${args.meetingUrl}">${args.meetingUrl}</a>.`
      : "quelles seraient vos disponibilités cette semaine pour un échange de 30 minutes ?";
    return {
      subject: "Re: échangeons 30 min ?",
      html: `<p>${hello}</p><p>Merci pour votre retour ! Pour avancer concrètement, ${ask}</p>` +
        `<p>À très vite,<br/>${args.signature}</p>`,
    };
  }
  return null; // hors_sujet / auto_reply → pas de réponse
}

async function pickSmtp(preferredId: string | null) {
  if (preferredId) {
    const row = await prisma.smtpConfig.findUnique({ where: { id: preferredId } });
    if (row?.isActive) return row;
  }
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
  inboundMessageId: string | null;
}): Promise<{ acted: boolean; mode: Mode; reason?: string }> {
  const settings = await autoReplySettings().catch(() => ({ mode: asMode(process.env.AUTO_RESPONDER_MODE), meetingUrl: null, smtpConfigId: null }));
  const m = settings.mode;
  if (m === "off") return { acted: false, mode: m, reason: "disabled" };
  if (args.category === "hors_sujet" || args.category === "auto_reply") {
    return { acted: false, mode: m, reason: "category_skipped" };
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
    if (!lead || lead.deletedAt) return { acted: false, mode: m, reason: "lead_missing" };
    const email = decryptOrNull(lead.emailEnc);
    if (!email) return { acted: false, mode: m, reason: "no_email" };

    const smtp = await pickSmtp(settings.smtpConfigId);
    const signature = smtp?.fromName?.trim() || "L'équipe commerciale";
    const fb = fallbackReply({ category: args.category, firstName: lead.firstName, company: lead.company, meetingUrl: settings.meetingUrl, signature });
    if (!fb) return { acted: false, mode: m, reason: "no_template" };

    // Rédaction IA — skill crm-auto-reply (fallback = template déterministe ci-dessus).
    const ai = await aiAutoReply({
      category: args.category,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      inboundSubject: args.inboundSubject,
      meetingUrl: settings.meetingUrl,
      signature,
      fallback: fb,
    });
    const { subject, html } = ai;

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
        const transporter = createAccountTransport({ host: smtp.host, port: smtp.port, login, pass });
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
        subject,
        bodyHtml: html,
        category: args.category,
        isDraft: m === "draft",
        receivedAt: new Date(),
      },
    });

    if (args.category === "pas_interesse" && m === "auto") {
      await prisma.lead.update({ where: { id: args.leadId }, data: { status: "PERDU" } });
    }

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
        await prisma.notification.create({
          data: {
            userId: a.id,
            type: "auto_reply_draft",
            title: "Brouillon de réponse IA à valider",
            body: `Réponse "${args.category}" préparée pour un lead. À relire avant envoi.`,
            link: `/leads/${args.leadId}`,
          },
        });
      }
    }

    return { acted: true, mode: m };
  } catch (e) {
    console.warn(`[auto-responder] KO leadId=${args.leadId}:`, e instanceof Error ? e.message : e);
    return { acted: false, mode: m, reason: "error" };
  }
}

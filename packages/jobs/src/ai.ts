/**
 * Helpers IA partagés (worker) — couche "AI autopilot".
 *
 * Stratégie commune à A2 (personnalisation message) et A4 (auto-réponse) :
 *   - Si CLAUDE_SKILLS_ENABLED=true → exécution du Claude Skill correspondant
 *     via le CLI Claude Code (abonnement, pas de clé API — voir @crm/ai).
 *   - Sinon → fallback déterministe (toujours testable, jamais bloquant).
 *
 * Ne jette jamais : en cas d'erreur CLI/timeout, on retombe sur le fallback.
 */
import { emailSchema, runSkill } from "@crm/ai";
import type { ReplyCategory } from "./replyCategorizer";

export type LeadLite = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sector: string | null;
  city: string | null;
  email: string | null;
};

type EmailOut = { subject: string; html: string };

/**
 * A2 (F2/F3/F6) — réécrit un email pour le rendre unique et adapté au
 * destinataire à partir de son contexte (lead + enrichment + aiBrief).
 * Skill : `crm-email-personalize`.
 *
 * Conserve les variables déjà substituées (le HTML reçu est déjà passé
 * par `personalize()`), les liens et la structure ; ne réécrit que le
 * texte rédactionnel. Fallback : retourne le HTML inchangé (= comportement
 * historique à base de variables).
 */
export async function aiPersonalizeEmail(args: {
  subject: string;
  html: string;
  lead: LeadLite;
  enrichment: unknown;
  /** "email" = 1er contact, "relance" = étape de séquence. */
  kind: "email" | "relance";
  stepIndex?: number;
}): Promise<{ subject: string; html: string; source: "ai" | "fallback" }> {
  const out = await runSkill<EmailOut>({
    skill: "crm-email-personalize",
    schema: emailSchema,
    input: {
      kind: args.kind,
      stepIndex: args.stepIndex ?? null,
      recipient: [args.lead.firstName, args.lead.lastName].filter(Boolean).join(" ") || null,
      company: args.lead.company,
      context: enrichmentSummary(args.enrichment) || null,
      subject: args.subject,
      html: args.html.slice(0, 6000),
    },
  });
  if (!out) return { subject: args.subject, html: args.html, source: "fallback" };
  return {
    subject: out.subject.trim() || args.subject,
    html: out.html.trim() || args.html,
    source: "ai",
  };
}

/**
 * A4 (F7) — rédige l'auto-réponse à un prospect selon sa catégorie.
 * Skill : `crm-auto-reply`. Fallback : le template déterministe fourni.
 */
export async function aiAutoReply(args: {
  category: ReplyCategory;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  inboundSubject: string | null;
  meetingUrl: string;
  fallback: EmailOut;
}): Promise<EmailOut & { source: "ai" | "fallback" }> {
  const out = await runSkill<EmailOut>({
    skill: "crm-auto-reply",
    schema: emailSchema,
    input: {
      category: args.category,
      contact: [args.firstName, args.lastName].filter(Boolean).join(" ") || null,
      company: args.company,
      inboundSubject: args.inboundSubject,
      meetingUrl: args.meetingUrl,
    },
  });
  if (!out) return { ...args.fallback, source: "fallback" };
  return { subject: out.subject, html: out.html, source: "ai" };
}

/** Concatène les signaux d'enrichissement exploitables en contexte IA. */
export function enrichmentSummary(enrichment: unknown): string {
  const e = (enrichment ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const company = e.company as { legalName?: string; nafCode?: string; foundedYear?: number } | undefined;
  if (company?.legalName) parts.push(`Société : ${company.legalName}`);
  if (company?.nafCode) parts.push(`NAF ${company.nafCode}`);
  if (company?.foundedYear) parts.push(`créée en ${company.foundedYear}`);
  const news = e.news as { items?: { title: string }[] } | undefined;
  if (news?.items?.length) {
    parts.push(`Actu récente : ${news.items.slice(0, 2).map((n) => n.title).join(" ; ")}`);
  }
  const site = e.siteAnalysis as { summary?: string; activity?: string; signals?: string[] } | undefined;
  if (site?.activity) parts.push(`Activité : ${site.activity}`);
  if (site?.summary) parts.push(`Site web : ${site.summary}`);
  if (site?.signals?.length) parts.push(`Signaux : ${site.signals.join(" ; ")}`);
  const brief = e.aiBrief as { summary?: string; angle?: string } | undefined;
  if (brief?.summary) parts.push(`Brief : ${brief.summary}`);
  if (brief?.angle) parts.push(`Angle conseillé : ${brief.angle}`);
  return parts.join("\n");
}

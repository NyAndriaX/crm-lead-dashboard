/**
 * Catégoriseur de réponses (R-04) — version web, miroir de
 * packages/jobs/src/replyCategorizer.ts. Pas de dépendance Prisma : fonction
 * pure utilisable depuis une route API (re-catégorisation manuelle).
 * IA : skill Claude `crm-reply-categorize` (CLAUDE_SKILLS_ENABLED), sinon heuristique.
 */

import { REPLY_CATEGORIES, replyCategorySchema, runSkill } from "@crm/ai";

export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

function heuristic(subject: string | null, body: string | null): ReplyCategory {
  const text = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/auto[- ]?reply|out of office|absen|cong[éeè]|vacation|hors du bureau|on vacation/.test(text)) {
    return "auto_reply";
  }
  if (/pas (intéress|interess)|d[ée]j[àa] [ée]quip[ée]|ne (me )?recontact|stop|désabonn|d[ée]sabonn|unsubscribe|no thanks/.test(text)) {
    return "pas_interesse";
  }
  if (/rappel|recontact|plus tard|en (juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre|janvier|f[ée]vrier|mars|avril|mai)|busy|too busy|relancez/.test(text)) {
    return "rappel";
  }
  if (/int[ée]ress[ée]|d[ée]mo|rdv|rendez[- ]vous|disponibilit[ée]|tarif|prix|devis|essai|trial|en savoir plus/.test(text)) {
    return "interesse";
  }
  return "hors_sujet";
}

export async function categorizeReply(args: {
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isAutoReply: boolean;
}): Promise<{ category: ReplyCategory; source: "ai" | "heuristic" }> {
  if (args.isAutoReply) return { category: "auto_reply", source: "heuristic" };

  const stripped = args.bodyText
    ?? (args.bodyHtml ? args.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null)
    ?? "";
  const body = stripped.slice(0, 2000);

  const out = await runSkill<{ category: ReplyCategory }>({
    skill: "crm-reply-categorize",
    schema: replyCategorySchema,
    model: "haiku",
    input: { subject: args.subject ?? "(sans sujet)", body: body || "(vide)" },
  });
  if (out) return { category: out.category, source: "ai" };
  return { category: heuristic(args.subject, body), source: "heuristic" };
}

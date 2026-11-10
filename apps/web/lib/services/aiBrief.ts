/**
 * Brief de qualification IA d'un lead (A1 / feature F1).
 *
 * À partir des données du lead + de son enrichissement, produit :
 *  - summary : 2-3 phrases qui qualifient/"chauffent" le lead
 *  - angle   : l'angle d'approche commercial recommandé
 *  - score   : 0-100 (potentiel estimé)
 *
 * Skill Claude `crm-lead-brief` si CLAUDE_SKILLS_ENABLED (voir @crm/ai),
 * sinon fallback déterministe (toujours testable).
 * Ne jette jamais : en cas d'échec, retourne le fallback.
 */
import { leadBriefSchema, runSkill } from "@crm/ai";

export type LeadAiBrief = {
  summary: string;
  angle: string;
  score: number;
  source: "ai" | "fallback";
  at: string;
};

type LeadCtx = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sector: string | null;
  city: string | null;
};

function fallbackBrief(lead: LeadCtx, enrichment: unknown): Omit<LeadAiBrief, "source" | "at"> {
  const e = (enrichment ?? {}) as Record<string, unknown>;
  const news = (e.news as { items?: { title: string }[] } | undefined)?.items ?? [];
  const company = (e.company as { legalName?: string; foundedYear?: number } | undefined) ?? {};
  const who = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Le contact";
  const co = lead.company || company.legalName || "l'entreprise";
  const sectorTxt = lead.sector ? ` dans le secteur ${lead.sector}` : "";
  const cityTxt = lead.city ? ` (${lead.city})` : "";
  const newsTxt = news.length
    ? ` Actualité détectée : « ${news[0]!.title} » — bon prétexte d'accroche.`
    : "";
  let score = 35;
  if (lead.company) score += 15;
  if (lead.sector) score += 10;
  if (news.length) score += 20;
  if (company.foundedYear) score += 5;
  score = Math.min(95, score);
  return {
    summary: `${who} chez ${co}${sectorTxt}${cityTxt}.${newsTxt} Profil à qualifier par un premier contact ciblé.`,
    angle: news.length
      ? "Accroche personnalisée sur l'actualité récente de l'entreprise, puis proposition de valeur courte."
      : `Approche directe orientée bénéfice métier${sectorTxt ? " pour le secteur " + lead.sector : ""}, CTA léger (échange de 15 min).`,
    score,
  };
}

export async function generateLeadAiBrief(
  lead: LeadCtx,
  enrichment: unknown,
): Promise<LeadAiBrief> {
  const at = new Date().toISOString();
  const fb = fallbackBrief(lead, enrichment);
  const e = (enrichment ?? {}) as Record<string, unknown>;
  const news = (e.news as { items?: { title: string }[] } | undefined)?.items ?? [];
  const company = (e.company as { legalName?: string; nafCode?: string; foundedYear?: number } | undefined) ?? {};
  const site = (e.siteAnalysis as {
    summary?: string; activity?: string; signals?: string[]; fitScore?: number;
    decisionMaker?: { name?: string; role?: string | null } | null;
  } | undefined) ?? {};

  const out = await runSkill<{ summary: string; angle: string; score: number }>({
    skill: "crm-lead-brief",
    schema: leadBriefSchema,
    input: {
      contact: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null,
      company: lead.company,
      sector: lead.sector,
      city: lead.city,
      legalName: company.legalName ?? null,
      nafCode: company.nafCode ?? null,
      foundedYear: company.foundedYear ?? null,
      news: news.slice(0, 3).map((n) => n.title),
      siteSummary: site.summary ?? null,
      activity: site.activity ?? null,
      signals: site.signals ?? [],
      fitScore: site.fitScore ?? null,
      decisionMaker: site.decisionMaker?.name
        ? `${site.decisionMaker.name}${site.decisionMaker.role ? ` (${site.decisionMaker.role})` : ""}`
        : null,
    },
  });
  if (!out) return { ...fb, source: "fallback", at };
  return {
    summary: out.summary.slice(0, 800),
    angle: out.angle.slice(0, 400),
    score: Math.max(0, Math.min(100, Math.round(out.score))),
    source: "ai",
    at,
  };
}

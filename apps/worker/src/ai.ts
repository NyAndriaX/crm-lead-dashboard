/**
 * Helper IA partagé (worker) — couche "AI autopilot".
 *
 * Utilise la clé OpenAI de l'utilisateur propriétaire de l'action (créateur
 * de campagne, assigné du lead, etc.). Sans clé → fallback déterministe.
 */
import { openAiChatCompletion, resolveOpenAiCredentials, injectKnowledgeIntoMessages } from "@crm/db";

export type AiMessage = { role: "system" | "user"; content: string };

export async function aiComplete(args: {
  userId?: string | null;
  feature?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  fallback: () => string;
}): Promise<{ text: string; source: "ai" | "fallback" }> {
  const credentials = await resolveOpenAiCredentials(args.userId);
  if (!credentials) return { text: args.fallback(), source: "fallback" };

  const messages = await injectKnowledgeIntoMessages(args.userId, args.messages);

  const res = await openAiChatCompletion({
    credentials,
    messages,
    maxTokens: args.maxTokens,
    temperature: args.temperature,
    json: args.json,
    track:
      args.userId && args.feature
        ? { userId: args.userId, feature: args.feature }
        : undefined,
  });
  if (!res.ok) {
    console.warn(`[ai] OpenAI ${res.status ?? ""} — fallback`);
    return { text: args.fallback(), source: "fallback" };
  }
  return { text: res.content, source: "ai" };
}

export type LeadLite = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  sector: string | null;
  city: string | null;
  email: string | null;
};

/**
 * A2 (F2/F3/F6) — réécrit un email pour le rendre unique et adapté au
 * destinataire à partir de son contexte (lead + enrichment + aiBrief).
 */
export async function aiPersonalizeEmail(args: {
  userId?: string | null;
  subject: string;
  html: string;
  lead: LeadLite;
  enrichment: unknown;
  kind: "email" | "relance";
  stepIndex?: number;
}): Promise<{ subject: string; html: string; source: "ai" | "fallback" }> {
  const ctx = enrichmentSummary(args.enrichment);
  const who = [args.lead.firstName, args.lead.lastName].filter(Boolean).join(" ") || "le contact";
  const company = args.lead.company ?? "son entreprise";

  const fallback = () => JSON.stringify({ subject: args.subject, html: args.html });

  const { text, source } = await aiComplete({
    userId: args.userId,
    feature: args.kind === "relance" ? "sequence_personalize" : "email_personalize",
    maxTokens: 900,
    temperature: 0.7,
    json: true,
    fallback,
    messages: [
      {
        role: "system",
        content:
          "Tu es un SDR B2B francophone. On te donne un email (sujet + HTML) déjà " +
          "partiellement personnalisé par variables. Réécris-le pour qu'il soit UNIQUE " +
          "et naturellement adapté à ce destinataire précis, en t'appuyant sur le " +
          "contexte fourni. Garde la même intention commerciale, la même longueur " +
          "approximative, TOUS les liens <a> et la balise éventuelle de tracking/pixel " +
          "intacts, le ton professionnel et chaleureux. " +
          (args.kind === "relance"
            ? `C'est une RELANCE (étape ${args.stepIndex ?? "?"}) : reste bref, rappelle le contexte sans lourdeur. `
            : "C'est le PREMIER email : accroche soignée. ") +
          'Réponds UNIQUEMENT en JSON {"subject": string, "html": string}. Pas de markdown.',
      },
      {
        role: "user",
        content:
          `Destinataire : ${who} — ${company}\n` +
          `Contexte :\n${ctx || "(aucun enrichissement disponible)"}\n\n` +
          `Sujet actuel : ${args.subject}\n\nHTML actuel :\n${args.html.slice(0, 6000)}`,
      },
    ],
  });

  if (source === "fallback") {
    return { subject: args.subject, html: args.html, source: "fallback" };
  }
  try {
    const parsed = JSON.parse(text) as { subject?: string; html?: string };
    return {
      subject: (parsed.subject && parsed.subject.trim()) || args.subject,
      html: (parsed.html && parsed.html.trim()) || args.html,
      source: "ai",
    };
  } catch {
    return { subject: args.subject, html: args.html, source: "fallback" };
  }
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
  const brief = e.aiBrief as { summary?: string; angle?: string } | undefined;
  if (brief?.summary) parts.push(`Brief : ${brief.summary}`);
  if (brief?.angle) parts.push(`Angle conseillé : ${brief.angle}`);
  return parts.join("\n");
}

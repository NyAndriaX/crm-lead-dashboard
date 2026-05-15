/**
 * Helper IA partagé (worker) — couche "AI autopilot".
 *
 * Stratégie commune à A1 (brief qualification), A2 (personnalisation
 * message) et A4 (auto-réponse) :
 *   - Si OPENAI_API_KEY défini → appel Chat Completions (gpt-4o-mini).
 *   - Sinon → fallback déterministe (toujours testable, jamais bloquant).
 *
 * Ne jette jamais : en cas d'erreur réseau/API, on retombe sur le fallback.
 */

export type AiMessage = { role: "system" | "user"; content: string };

export async function aiComplete(args: {
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  fallback: () => string;
}): Promise<{ text: string; source: "ai" | "fallback" }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { text: args.fallback(), source: "fallback" };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_AUTOPILOT_MODEL ?? "gpt-4o-mini",
        messages: args.messages,
        temperature: args.temperature ?? 0.6,
        max_tokens: args.maxTokens ?? 600,
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      console.warn(`[ai] OpenAI HTTP ${res.status} — fallback`);
      return { text: args.fallback(), source: "fallback" };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return { text: args.fallback(), source: "fallback" };
    return { text: content, source: "ai" };
  } catch (e) {
    console.warn(`[ai] erreur, fallback :`, e instanceof Error ? e.message : e);
    return { text: args.fallback(), source: "fallback" };
  }
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
  const ctx = enrichmentSummary(args.enrichment);
  const who = [args.lead.firstName, args.lead.lastName].filter(Boolean).join(" ") || "le contact";
  const company = args.lead.company ?? "son entreprise";

  const fallback = () => JSON.stringify({ subject: args.subject, html: args.html });

  const { text, source } = await aiComplete({
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

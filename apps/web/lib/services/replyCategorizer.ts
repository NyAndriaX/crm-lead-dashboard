/**
 * Catégoriseur de réponses (R-04) — version web.
 */
import { openAiChatCompletion, resolveOpenAiCredentials } from "@crm/db";

export type ReplyCategory =
  | "interesse"
  | "pas_interesse"
  | "hors_sujet"
  | "rappel"
  | "auto_reply";

const VALID: ReadonlySet<ReplyCategory> = new Set([
  "interesse", "pas_interesse", "hors_sujet", "rappel", "auto_reply",
]);

const PROMPT_SYSTEM = `Tu es un classifieur de réponses email B2B en français.
À partir du sujet et du corps d'une réponse reçue par un commercial, retourne UNIQUEMENT un JSON valide :
{"category": "interesse" | "pas_interesse" | "hors_sujet" | "rappel" | "auto_reply"}

Règles :
- "interesse" : signal d'achat / questions produit / RDV demandé.
- "pas_interesse" : refus clair (pas intéressé, déjà équipé, ne pas recontacter).
- "rappel" : demande à être recontacté plus tard.
- "hors_sujet" : mauvaise adresse, RH/admin, hors contexte commercial.
- "auto_reply" : absence, congés, OOO.

Réponds avec UNIQUEMENT le JSON.`;

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
  userId?: string | null;
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

  const credentials = await resolveOpenAiCredentials(args.userId);
  if (!credentials) return { category: heuristic(args.subject, body), source: "heuristic" };

  try {
    const res = await openAiChatCompletion({
      credentials,
      track: args.userId ? { userId: args.userId, feature: "reply_categorize" } : undefined,
      messages: [
        { role: "system", content: PROMPT_SYSTEM },
        {
          role: "user",
          content: `Sujet : ${args.subject ?? "(sans sujet)"}\n\nCorps :\n${body || "(vide)"}`,
        },
      ],
      temperature: 0,
      maxTokens: 30,
      json: true,
    });
    if (!res.ok) return { category: heuristic(args.subject, body), source: "heuristic" };
    const parsed = JSON.parse(res.content) as { category?: string };
    const cat = parsed.category as ReplyCategory | undefined;
    if (cat && VALID.has(cat)) return { category: cat, source: "ai" };
    return { category: heuristic(args.subject, body), source: "heuristic" };
  } catch {
    return { category: heuristic(args.subject, body), source: "heuristic" };
  }
}

/**
 * Catégorisation automatique des réponses entrantes (R-04).
 * Utilise la clé OpenAI de l'utilisateur assigné au lead (si fourni).
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
- "interesse" : le prospect répond positivement, pose une question produit, demande un RDV/démo, accepte les échanges.
- "pas_interesse" : refus clair (pas intéressé, déjà équipé, ne pas recontacter, désinscription).
- "rappel" : demande explicite à être recontacté plus tard (vacances, occupé, "rappellez-moi en juin").
- "hors_sujet" : mauvaise adresse, question RH/admin, signature seule, hors contexte commercial.
- "auto_reply" : message automatique (absence, congés, vacation, OOO).

Réponds avec UNIQUEMENT le JSON, sans markdown ni texte additionnel.`;

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
  if (!credentials) {
    return { category: heuristic(args.subject, body), source: "heuristic" };
  }

  try {
    const res = await openAiChatCompletion({
      credentials,
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
    if (!res.ok) {
      console.warn(`[categorizer] OpenAI ${res.status ?? ""}`);
      return { category: heuristic(args.subject, body), source: "heuristic" };
    }
    const parsed = JSON.parse(res.content) as { category?: string };
    const cat = parsed.category as ReplyCategory | undefined;
    if (cat && VALID.has(cat)) {
      return { category: cat, source: "ai" };
    }
    console.warn(`[categorizer] OpenAI réponse invalide :`, res.content);
    return { category: heuristic(args.subject, body), source: "heuristic" };
  } catch (e) {
    console.warn(`[categorizer] erreur IA, fallback heuristique :`, e instanceof Error ? e.message : e);
    return { category: heuristic(args.subject, body), source: "heuristic" };
  }
}

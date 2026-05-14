/**
 * Catégorisation automatique des réponses entrantes (R-04).
 *
 * Stratégie :
 *  1. Si `OPENAI_API_KEY` est défini → appel GPT-4o-mini (réponse JSON courte).
 *  2. Sinon → fallback heuristique sur mots-clés FR/EN.
 *
 * Catégories possibles (alignées sur InboxMessage.category) :
 *  - "interesse"       : signal d'achat / questions sur le produit / RDV demandé
 *  - "pas_interesse"   : refus explicite
 *  - "hors_sujet"      : question administrative / mauvaise adresse
 *  - "rappel"          : demande de recontact ultérieur
 *  - "auto_reply"      : auto-reply (déjà détecté par headers, ici en redondance)
 */

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
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isAutoReply: boolean;
}): Promise<{ category: ReplyCategory; source: "ai" | "heuristic" }> {
  if (args.isAutoReply) return { category: "auto_reply", source: "heuristic" };

  const stripped = args.bodyText
    ?? (args.bodyHtml ? args.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null)
    ?? "";
  // Clip pour la requête IA (et pour les logs)
  const body = stripped.slice(0, 2000);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { category: heuristic(args.subject, body), source: "heuristic" };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_REPLY_CATEGORIZER_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: PROMPT_SYSTEM },
          {
            role: "user",
            content: `Sujet : ${args.subject ?? "(sans sujet)"}\n\nCorps :\n${body || "(vide)"}`,
          },
        ],
        temperature: 0,
        max_tokens: 30,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn(`[categorizer] OpenAI HTTP ${res.status}`);
      return { category: heuristic(args.subject, body), source: "heuristic" };
    }
    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { category?: string };
    const cat = parsed.category as ReplyCategory | undefined;
    if (cat && VALID.has(cat)) {
      return { category: cat, source: "ai" };
    }
    console.warn(`[categorizer] OpenAI réponse invalide :`, content);
    return { category: heuristic(args.subject, body), source: "heuristic" };
  } catch (e) {
    console.warn(`[categorizer] erreur IA, fallback heuristique :`, e instanceof Error ? e.message : e);
    return { category: heuristic(args.subject, body), source: "heuristic" };
  }
}

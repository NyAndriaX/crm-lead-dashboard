/**
 * Personnalisation IA d'un email par destinataire (A2 / features F2, F3, F6).
 *
 * Réécrit le corps (et éventuellement le sujet) d'un email pour le rendre
 * unique et adapté au lead, en s'appuyant sur son enrichissement / brief IA.
 * Utilisé par campaignSend (1er email) ET sequenceTick (relances) pour que
 * CHAQUE message envoyé soit singulier.
 *
 * Sans clé OpenAI utilisateur → fallback = remplacement de variables. Ne jette jamais.
 */
import { aiComplete, enrichmentSummary, type LeadLite } from "./ai";

function applyVars(
  html: string,
  lead: { firstName: string | null; lastName: string | null; company: string | null; email: string | null },
): string {
  return html
    .replace(/\{\{prenom\}\}/gi, lead.firstName ?? "")
    .replace(/\{\{nom\}\}/gi, lead.lastName ?? "")
    .replace(/\{\{entreprise\}\}/gi, lead.company ?? "")
    .replace(/\{\{email\}\}/gi, lead.email ?? "")
    .replace(/\{\{actu\}\}/gi, "")
    .replace(/\{\{custom\}\}/gi, "");
}

/**
 * @param stage  "premier" (campagne) ou "relance N" — oriente le ton.
 * Retourne le HTML personnalisé. Le sujet est laissé tel quel (réécriture
 * du sujet possible via personalizeSubject ci-dessous si besoin).
 */
export async function aiPersonalizeBody(args: {
  userId?: string | null;
  campaignId?: string | null;
  subject: string;
  bodyHtml: string;
  lead: LeadLite;
  enrichment: unknown;
  stage: string;
}): Promise<{ html: string; source: "ai" | "fallback" }> {
  const baseVars = applyVars(args.bodyHtml, {
    firstName: args.lead.firstName,
    lastName: args.lead.lastName,
    company: args.lead.company,
    email: args.lead.email,
  });

  const ctx = enrichmentSummary(args.enrichment);

  const who = [args.lead.firstName, args.lead.lastName].filter(Boolean).join(" ") || "le prospect";
  const isRelance = /relance/i.test(args.stage);
  const { text, source } = await aiComplete({
    userId: args.userId,
    campaignId: args.campaignId,
    feature: isRelance ? "sequence_personalize" : "email_personalize",
    maxTokens: 800,
    temperature: 0.7,
    fallback: () => baseVars,
    messages: [
      {
        role: "system",
        content:
          "Tu es un SDR B2B francophone. On te donne un email de prospection (HTML) et le contexte d'un lead. " +
          "Réécris le corps pour qu'il soit UNIQUE, naturel et personnalisé pour ce destinataire précis " +
          "(accroche sur son contexte/actualité si pertinent), en gardant la même intention, une longueur " +
          "similaire, le HTML valide et tout lien/balise éventuel intact. Réponds UNIQUEMENT avec le HTML du corps, " +
          "sans markdown, sans commentaire.",
      },
      {
        role: "user",
        content:
          `Étape : ${args.stage}\nDestinataire : ${who}\nSujet : ${args.subject}\n` +
          `Contexte lead :\n${ctx || "(aucun enrichissement — personnalise sobrement)"}\n\n` +
          `Email de base (HTML) :\n${baseVars}`,
      },
    ],
  });

  // Garde-fou : si l'IA renvoie quelque chose d'aberrant (trop court / vide),
  // on retombe sur la version variables.
  const cleaned = text.trim();
  if (source === "fallback" || cleaned.length < 20) {
    return { html: baseVars, source: "fallback" };
  }
  return { html: cleaned, source: "ai" };
}

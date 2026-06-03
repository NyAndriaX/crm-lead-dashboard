/**
 * Suggestion de variantes (sujet + corps ou corps seul) via OpenAI.
 * Utilise la clé OpenAI de l'utilisateur courant.
 */
import { z } from "zod";
import { openAiChatCompletion, resolveOpenAiCredentials } from "@crm/db";
import { ApiError } from "@/lib/api";

export type GenerateEmailAiVariantsInput = {
  userId: string;
  mode: "template" | "block";
  subject?: string;
  bodyHtml: string;
  variables: string[];
  leadContext?: {
    prenom?: string;
    entreprise?: string;
    secteur?: string;
    titre?: string;
    actu?: string;
    consigne?: string;
  };
};

const variantSchema = z.object({
  label: z.string(),
  subject: z.string().optional(),
  bodyHtml: z.string(),
});

const variantsOutputSchema = z.object({
  variants: z.array(variantSchema).min(1).max(5),
});

function buildUserPayload(input: GenerateEmailAiVariantsInput): string {
  const vars = input.variables.length ? input.variables.join(", ") : "(aucune)";
  const ctx = input.leadContext;
  const ctxLines = ctx
    ? [
        ctx.prenom ? `Prénom : ${ctx.prenom}` : "",
        ctx.entreprise ? `Entreprise : ${ctx.entreprise}` : "",
        ctx.secteur ? `Secteur : ${ctx.secteur}` : "",
        ctx.titre ? `Titre : ${ctx.titre}` : "",
        ctx.actu ? `Actualité : ${ctx.actu}` : "",
        ctx.consigne ? `Consigne : ${ctx.consigne}` : "",
      ].filter(Boolean).join("\n")
    : "";
  return [
    `Mode : ${input.mode}`,
    input.mode === "template" ? `Sujet actuel : ${input.subject ?? ""}` : "",
    `Variables de fusion à conserver : ${vars}`,
    ctxLines ? `Contexte lead :\n${ctxLines}` : "",
    `Brouillon HTML :\n${input.bodyHtml.slice(0, 12_000)}`,
  ].filter(Boolean).join("\n\n");
}

export async function generateEmailAiVariants(
  input: GenerateEmailAiVariantsInput,
): Promise<z.infer<typeof variantsOutputSchema>> {
  const credentials = await resolveOpenAiCredentials(input.userId);
  if (!credentials) {
    throw new ApiError(
      503,
      "Personnalisation IA indisponible : configurez votre clé OpenAI dans Mon compte → Intégration IA.",
      "ai_disabled",
    );
  }

  const system = [
    "Vous aidez à rédiger des emails B2B en français.",
    'Répondez UNIQUEMENT avec un JSON valide au format : {"variants":[{"label":"...","subject":"...","bodyHtml":"..."}]}',
    "Proposez 2 ou 3 variantes de ton (plus direct, plus relationnel, plus formel) en réutilisant la structure HTML (balises, liens).",
    "Conservez impérativement les variables de fusion sous forme {{nom}} (ex. {{prenom}}, {{entreprise}}, {{actu}}, {{custom}}) là où elles apparaissent dans le brouillon.",
    "N'inventez pas de chiffres, clients ou faits non fournis dans le contexte.",
    input.mode === "block"
      ? "Pour chaque variante, le champ subject doit être une chaîne vide \"\"."
      : "Chaque variante doit inclure un subject non vide et un bodyHtml non vide.",
  ].join(" ");

  const res = await openAiChatCompletion({
    credentials,
    messages: [
      { role: "system", content: system },
      { role: "user", content: buildUserPayload(input) },
    ],
    temperature: 0.7,
    maxTokens: 2500,
    json: true,
  });

  if (!res.ok) {
    const errText = res.error ?? "";
    if (res.status === 401) {
      throw new ApiError(502, "Clé OpenAI refusée — vérifiez votre configuration.", "openai_auth");
    }
    throw new ApiError(
      502,
      `OpenAI a renvoyé une erreur${res.status ? ` (${res.status})` : ""}. ${errText.slice(0, 200)}`,
      "openai_error",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    throw new ApiError(502, "Réponse OpenAI illisible (JSON invalide).", "openai_parse");
  }

  const out = variantsOutputSchema.safeParse(parsed);
  if (!out.success) {
    throw new ApiError(502, "Format de variantes IA inattendu.", "openai_format", out.error.flatten());
  }
  return out.data;
}

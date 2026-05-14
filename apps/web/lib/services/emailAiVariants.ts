import { z } from "zod";
import { ApiError } from "@/lib/api";

const variantsOutputSchema = z.object({
  variants: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        subject: z.string().min(1).max(300).optional(),
        bodyHtml: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
});

export type EmailAiMode = "template" | "block";

export type LeadContextForAi = {
  prenom?: string;
  entreprise?: string;
  secteur?: string;
  titre?: string;
  actu?: string;
  consigne?: string;
};

export type GenerateEmailAiVariantsInput = {
  mode: EmailAiMode;
  subject?: string;
  bodyHtml: string;
  variables: string[];
  leadContext?: LeadContextForAi;
};

function buildUserPayload(input: GenerateEmailAiVariantsInput): string {
  const vars = input.variables.length ? input.variables.join(", ") : "(aucune liste — utilisez {{prenom}}, {{entreprise}}, {{actu}}, {{custom}} si pertinent)";
  const ctx = input.leadContext;
  const ctxLines = ctx
    ? [
        ctx.prenom && `Prénom exemple : ${ctx.prenom}`,
        ctx.entreprise && `Entreprise : ${ctx.entreprise}`,
        ctx.secteur && `Secteur : ${ctx.secteur}`,
        ctx.titre && `Titre / fonction : ${ctx.titre}`,
        ctx.actu && `Actualité / contexte : ${ctx.actu}`,
        ctx.consigne && `Consigne rédactionnelle : ${ctx.consigne}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  if (input.mode === "template") {
    return [
      `Mode : template email complet (sujet + corps HTML).`,
      `Sujet actuel : ${input.subject?.trim() || "(vide)"}`,
      `Variables connues : ${vars}`,
      ctxLines && `Contexte lead (pour personnaliser le ton, sans inventer de faits) :\n${ctxLines}`,
      `Corps HTML actuel :\n${input.bodyHtml}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `Mode : bloc HTML réutilisable (pas de ligne d'objet email). Ne renvoie pas de subject, ou renvoie une chaîne vide pour subject.`,
    `Variables : ${vars}`,
    ctxLines && `Contexte :\n${ctxLines}`,
    `HTML actuel :\n${input.bodyHtml}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Suggestion de variantes (sujet + corps ou corps seul) via OpenAI.
 * Nécessite OPENAI_API_KEY. Les merge tags {{...}} doivent être conservés.
 */
export async function generateEmailAiVariants(
  input: GenerateEmailAiVariantsInput,
): Promise<z.infer<typeof variantsOutputSchema>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(
      503,
      "Personnalisation IA indisponible : définissez OPENAI_API_KEY sur le serveur.",
      "ai_disabled",
    );
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildUserPayload(input) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new ApiError(
      502,
      `Fournisseur IA indisponible (${res.status}).`,
      "ai_upstream_error",
      errText.slice(0, 500),
    );
  }

  const raw = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new ApiError(502, "Réponse IA vide.", "ai_empty");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ApiError(502, "Réponse IA non JSON.", "ai_parse_error");
  }

  const checked = variantsOutputSchema.safeParse(parsed);
  if (!checked.success) {
    throw new ApiError(502, "Format de réponse IA inattendu.", "ai_schema_error", checked.error.flatten());
  }

  if (input.mode === "block") {
    return {
      variants: checked.data.variants.map((v) => ({
        ...v,
        subject: undefined,
      })),
    };
  }

  for (const v of checked.data.variants) {
    if (!v.subject?.trim()) {
      throw new ApiError(502, "Une variante template sans sujet a été renvoyée.", "ai_invalid_variant");
    }
  }

  return checked.data;
}

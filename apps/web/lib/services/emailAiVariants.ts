import { z } from "zod";
import { emailVariantsSchema, isAiEnabled, runSkill } from "@crm/ai";
import { ApiError } from "@/lib/api";

const variantsOutputSchema = z.object({
  variants: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        // "" attendu en mode block ; non-vide vérifié plus bas en mode template.
        subject: z.string().max(300).optional(),
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

/**
 * Suggestion de variantes (sujet + corps ou corps seul) via le skill Claude
 * `crm-email-variants`. Nécessite un fournisseur d'IA configuré (voir @crm/ai).
 * Les merge tags {{...}} doivent être conservés.
 */
export async function generateEmailAiVariants(
  input: GenerateEmailAiVariantsInput,
): Promise<z.infer<typeof variantsOutputSchema>> {
  if (!(await isAiEnabled())) {
    throw new ApiError(
      503,
      "Variantes IA indisponibles : aucun fournisseur d'IA n'est configuré (Configuration › Intelligence artificielle).",
      "ai_disabled",
    );
  }

  const parsed = await runSkill<unknown>({
    skill: "crm-email-variants",
    schema: emailVariantsSchema,
    input: {
      mode: input.mode,
      subject: input.mode === "template" ? input.subject?.trim() || "" : "",
      bodyHtml: input.bodyHtml,
      variables: input.variables,
      leadContext: input.leadContext ?? null,
    },
  });
  if (parsed == null) {
    throw new ApiError(502, "Fournisseur d'IA indisponible ou réponse invalide.", "ai_upstream_error");
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

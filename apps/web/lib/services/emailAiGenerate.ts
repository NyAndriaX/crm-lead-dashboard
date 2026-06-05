/**
 * Génération complète d'un template email ou d'un bloc de contenu via OpenAI.
 */
import { z } from "zod";
import { openAiChatCompletion, resolveOpenAiCredentials } from "@crm/db";
import { ApiError } from "@/lib/api";

const TEMPLATE_VARS = ["prenom", "entreprise", "actu", "custom"] as const;

const templateOutputSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(100).optional(),
  subject: z.string().min(1).max(300),
  bodyHtml: z.string().min(1).max(200_000),
  variables: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const blockOutputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(["header", "content", "cta", "footer", "signature", "divider", "image", "social"]),
  htmlContent: z.string().min(1).max(200_000),
  variables: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export type GenerateEmailAiInput = {
  userId: string;
  mode: "template" | "block";
  /** Sujet ou brief décrivant ce qu'il faut générer. */
  brief: string;
  tone?: string;
  blockCategory?: string;
};

function variablesToCsv(vars: string[] | undefined): string {
  const list = (vars?.length ? vars : [...TEMPLATE_VARS]).slice(0, 20);
  return list.join(", ");
}

export async function generateEmailAiContent(input: GenerateEmailAiInput) {
  const credentials = await resolveOpenAiCredentials(input.userId);
  if (!credentials) {
    throw new ApiError(
      503,
      "Génération IA indisponible : configurez votre clé OpenAI dans Mon compte → Intégration IA.",
      "ai_disabled",
    );
  }

  const brief = input.brief.trim();
  if (!brief) {
    throw new ApiError(422, "Indiquez un sujet ou un brief pour lancer la génération.", "brief_required");
  }

  if (input.mode === "template") {
    const system = [
      "Tu es un expert en emails B2B de prospection en français.",
      'Réponds UNIQUEMENT avec un JSON valide :',
      '{"name":"...","category":"...","subject":"...","bodyHtml":"...","variables":["prenom","entreprise"]}',
      "Rédige un email professionnel, concis et chaleureux adapté au brief.",
      "Le bodyHtml doit utiliser des balises HTML simples (<p>, <strong>, <a> si besoin).",
      `Inclure les variables de fusion {{prenom}}, {{entreprise}}, {{actu}} ou {{custom}} dans le texte.`,
      "Le subject peut aussi contenir {{entreprise}} si pertinent.",
      "N'invente pas de chiffres, clients ou faits non mentionnés dans le brief.",
      input.tone ? `Ton souhaité : ${input.tone}.` : "",
    ].filter(Boolean).join(" ");

    const res = await openAiChatCompletion({
      credentials,
      track: { userId: input.userId, feature: "email_generate" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Brief / sujet :\n${brief.slice(0, 4000)}` },
      ],
      temperature: 0.7,
      maxTokens: 2000,
      json: true,
    });

    if (!res.ok) {
      throw new ApiError(502, `OpenAI : ${(res.error ?? "erreur").slice(0, 200)}`, "openai_error");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch {
      throw new ApiError(502, "Réponse OpenAI illisible.", "openai_parse");
    }

    const out = templateOutputSchema.safeParse(parsed);
    if (!out.success) {
      throw new ApiError(502, "Format de template IA inattendu.", "openai_format", out.error.flatten());
    }

    return {
      mode: "template" as const,
      name: out.data.name.trim(),
      category: out.data.category?.trim() || "Prospection",
      subject: out.data.subject.trim(),
      bodyHtml: out.data.bodyHtml.trim(),
      variables: variablesToCsv(out.data.variables),
    };
  }

  const blockCat = input.blockCategory?.trim() || "content";
  const system = [
    "Tu es un expert en emails HTML B2B en français.",
    'Réponds UNIQUEMENT avec un JSON valide :',
    '{"name":"...","description":"...","category":"content","htmlContent":"...","variables":["prenom"]}',
    `category doit être l'une de : header, content, cta, footer, signature, divider, image, social.`,
    blockCat !== "content" ? `Catégorie demandée : ${blockCat}.` : "",
    "htmlContent : fragment HTML réutilisable (pas de <html>/<body>).",
    "Utilise {{prenom}}, {{entreprise}}, {{actu}}, {{custom}} si pertinent.",
    input.tone ? `Ton : ${input.tone}.` : "",
  ].filter(Boolean).join(" ");

  const res = await openAiChatCompletion({
    credentials,
    track: { userId: input.userId, feature: "email_generate" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Brief du bloc :\n${brief.slice(0, 4000)}` },
    ],
    temperature: 0.7,
    maxTokens: 1800,
    json: true,
  });

  if (!res.ok) {
    throw new ApiError(502, `OpenAI : ${(res.error ?? "erreur").slice(0, 200)}`, "openai_error");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    throw new ApiError(502, "Réponse OpenAI illisible.", "openai_parse");
  }

  const out = blockOutputSchema.safeParse(parsed);
  if (!out.success) {
    throw new ApiError(502, "Format de bloc IA inattendu.", "openai_format", out.error.flatten());
  }

  return {
    mode: "block" as const,
    name: out.data.name.trim(),
    description: out.data.description?.trim() || "",
    category: out.data.category,
    htmlContent: out.data.htmlContent.trim(),
    variables: variablesToCsv(out.data.variables),
  };
}

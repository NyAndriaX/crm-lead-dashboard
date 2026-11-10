/**
 * JSON Schemas de sortie des Skills — passés au CLI (`--json-schema`), qui
 * valide la réponse avant de la renvoyer dans `structured_output`.
 */
import type { JsonSchema } from "./index";

export const REPLY_CATEGORIES = [
  "interesse",
  "pas_interesse",
  "hors_sujet",
  "rappel",
  "auto_reply",
] as const;

export const leadBriefSchema: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 800 },
    angle: { type: "string", minLength: 1, maxLength: 400 },
    score: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: ["summary", "angle", "score"],
  additionalProperties: false,
};

export const emailSchema: JsonSchema = {
  type: "object",
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 300 },
    html: { type: "string", minLength: 20 },
  },
  required: ["subject", "html"],
  additionalProperties: false,
};

export const replyCategorySchema: JsonSchema = {
  type: "object",
  properties: { category: { type: "string", enum: [...REPLY_CATEGORIES] } },
  required: ["category"],
  additionalProperties: false,
};

export const emailVariantsSchema: JsonSchema = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          label: { type: "string", minLength: 1, maxLength: 120 },
          subject: { type: "string", maxLength: 300 },
          bodyHtml: { type: "string", minLength: 1 },
        },
        required: ["label", "subject", "bodyHtml"],
        additionalProperties: false,
      },
    },
  },
  required: ["variants"],
  additionalProperties: false,
};

export const scrapingPlanSchema: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    queries: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 2, maxLength: 200 },
    },
    target_profile: { type: "string", minLength: 1, maxLength: 2000 },
    exclusions: { type: "array", maxItems: 6, items: { type: "string", maxLength: 200 } },
    suggested_limit: { type: "integer", minimum: 10, maximum: 120 },
    min_fit_score: { type: "integer", minimum: 0, maximum: 100 },
    rationale: { type: "string", maxLength: 600 },
  },
  required: ["name", "queries", "target_profile", "exclusions", "suggested_limit", "min_fit_score", "rationale"],
  additionalProperties: false,
};

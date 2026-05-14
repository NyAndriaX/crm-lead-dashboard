import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { generateEmailAiVariants } from "@/lib/services/emailAiVariants";

export const dynamic = "force-dynamic";

const leadContextSchema = z.object({
  prenom: z.string().max(80).optional(),
  entreprise: z.string().max(200).optional(),
  secteur: z.string().max(120).optional(),
  titre: z.string().max(120).optional(),
  actu: z.string().max(2000).optional(),
  consigne: z.string().max(2000).optional(),
});

const bodySchema = z.object({
  mode: z.enum(["template", "block"]),
  subject: z.string().max(300).optional(),
  bodyHtml: z.string().min(1, "Corps / HTML requis").max(200_000),
  variables: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  leadContext: leadContextSchema.optional(),
});

/** POST /api/emailing/ai-variants — M-05 variantes personnalisées (OpenAI, OPENAI_API_KEY). */
export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const body = await parseBody(req, bodySchema);
  if (body.mode === "template" && (!body.subject || !body.subject.trim())) {
    throw new ApiError(422, "Sujet requis pour le mode template.", "subject_required");
  }
  const data = await generateEmailAiVariants({
    mode: body.mode,
    subject: body.subject,
    bodyHtml: body.bodyHtml,
    variables: body.variables ?? [],
    leadContext: body.leadContext,
  });
  return json({ data });
});

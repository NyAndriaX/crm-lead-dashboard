import { z } from "zod";
import { handler, json, parseBody, requireSession } from "@/lib/api";
import { getOpenAiConfigPublic, upsertOpenAiConfig } from "@/lib/services/openaiConfig";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().trim().min(1).max(80).optional(),
  apiKey: z.string().max(256).optional(),
  clearApiKey: z.boolean().optional(),
  autoResponderMode: z.enum(["off", "draft", "auto"]).optional(),
  autoResponderMeetingUrl: z.string().trim().max(500).nullable().optional(),
  knowledgeText: z.string().max(20_000).nullable().optional(),
  knowledgeDocs: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(200),
        content: z.string().max(8_000),
        createdAt: z.string().optional(),
      }),
    )
    .max(10)
    .optional(),
  knowledgeBaseId: z.string().trim().min(1).nullable().optional(),
});

/** GET /api/me/openai-config — état de la config OpenAI du user courant (sans clé). */
export const GET = handler(async () => {
  const session = await requireSession();
  const data = await getOpenAiConfigPublic(session.sub);
  return json({ data });
});

/** PUT /api/me/openai-config — enregistre la config OpenAI personnelle. */
export const PUT = handler(async (req) => {
  const session = await requireSession();
  const body = await parseBody(req, upsertSchema);
  const data = await upsertOpenAiConfig(session.sub, body);
  return json({ data });
});

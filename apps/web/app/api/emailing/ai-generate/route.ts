import { z } from "zod";
import { handler, json, parseBody, requireSession } from "@/lib/api";
import { generateEmailAiContent } from "@/lib/services/emailAiGenerate";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["template", "block"]),
  brief: z.string().trim().min(3, "Brief trop court").max(4000),
  tone: z.string().trim().max(200).optional(),
  blockCategory: z.string().trim().max(40).optional(),
});

/** POST /api/emailing/ai-generate — génère un template ou bloc complet depuis un brief. */
export const POST = handler(async (req) => {
  const session = await requireSession();
  const body = await parseBody(req, bodySchema);
  const data = await generateEmailAiContent({
    userId: session.sub,
    mode: body.mode,
    brief: body.brief,
    tone: body.tone,
    blockCategory: body.blockCategory,
  });
  return json({ data });
});

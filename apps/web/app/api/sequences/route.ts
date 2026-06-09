import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { createSequence, listSequences } from "@/lib/services/sequences";

export const dynamic = "force-dynamic";

const stepSchema = z.object({
  delayDays: z.number().int().min(0).max(365),
  templateId: z.string().trim().min(1).nullable().optional(),
  subject: z.string().trim().min(1).max(500).nullable().optional(),
  bodyHtml: z.string().min(1).max(200_000).nullable().optional(),
  stopOnReply: z.boolean().optional(),
  aiPersonalize: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  steps: z.array(stepSchema).min(1).max(20),
  maxSteps: z.number().int().min(1).max(20).nullable().optional(),
  isPaused: z.boolean().optional(),
  campaignId: z.string().trim().min(1).nullable().optional(),
});

export const GET = handler(async () => {
  await requirePermission("sequences:manage");
  const data = await listSequences();
  return json({ data });
});

export const POST = handler(async (req) => {
  await requirePermission("sequences:manage");
  const input = await parseBody(req, createSchema);
  const seq = await createSequence(input);
  return created({ data: seq });
});

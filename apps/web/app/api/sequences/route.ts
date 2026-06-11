import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
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

const configSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1).nullable().optional(),
  knowledgeText: z.string().trim().max(20_000).nullable().optional(),
}).optional().nullable();

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  steps: z.array(stepSchema).min(1).max(20),
  maxSteps: z.number().int().min(1).max(20).nullable().optional(),
  isPaused: z.boolean().optional(),
  campaignId: z.string().trim().min(1).nullable().optional(),
  config: configSchema,
});

export const GET = handler(async () => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const data = await listSequences(scope);
  return json({ data });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const input = await parseBody(req, createSchema);
  const seq = await createSequence(input, scope);
  return created({ data: seq });
});

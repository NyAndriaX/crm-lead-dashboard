import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { createTemplateBlock, listTemplateBlocks } from "@/lib/services/templateBlocks";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  htmlContent: z.string().trim().min(1),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
});

export const GET = handler(async () => {
  const session = await requirePermission("settings:manage");
  const blocks = await listTemplateBlocks(session.sub);
  return json({ data: blocks });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const input = await parseBody(req, createSchema);
  const block = await createTemplateBlock(input, session.sub);
  return created({ data: block });
});

import { z } from "zod";
import { handler, json, notFound, parseBody, requirePermission } from "@/lib/api";
import { getTemplateBlock, updateTemplateBlock, deleteTemplateBlock } from "@/lib/services/templateBlocks";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  htmlContent: z.string().trim().min(1).optional(),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
});

export const GET = handler(async (req, ctx) => {
  await requirePermission("settings:manage");
  const params = ctx as { params: { id: string } };
  const id = params.params.id;
  const block = await getTemplateBlock(id);
  if (!block) return notFound();
  return json({ data: block });
});

export const PUT = handler(async (req, ctx) => {
  await requirePermission("settings:manage");
  const params = ctx as { params: { id: string } };
  const id = params.params.id;
  const input = await parseBody(req, updateSchema);
  const block = await updateTemplateBlock(id, input);
  return json({ data: block });
});

export const DELETE = handler(async (req, ctx) => {
  await requirePermission("settings:manage");
  const params = ctx as { params: { id: string } };
  const id = params.params.id;
  await deleteTemplateBlock(id);
  return json({ success: true });
});

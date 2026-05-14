import { z } from "zod";
import { handler, json, notFound, parseBody, requirePermission } from "@/lib/api";
import { getTemplateBlock, updateTemplateBlock, deleteTemplateBlock } from "@/lib/services/templateBlocks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  htmlContent: z.string().trim().min(1).optional(),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("settings:manage");
  const { id } = await params;
  const block = await getTemplateBlock(id);
  if (!block) return notFound();
  return json({ data: block });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const { id } = await params;
  const input = await parseBody(req, updateSchema);
  const block = await updateTemplateBlock(id, input);
  return json({ data: block });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("settings:manage");
  const { id } = await params;
  await deleteTemplateBlock(id);
  return json({ success: true });
});

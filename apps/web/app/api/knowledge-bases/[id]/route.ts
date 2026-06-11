import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { deleteKnowledgeBase, getKnowledgeBase, updateKnowledgeBase } from "@/lib/services/knowledgeBases";
import { ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  contentMd: z.string().trim().min(1).max(100_000).optional(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("settings:manage");
  const scope = toScope(s);
  const { id } = await params;
  const data = await getKnowledgeBase(id, scope);
  if (!data) throw new ApiError(404, "Base introuvable", "not_found");
  return json({ data });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("settings:manage");
  const scope = toScope(s);
  const { id } = await params;
  const input = await parseBody(req, updateSchema);
  const data = await updateKnowledgeBase(id, input, scope);
  return json({ data });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("settings:manage");
  const scope = toScope(s);
  const { id } = await params;
  await deleteKnowledgeBase(id, scope);
  return noContent();
});

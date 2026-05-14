import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission, ApiError } from "@/lib/api";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/services/templates";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  category: z.string().trim().max(100).optional().nullable(),
  subject: z.string().trim().min(1).max(200).optional(),
  bodyHtml: z.string().trim().min(1).optional(),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
});

export const GET = handler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const id = z.string().min(1).parse(params?.id);
  const template = await getTemplate(id);
  if (!template) throw new ApiError(404, "Template introuvable", "not_found");
  return json({ data: template });
});

export const PUT = handler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const id = z.string().min(1).parse(params?.id);
  const input = await parseBody(req, updateSchema);
  const template = await updateTemplate(id, input);
  return json({ data: template });
});

export const DELETE = handler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const id = z.string().min(1).parse(params?.id);
  await deleteTemplate(id);
  return noContent();
});

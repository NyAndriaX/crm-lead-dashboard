import { z } from "zod";
import { ApiError, handler, json, created, parseBody, requirePermission, requireSession } from "@/lib/api";
import { can } from "@/lib/rbac";
import { createTemplate, listTemplates } from "@/lib/services/templates";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().max(100).optional(),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
});

export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "settings:manage") && !can(s.role, "campaigns:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const templates = await listTemplates();
  return json({ data: templates });
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, createSchema);
  const template = await createTemplate(input);
  return created({ data: template });
});

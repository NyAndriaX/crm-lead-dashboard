import { z } from "zod";
import { ApiError, handler, json, created, parseBody, requirePermission, requireSession } from "@/lib/api";
import { can } from "@/lib/rbac";
import { createTemplate, listTemplates } from "@/lib/services/templates";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().max(100).optional(),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1),
  variables: z.array(z.string().trim().min(1)).optional(),
  isPublic: z.boolean().optional(),
  includeUnsubscribeLink: z.boolean().optional(),
});

export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "settings:manage") && !can(s.role, "campaigns:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const scope = toScope(s);
  const templates = await listTemplates(scope);
  return json({ data: templates });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("settings:manage");
  const input = await parseBody(req, createSchema);
  const template = await createTemplate(input, toScope(s));
  return created({ data: template });
});

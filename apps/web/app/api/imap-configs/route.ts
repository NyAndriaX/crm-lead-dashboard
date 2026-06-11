import { z } from "zod";
import { ApiError, handler, json, created, parseBody, parseQuery, requirePermission, requireSession } from "@/lib/api";
import { can } from "@/lib/rbac";
import { toScope } from "@/lib/scope";
import { createImapConfig, listImapConfigs } from "@/lib/services/imap";

export const dynamic = "force-dynamic";

const querySchema = z.object({ active: z.enum(["true", "false"]).optional() });

const createSchema = z.object({
  label: z.string().trim().min(1).max(100),
  host: z.string().trim().min(1),
  port: z.number().int().positive(),
  login: z.string().trim().min(1),
  password: z.string().min(1).max(256),
  isActive: z.boolean().optional(),
});

export const GET = handler(async (req) => {
  const s = await requireSession();
  if (!can(s.role, "settings:manage") && !can(s.role, "inbox:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const scope = toScope(s);
  const { active } = parseQuery(req, querySchema);
  const configs = await listImapConfigs(scope);
  return json({ data: active === "true" ? configs.filter((c) => c.isActive) : configs });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("settings:manage");
  const scope = toScope(s);
  const input = await parseBody(req, createSchema);
  const config = await createImapConfig(input, scope);
  return created({ data: config });
});

import { z } from "zod";
import { handler, json, created, parseBody, parseQuery, requirePermission } from "@/lib/api";
import { createSmtpConfig, listSmtpConfigs } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

const querySchema = z.object({ active: z.enum(["true", "false"]).optional() });

const createSchema = z.object({
  label: z.string().trim().min(1).max(100),
  host: z.string().trim().min(1),
  port: z.number().int().positive(),
  login: z.string().trim().min(1),
  password: z.string().min(1).max(256),
  fromName: z.string().trim().max(100).optional().nullable(),
  fromEmail: z.string().trim().email().optional().nullable(),
  dailyLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const GET = handler(async (req) => {
  await requirePermission("settings:manage");
  const { active } = parseQuery(req, querySchema);
  const configs = await listSmtpConfigs();
  return json({ data: active === "true" ? configs.filter((config) => config.isActive) : configs });
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, createSchema);
  const config = await createSmtpConfig(input);
  return created({ data: config });
});

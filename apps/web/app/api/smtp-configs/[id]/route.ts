import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission, ApiError } from "@/lib/api";
import { deleteSmtpConfig, getSmtpConfig, updateSmtpConfig } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  host: z.string().trim().min(1).optional(),
  port: z.number().int().positive().optional(),
  login: z.string().trim().min(1).optional(),
  password: z.string().max(256).optional().nullable(),
  fromName: z.string().trim().max(100).optional().nullable(),
  fromEmail: z.string().trim().email().optional().nullable(),
  dailyLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const GET = handler<Ctx>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const config = await getSmtpConfig(id);
  if (!config) throw new ApiError(404, "Configuration SMTP introuvable", "not_found");
  return json({ data: config });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  const config = await updateSmtpConfig(id, input);
  return json({ data: config });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteSmtpConfig(id);
  return noContent();
});

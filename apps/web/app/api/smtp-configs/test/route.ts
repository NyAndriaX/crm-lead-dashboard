import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { testSmtpConnection } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().positive(),
  login: z.string().trim().min(1),
  password: z.string().min(1).max(256),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, testSchema);
  const result = await testSmtpConnection(input);
  return json({ data: result });
});

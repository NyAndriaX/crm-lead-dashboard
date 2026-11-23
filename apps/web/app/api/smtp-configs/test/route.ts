import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { describeSmtpError, testSmtpConnection } from "@/lib/services/smtp";

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
  try {
    return json({ data: await testSmtpConnection(input) });
  } catch (e) {
    // Échec attendu (mauvais identifiants, port bloqué…) : 400 avec la cause, pas une erreur interne.
    throw new ApiError(400, `Échec de connexion SMTP : ${describeSmtpError(e)}`, "smtp_test_failed");
  }
});

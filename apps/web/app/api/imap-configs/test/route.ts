import { z } from "zod";
import { handler, json, parseBody, requirePermission, ApiError } from "@/lib/api";
import { testImapConnection } from "@/lib/services/imap";

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
    const result = await testImapConnection(input);
    return json({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message || (e as any).name || String(e) : String(e);
    throw new ApiError(400, `Échec de connexion IMAP : ${msg || "Erreur inconnue"}`, "imap_test_failed");
  }
});

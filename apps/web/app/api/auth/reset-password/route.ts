import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";
import { resetPasswordWithToken } from "@/lib/services/passwordReset";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
});

export const POST = handler(async (req) => {
  const { token, password } = await parseBody(req, schema);
  await resetPasswordWithToken(token, password);
  return json({ data: { ok: true } });
});

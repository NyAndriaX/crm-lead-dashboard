import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";
import { requestPasswordReset } from "@/lib/services/passwordReset";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
});

export const POST = handler(async (req) => {
  const { email } = await parseBody(req, schema);
  await requestPasswordReset(email);
  return json({
    data: {
      ok: true,
      message: "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.",
    },
  });
});

import { ApiError, handler, json, requirePermission } from "@/lib/api";
import { describeSmtpError, testSavedSmtpConfig } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/smtp-configs/:id/test — teste un compte enregistré sans ressaisir le mot de passe (ex. Gmail connecté).
export const POST = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("settings:manage");
  const { id } = await params;
  try {
    return json({ data: await testSavedSmtpConfig(id) });
  } catch (e) {
    throw new ApiError(400, `Échec de connexion : ${describeSmtpError(e)}`, "smtp_test_failed");
  }
});

/**
 * POST /api/oauth/microsoft/poll
 * Sonde le token endpoint jusqu'à consentement (max 120 s).
 * Body : { tenantId, clientId, clientSecret, deviceCode, interval? }
 * Retourne : { accessToken, refreshToken }
 */
import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { msOAuthCredsSchema, parseMsOAuthCreds } from "@/lib/oauth/microsoftSchemas";
import { pollDeviceCodeToken } from "@crm/db";

export const dynamic = "force-dynamic";

const bodySchema = msOAuthCredsSchema.extend({
  deviceCode: z.string().trim().min(1),
  interval: z.number().int().positive().optional(),
});

function mapOAuthPollError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("AADSTS7000218")) {
    throw new ApiError(
      400,
      "Microsoft exige le Client Secret à cette étape. Vérifiez que vous avez collé la Valeur du secret (affichée une seule fois à la création), pas l'ID du secret ni l'ID de l'application.",
      "azure_client_secret",
    );
  }
  if (msg.includes("authorization_pending")) {
    throw new ApiError(202, "Consentement en attente — connectez-vous sur le site Microsoft puis réessayez.", "authorization_pending");
  }
  if (msg.includes("expired_token") || msg.includes("Délai device code")) {
    throw new ApiError(408, "Code expiré — regénérez un nouveau code Microsoft.", "device_code_expired");
  }
  throw new ApiError(400, msg, "oauth_poll_failed");
}

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, bodySchema);
  const creds = parseMsOAuthCreds(input);
  try {
    const tokens = await pollDeviceCodeToken(
      creds,
      input.deviceCode,
      input.interval ?? 5,
      120_000,
    );
    return json({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresIn: tokens.expires_in,
      },
    });
  } catch (e) {
    mapOAuthPollError(e);
  }
});

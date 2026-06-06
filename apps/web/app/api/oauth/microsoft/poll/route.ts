/**
 * POST /api/oauth/microsoft/poll
 * Sonde le token endpoint jusqu'à consentement (max 120 s).
 * Body : { tenantId, clientId, clientSecret, deviceCode, interval? }
 * Retourne : { accessToken, refreshToken }
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { pollDeviceCodeToken } from "@crm/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  deviceCode: z.string().min(1),
  interval: z.number().int().positive().optional(),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, bodySchema);
  const tokens = await pollDeviceCodeToken(
    { tenantId: input.tenantId, clientId: input.clientId, clientSecret: input.clientSecret },
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
});

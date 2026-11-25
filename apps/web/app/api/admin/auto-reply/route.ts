/**
 * GET / PUT /api/admin/auto-reply — réponse automatique par l'IA : mode (off | draft | auto),
 * lien de prise de rendez-vous et compte d'envoi. ADMIN uniquement.
 */
import { z } from "zod";
import { handler, json, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { entityId } from "@/lib/schemas/common";
import { getAutoReplySettings, saveAutoReplySettings } from "@/lib/services/autoReply";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  mode: z.enum(["off", "draft", "auto"]),
  meetingUrl: z.string().trim().url("Lien invalide (https://…)").max(500).nullable().optional(),
  smtpConfigId: entityId.nullable().optional(),
});

export const GET = handler(async () => {
  await requireRole("ADMIN");
  return json({ data: await getAutoReplySettings() });
});

export const PUT = handler(async (req) => {
  const s = await requireRole("ADMIN");
  const input = await parseBody(req, putSchema);
  const data = await saveAutoReplySettings({ mode: input.mode, meetingUrl: input.meetingUrl ?? null, smtpConfigId: input.smtpConfigId ?? null }, s.sub);
  await audit({ userId: s.sub, action: "ai.auto_reply.update", entityType: "AiConfig", entityId: "default", ip: clientIp(req), diff: data });
  return json({ data });
});

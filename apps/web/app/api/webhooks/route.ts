import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createWebhook, listWebhooks, WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS as [string, ...string[]])).min(1).max(WEBHOOK_EVENTS.length),
  secret: z.string().min(8).max(120).optional(),
  isActive: z.boolean().optional(),
});

export const GET = handler(async () => {
  const session = await requirePermission("settings:manage");
  return json({ data: await listWebhooks(toScope(session)) });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const input = await parseBody(req, createSchema);
  const wh = await createWebhook(toScope(session), input);
  await audit({
    userId: session.sub,
    action: "webhook.create",
    entityType: "WebhookOut",
    entityId: wh.id,
    ip: clientIp(req),
    diff: { url: wh.url, events: wh.events },
  });
  return created({ data: wh });
});

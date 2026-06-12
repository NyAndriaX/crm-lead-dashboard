import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteWebhook, updateWebhook, WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as [string, ...string[]])).min(1).max(WEBHOOK_EVENTS.length).optional(),
  isActive: z.boolean().optional(),
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  const wh = await updateWebhook(id, toScope(session), input);
  await audit({
    userId: session.sub,
    action: "webhook.update",
    entityType: "WebhookOut",
    entityId: id,
    ip: clientIp(req),
    diff: input,
  });
  return json({ data: wh });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteWebhook(id, toScope(session));
  await audit({
    userId: session.sub,
    action: "webhook.delete",
    entityType: "WebhookOut",
    entityId: id,
    ip: clientIp(req),
  });
  return noContent();
});

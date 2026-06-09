import { z } from "zod";
import { savePushSubscription } from "@crm/db";
import { handler, json, noContent, parseBody, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = handler(async (req) => {
  const session = await requireSession();
  const body = await parseBody(req, subSchema);
  await savePushSubscription(session.sub, body);
  return json({ data: { ok: true } });
});

export const DELETE = handler(async (req) => {
  const session = await requireSession();
  const { removePushSubscription } = await import("@crm/db");
  const body = await parseBody(req, z.object({ endpoint: z.string().url() }));
  await removePushSubscription(session.sub, body.endpoint);
  return noContent();
});

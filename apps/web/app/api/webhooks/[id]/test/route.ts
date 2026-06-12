import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { testWebhook } from "@/lib/services/webhooks";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  const session = await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const result = await testWebhook(id, toScope(session));
  return json({ data: result });
});

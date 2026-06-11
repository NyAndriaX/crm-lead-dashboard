import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { getLeadThread } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("inbox:read");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await getLeadThread(id, scope);
  return json({ data });
});

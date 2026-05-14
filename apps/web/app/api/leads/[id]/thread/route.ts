import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { getLeadThread } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("inbox:read");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await getLeadThread(id);
  return json({ data });
});

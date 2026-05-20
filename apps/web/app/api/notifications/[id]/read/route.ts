import { z } from "zod";
import { handler, noContent, requireSession } from "@/lib/api";
import { markRead } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  const s = await requireSession();
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await markRead(s.sub, id);
  return noContent();
});

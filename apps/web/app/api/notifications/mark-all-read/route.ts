import { handler, json, requireSession } from "@/lib/api";
import { markAllRead } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  const s = await requireSession();
  const result = await markAllRead(s.sub);
  return json({ data: result });
});

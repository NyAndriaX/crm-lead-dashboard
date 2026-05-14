import { handler, json, requireSession } from "@/lib/api";
import { countUnreadForUser } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await requireSession();
  const count = await countUnreadForUser(s.sub);
  return json({ data: { count } });
});

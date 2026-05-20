import { handler, json, requirePermission } from "@/lib/api";
import { enqueue } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  await requirePermission("settings:manage");
  await enqueue("imap-sync");
  return json({ data: { ok: true, message: "Sync IMAP demandé" } });
});

import { handler, json, requirePermission } from "@/lib/api";
import { enqueue } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  const session = await requirePermission("settings:manage");
  await enqueue("imap-sync", { ownerUserId: session.sub });
  return json({ data: { ok: true, message: "Sync IMAP demandé pour vos comptes" } });
});

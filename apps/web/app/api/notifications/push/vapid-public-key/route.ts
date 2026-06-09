import { getVapidPublicKey } from "@crm/db";
import { handler, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const publicKey = getVapidPublicKey();
  return json({ data: { publicKey, enabled: Boolean(publicKey) } });
});

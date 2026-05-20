import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { checkSmtpDnsRecords } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

const dnsSchema = z.object({
  domain: z.string().trim().min(1).regex(/^[a-zA-Z0-9.-]+$/, "Nom de domaine invalide"),
  dkimSelector: z.string().trim().max(100).optional().nullable(),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, dnsSchema);
  const result = await checkSmtpDnsRecords({
    domain: input.domain,
    dkimSelector: input.dkimSelector ?? undefined,
  });
  return json({ data: result });
});

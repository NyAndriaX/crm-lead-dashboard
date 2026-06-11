import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { currentOrganization, updateOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  siteName: z.string().trim().min(1).max(80).optional(),
  siteIconUrl: z.string().trim().max(500_000).optional().nullable(),
});

export const GET = handler(async () => {
  const org = await currentOrganization();
  return json({ data: org.branding });
});

export const PUT = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, updateSchema);
  const org = await updateOrganization({ branding: input });
  return json({ data: org.branding });
});

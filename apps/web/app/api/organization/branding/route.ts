import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { currentOrganization, updateOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const updateSchema = z.object({
  siteName: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(80).optional(),
  ),
  siteIconUrl: z.preprocess(
    emptyToNull,
    z.string().max(2_000_000).nullable().optional(),
  ),
  siteIconSizeSidebar: z.number().int().min(16).max(64).optional(),
  siteIconSizeLogin: z.number().int().min(24).max(80).optional(),
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

import { z } from "zod";
import { ApiError, created, handler, requirePermission } from "@/lib/api";
import { duplicateTemplate } from "@/lib/services/templates";

export const dynamic = "force-dynamic";

export const POST = handler<{ params: { id: string } }>(async (_req, { params }) => {
  await requirePermission("settings:manage");
  const id = z.string().min(1).parse(params?.id);
  const copy = await duplicateTemplate(id);
  if (!copy) throw new ApiError(404, "Template introuvable", "not_found");
  return created({ data: copy });
});

import { z } from "zod";
import { ApiError, created, handler, requirePermission } from "@/lib/api";
import { duplicateTemplateBlock } from "@/lib/services/templateBlocks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  const claims = await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const copy = await duplicateTemplateBlock(id, claims.sub);
  if (!copy) throw new ApiError(404, "Bloc introuvable", "not_found");
  return created({ data: copy });
});

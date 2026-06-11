import { z } from "zod";
import { ApiError, created, handler, requirePermission } from "@/lib/api";
import { duplicateTemplate } from "@/lib/services/templates";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("settings:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const copy = await duplicateTemplate(id, toScope(s));
  return created({ data: copy });
});

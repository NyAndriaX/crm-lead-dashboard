import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import {
  enrollLeadsInSequence,
  enrollSegmentInSequence,
  listSequenceLeads,
  removeLeadFromSequence,
} from "@/lib/services/sequences";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Inscription par liste de leads, ou d'un segment entier (leads joignables).
const enrollSchema = z.union([
  z.object({ leadIds: z.array(z.string().trim().min(1)).min(1).max(2000) }),
  z.object({ segmentId: z.string().trim().min(1) }),
]);

const removeSchema = z.object({
  leadId: z.string().trim().min(1),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("sequences:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await listSequenceLeads(id);
  return json({ data });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  await requirePermission("sequences:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, enrollSchema);
  const result = "segmentId" in input
    ? await enrollSegmentInSequence(id, input.segmentId)
    : await enrollLeadsInSequence(id, input.leadIds);
  return created({ data: result });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  await requirePermission("sequences:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, removeSchema);
  await removeLeadFromSequence(id, input.leadId);
  return json({ data: { ok: true } });
});

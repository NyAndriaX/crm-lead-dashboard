import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import {
  enrollLeadsInSequence,
  listSequenceLeads,
  removeLeadFromSequence,
} from "@/lib/services/sequences";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const enrollSchema = z.object({
  leadIds: z.array(z.string().trim().min(1)).min(1).max(2000),
});

const removeSchema = z.object({
  leadId: z.string().trim().min(1),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await listSequenceLeads(id, scope);
  return json({ data });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, enrollSchema);
  const result = await enrollLeadsInSequence(id, input.leadIds, scope);
  return created({ data: result });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, removeSchema);
  await removeLeadFromSequence(id, input.leadId, scope);
  return json({ data: { ok: true } });
});

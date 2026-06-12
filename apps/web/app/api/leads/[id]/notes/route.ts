import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { LEAD_NOTE_LEGAL_BASES } from "@/lib/leadLegalBasis";
import { createLeadNote, listLeadNotes } from "@/lib/services/leadNotes";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const legalValues = LEAD_NOTE_LEGAL_BASES.map((b) => b.value) as [string, ...string[]];

const createSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  legalBasis: z.enum(legalValues).optional().nullable(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  const session = await requirePermission("leads:read");
  const { id } = await params;
  return json({ data: await listLeadNotes(id, toScope(session)) });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id } = await params;
  const input = await parseBody(req, createSchema);
  const note = await createLeadNote(id, input, toScope(session), session.sub);
  await audit({
    userId: session.sub,
    action: "lead.note.create",
    entityType: "Lead",
    entityId: id,
    ip: clientIp(req),
  });
  return created({ data: note });
});

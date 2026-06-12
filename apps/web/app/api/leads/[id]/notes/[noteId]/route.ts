import { z } from "zod";
import { handler, noContent, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteLeadNote } from "@/lib/services/leadNotes";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id, noteId: rawNoteId } = await params;
  const noteId = z.string().min(1).parse(rawNoteId);
  await deleteLeadNote(id, noteId, toScope(session), session.sub);
  await audit({
    userId: session.sub,
    action: "lead.note.delete",
    entityType: "Lead",
    entityId: id,
    ip: clientIp(req),
  });
  return noContent();
});

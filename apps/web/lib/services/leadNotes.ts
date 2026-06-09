import { prisma } from "@crm/db";
import { ApiError } from "@/lib/api";
import type { LeadNoteLegalBasis } from "@/lib/leadLegalBasis";

export type LeadNoteDTO = {
  id: string;
  leadId: string;
  userId: string | null;
  authorName: string | null;
  content: string;
  legalBasis: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function assertLead(id: string) {
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!lead || lead.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
}

export async function listLeadNotes(leadId: string): Promise<LeadNoteDTO[]> {
  await assertLead(leadId);
  const rows = await prisma.leadNote.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    userId: r.userId,
    authorName: r.user?.name ?? null,
    content: r.content,
    legalBasis: r.legalBasis,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createLeadNote(
  leadId: string,
  input: { content: string; legalBasis?: LeadNoteLegalBasis | string | null },
  actorId?: string,
): Promise<LeadNoteDTO> {
  await assertLead(leadId);
  const content = input.content.trim();
  if (!content) throw new ApiError(400, "Contenu requis", "validation_error");

  const row = await prisma.leadNote.create({
    data: {
      leadId,
      userId: actorId ?? null,
      content: content.slice(0, 10_000),
      legalBasis: input.legalBasis ?? null,
    },
    include: { user: { select: { name: true } } },
  });

  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: actorId ?? null,
      type: "note_added",
      payload: { noteId: row.id, legalBasis: row.legalBasis } as object,
    },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActionAt: new Date() } });

  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    authorName: row.user?.name ?? null,
    content: row.content,
    legalBasis: row.legalBasis,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteLeadNote(leadId: string, noteId: string, actorId?: string): Promise<void> {
  await assertLead(leadId);
  const note = await prisma.leadNote.findFirst({ where: { id: noteId, leadId } });
  if (!note) throw new ApiError(404, "Note introuvable", "not_found");
  await prisma.leadNote.delete({ where: { id: noteId } });
  await prisma.leadHistory.create({
    data: { leadId, userId: actorId ?? null, type: "note_deleted", payload: { noteId } as object },
  });
}

import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id/engagement — événements email (campagnes + séquences) et parcours de relance du lead.
export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("leads:read");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const [events, sequences] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { leadId: id },
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: { id: true, eventType: true, occurredAt: true, url: true, sequenceId: true, campaign: { select: { id: true, name: true } } },
    }),
    prisma.sequenceLead.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, currentStep: true, sentCount: true, stoppedReason: true, nextSendAt: true,
        sequence: { select: { id: true, name: true, steps: true } },
      },
    }),
  ]);
  const seqNames = new Map(sequences.map((s) => [s.sequence.id, s.sequence.name]));
  const missing = [...new Set(events.map((e) => e.sequenceId).filter((s): s is string => !!s && !seqNames.has(s)))];
  if (missing.length) {
    for (const s of await prisma.sequence.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) seqNames.set(s.id, s.name);
  }
  return json({
    data: {
      events: events.map((e) => ({
        id: e.id,
        type: String(e.eventType),
        occurredAt: e.occurredAt,
        url: e.url,
        campaign: e.campaign,
        sequence: e.sequenceId ? { id: e.sequenceId, name: seqNames.get(e.sequenceId) ?? "Séquence" } : null,
      })),
      sequences: sequences.map((s) => ({
        id: s.id, status: s.status, currentStep: s.currentStep, sentCount: s.sentCount, stoppedReason: s.stoppedReason, nextSendAt: s.nextSendAt,
        sequence: { id: s.sequence.id, name: s.sequence.name, stepCount: Array.isArray(s.sequence.steps) ? s.sequence.steps.length : 0 },
      })),
    },
  });
});

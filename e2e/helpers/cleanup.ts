import { prisma } from "../../packages/db/src/index";

/** Nettoie tous les artefacts e2e d'un run (préfixe `e2e-{runId}`). */
export async function cleanupE2eRun(runId: string): Promise<void> {
  const prefix = `e2e-${runId}`;

  // Campagnes e2e
  await prisma.campaign.deleteMany({ where: { name: { startsWith: prefix } } });

  // Séquences e2e
  const seqs = await prisma.sequence.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  if (seqs.length) {
    await prisma.sequenceLead.deleteMany({ where: { sequenceId: { in: seqs.map((s) => s.id) } } });
    await prisma.sequence.deleteMany({ where: { id: { in: seqs.map((s) => s.id) } } });
  }

  // Segments e2e
  await prisma.segment.deleteMany({ where: { name: { startsWith: prefix } } });

  // Vues leads e2e
  await prisma.leadView.deleteMany({ where: { name: { startsWith: prefix } } });

  // Templates e2e
  await prisma.template.deleteMany({ where: { name: { startsWith: prefix } } });

  // Pipeline stages e2e — détacher les leads avant suppression
  const e2eStages = await prisma.pipelineStage.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  if (e2eStages.length > 0) {
    const stageIds = e2eStages.map((s) => s.id);
    await prisma.leadPipeline.deleteMany({ where: { stageId: { in: stageIds } } });
    await prisma.lead.updateMany({
      where: { pipelineStageId: { in: stageIds } },
      data: { pipelineStageId: null },
    });
    await prisma.pipelineStage.deleteMany({ where: { id: { in: stageIds } } });
  }

  // Missions scraping
  const missions = await prisma.scrapingMission.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  if (missions.length) {
    await prisma.scrapedLeadBuffer.deleteMany({ where: { missionId: { in: missions.map((m) => m.id) } } });
    await prisma.scrapingMission.deleteMany({ where: { id: { in: missions.map((m) => m.id) } } });
  }

  // Logs OpenAI e2e
  await prisma.openAiUsageLog.deleteMany({ where: { feature: { startsWith: "e2e-" } } });

  // Leads e2e
  const leads = await prisma.lead.findMany({
    where: {
      OR: [{ source: { startsWith: prefix } }, { company: { startsWith: prefix } }],
    },
    select: { id: true },
  });
  if (leads.length) {
    const ids = leads.map((l) => l.id);
    await prisma.sequenceLead.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadHistory.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  }

  // Tags créés par e2e (noms uniques)
  await prisma.tag.deleteMany({
    where: { name: { startsWith: prefix } },
  });
}

/**
 * Attribue les enregistrements orphelins (sans propriétaire) au premier administrateur actif.
 * Usage : node packages/db/scripts/backfill-owners.mjs
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.warn("[backfill-owners] Aucun administrateur actif — abandon.");
    return;
  }
  const uid = admin.id;
  console.log(`[backfill-owners] Propriétaire par défaut : ${admin.email} (${uid})`);

  const updates = await Promise.all([
    prisma.imapConfig.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.smtpConfig.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.pipelineStage.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.knowledgeBase.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.inboxMessage.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.lead.updateMany({ where: { ownerUserId: null }, data: { ownerUserId: uid } }),
    prisma.campaign.updateMany({ where: { createdById: null }, data: { createdById: uid } }),
    prisma.sequence.updateMany({ where: { createdById: null }, data: { createdById: uid } }),
    prisma.segment.updateMany({ where: { createdById: null }, data: { createdById: uid } }),
    prisma.template.updateMany({ where: { createdById: null }, data: { createdById: uid } }),
  ]);

  const labels = [
    "imapConfig", "smtpConfig", "pipelineStage", "knowledgeBase", "inboxMessage",
    "lead", "campaign", "sequence", "segment", "template",
  ];
  updates.forEach((r, i) => console.log(`  ${labels[i]}: ${r.count} ligne(s)`));

  // Étapes pipeline pour les autres utilisateurs actifs sans étapes
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: uid } },
    select: { id: true, email: true },
  });
  const defaultStages = [
    { name: "Nouveau", color: "#1677ff" },
    { name: "Contacté", color: "#52c41a" },
    { name: "Qualifié", color: "#fa8c16" },
    { name: "En discussion", color: "#722ed1" },
    { name: "Gagné", color: "#13c2c2" },
    { name: "Perdu", color: "#f5222d" },
  ];
  for (const u of users) {
    const n = await prisma.pipelineStage.count({ where: { ownerUserId: u.id } });
    if (n === 0) {
      await prisma.pipelineStage.createMany({
        data: defaultStages.map((s, i) => ({
          name: s.name,
          color: s.color,
          order: i,
          ownerUserId: u.id,
        })),
      });
      console.log(`  pipeline stages créées pour ${u.email}`);
    }
  }

  console.log("[backfill-owners] Terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

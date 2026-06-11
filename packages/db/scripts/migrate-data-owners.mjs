#!/usr/bin/env node
/**
 * Migration production — isolation des données par propriétaire.
 *
 * Usage :
 *   yarn db:migrate-owners              # audit seul (dry-run, aucune écriture)
 *   yarn db:migrate-owners --apply      # applique les corrections
 *   yarn db:migrate-owners --apply --delete-orphans   # supprime l'irrécupérable
 *   yarn db:migrate-owners --apply --default-owner=admin@example.com
 *   yarn db:migrate-owners --apply --mapping=./owner-mapping.json
 *
 * Ordre recommandé en prod :
 *   1. Sauvegarde MySQL
 *   2. yarn db:push (schéma à jour)
 *   3. yarn db:migrate-owners            → lire le rapport
 *   4. yarn db:migrate-owners --apply
 *   5. Redémarrer web + worker
 */
import { readFileSync } from "node:fs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DELETE_ORPHANS = args.includes("--delete-orphans");
const defaultOwnerArg = args.find((a) => a.startsWith("--default-owner="));
const mappingArg = args.find((a) => a.startsWith("--mapping="));

const DEFAULT_STAGES = [
  { name: "Nouveau", color: "#1677ff" },
  { name: "Contacté", color: "#52c41a" },
  { name: "Qualifié", color: "#fa8c16" },
  { name: "En discussion", color: "#722ed1" },
  { name: "Gagné", color: "#13c2c2" },
  { name: "Perdu", color: "#f5222d" },
];

function loadMapping() {
  if (!mappingArg) return null;
  const path = mappingArg.split("=")[1];
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

async function resolveDefaultOwner() {
  if (defaultOwnerArg) {
    const email = defaultOwnerArg.split("=")[1]?.trim();
    const u = await prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true, email: true, role: true },
    });
    if (!u) throw new Error(`Utilisateur introuvable : ${email}`);
    return u;
  }
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true },
  });
  if (!admin) throw new Error("Aucun administrateur actif.");
  return admin;
}

function mapOwner(mapping, table, id, fallbackId) {
  if (!mapping?.[table]) return fallbackId;
  return mapping[table][id] ?? fallbackId;
}

async function audit() {
  const counts = {
    imapConfig: await prisma.imapConfig.count({ where: { ownerUserId: null } }),
    smtpConfig: await prisma.smtpConfig.count({ where: { ownerUserId: null } }),
    pipelineStage: await prisma.pipelineStage.count({ where: { ownerUserId: null } }),
    knowledgeBase: await prisma.knowledgeBase.count({ where: { ownerUserId: null } }),
    inboxMessage: await prisma.inboxMessage.count({ where: { ownerUserId: null } }),
    lead: await prisma.lead.count({ where: { ownerUserId: null } }),
    campaign: await prisma.campaign.count({ where: { createdById: null } }),
    sequence: await prisma.sequence.count({ where: { createdById: null } }),
    segment: await prisma.segment.count({ where: { createdById: null } }),
    template: await prisma.template.count({ where: { createdById: null } }),
  };

  const inboxNoLead = await prisma.inboxMessage.count({
    where: { ownerUserId: null, leadId: null, imapConfigId: null },
  });

  const leadsNoOwnerNoAssignee = await prisma.lead.count({
    where: { ownerUserId: null, assignedToId: null },
  });

  const usersWithoutStages = await prisma.user.count({
    where: {
      isActive: true,
      ownedPipelineStages: { none: {} },
    },
  });

  console.log("\n=== AUDIT — enregistrements sans propriétaire ===\n");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  console.log(`\n  inbox sans lead ni IMAP (difficile à attribuer) : ${inboxNoLead}`);
  console.log(`  leads sans propriétaire ni assigné            : ${leadsNoOwnerNoAssignee}`);
  console.log(`  utilisateurs actifs sans pipeline            : ${usersWithoutStages}`);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n  TOTAL à corriger : ${total}`);
  if (!APPLY) {
    console.log("\n  Mode audit — aucune modification. Relancez avec --apply pour corriger.\n");
  }
  return { counts, inboxNoLead, leadsNoOwnerNoAssignee, usersWithoutStages, total };
}

async function fixLeads(defaultId) {
  const leads = await prisma.lead.findMany({
    where: { ownerUserId: null },
    select: { id: true, assignedToId: true },
  });
  let fixed = 0;
  for (const l of leads) {
    const ownerUserId = l.assignedToId ?? defaultId;
    if (!APPLY) { fixed++; continue; }
    await prisma.lead.update({ where: { id: l.id }, data: { ownerUserId } });
    fixed++;
  }
  return fixed;
}

async function fixInbox(defaultId) {
  const rows = await prisma.inboxMessage.findMany({
    where: { ownerUserId: null },
    select: {
      id: true,
      leadId: true,
      imapConfigId: true,
      lead: { select: { ownerUserId: true, assignedToId: true } },
    },
  });
  let fixed = 0;
  let deleted = 0;
  for (const m of rows) {
    let ownerUserId = null;
    if (m.imapConfigId) {
      const imap = await prisma.imapConfig.findUnique({
        where: { id: m.imapConfigId },
        select: { ownerUserId: true },
      });
      ownerUserId = imap?.ownerUserId ?? null;
    }
    if (!ownerUserId && m.lead) {
      ownerUserId = m.lead.ownerUserId ?? m.lead.assignedToId;
    }
    if (!ownerUserId) ownerUserId = defaultId;

    if (!ownerUserId && DELETE_ORPHANS) {
      if (APPLY) {
        await prisma.inboxMessage.delete({ where: { id: m.id } });
        deleted++;
      } else deleted++;
      continue;
    }
    if (!ownerUserId) continue;

    if (!APPLY) { fixed++; continue; }
    await prisma.inboxMessage.update({ where: { id: m.id }, data: { ownerUserId } });
    fixed++;
  }
  return { fixed, deleted };
}

async function fixCampaigns(defaultId, mapping) {
  const rows = await prisma.campaign.findMany({
    where: { createdById: null },
    select: { id: true, smtpConfigId: true, smtpConfig: { select: { ownerUserId: true } } },
  });
  let fixed = 0;
  for (const c of rows) {
    const createdById = mapOwner(mapping, "campaign", c.id, c.smtpConfig?.ownerUserId ?? defaultId);
    if (!APPLY) { fixed++; continue; }
    await prisma.campaign.update({ where: { id: c.id }, data: { createdById } });
    fixed++;
  }
  return fixed;
}

async function fixSequences(defaultId) {
  const rows = await prisma.sequence.findMany({
    where: { createdById: null },
    select: { id: true, campaignId: true, campaign: { select: { createdById: true } } },
  });
  let fixed = 0;
  for (const s of rows) {
    const createdById = s.campaign?.createdById ?? defaultId;
    if (!APPLY) { fixed++; continue; }
    await prisma.sequence.update({ where: { id: s.id }, data: { createdById } });
    fixed++;
  }
  return fixed;
}

async function fixSegments(defaultId) {
  const rows = await prisma.segment.findMany({
    where: { createdById: null },
    select: { id: true, campaigns: { select: { createdById: true }, take: 1 } },
  });
  let fixed = 0;
  for (const s of rows) {
    const createdById = s.campaigns[0]?.createdById ?? defaultId;
    if (!APPLY) { fixed++; continue; }
    await prisma.segment.update({ where: { id: s.id }, data: { createdById } });
    fixed++;
  }
  return fixed;
}

async function fixTemplates(defaultId) {
  const rows = await prisma.template.findMany({
    where: { createdById: null },
    select: { id: true, campaigns: { select: { createdById: true }, take: 1 } },
  });
  let fixed = 0;
  for (const t of rows) {
    const createdById = t.campaigns[0]?.createdById ?? defaultId;
    if (!APPLY) { fixed++; continue; }
    await prisma.template.update({ where: { id: t.id }, data: { createdById } });
    fixed++;
  }
  return fixed;
}

async function fixSimpleOwner(table, defaultId, mapping) {
  const model = prisma[table];
  const rows = await model.findMany({
    where: { ownerUserId: null },
    select: { id: true },
  });
  let fixed = 0;
  for (const r of rows) {
    const ownerUserId = mapOwner(mapping, table, r.id, defaultId);
    if (!APPLY) { fixed++; continue; }
    await model.update({ where: { id: r.id }, data: { ownerUserId } });
    fixed++;
  }
  return fixed;
}

async function ensureUserPipelineStages() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true },
  });
  let created = 0;
  for (const u of users) {
    const n = await prisma.pipelineStage.count({ where: { ownerUserId: u.id } });
    if (n > 0) continue;
    if (!APPLY) { created++; continue; }
    await prisma.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((s, i) => ({
        name: s.name,
        color: s.color,
        order: i,
        ownerUserId: u.id,
      })),
    });
    console.log(`  pipeline créé pour ${u.email}`);
    created++;
  }
  return created;
}

async function apply(defaultOwner, mapping) {
  const uid = defaultOwner.id;
  console.log(`\n=== ${APPLY ? "APPLICATION" : "SIMULATION"} — propriétaire par défaut : ${defaultOwner.email} ===\n`);

  const leads = await fixLeads(uid);
  console.log(`  leads              → ${leads} corrigé(s) (assigné ou défaut)`);

  const inbox = await fixInbox(uid);
  console.log(`  inbox              → ${inbox.fixed} corrigé(s)${inbox.deleted ? `, ${inbox.deleted} supprimé(s)` : ""}`);

  const imap = await fixSimpleOwner("imapConfig", uid, mapping);
  const smtp = await fixSimpleOwner("smtpConfig", uid, mapping);
  const kb = await fixSimpleOwner("knowledgeBase", uid, mapping);
  const stages = await fixSimpleOwner("pipelineStage", uid, mapping);
  console.log(`  imapConfig         → ${imap}`);
  console.log(`  smtpConfig         → ${smtp}`);
  console.log(`  knowledgeBase      → ${kb}`);
  console.log(`  pipelineStage      → ${stages}`);

  const campaigns = await fixCampaigns(uid, mapping);
  const sequences = await fixSequences(uid);
  const segments = await fixSegments(uid);
  const templates = await fixTemplates(uid);
  console.log(`  campaign           → ${campaigns}`);
  console.log(`  sequence           → ${sequences}`);
  console.log(`  segment            → ${segments}`);
  console.log(`  template           → ${templates}`);

  const pipelines = await ensureUserPipelineStages();
  console.log(`  pipelines manquants → ${pipelines} utilisateur(s)`);

  if (!APPLY) {
    console.log("\n  Simulation terminée. Relancez avec --apply pour écrire en base.\n");
  } else {
    console.log("\n  Migration terminée.\n");
  }
}

async function main() {
  const mapping = loadMapping();
  if (mappingArg && !mapping) {
    throw new Error("Fichier de mapping invalide.");
  }

  await audit();
  const defaultOwner = await resolveDefaultOwner();
  await apply(defaultOwner, mapping);

  if (APPLY) {
    console.log("=== Vérification post-migration ===\n");
    await audit();
  }
}

main()
  .catch((e) => {
    console.error("[migrate-data-owners] ERREUR:", e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

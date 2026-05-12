/**
 * Seed CRM — données de démo réalistes pour le dashboard et les modules L2/L3.
 *
 * Lancer : yarn db:seed
 *
 * Variables :
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — compte admin (déf. admin@crm.local / ChangeMe!2026)
 *   SEED_PASSWORD — mot de passe commun des comptes de démo (déf. ChangeMe!2026)
 *   SEED_SKIP_DEMO=true — ne charge que l'admin + le pipeline
 *   SEED_RESET_DEMO=true — supprime les leads/notifications/imports de démo avant réinjection
 *
 * Prérequis : PII_ENCRYPTION_KEY + EMAIL_HASH_SECRET (voir .env.example)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { emailHash, encryptOrNull } from "./seed/crypto.mjs";
import {
  DEMO_SOURCE,
  TEAM_NAME,
  USER_FIXTURES,
  TAG_FIXTURES,
  PIPELINE_STAGES,
  LEAD_VIEW_FIXTURES,
  IMPORT_JOB_FIXTURES,
  LEAD_FIXTURES,
} from "./seed/fixtures.mjs";
import { computeScore, SCORING_WEIGHTS } from "./seed/scoring.mjs";

const prisma = new PrismaClient();

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@crm.local").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? process.env.SEED_PASSWORD ?? "ChangeMe!2026";
const demoPassword = process.env.SEED_PASSWORD ?? "ChangeMe!2026";
const skipDemo = process.env.SEED_SKIP_DEMO === "true";
const resetDemo = process.env.SEED_RESET_DEMO === "true";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + (n % 8), 15 + (n % 30), 0, 0);
  return d;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function seedUsers(passwordHash) {
  const users = new Map();
  for (const fixture of USER_FIXTURES) {
    const email = fixture.email.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: fixture.name,
        role: fixture.role,
        isActive: true,
      },
      create: {
        email,
        passwordHash,
        name: fixture.name,
        role: fixture.role,
        isActive: true,
        lastLoginAt: fixture.role === "LECTEUR" ? null : daysAgo(fixture.role === "ADMIN" ? 0 : 2),
      },
    });
    users.set(email, user);
  }
  return users;
}

async function seedTeam(users) {
  let team = await prisma.team.findFirst({ where: { name: TEAM_NAME } });
  if (!team) {
    team = await prisma.team.create({ data: { name: TEAM_NAME } });
  }

  for (const email of ["manager@crm.local", "lucas.bernard@crm.local", "emma.dupont@crm.local"]) {
    const user = users.get(email);
    if (!user) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { teamId: team.id },
    });
  }

  return team;
}

async function seedPipelineStages() {
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const existing = await prisma.pipelineStage.findFirst({ where: { name: stage.name } });
    if (!existing) {
      await prisma.pipelineStage.create({
        data: { name: stage.name, order: i, color: stage.color },
      });
    }
  }
}

async function seedTags() {
  for (const tag of TAG_FIXTURES) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: { color: tag.color },
      create: { name: tag.name, color: tag.color },
    });
  }
}

async function seedScoringConfig(adminId) {
  await prisma.scoringConfig.upsert({
    where: { id: "default" },
    update: { weights: SCORING_WEIGHTS, updatedBy: adminId },
    create: { id: "default", weights: SCORING_WEIGHTS, updatedBy: adminId },
  });
}

async function resetDemoData() {
  const demoHashes = LEAD_FIXTURES.map((fixture) => emailHash(fixture.email));
  const demoLeads = await prisma.lead.findMany({
    where: { emailHash: { in: demoHashes } },
    select: { id: true },
  });
  const leadIds = demoLeads.map((l) => l.id);
  if (leadIds.length === 0) return;

  await prisma.emailEvent.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadHistory.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.notification.deleteMany({
    where: { link: { contains: "/leads/" } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
}

async function seedLeads(users) {
  const created = [];

  for (const fixture of LEAD_FIXTURES) {
    const hash = emailHash(fixture.email);
    const assignee = fixture.assigneeEmail ? users.get(fixture.assigneeEmail.toLowerCase()) : null;
    const createdAt = daysAgo(fixture.daysAgo ?? 0);
    const lastActionAt = daysAgo(fixture.lastActionDaysAgo ?? fixture.daysAgo ?? 0);
    const lastReplyAt = fixture.lastReplyDaysAgo != null ? daysAgo(fixture.lastReplyDaysAgo) : null;

    const data = {
      emailEnc: encryptOrNull(fixture.email),
      emailHash: hash,
      phoneEnc: encryptOrNull(fixture.phone ?? null),
      firstName: fixture.firstName ?? null,
      lastName: fixture.lastName ?? null,
      company: fixture.company ?? null,
      website: fixture.website ?? null,
      sector: fixture.sector ?? null,
      city: fixture.city ?? null,
      country: fixture.country ?? "France",
      source: fixture.source ?? DEMO_SOURCE,
      status: fixture.status,
      tags: fixture.tags ?? [],
      notes: fixture.notes ?? null,
      assignedToId: assignee?.id ?? null,
      enrichment: fixture.enrichment ?? null,
      lastActionAt,
      lastReplyAt,
      createdAt,
      updatedAt: lastActionAt,
    };

    const existing = await prisma.lead.findFirst({ where: { emailHash: hash } });
    const lead = existing
      ? await prisma.lead.update({ where: { id: existing.id }, data })
      : await prisma.lead.create({ data });

    const score = computeScore(lead, fixture.signals ?? { opens: 0, clicks: 0, hasReplied: false });
    if (score !== lead.score) {
      await prisma.lead.update({ where: { id: lead.id }, data: { score } });
    }

    const historyCount = await prisma.leadHistory.count({ where: { leadId: lead.id } });
    if (historyCount === 0) {
      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          userId: assignee?.id ?? users.get(adminEmail)?.id ?? null,
          type: "created",
          payload: { source: DEMO_SOURCE, channel: fixture.source ?? null },
          createdAt,
        },
      });

      if (fixture.status !== "NOUVEAU") {
        await prisma.leadHistory.create({
          data: {
            leadId: lead.id,
            userId: assignee?.id ?? null,
            type: "status_change",
            payload: { from: "NOUVEAU", to: fixture.status, reason: "Progression commerciale (démo)" },
            createdAt: daysAgo(Math.max(0, (fixture.lastActionDaysAgo ?? 1))),
          },
        });
      }

      if (assignee) {
        await prisma.leadHistory.create({
          data: {
            leadId: lead.id,
            userId: users.get(adminEmail)?.id ?? null,
            type: "assigned",
            payload: { to: assignee.id },
            createdAt: daysAgo(Math.max(0, (fixture.daysAgo ?? 1) - 1)),
          },
        });
      }
    }

    const signals = fixture.signals ?? { opens: 0, clicks: 0, hasReplied: false };
    const eventCount = await prisma.emailEvent.count({ where: { leadId: lead.id } });
    if (eventCount === 0) {
      const base = daysAgo((fixture.lastActionDaysAgo ?? 2) + 1);
      for (let i = 0; i < signals.opens; i++) {
        await prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            eventType: "OPEN",
            occurredAt: new Date(base.getTime() + i * 3_600_000),
          },
        });
      }
      for (let i = 0; i < signals.clicks; i++) {
        await prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            eventType: "CLICK",
            url: "https://crm.local/demo",
            occurredAt: new Date(base.getTime() + (signals.opens + i) * 3_600_000),
          },
        });
      }
      if (signals.hasReplied) {
        await prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            eventType: "REPLIED",
            occurredAt: lastReplyAt ?? base,
          },
        });
      }
    }

    created.push({ lead, assignee, fixture });
  }

  return created;
}

async function seedLeadViews(users) {
  for (const view of LEAD_VIEW_FIXTURES) {
    const owner = users.get(view.ownerEmail.toLowerCase());
    if (!owner) continue;

    const filters = { ...view.filters };
    if (filters.assignedToId === "__SELF__") {
      filters.assignedToId = owner.id;
    }

    const existing = await prisma.leadView.findFirst({
      where: { userId: owner.id, name: view.name },
    });
    if (existing) {
      await prisma.leadView.update({
        where: { id: existing.id },
        data: { filters, columns: view.columns, shared: view.shared },
      });
    } else {
      await prisma.leadView.create({
        data: {
          userId: owner.id,
          name: view.name,
          filters,
          columns: view.columns,
          shared: view.shared,
        },
      });
    }
  }
}

async function seedImportJobs(users) {
  for (const job of IMPORT_JOB_FIXTURES) {
    const owner = users.get(job.ownerEmail.toLowerCase());
    if (!owner) continue;

    const existing = await prisma.importJob.findFirst({
      where: { userId: owner.id, fileName: job.fileName },
    });
    const createdAt = daysAgo(job.daysAgo);

    const data = {
      userId: owner.id,
      fileName: job.fileName,
      mapping: job.mapping,
      totalRows: job.totalRows,
      importedRows: job.importedRows,
      duplicateRows: job.duplicateRows,
      errorRows: job.errorRows,
      status: job.status,
      createdAt,
    };

    if (existing) {
      await prisma.importJob.update({ where: { id: existing.id }, data });
    } else {
      await prisma.importJob.create({ data });
    }
  }
}

async function seedNotifications(leadRows) {
  for (const { lead, assignee, fixture } of leadRows) {
    if (!assignee) continue;
    const link = `/leads/${lead.id}`;
    const existing = await prisma.notification.findFirst({
      where: { userId: assignee.id, link, type: "lead_assigned" },
    });
    if (existing) continue;

    const name = [fixture.firstName, fixture.lastName].filter(Boolean).join(" ") || fixture.company || "un lead";
    await prisma.notification.create({
      data: {
        userId: assignee.id,
        type: "lead_assigned",
        title: "Nouveau lead assigné",
        body: `${name} vous a été assigné`,
        link,
        createdAt: daysAgo(Math.max(0, (fixture.daysAgo ?? 1) - 1)),
      },
    });
  }
}

async function main() {
  const passwordHash = await hashPassword(demoPassword);
  const users = await seedUsers(passwordHash);
  const admin = users.get(adminEmail) ?? users.get("admin@crm.local");

  await seedTeam(users);
  await seedPipelineStages();
  await seedTags();

  if (skipDemo) {
    console.log("✔ Comptes + pipeline + tags (SEED_SKIP_DEMO=true, démo ignorée)");
    console.log(`  Admin: ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD || process.env.SEED_PASSWORD ? "(mot de passe via env)" : demoPassword}`);
    return;
  }

  if (resetDemo) {
    await resetDemoData();
    console.log("↺ Jeu de données de démo réinitialisé");
  }

  await seedScoringConfig(admin.id);
  const leadRows = await seedLeads(users);
  await seedLeadViews(users);
  await seedImportJobs(users);
  await seedNotifications(leadRows);

  const byStatus = leadRows.reduce((acc, { fixture }) => {
    acc[fixture.status] = (acc[fixture.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log("✔ Seed CRM terminé");
  console.log(`  Admin: ${adminEmail}`);
  console.log(`  Comptes démo: ${USER_FIXTURES.length} (mot de passe: ${process.env.SEED_PASSWORD ? "(via SEED_PASSWORD)" : demoPassword})`);
  console.log(`  Leads: ${leadRows.length} (${Object.entries(byStatus).map(([s, n]) => `${s}:${n}`).join(", ")})`);
  console.log(`  Vues sauvegardées: ${LEAD_VIEW_FIXTURES.length} · Imports: ${IMPORT_JOB_FIXTURES.length} · Tags: ${TAG_FIXTURES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

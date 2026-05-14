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
  ALL_LEAD_FIXTURES,
  AUDIT_LOG_FIXTURES,
  SYSTEM_NOTIFICATION_FIXTURES,
  TEMPLATE_FIXTURES,
  SEGMENT_FIXTURES,
  BLACKLIST_FIXTURES,
  API_CREDIT_FIXTURES,
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
  const demoHashes = ALL_LEAD_FIXTURES.map((fixture) => emailHash(fixture.email));
  const demoLeads = await prisma.lead.findMany({
    where: { emailHash: { in: demoHashes } },
    select: { id: true },
  });
  const leadIds = demoLeads.map((l) => l.id);

  if (leadIds.length > 0) {
    // Purge des relations enfants AVANT le delete des leads
    // (Prisma refuse sinon : relations requises LeadPipeline/InboxMessage/SequenceLead).
    await prisma.leadPipeline.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.inboxMessage.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.sequenceLead.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.emailEvent.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.leadHistory.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  }

  // Notifications (toutes celles liées à la démo)
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { link: { contains: "/leads" } },
        { link: { contains: "/import" } },
        { link: { contains: "/dashboard" } },
        { link: { contains: "/settings" } },
      ],
    },
  });

  // Audit logs récents (générés par le seed)
  await prisma.auditLog.deleteMany({
    where: { action: { in: ["auth.login", "user.create", "scoring.update", "import.start", "lead.assign", "lead.update", "lead.status_change", "lead.note", "view.create"] } },
  });
}

async function seedLeads(users) {
  const created = [];

  for (const fixture of ALL_LEAD_FIXTURES) {
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
      // Force le champ à `null` (et non absent) pour que les requêtes
      // `where: { deletedAt: null }` fonctionnent en MongoDB sans avoir
      // à utiliser `{ isSet: false }` partout. Cf. lib/notDeleted.ts
      deletedAt: null,
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
  // Notifications "lead_assigned" — limitées aux 12 plus récentes par utilisateur
  // pour éviter de saturer la cloche.
  const recentByAssignee = new Map();
  for (const row of leadRows) {
    if (!row.assignee) continue;
    const list = recentByAssignee.get(row.assignee.id) ?? [];
    list.push(row);
    recentByAssignee.set(row.assignee.id, list);
  }

  for (const [, rows] of recentByAssignee) {
    rows.sort((a, b) => (a.fixture.daysAgo ?? 0) - (b.fixture.daysAgo ?? 0));
    for (const { lead, assignee, fixture } of rows.slice(0, 12)) {
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
          isRead: (fixture.daysAgo ?? 0) > 5,
          createdAt: daysAgo(Math.max(0, (fixture.daysAgo ?? 1) - 1)),
        },
      });
    }
  }
}

async function seedSystemNotifications(users) {
  for (const fixture of SYSTEM_NOTIFICATION_FIXTURES) {
    const owner = users.get(fixture.ownerEmail.toLowerCase());
    if (!owner) continue;
    const existing = await prisma.notification.findFirst({
      where: { userId: owner.id, type: fixture.type, title: fixture.title, link: fixture.link },
    });
    if (existing) continue;
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: fixture.type,
        title: fixture.title,
        body: fixture.body,
        link: fixture.link,
        isRead: !!fixture.read,
        createdAt: daysAgo(fixture.daysAgo ?? 0),
      },
    });
  }
}

async function seedAuditLogs(users) {
  for (const log of AUDIT_LOG_FIXTURES) {
    const actor = users.get(log.actorEmail.toLowerCase());
    if (!actor) continue;
    const createdAt = daysAgo(log.daysAgo ?? 0);
    const existing = await prisma.auditLog.findFirst({
      where: { userId: actor.id, action: log.action, createdAt },
    });
    if (existing) continue;
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: log.action,
        ip: log.ip ?? null,
        diff: null,
        createdAt,
      },
    });
  }

  // Met aussi à jour le lastLoginAt à partir du dernier "auth.login"
  for (const [email, user] of users.entries()) {
    const lastLogin = AUDIT_LOG_FIXTURES
      .filter((l) => l.actorEmail.toLowerCase() === email && l.action === "auth.login")
      .sort((a, b) => (a.daysAgo ?? 0) - (b.daysAgo ?? 0))[0];
    if (lastLogin) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: daysAgo(lastLogin.daysAgo ?? 0) },
      });
    }
  }
}

async function seedTemplates() {
  for (const tpl of TEMPLATE_FIXTURES) {
    const existing = await prisma.template.findFirst({ where: { name: tpl.name } });
    const data = {
      name: tpl.name,
      category: tpl.category,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      variables: tpl.variables,
      isPreset: tpl.isPreset,
      isPublic: true,
    };
    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data });
    } else {
      await prisma.template.create({ data });
    }
  }
}

async function seedSegments() {
  for (const seg of SEGMENT_FIXTURES) {
    const existing = await prisma.segment.findFirst({ where: { name: seg.name } });
    if (existing) {
      await prisma.segment.update({ where: { id: existing.id }, data: { filters: seg.filters } });
    } else {
      await prisma.segment.create({ data: { name: seg.name, filters: seg.filters } });
    }
  }
}

async function seedBlacklist() {
  for (const entry of BLACKLIST_FIXTURES) {
    const hash = emailHash(entry.email);
    await prisma.blacklist.upsert({
      where: { emailHash: hash },
      update: { reason: entry.reason },
      create: { emailHash: hash, reason: entry.reason },
    });
  }
}

async function seedApiCredits() {
  for (const credit of API_CREDIT_FIXTURES) {
    await prisma.apiCredit.upsert({
      where: { provider: credit.provider },
      update: { used: credit.used, quota: credit.quota },
      create: credit,
    });
  }
}

async function seedPipelineAssignment(leadRows) {
  // Récupère les stages indexés par nom.
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: "asc" } });
  if (stages.length === 0) return;
  const STATUS_TO_STAGE = {
    NOUVEAU: "Nouveau",
    CONTACTE: "Contacté",
    QUALIFIE: "Qualifié",
    EN_DISCUSSION: "Négociation",
    CONVERTI: "Gagné",
    PERDU: "Perdu",
  };

  let position = 0;
  for (const { lead, fixture } of leadRows) {
    const stageName = STATUS_TO_STAGE[fixture.status] ?? "Nouveau";
    const stage = stages.find((s) => s.name === stageName);
    if (!stage) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { pipelineStageId: stage.id },
    });
    const existing = await prisma.leadPipeline.findUnique({ where: { leadId: lead.id } });
    const enteredAt = daysAgo(Math.max(0, (fixture.lastActionDaysAgo ?? fixture.daysAgo ?? 0)));
    if (existing) {
      await prisma.leadPipeline.update({
        where: { leadId: lead.id },
        data: { stageId: stage.id, position: position++, enteredAt },
      });
    } else {
      await prisma.leadPipeline.create({
        data: { leadId: lead.id, stageId: stage.id, position: position++, enteredAt },
      });
    }
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
  await seedPipelineAssignment(leadRows);
  await seedNotifications(leadRows);
  await seedSystemNotifications(users);
  await seedAuditLogs(users);
  await seedTemplates();
  await seedSegments();
  await seedBlacklist();
  await seedApiCredits();

  const byStatus = leadRows.reduce((acc, { fixture }) => {
    acc[fixture.status] = (acc[fixture.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────");
  console.log("│  ✔ Seed CRM terminé");
  console.log("├──────────────────────────────────────────────────────────────");
  console.log(`│  Admin       : ${adminEmail}`);
  console.log(`│  Mot de passe: ${process.env.SEED_PASSWORD ? "(via SEED_PASSWORD)" : demoPassword}`);
  console.log(`│  Comptes     : ${USER_FIXTURES.length} (Admin/Manager/Sales×2/Lecteur)`);
  console.log(`│  Leads       : ${leadRows.length} (${Object.entries(byStatus).map(([s, n]) => `${s}:${n}`).join(" · ")})`);
  console.log(`│  Vues        : ${LEAD_VIEW_FIXTURES.length}`);
  console.log(`│  Imports     : ${IMPORT_JOB_FIXTURES.length} jobs (done/running/failed)`);
  console.log(`│  Tags        : ${TAG_FIXTURES.length}`);
  console.log(`│  Templates   : ${TEMPLATE_FIXTURES.length} · Segments: ${SEGMENT_FIXTURES.length}`);
  console.log(`│  Audit logs  : ${AUDIT_LOG_FIXTURES.length}`);
  console.log(`│  Notifs      : ${SYSTEM_NOTIFICATION_FIXTURES.length} système + ${leadRows.filter((r) => r.assignee).length} d'assignation`);
  console.log(`│  Blacklist   : ${BLACKLIST_FIXTURES.length} · API credits: ${API_CREDIT_FIXTURES.length}`);
  console.log("└──────────────────────────────────────────────────────────────");
  console.log("");
  console.log("→ Connectez-vous sur http://localhost:3000/login");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

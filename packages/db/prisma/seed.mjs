/**
 * Seed CRM — données de démo réalistes pour le dashboard et les modules L2/L3.
 *
 * Lancer : pnpm db:seed
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
  SMTP_CONFIG_FIXTURES,
  IMAP_CONFIG_FIXTURES,
  INBOX_MESSAGE_FIXTURES,
  SEQUENCE_FIXTURES,
  SEQUENCE_LEAD_FIXTURES,
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

async function seedWorkerConfig() {
  const existing = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  if (!existing) {
    await prisma.workerConfig.create({
      data: { id: "default", agendaTimezone: process.env.SEED_WORKER_TIMEZONE || "Europe/Paris" },
    });
  }
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

  // Réponses / Relances (R-01 / RL-01) — purge des entités de démo.
  // InboxMessage orphans (déjà supprimés via leadIds plus haut pour ceux liés à un lead)
  const demoMessageIds = INBOX_MESSAGE_FIXTURES.map((m) => m.messageId);
  if (demoMessageIds.length > 0) {
    await prisma.inboxMessage.deleteMany({ where: { messageId: { in: demoMessageIds } } });
  }
  // Séquences de démo (par nom)
  const demoSequenceNames = SEQUENCE_FIXTURES.map((s) => s.name);
  if (demoSequenceNames.length > 0) {
    const demoSeqs = await prisma.sequence.findMany({
      where: { name: { in: demoSequenceNames } },
      select: { id: true },
    });
    const seqIds = demoSeqs.map((s) => s.id);
    if (seqIds.length > 0) {
      await prisma.sequenceLead.deleteMany({ where: { sequenceId: { in: seqIds } } });
      await prisma.sequence.deleteMany({ where: { id: { in: seqIds } } });
    }
  }
  // Campagnes de démo (par nom) et leurs événements
  const demoCampaigns = await prisma.campaign.findMany({ where: { name: { in: CAMPAIGN_FIXTURES.map((c) => c.name) } }, select: { id: true } });
  if (demoCampaigns.length > 0) {
    const ids = demoCampaigns.map((c) => c.id);
    await prisma.emailEvent.deleteMany({ where: { campaignId: { in: ids } } });
    await prisma.campaign.deleteMany({ where: { id: { in: ids } } });
  }
  // Comptes SMTP / IMAP de démo (par label)
  const demoSmtpLabels = SMTP_CONFIG_FIXTURES.map((c) => c.label);
  if (demoSmtpLabels.length > 0) {
    await prisma.smtpConfig.deleteMany({ where: { label: { in: demoSmtpLabels } } });
  }
  const demoImapLabels = IMAP_CONFIG_FIXTURES.map((c) => c.label);
  if (demoImapLabels.length > 0) {
    await prisma.imapConfig.deleteMany({ where: { label: { in: demoImapLabels } } });
  }
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

// ── SMTP / IMAP (M-01 + R-01) ────────────────────────────────────────────────
async function seedSmtpConfigs() {
  for (const cfg of SMTP_CONFIG_FIXTURES) {
    const existing = await prisma.smtpConfig.findFirst({ where: { label: cfg.label } });
    const data = {
      label: cfg.label,
      host: cfg.host,
      port: cfg.port,
      loginEnc: encryptOrNull(cfg.login),
      passwordEnc: encryptOrNull(cfg.password),
      fromName: cfg.fromName ?? null,
      fromEmail: cfg.fromEmail ?? null,
      dailyLimit: cfg.dailyLimit ?? 200,
      isActive: cfg.isActive ?? true,
    };
    if (existing) {
      await prisma.smtpConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.smtpConfig.create({ data });
    }
  }
}

async function seedImapConfigs() {
  for (const cfg of IMAP_CONFIG_FIXTURES) {
    const existing = await prisma.imapConfig.findFirst({ where: { label: cfg.label } });
    const data = {
      label: cfg.label,
      host: cfg.host,
      port: cfg.port,
      loginEnc: encryptOrNull(cfg.login),
      passwordEnc: encryptOrNull(cfg.password),
      isActive: cfg.isActive ?? true,
      lastSyncAt: cfg.lastSyncDaysAgo != null ? daysAgo(cfg.lastSyncDaysAgo) : null,
    };
    if (existing) {
      await prisma.imapConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.imapConfig.create({ data });
    }
  }
}

// ── Inbox (R-01, R-02, R-07) ────────────────────────────────────────────────
async function seedInboxMessages() {
  // Pré-résolution leadEmail → leadId via emailHash (évite N requêtes).
  const leadEmails = [...new Set(INBOX_MESSAGE_FIXTURES.map((m) => m.leadEmail).filter(Boolean))];
  const hashes = leadEmails.map((e) => emailHash(e));
  const leads = await prisma.lead.findMany({
    where: { emailHash: { in: hashes } },
    select: { id: true, emailHash: true },
  });
  const leadIdByHash = new Map(leads.map((l) => [l.emailHash, l.id]));

  for (const msg of INBOX_MESSAGE_FIXTURES) {
    const leadId = msg.leadEmail ? leadIdByHash.get(emailHash(msg.leadEmail)) ?? null : null;
    const existing = await prisma.inboxMessage.findFirst({ where: { messageId: msg.messageId } });
    const receivedAt = daysAgo(msg.daysAgo ?? 0);
    const data = {
      leadId,
      messageId: msg.messageId,
      inReplyTo: msg.inReplyTo ?? null,
      direction: msg.direction,
      fromEnc: encryptOrNull(msg.from),
      toEnc: encryptOrNull(msg.to),
      subject: msg.subject ?? null,
      bodyText: msg.bodyText ?? null,
      bodyHtml: msg.bodyHtml ?? null,
      isAutoReply: msg.isAutoReply ?? false,
      isRead: msg.isRead ?? false,
      receivedAt,
    };
    if (existing) {
      await prisma.inboxMessage.update({ where: { id: existing.id }, data });
    } else {
      await prisma.inboxMessage.create({ data });
    }
  }
}

// ── Sequences (RL-01, RL-02) ────────────────────────────────────────────────
async function seedSequences() {
  // Map templateName → templateId
  const templates = await prisma.template.findMany({ select: { id: true, name: true } });
  const tplIdByName = new Map(templates.map((t) => [t.name, t.id]));

  for (const seq of SEQUENCE_FIXTURES) {
    const steps = seq.steps.map((s) => ({
      delayDays: s.delayDays,
      templateId: s.templateRef ? tplIdByName.get(s.templateRef) ?? null : null,
      subject: s.subject ?? null,
      bodyHtml: s.bodyHtml ?? null,
      stopOnReply: s.stopOnReply !== false,
    }));
    const data = {
      name: seq.name,
      steps,
      maxSteps: seq.maxSteps ?? null,
      isPaused: seq.isPaused ?? false,
    };
    const existing = await prisma.sequence.findFirst({ where: { name: seq.name } });
    if (existing) {
      await prisma.sequence.update({ where: { id: existing.id }, data });
    } else {
      await prisma.sequence.create({ data });
    }
  }
}

async function seedSequenceLeads() {
  const sequences = await prisma.sequence.findMany({ select: { id: true, name: true } });
  const seqIdByName = new Map(sequences.map((s) => [s.name, s.id]));
  const leadEmails = [...new Set(SEQUENCE_LEAD_FIXTURES.map((sl) => sl.leadEmail))];
  const hashes = leadEmails.map((e) => emailHash(e));
  const leads = await prisma.lead.findMany({
    where: { emailHash: { in: hashes } },
    select: { id: true, emailHash: true },
  });
  const leadIdByHash = new Map(leads.map((l) => [l.emailHash, l.id]));

  for (const sl of SEQUENCE_LEAD_FIXTURES) {
    const sequenceId = seqIdByName.get(sl.sequenceName);
    const leadId = leadIdByHash.get(emailHash(sl.leadEmail));
    if (!sequenceId || !leadId) continue;

    const nextSendAt = sl.nextSendDaysAhead == null ? null
      : new Date(Date.now() + sl.nextSendDaysAhead * 24 * 3600 * 1000);

    const existing = await prisma.sequenceLead.findFirst({ where: { sequenceId, leadId } });
    const data = {
      sequenceId,
      leadId,
      currentStep: sl.currentStep ?? 0,
      sentCount: sl.sentCount ?? 0,
      status: sl.status ?? "active",
      stoppedReason: sl.stoppedReason ?? null,
      nextSendAt,
    };
    if (existing) {
      await prisma.sequenceLead.update({ where: { id: existing.id }, data });
    } else {
      await prisma.sequenceLead.create({ data });
    }
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

// Campagnes de démonstration : une terminée, une en cours, une planifiée, un brouillon.
// Les événements (SENT/OPEN/CLICK/REPLIED/BOUNCE/UNSUBSCRIBE) sont répartis sur 14 jours
// pour alimenter les statistiques de campagne et la page Analytics.
const CAMPAIGN_FIXTURES = [
  { name: "Lancement offre CRM — PME Lyon", status: "DONE", template: 0, segment: 0, daysAgo: 13, sent: 42, opens: 27, clicks: 12, replies: 5, bounces: 2, unsubs: 1 },
  { name: "Relance Salon Paris 2026", status: "SENDING", template: 1, segment: 2, daysAgo: 4, sent: 24, opens: 13, clicks: 5, replies: 2, bounces: 1, unsubs: 0 },
  { name: "Invitation webinar — IA & prospection", status: "SCHEDULED", template: 2, segment: 1, daysAgo: -3, sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0, unsubs: 0 },
  { name: "Offre partenaires — brouillon", status: "DRAFT", template: 0, segment: 3, daysAgo: 0, sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0, unsubs: 0 },
];

async function seedCampaigns(leadRows) {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, subject: true } });
  const segments = await prisma.segment.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const smtp = await prisma.smtpConfig.findFirst({ where: { isActive: true }, select: { id: true } });
  const leads = leadRows.map((r) => r.lead);
  for (const fx of CAMPAIGN_FIXTURES) {
    const tpl = templates[fx.template % Math.max(templates.length, 1)];
    const data = {
      name: fx.name,
      status: fx.status,
      templateId: tpl?.id ?? null,
      segmentId: segments[fx.segment % Math.max(segments.length, 1)]?.id ?? null,
      smtpConfigId: smtp?.id ?? null,
      subject: tpl?.subject ?? null,
      scheduledAt: fx.status === "SCHEDULED" ? daysAgo(fx.daysAgo) : fx.status === "DRAFT" ? null : daysAgo(fx.daysAgo),
      dailyLimit: 150,
      config: { aiPersonalize: true, throttleMinDelayMs: 4000 },
      stats: { target: fx.status === "SENDING" ? 38 : fx.sent },
    };
    const existing = await prisma.campaign.findFirst({ where: { name: fx.name }, select: { id: true } });
    const campaign = existing
      ? await prisma.campaign.update({ where: { id: existing.id }, data })
      : await prisma.campaign.create({ data });
    await prisma.emailEvent.deleteMany({ where: { campaignId: campaign.id } });

    const start = daysAgo(Math.max(fx.daysAgo, 0)).getTime();
    const events = [];
    const at = (i, spreadH) => new Date(Math.min(Date.now() - 60_000, start + (i % 9) * spreadH * 3_600_000 + i * 600_000));
    const target = (i) => leads[i % leads.length]?.id ?? null;
    for (let i = 0; i < fx.sent; i++) events.push({ campaignId: campaign.id, leadId: target(i), eventType: "SENT", occurredAt: at(i, 2) });
    for (let i = 0; i < fx.opens; i++) events.push({ campaignId: campaign.id, leadId: target(i), eventType: "OPEN", occurredAt: at(i, 9) });
    for (let i = 0; i < fx.clicks; i++) events.push({ campaignId: campaign.id, leadId: target(i), eventType: "CLICK", url: "https://crm.local/demo", occurredAt: at(i, 12) });
    for (let i = 0; i < fx.replies; i++) events.push({ campaignId: campaign.id, leadId: target(i), eventType: "REPLIED", occurredAt: at(i, 20) });
    for (let i = 0; i < fx.bounces; i++) events.push({ campaignId: campaign.id, leadId: target(fx.sent - 1 - i), eventType: "BOUNCE", occurredAt: at(i, 1) });
    for (let i = 0; i < fx.unsubs; i++) events.push({ campaignId: campaign.id, leadId: target(fx.sent - 3 - i), eventType: "UNSUBSCRIBE", occurredAt: at(i, 30) });
    if (events.length > 0) await prisma.emailEvent.createMany({ data: events });
  }
}

async function main() {
  const passwordHash = await hashPassword(demoPassword);
  const users = await seedUsers(passwordHash);
  const admin = users.get(adminEmail) ?? users.get("admin@crm.local");

  await seedTeam(users);
  await seedPipelineStages();
  await seedTags();
  await seedWorkerConfig();

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
  await seedSmtpConfigs();
  await seedImapConfigs();
  await seedCampaigns(leadRows);
  await seedInboxMessages();
  await seedSequences();
  await seedSequenceLeads();

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
  console.log(`│  SMTP / IMAP : ${SMTP_CONFIG_FIXTURES.length} SMTP + ${IMAP_CONFIG_FIXTURES.length} IMAP`);
  console.log(`│  Campagnes   : ${CAMPAIGN_FIXTURES.length} (terminée, en cours, planifiée, brouillon)`);
  console.log(`│  Inbox       : ${INBOX_MESSAGE_FIXTURES.length} messages (threads inbound/outbound + auto-reply + orphan)`);
  console.log(`│  Séquences   : ${SEQUENCE_FIXTURES.length} (${SEQUENCE_LEAD_FIXTURES.length} leads inscrits)`);
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

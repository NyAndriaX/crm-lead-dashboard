/**
 * GET /api/system/capacity — P-02 (Capacité).
 *
 * ADMIN : métriques organisation (limites CDC).
 * Autres rôles avec settings:manage : métriques limitées à leur périmètre.
 */
import { prisma, buildLeadVisibilityWhere, strictOwnerWhere } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const LIMITS = {
  leads: 100_000,
  emailsPerDay: 10_000,
};

export const GET = handler(async () => {
  const session = await requirePermission("settings:manage");
  const scope = toScope(session);
  const isAdmin = session.role === "ADMIN";

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const leadWhere = isAdmin
    ? { deletedAt: null }
    : { AND: [{ deletedAt: null }, buildLeadVisibilityWhere(scope)] };

  const emailWhere = isAdmin
    ? { eventType: "SENT" as const, occurredAt: { gte: startOfDay } }
    : {
        eventType: "SENT" as const,
        occurredAt: { gte: startOfDay },
        OR: [
          { lead: buildLeadVisibilityWhere(scope) },
          { campaign: { createdById: scope.userId } },
        ],
      };

  const smtpWhere = isAdmin ? {} : strictOwnerWhere(scope.userId);
  const inboxWhere = isAdmin ? {} : strictOwnerWhere(scope.userId);
  const sequenceLeadWhere = isAdmin
    ? { status: "active" as const }
    : { status: "active" as const, sequence: { createdById: scope.userId } };

  const [leadsTotal, leadsActive, emailsToday, smtpConfigs, inboxTotal, sequencesActive] =
    await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, status: { not: "PERDU" } } }),
      prisma.emailEvent.count({ where: emailWhere }),
      prisma.smtpConfig.aggregate({ where: smtpWhere, _sum: { dailyLimit: true }, _count: { _all: true } }),
      prisma.inboxMessage.count({ where: inboxWhere }),
      prisma.sequenceLead.count({ where: sequenceLeadWhere }),
    ]);

  const smtpDailyCapacity = smtpConfigs._sum.dailyLimit ?? 0;

  const pct = (used: number, limit: number) =>
    limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;

  return json({
    data: {
      scoped: !isAdmin,
      leads: {
        used: leadsTotal,
        active: leadsActive,
        limit: LIMITS.leads,
        usagePct: pct(leadsTotal, LIMITS.leads),
      },
      emailsToday: {
        used: emailsToday,
        targetLimit: LIMITS.emailsPerDay,
        smtpDailyCapacity,
        usagePct: pct(emailsToday, LIMITS.emailsPerDay),
        note:
          smtpDailyCapacity < LIMITS.emailsPerDay
            ? `Capacité SMTP cumulée (${smtpDailyCapacity}/j) sous la cible 10 000/j — ajoutez des comptes SMTP pour atteindre le volume cible.`
            : "Capacité SMTP suffisante pour la cible.",
      },
      inboxMessages: inboxTotal,
      sequencesActive,
      smtpAccounts: smtpConfigs._count._all,
      indexesDoc: "packages/db/prisma/manual-indexes.md",
    },
  });
});

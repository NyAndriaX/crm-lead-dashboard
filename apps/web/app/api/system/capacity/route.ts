/**
 * GET /api/system/capacity — P-02 (Capacité).
 *
 * Expose l'usage courant vs les limites cibles du CDC (100 000 leads /
 * compte, 10 000 emails / jour) afin d'anticiper la montée en charge et
 * d'alimenter les jauges de l'onglet Paramètres → Système.
 *
 * Les index MySQL nécessaires à cette échelle sont déclarés dans le schéma Prisma
 * (@@index) et créés par les migrations (packages/db/prisma/migrations).
 */
import { prisma } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

const LIMITS = {
  leads: 100_000,
  emailsPerDay: 10_000,
};

export const GET = handler(async () => {
  await requirePermission("settings:manage");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [leadsTotal, leadsActive, emailsToday, smtpConfigs, inboxTotal, sequencesActive] =
    await Promise.all([
      prisma.lead.count({ where: { deletedAt: null } }),
      prisma.lead.count({ where: { deletedAt: null, status: { not: "PERDU" } } }),
      prisma.emailEvent.count({
        where: { eventType: "SENT", occurredAt: { gte: startOfDay } },
      }),
      prisma.smtpConfig.aggregate({ _sum: { dailyLimit: true }, _count: { _all: true } }),
      prisma.inboxMessage.count(),
      prisma.sequenceLead.count({ where: { status: "active" } }),
    ]);

  const smtpDailyCapacity = smtpConfigs._sum.dailyLimit ?? 0;

  const pct = (used: number, limit: number) =>
    limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;

  return json({
    data: {
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
      indexesDoc: "packages/db/prisma/schema.prisma",
    },
  });
});

/**
 * Service Scraping — module S-01 → S-10.
 *
 * Gère les missions de scraping (ScrapingMission), le buffer de leads
 * scrapés en attente de validation (ScrapedLeadBuffer), le dédoublonnage
 * avant injection (S-07) et l'injection finale dans le CRM (S-10).
 *
 * Le scraping effectif tourne côté worker (job `scraping-run`) avec des
 * adapters "sandbox-first" : données mock réalistes par défaut, vrais
 * scrapers Playwright derrière le flag env SCRAPING_LIVE (cf.
 * packages/jobs/src/scraping/).
 */
import {
  isIdentifiableLead,
  isMaskedProxy,
  maskProxyUrl,
  normalizeMissionConfig,
  proxyHasCredentials,
  parseScraperPayload,
  passesEmailRequirement,
  scheduleLabel,
  scrapedPrivateContacts,
  type MissionConfig,
  type MissionSchedulePlan,
  type ScrapedLead,
} from "@crm/db";
import { prisma, recomputeLeadScore, type Prisma } from "@crm/db";
import { enqueue } from "@/lib/jobs";
import { encrypt, encryptOrNull, emailHash } from "@/lib/crypto";
import { buildLeadCreateFromScraped, isScrapedLeadDuplicateInCrm } from "@crm/jobs";
import { enrichLeadById } from "@/lib/services/enrichment";
import { generateLeadAiBrief } from "@/lib/services/aiBrief";

/**
 * A1 (F1) — enrichit + génère un brief de qualification IA sur un lead
 * fraîchement injecté. Best-effort : ne jette jamais (n'invalide pas
 * l'injection si l'enrichissement ou l'IA échoue).
 */

/** Téléphones du site et coordonnées directes du décideur : JSON chiffré (données personnelles possibles). */
function privateContactsEnc(raw: ScrapedLead): ReturnType<typeof encryptOrNull> {
  const c = scrapedPrivateContacts(raw);
  return c ? encryptOrNull(JSON.stringify(c)) : null;
}
const AUTO_ENRICH_CAP = Number(process.env.SCRAPING_AUTOENRICH_CAP ?? 50);

async function autoEnrichAndBrief(leadId: string): Promise<void> {
  try {
    await enrichLeadById(leadId, ["email", "emailVerify", "company", "news"]);
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { firstName: true, lastName: true, company: true, sector: true, city: true, enrichment: true },
    });
    if (!lead) return;
    const brief = await generateLeadAiBrief(
      { firstName: lead.firstName, lastName: lead.lastName, company: lead.company, sector: lead.sector, city: lead.city },
      lead.enrichment,
    );
    const enr = (lead.enrichment ?? {}) as Record<string, unknown>;
    await prisma.lead.update({
      where: { id: leadId },
      data: { enrichment: { ...enr, aiBrief: brief } as object },
    });
    await prisma.leadHistory.create({
      data: { leadId, type: "ai_qualified", payload: { score: brief.score, source: brief.source } as object },
    });
  } catch (e) {
    console.warn(`[scraping] auto-enrich/brief KO leadId=${leadId}:`, e instanceof Error ? e.message : e);
  }
}

export type { MissionConfig, MissionSchedulePlan };

export type MissionDTO = {
  id: string;
  name: string;
  config: MissionConfig;
  schedule: string | null;
  scheduleLabel: string;
  status: string;
  logs: string | null;
  createdAt: Date;
  bufferCounts: { pending: number; accepted: number; rejected: number };
};

/**
 * S-06 — proxy de la mission : avec identifiants, l'URL est chiffrée (AES-256-GCM, base64)
 * et seule une version masquée reste lisible ; le libellé masqué renvoyé par le formulaire
 * conserve le proxy existant. Sans `rate` dans la saisie, les réglages précédents sont gardés.
 */
function secureMissionConfig(input: unknown, previous?: MissionConfig | null): MissionConfig {
  const raw = (input ?? {}) as { rate?: Partial<MissionConfig["rate"]> };
  if (!raw.rate && previous) return normalizeMissionConfig({ ...(input as object), rate: previous.rate });
  const config = normalizeMissionConfig(input);
  const submitted = typeof raw.rate?.proxyUrl === "string" ? raw.rate.proxyUrl.trim() : "";
  let proxyUrl: string | null = null;
  let proxyUrlEnc: string | null = null;
  if (submitted && isMaskedProxy(submitted)) {
    proxyUrl = previous?.rate.proxyUrlEnc ? previous.rate.proxyUrl ?? null : null;
    proxyUrlEnc = previous?.rate.proxyUrlEnc ?? null;
  } else if (submitted && proxyHasCredentials(submitted)) {
    proxyUrl = maskProxyUrl(submitted);
    proxyUrlEnc = encrypt(submitted).toString("base64");
  } else if (submitted) {
    proxyUrl = submitted;
  }
  return { ...config, rate: { ...config.rate, proxyUrl, proxyUrlEnc } };
}

/** Configuration renvoyée au navigateur : jamais le proxy chiffré. */
function publicConfig(config: MissionConfig): MissionConfig {
  const { proxyUrlEnc: _enc, ...rate } = config.rate;
  return { ...config, rate };
}

function legacyScheduleField(plan?: MissionSchedulePlan): string | null {
  if (!plan || plan.mode === "manual") return null;
  if (plan.mode === "once") return "once";
  return plan.frequency ?? "daily";
}

async function enqueueScheduledRun(missionId: string, cfg: MissionConfig): Promise<void> {
  const plan = cfg.schedulePlan;
  if (!plan || plan.mode === "manual") return;

  // Mode ponctuel : job planifié à la date demandée.
  if (plan.mode === "once" && plan.runAt) {
    const runAt = new Date(plan.runAt);
    if (runAt.getTime() > Date.now()) {
      await enqueue("scraping-run", { missionId }, { runAt, priority: 2 });
      await prisma.scrapingMission.update({
        where: { id: missionId },
        data: { status: "scheduled", logs: `Planifiée le ${runAt.toISOString()}` },
      });
    }
    return;
  }

  // Mode récurrent : job planifié pour la PREMIÈRE exécution (runAt ou immédiat).
  // Les exécutions suivantes sont gérées par le cron scraping-scheduler.
  if (plan.mode === "recurring") {
    const anchor = plan.runAt ? new Date(plan.runAt) : new Date();
    const runAt = anchor.getTime() <= Date.now() ? new Date() : anchor;
    await enqueue("scraping-run", { missionId }, { runAt, priority: 2 });
    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: {
        status: "scheduled",
        logs: `Première exécution planifiée le ${runAt.toISOString()}`,
      },
    });
  }
}

async function bufferCounts(missionId: string) {
  const groups = await prisma.scrapedLeadBuffer.groupBy({
    by: ["status"],
    where: { missionId },
    _count: { _all: true },
  });
  const get = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { pending: get("pending"), accepted: get("accepted"), rejected: get("rejected") };
}

export async function listMissions(): Promise<MissionDTO[]> {
  const missions = await prisma.scrapingMission.findMany({ orderBy: { updatedAt: "desc" } });
  const out: MissionDTO[] = [];
  for (const m of missions) {
    const config = normalizeMissionConfig(m.config);
    out.push({
      id: m.id,
      name: m.name,
      config: publicConfig(config),
      schedule: legacyScheduleField(config.schedulePlan) ?? m.schedule,
      scheduleLabel: scheduleLabel(config.schedulePlan),
      status: m.status,
      logs: m.logs,
      createdAt: m.createdAt,
      bufferCounts: await bufferCounts(m.id),
    });
  }
  return out;
}

export async function getMission(id: string): Promise<MissionDTO | null> {
  const m = await prisma.scrapingMission.findUnique({ where: { id } });
  if (!m) return null;
  const config = normalizeMissionConfig(m.config);
  return {
    id: m.id,
    name: m.name,
    config: publicConfig(config),
    schedule: legacyScheduleField(config.schedulePlan) ?? m.schedule,
    scheduleLabel: scheduleLabel(config.schedulePlan),
    status: m.status,
    logs: m.logs,
    createdAt: m.createdAt,
    bufferCounts: await bufferCounts(m.id),
  };
}

export async function createMission(input: {
  name: string;
  config: unknown;
}): Promise<MissionDTO> {
  const config = secureMissionConfig(input.config);
  const m = await prisma.scrapingMission.create({
    data: {
      name: input.name,
      config: config as object,
      schedule: legacyScheduleField(config.schedulePlan),
      status: "pending",
    },
  });
  await enqueueScheduledRun(m.id, config);
  const dto = await getMission(m.id);
  return dto!;
}

export async function updateMission(
  id: string,
  input: { name?: string; config?: unknown },
): Promise<void> {
  const data: Prisma.ScrapingMissionUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  let config: MissionConfig | null = null;
  if (input.config !== undefined) {
    const current = await prisma.scrapingMission.findUnique({ where: { id }, select: { config: true } });
    config = secureMissionConfig(input.config, current ? normalizeMissionConfig(current.config) : null);
    data.config = config as object;
    data.schedule = legacyScheduleField(config.schedulePlan);
  }
  await prisma.scrapingMission.update({ where: { id }, data });
  if (config) {
    await enqueueScheduledRun(id, config);
  }
}

export async function deleteMission(id: string): Promise<void> {
  await prisma.scrapedLeadBuffer.deleteMany({ where: { missionId: id } });
  await prisma.scrapingMission.delete({ where: { id } });
}

export type BufferRaw = ScrapedLead & {
  duplicate?: boolean;
  duplicateReason?: string | null;
  injectedLeadId?: string;
  auto?: boolean;
};

export type BufferItem = {
  id: string;
  missionId: string;
  status: string;
  raw: BufferRaw;
  createdAt: Date;
};

export async function listBuffer(
  missionId: string,
  status?: string,
): Promise<BufferItem[]> {
  const rows = await prisma.scrapedLeadBuffer.findMany({
    where: { missionId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return rows.map((r) => ({
    id: r.id,
    missionId: r.missionId,
    status: r.status,
    raw: (r.raw ?? {}) as BufferItem["raw"],
    createdAt: r.createdAt,
  }));
}

export async function setBufferStatus(ids: string[], status: "accepted" | "rejected"): Promise<number> {
  const res = await prisma.scrapedLeadBuffer.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
  return res.count;
}

/**
 * Importe un payload crm-leads-scraper dans le buffer d'une mission
 * (enveloppe `{ ok, results[] }` ou tableau brut).
 */
export async function importScraperPayloadToBuffer(
  missionId: string,
  payload: unknown,
): Promise<{ inserted: number; duplicates: number; filteredNoEmail: number }> {
  const mission = await prisma.scrapingMission.findUnique({ where: { id: missionId } });
  const cfg = normalizeMissionConfig(mission?.config);
  const { leads } = parseScraperPayload(payload);
  let inserted = 0;
  let duplicates = 0;
  let filteredNoEmail = 0;
  const seen = { placeId: new Set<string>(), email: new Set<string>(), companyCity: new Set<string>() };

  for (const lead of leads) {
    const email = lead.email?.trim().toLowerCase() || null;

    if (!passesEmailRequirement(lead, cfg.requireEmail)) {
      filteredNoEmail++;
      continue;
    }

    let duplicate = false;
    let reason: string | null = null;

    const placeId = lead.place_id?.trim();
    if (placeId) {
      if (seen.placeId.has(placeId)) {
        duplicate = true;
        reason = "doublon interne (place_id)";
      } else {
        const { duplicate: inCrm, reason: crmReason } = await isScrapedLeadDuplicateInCrm(lead, emailHash);
        if (inCrm) {
          duplicate = true;
          reason = crmReason;
        }
      }
      seen.placeId.add(placeId);
    } else if (email) {
      if (seen.email.has(email)) {
        duplicate = true;
        reason = "doublon interne (email)";
      } else {
        const { duplicate: inCrm, reason: crmReason } = await isScrapedLeadDuplicateInCrm(lead, emailHash);
        if (inCrm) {
          duplicate = true;
          reason = crmReason;
        }
      }
      seen.email.add(email);
    }

    if (duplicate) duplicates++;
    else inserted++;

    await prisma.scrapedLeadBuffer.create({
      data: {
        missionId,
        emailHash: email ? emailHash(email) : null,
        status: duplicate ? "rejected" : "pending",
        raw: { ...lead, duplicate, duplicateReason: reason } as object,
      },
    });
  }

  return { inserted, duplicates, filteredNoEmail };
}

/**
 * S-07 + S-10 — Injecte les leads "accepted" d'une mission dans le CRM.
 * Re-vérifie le dédoublonnage au moment de l'injection (un lead a pu être
 * créé entre le scraping et la validation).
 */
export async function injectAcceptedLeads(missionId: string, actorId?: string): Promise<{
  injected: number;
  skippedDuplicate: number;
  skippedInvalid: number;
}> {
  const accepted = await prisma.scrapedLeadBuffer.findMany({
    where: { missionId, status: "accepted" },
  });

  let injected = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const row of accepted) {
    const raw = (row.raw ?? {}) as BufferRaw;

    if (!isIdentifiableLead(raw)) {
      skippedInvalid++;
      continue;
    }

    const email = raw.email?.trim().toLowerCase() || null;
    const { duplicate: dup, reason: dupReason } = await isScrapedLeadDuplicateInCrm(raw, emailHash);
    if (dup) {
      skippedDuplicate++;
      await prisma.scrapedLeadBuffer.update({
        where: { id: row.id },
        data: {
          status: "rejected",
          raw: { ...raw, duplicate: true, duplicateReason: dupReason ?? "déjà en base" } as object,
        },
      });
      continue;
    }

    const base = buildLeadCreateFromScraped(raw, `Scraping: ${raw.source ?? "mission"}`);
    const lead = await prisma.lead.create({
      data: {
        ...base,
        emailEnc: encryptOrNull(email),
        emailHash: email ? emailHash(email) : null,
        phoneEnc: encryptOrNull(raw.phone ?? null),
        contactsEnc: privateContactsEnc(raw),
      },
    });
    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        userId: actorId ?? null,
        type: "scraped_imported",
        payload: { missionId, source: raw.source ?? null } as object,
      },
    });
    await prisma.scrapedLeadBuffer.update({
      where: { id: row.id },
      data: { status: "accepted", raw: { ...raw, injectedLeadId: lead.id } as object },
    });
    injected++;

    // A1 (F1) — enrichissement + brief de qualification IA automatiques,
    // plafonné et best-effort (n'invalide jamais l'injection).
    if (injected <= AUTO_ENRICH_CAP) {
      await autoEnrichAndBrief(lead.id);
    }
    // Score initial : profil + adéquation estimée par Claude (sinon le lead resterait à 0).
    await recomputeLeadScore(prisma, lead.id).catch(() => null);
  }

  return { injected, skippedDuplicate, skippedInvalid };
}

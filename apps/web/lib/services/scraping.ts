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
 * apps/worker/src/scraping/).
 */
import { prisma, type Prisma } from "@crm/db";
import { encryptOrNull, emailHash } from "@/lib/crypto";
import { enrichLeadById } from "@/lib/services/enrichment";
import { generateLeadAiBrief } from "@/lib/services/aiBrief";

/**
 * A1 (F1) — enrichit + génère un brief de qualification IA sur un lead
 * fraîchement injecté. Best-effort : ne jette jamais (n'invalide pas
 * l'injection si l'enrichissement ou l'IA échoue).
 */
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

export type ScrapingSource = "google_maps" | "directories" | "linkedin" | "website";

export const SCRAPING_SOURCES: ScrapingSource[] = [
  "google_maps", "directories", "linkedin", "website",
];

export const SOURCE_LABELS: Record<ScrapingSource, string> = {
  google_maps: "Google Maps / Places",
  directories: "Annuaires pro (Pages Jaunes, Kompass, Societe.com)",
  linkedin: "LinkedIn (public / Sales Nav)",
  website: "Sites web sectoriels",
};

/** Forme du champ ScrapingMission.config (Json libre côté Prisma). */
export type MissionConfig = {
  sources: ScrapingSource[];
  keywords: string;
  location: { city?: string | null; country?: string | null; radiusKm?: number | null };
  companyType?: string | null;
  companySize?: string | null;
  language?: string | null;
  limit: number;
  /** S-06 — débit & proxy. */
  rate: {
    delayMs: number;
    retries: number;
    rotateUserAgent: boolean;
    proxyUrl?: string | null;
  };
  /** A3 (F4) — scraping automatisé : quota/jour + pipeline auto. */
  dailyQuota?: number | null;
  autoPipeline?: {
    enabled: boolean;
    /** Inscrit les leads injectés dans cette séquence (relances IA si steps.aiPersonalize). */
    sequenceId?: string | null;
  };
};

export const DEFAULT_RATE: MissionConfig["rate"] = {
  delayMs: 2000,
  retries: 2,
  rotateUserAgent: true,
  proxyUrl: null,
};

export type MissionDTO = {
  id: string;
  name: string;
  config: MissionConfig;
  schedule: string | null;
  status: string;
  logs: string | null;
  createdAt: Date;
  bufferCounts: { pending: number; accepted: number; rejected: number };
};

function normalizeConfig(raw: unknown): MissionConfig {
  const c = (raw ?? {}) as Partial<MissionConfig>;
  return {
    sources: Array.isArray(c.sources) && c.sources.length > 0 ? c.sources : ["google_maps"],
    keywords: typeof c.keywords === "string" ? c.keywords : "",
    location: {
      city: c.location?.city ?? null,
      country: c.location?.country ?? "France",
      radiusKm: c.location?.radiusKm ?? null,
    },
    companyType: c.companyType ?? null,
    companySize: c.companySize ?? null,
    language: c.language ?? "fr",
    limit: typeof c.limit === "number" && c.limit > 0 ? Math.min(c.limit, 500) : 50,
    rate: { ...DEFAULT_RATE, ...(c.rate ?? {}) },
    dailyQuota:
      typeof c.dailyQuota === "number" && c.dailyQuota > 0 ? Math.min(c.dailyQuota, 1000) : null,
    autoPipeline: c.autoPipeline?.enabled
      ? { enabled: true, sequenceId: c.autoPipeline.sequenceId ?? null }
      : { enabled: false, sequenceId: null },
  };
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
  const missions = await prisma.scrapingMission.findMany({ orderBy: { createdAt: "desc" } });
  const out: MissionDTO[] = [];
  for (const m of missions) {
    out.push({
      id: m.id,
      name: m.name,
      config: normalizeConfig(m.config),
      schedule: m.schedule,
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
  return {
    id: m.id,
    name: m.name,
    config: normalizeConfig(m.config),
    schedule: m.schedule,
    status: m.status,
    logs: m.logs,
    createdAt: m.createdAt,
    bufferCounts: await bufferCounts(m.id),
  };
}

export async function createMission(input: {
  name: string;
  config: MissionConfig;
  schedule?: string | null;
}): Promise<MissionDTO> {
  const m = await prisma.scrapingMission.create({
    data: {
      name: input.name,
      config: normalizeConfig(input.config) as object,
      schedule: input.schedule ?? null,
      status: "pending",
    },
  });
  return {
    id: m.id, name: m.name, config: normalizeConfig(m.config), schedule: m.schedule,
    status: m.status, logs: m.logs, createdAt: m.createdAt,
    bufferCounts: { pending: 0, accepted: 0, rejected: 0 },
  };
}

export async function updateMission(
  id: string,
  input: { name?: string; config?: MissionConfig; schedule?: string | null },
): Promise<void> {
  const data: Prisma.ScrapingMissionUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.config !== undefined) data.config = normalizeConfig(input.config) as object;
  if (input.schedule !== undefined) data.schedule = input.schedule;
  await prisma.scrapingMission.update({ where: { id }, data });
}

export async function deleteMission(id: string): Promise<void> {
  await prisma.scrapedLeadBuffer.deleteMany({ where: { missionId: id } });
  await prisma.scrapingMission.delete({ where: { id } });
}

export type BufferItem = {
  id: string;
  missionId: string;
  status: string;
  raw: {
    name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    sector?: string | null;
    source?: string;
    rating?: number | null;
    duplicate?: boolean;
    duplicateReason?: string | null;
  };
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
    const raw = (row.raw ?? {}) as BufferItem["raw"];
    const email = raw.email?.trim() || null;
    const name = raw.name?.trim() || null;
    const company = raw.company?.trim() || null;

    if (!email && !name && !company) {
      skippedInvalid++;
      continue;
    }

    // Dédoublonnage final (S-07) : email exact, sinon nom+entreprise.
    let dup = false;
    if (email) {
      const h = emailHash(email);
      const exists = await prisma.lead.findFirst({
        where: { emailHash: h, deletedAt: null },
        select: { id: true },
      });
      if (exists) dup = true;
    }
    if (!dup && !email && name && company) {
      const exists = await prisma.lead.findFirst({
        where: {
          deletedAt: null,
          company: { equals: company, mode: "insensitive" },
          OR: [
            { firstName: { equals: name.split(" ")[0] ?? name, mode: "insensitive" } },
            { lastName: { contains: name.split(" ").slice(1).join(" "), mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (exists) dup = true;
    }
    if (dup) {
      skippedDuplicate++;
      await prisma.scrapedLeadBuffer.update({
        where: { id: row.id },
        data: { status: "rejected", raw: { ...raw, duplicate: true, duplicateReason: "déjà en base" } as object },
      });
      continue;
    }

    const [firstName, ...rest] = (name ?? "").split(" ");
    const lead = await prisma.lead.create({
      data: {
        emailEnc: encryptOrNull(email),
        emailHash: email ? emailHash(email) : null,
        phoneEnc: encryptOrNull(raw.phone ?? null),
        firstName: firstName || null,
        lastName: rest.join(" ") || null,
        company,
        website: raw.website ?? null,
        sector: raw.sector ?? null,
        city: raw.city ?? null,
        country: "France",
        source: `Scraping: ${raw.source ?? "mission"}`,
        status: "NOUVEAU",
        notes: raw.address ? `Adresse scrapée : ${raw.address}` : null,
        lastActionAt: new Date(),
        deletedAt: null,
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
  }

  return { injected, skippedDuplicate, skippedInvalid };
}

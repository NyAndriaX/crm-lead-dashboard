/**
 * Job `scraping-run` — mission Google Maps via crm-leads-scraper.
 */
import * as crypto from "node:crypto";
import {
  normalizeMissionConfig,
  passesEmailRequirement,
  type MissionConfig,
  type ScrapedLead,
} from "@crm/db";
import { prisma, notifyUser, syncTags, type Prisma } from "@crm/db";
import type { WorkerJobContext } from "@crm/queue";
import { runScrapingMission } from "./scraping/adapters";
import { checkScrapedLeadDuplicate, trackScrapedLeadSeen } from "./scraping/dedup";
import { buildLeadCreateFromScraped } from "./scraping/leadPayload";

function getHmacSecret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant");
  return s;
}
function emailHash(email: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}

const ALGO = "aes-256-gcm";
function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return key;
}
function encryptOrNull(v: string | null | undefined): Buffer | null {
  if (v == null || v === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(v, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

async function saveMissionConfig(missionId: string, config: MissionConfig): Promise<void> {
  await prisma.scrapingMission.update({
    where: { id: missionId },
    data: { config: config as object },
  });
}

function markMissionRan(config: MissionConfig): MissionConfig {
  const plan = config.schedulePlan ?? { mode: "manual" as const };
  return {
    ...config,
    schedulePlan: { ...plan, lastRunAt: new Date().toISOString() },
  };
}

export async function runScraping(ctx: WorkerJobContext): Promise<unknown> {
  const payload = (ctx.payload ?? {}) as { missionId?: string };
  const missionId = payload.missionId;
  if (!missionId) return { error: "missionId manquant" };

  const mission = await prisma.scrapingMission.findUnique({ where: { id: missionId } });
  if (!mission) return { error: "Mission introuvable" };

  const logs: string[] = [];
  const flushLogs = async () => {
    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: { logs: logs.join("\n") },
    });
  };
  const log = (line: string) => {
    const row = `${new Date().toISOString().slice(11, 19)} ${line}`;
    logs.push(row);
    console.log(`[worker] [scraping] ${row}`);
    void flushLogs().catch((e) => console.warn("[worker] flush logs:", e));
  };

  const cfg = normalizeMissionConfig(mission.config);
  const configWithRun = {
    ...(mission.config as object),
    _runStartedAt: new Date().toISOString(),
  };

  await prisma.scrapingMission.update({
    where: { id: missionId },
    data: {
      status: "running",
      logs: "Démarrage en arrière-plan — vous serez notifié à la fin du scraping.",
      config: configWithRun,
    },
  });

  try {
    const live = process.env.SCRAPING_LIVE ?? "(unset)";
    const api = process.env.SCRAPER_API_URL ?? "http://127.0.0.1:8000";
    log(`SCRAPING_LIVE=${live} · API=${api}`);
    log("Exécution en arrière-plan — pas de limite de durée côté CRM (peut prendre 1 h ou plus).");
    log(`Mission « ${mission.name} » — ${cfg.keywords} (${cfg.location.country ?? "France"})`);
    if (cfg.requireEmail) log("Filtre actif : email obligatoire");

    let scraped = await runScrapingMission(cfg, log);
    if (cfg.dailyQuota && scraped.length > cfg.dailyQuota) {
      log(`Quota ${cfg.dailyQuota} appliqué (${scraped.length} → ${cfg.dailyQuota})`);
      scraped = scraped.slice(0, cfg.dailyQuota);
    }
    log(`Total brut : ${scraped.length}`);

    let dupExisting = 0;
    let dupInternal = 0;
    let filteredNoEmail = 0;
    let newPending = 0;
    const seen = { placeId: new Set<string>(), email: new Set<string>(), companyCity: new Set<string>() };

    for (const lead of scraped) {
      const email = lead.email?.trim().toLowerCase() || null;

      if (!passesEmailRequirement(lead, cfg.requireEmail)) {
        filteredNoEmail++;
        continue;
      }

      const dedup = await checkScrapedLeadDuplicate(lead, seen, emailHash);
      if (dedup.kind === "internal") dupInternal++;
      if (dedup.kind === "existing") dupExisting++;

      trackScrapedLeadSeen(lead, seen);

      const status = dedup.duplicate ? "rejected" : "pending";
      if (status === "pending") newPending++;

      await prisma.scrapedLeadBuffer.create({
        data: {
          missionId,
          emailHash: email ? emailHash(email) : null,
          status,
          raw: {
            ...(lead as ScrapedLead),
            duplicate: dedup.duplicate,
            duplicateReason: dedup.reason,
          } as object,
        },
      });
    }

    log(
      `Buffer : ${newPending} nouveau(x) · ${dupExisting} déjà en base · ` +
        `${dupInternal} doublons lot · ${filteredNoEmail} exclus (sans email)`,
    );

    let autoInjected = 0;
    if (cfg.autoPipeline?.enabled) {
      const pendings = await prisma.scrapedLeadBuffer.findMany({
        where: { missionId, status: "pending" },
      });
      const seqId = cfg.autoPipeline.sequenceId || null;
      for (const row of pendings) {
        const raw = (row.raw ?? {}) as ScrapedLead;
        const em = (raw.email ?? "").trim() || null;
      const extraTags = [...(cfg.injectionTags ?? []), ...(cfg.autoPipeline?.tags ?? []), "scraping-auto"];
      if (extraTags.length > 0) await syncTags(extraTags);
      const base = buildLeadCreateFromScraped(
        raw,
        `Scraping auto: ${mission.name}`,
        extraTags,
      );
        try {
          const created = await prisma.lead.create({
            data: {
              ...base,
              tags: base.tags as Prisma.InputJsonValue,
              emailEnc: encryptOrNull(em),
              emailHash: em ? emailHash(em) : null,
              phoneEnc: encryptOrNull(raw.phone ?? null),
            },
          });
          await prisma.scrapedLeadBuffer.update({
            where: { id: row.id },
            data: { status: "accepted", raw: { ...raw, injectedLeadId: created.id, auto: true } as object },
          });
          await prisma.leadHistory.create({
            data: { leadId: created.id, type: "scraped_auto_imported", payload: { missionId } as object },
          });
          if (seqId) {
            const seq = await prisma.sequence.findUnique({ where: { id: seqId } });
            if (seq && !seq.isPaused) {
              await prisma.sequenceLead.create({
                data: {
                  sequenceId: seqId,
                  leadId: created.id,
                  currentStep: 0,
                  status: "active",
                  nextSendAt: new Date(),
                },
              });
            }
          }
          autoInjected++;
        } catch (e) {
          log(`auto-inject KO : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      log(`Auto-pipeline : ${autoInjected} lead(s) injecté(s)`);
    }

    const cfgAfterRun = markMissionRan(cfg);
    await saveMissionConfig(missionId, cfgAfterRun);

    const updatedConfig = markMissionRan(cfg);
    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: { status: "done", logs: logs.join("\n"), config: updatedConfig as object },
    });

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true },
      take: 10,
    });

    const dupTotal = dupExisting + dupInternal;
    const parts: string[] = [];
    if (cfg.autoPipeline?.enabled) {
      parts.push(`${autoInjected} lead(s) importé(s) dans le CRM`);
    } else {
      parts.push(
        `Récupération Google Maps terminée : ${newPending} nouveau(x) lead(s) prêt(s) à valider`,
      );
    }
    if (dupTotal > 0) parts.push(`${dupTotal} doublon(s) exclus`);
    if (filteredNoEmail > 0) parts.push(`${filteredNoEmail} sans email (filtre actif)`);
    const bodyMsg = `« ${mission.name} » — ${parts.join(" · ")}. Ouvrez Scraping → Résultats.`;

    const notifLink = `/scraping?openResults=${missionId}`;
    for (const a of admins) {
      await notifyUser({
        userId: a.id,
        type: "scraping_done",
        title: cfg.autoPipeline?.enabled
          ? "Scraping terminé — leads importés"
          : "Scraping terminé — leads à valider",
        body: bodyMsg,
        link: notifLink,
      });
    }

    return {
      ok: true,
      scraped: scraped.length,
      newPending,
      filteredNoEmail,
      duplicatesExisting: dupExisting,
      duplicatesInternal: dupInternal,
      autoInjected,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`ERREUR : ${msg}`);
    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: { status: "error", logs: logs.join("\n") },
    });

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true },
      take: 5,
    });
    for (const a of admins) {
      await notifyUser({
        userId: a.id,
        type: "scraping_error",
        title: "Scraping en erreur",
        body: `Mission « ${mission.name} » : ${msg}`,
        link: `/scraping?openResults=${missionId}`,
      });
    }
    return { error: msg };
  }
}

/** Cron — relance les missions planifiées (ponctuelles ou récurrentes). */
export async function runScrapingScheduler(): Promise<unknown> {
  const missions = await prisma.scrapingMission.findMany({
    where: {
      OR: [
        { schedule: { not: null } },
        { status: "scheduled" },
      ],
    },
  });

  let triggered = 0;
  const { shouldRunScheduledMission } = await import("@crm/db");

  for (const m of missions) {
    const cfg = normalizeMissionConfig(m.config);
    if (!shouldRunScheduledMission(cfg.schedulePlan, m.status)) continue;

    await prisma.scrapingMission.update({
      where: { id: m.id },
      data: { status: "queued", logs: `Planificateur — mise en file ${new Date().toISOString()}` },
    });
    const { getWorkerAgenda, enqueueOneOff } = await import("@crm/queue");
    await enqueueOneOff(getWorkerAgenda(), "scraping-run", { missionId: m.id }, { priority: 1 });
    triggered++;
  }
  return { ok: true, triggered };
}

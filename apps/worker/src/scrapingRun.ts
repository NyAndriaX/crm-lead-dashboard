/**
 * Job `scraping-run` — exécute une mission de scraping (S-08).
 *
 * 1. Passe la mission en "running".
 * 2. Scrape toutes les sources configurées (adapters sandbox/live).
 * 3. Dédoublonne avant insertion buffer (S-07) : email exact en base /
 *    nom+entreprise / doublons internes au lot.
 * 4. Écrit dans ScrapedLeadBuffer (status "pending"), prêt pour la
 *    validation manuelle (S-10).
 * 5. Mission "done" (+ logs) et notification de fin (S-09).
 */
import * as crypto from "node:crypto";
import { prisma } from "@crm/db";
import type { WorkerJobContext } from "@crm/queue";
import { scrapeAllSources, type ScrapeConfig, type ScrapedLead } from "./scraping/adapters";

function getHmacSecret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant");
  return s;
}
function emailHash(email: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}

// Crypto AES-256-GCM (miroir de lib/crypto.ts) pour l'auto-injection.
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

/** Config enrichie A3 (au-delà du ScrapeConfig adapters). */
type AutoCfg = {
  dailyQuota?: number | null;
  autoPipeline?: { enabled?: boolean; sequenceId?: string | null };
};

export async function runScraping(ctx: WorkerJobContext): Promise<unknown> {
  const payload = (ctx.payload ?? {}) as { missionId?: string };
  const missionId = payload.missionId;
  if (!missionId) return { error: "missionId manquant" };

  const mission = await prisma.scrapingMission.findUnique({ where: { id: missionId } });
  if (!mission) return { error: "Mission introuvable" };

  const logs: string[] = [];
  const log = (line: string) => {
    logs.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  };

  await prisma.scrapingMission.update({
    where: { id: missionId },
    data: { status: "running", logs: "Démarrage…" },
  });

  try {
    const cfg = mission.config as unknown as ScrapeConfig;
    const autoCfg = mission.config as unknown as AutoCfg;
    log(`Mission "${mission.name}" — sources: ${cfg.sources.join(", ")}`);

    let scraped = await scrapeAllSources(cfg, log);
    // A3 (F4) — quota journalier : plafonne le volume si défini.
    if (autoCfg.dailyQuota && scraped.length > autoCfg.dailyQuota) {
      log(`Quota journalier ${autoCfg.dailyQuota} appliqué (${scraped.length} → ${autoCfg.dailyQuota})`);
      scraped = scraped.slice(0, autoCfg.dailyQuota);
    }
    log(`Total brut scrapé : ${scraped.length}`);

    // S-07 — dédoublonnage avant insertion buffer.
    let dupExisting = 0;
    let dupInternal = 0;
    const seenEmail = new Set<string>();
    const seenNameCompany = new Set<string>();
    let inserted = 0;

    for (const lead of scraped) {
      const email = lead.email?.trim().toLowerCase() || null;
      const nameCompanyKey = `${(lead.name ?? "").toLowerCase()}|${(lead.company ?? "").toLowerCase()}`;

      let duplicate = false;
      let reason: string | null = null;

      if (email && seenEmail.has(email)) {
        duplicate = true;
        reason = "doublon interne (email)";
        dupInternal++;
      } else if (!email && seenNameCompany.has(nameCompanyKey) && nameCompanyKey !== "|") {
        duplicate = true;
        reason = "doublon interne (nom+entreprise)";
        dupInternal++;
      } else if (email) {
        const h = emailHash(email);
        const exists = await prisma.lead.findFirst({
          where: { emailHash: h, deletedAt: null },
          select: { id: true },
        });
        if (exists) {
          duplicate = true;
          reason = "déjà en base (email)";
          dupExisting++;
        }
      }

      if (email) seenEmail.add(email);
      if (nameCompanyKey !== "|") seenNameCompany.add(nameCompanyKey);

      await prisma.scrapedLeadBuffer.create({
        data: {
          missionId,
          emailHash: email ? emailHash(email) : null,
          status: duplicate ? "rejected" : "pending",
          raw: {
            ...(lead as ScrapedLead),
            duplicate,
            duplicateReason: reason,
          } as object,
        },
      });
      inserted++;
    }

    log(`Buffer : ${inserted} inséré(s) · ${dupExisting} déjà en base · ${dupInternal} doublons internes`);

    // A3 (F4) — pipeline automatisé : auto-injection + enrôlement séquence.
    let autoInjected = 0;
    if (autoCfg.autoPipeline?.enabled) {
      const pendings = await prisma.scrapedLeadBuffer.findMany({
        where: { missionId, status: "pending" },
      });
      const seqId = autoCfg.autoPipeline.sequenceId || null;
      for (const row of pendings) {
        const raw = (row.raw ?? {}) as ScrapedLead & { name?: string | null };
        const email = (raw.email ?? "").trim() || null;
        const [firstName, ...rest] = (raw.name ?? "").split(" ");
        try {
          const created = await prisma.lead.create({
            data: {
              emailEnc: encryptOrNull(email),
              emailHash: email ? emailHash(email) : null,
              phoneEnc: encryptOrNull(raw.phone ?? null),
              firstName: firstName || null,
              lastName: rest.join(" ") || null,
              company: raw.company ?? null,
              website: raw.website ?? null,
              sector: raw.sector ?? null,
              city: raw.city ?? null,
              country: "France",
              source: `Scraping auto: ${raw.source ?? mission.name}`,
              status: "NOUVEAU",
              tags: ["scraping-auto"],
              lastActionAt: new Date(),
              deletedAt: null,
            },
          });
          await prisma.scrapedLeadBuffer.update({
            where: { id: row.id },
            data: { status: "accepted", raw: { ...raw, injectedLeadId: created.id, auto: true } as object },
          });
          await prisma.leadHistory.create({
            data: { leadId: created.id, type: "scraped_auto_imported", payload: { missionId } as object },
          });
          // Enrôle dans la séquence (relances IA si steps.aiPersonalize) → envoi auto.
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
      log(
        `Auto-pipeline : ${autoInjected} lead(s) injecté(s)` +
          (seqId ? ` + enrôlés dans la séquence ${seqId}` : "") +
          ". Les relances personnalisées partent automatiquement.",
      );
    } else {
      log("Mission terminée — validez les résultats avant injection CRM.");
    }

    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: { status: "done", logs: logs.join("\n") },
    });

    // S-09 — notification de fin (au créateur si traçable, sinon admins).
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true },
      take: 5,
    });
    const bodyMsg = autoCfg.autoPipeline?.enabled
      ? `Mission "${mission.name}" : ${autoInjected} lead(s) injecté(s) automatiquement.`
      : `Mission "${mission.name}" : ${inserted - dupExisting - dupInternal} lead(s) à valider.`;
    for (const a of admins) {
      await prisma.notification.create({
        data: {
          userId: a.id,
          type: "scraping_done",
          title: "Scraping terminé",
          body: bodyMsg,
          link: "/scraping",
        },
      });
    }

    return {
      ok: true,
      scraped: scraped.length,
      inserted,
      autoInjected,
      duplicatesExisting: dupExisting,
      duplicatesInternal: dupInternal,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`ERREUR : ${msg}`);
    await prisma.scrapingMission.update({
      where: { id: missionId },
      data: { status: "error", logs: logs.join("\n") },
    });
    return { error: msg };
  }
}

/**
 * Job `scraping-scheduler` (cron worker) — S-09 + A3 (F4).
 * Relance les missions planifiées : "daily" (F4 — X leads/jour),
 * "weekly" (7j) ou "monthly" (30j).
 */
export async function runScrapingScheduler(): Promise<unknown> {
  const missions = await prisma.scrapingMission.findMany({
    where: { schedule: { not: null } },
  });
  const now = Date.now();
  let triggered = 0;

  for (const m of missions) {
    if (m.status === "running" || m.status === "queued") continue;
    // Heuristique simple : on relit createdAt comme ancrage faute de
    // champ "lastRunAt" (schéma CDC figé). daily = 1j / weekly = 7j / monthly = 30j.
    const intervalDays =
      m.schedule === "monthly" ? 30 : m.schedule === "weekly" ? 7 : m.schedule === "daily" ? 1 : 0;
    if (intervalDays === 0) continue;
    const ageDays = (now - m.createdAt.getTime()) / 86_400_000;
    // Re-déclenche si la dernière exécution (approx createdAt + cycles) est due.
    if (ageDays % intervalDays < 0.05 || m.status === "pending") {
      await prisma.scrapingMission.update({
        where: { id: m.id },
        data: { status: "queued" },
      });
      // Réinsère un run via la même collection Agenda.
      const { getWorkerAgenda, enqueueOneOff } = await import("@crm/queue");
      await enqueueOneOff(getWorkerAgenda(), "scraping-run", { missionId: m.id }, { priority: 1 });
      triggered++;
    }
  }
  return { ok: true, triggered };
}

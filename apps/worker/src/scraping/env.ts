/** Mode LIVE : appelle crm-leads-scraper (sinon sandbox local). */
export function isScrapingLive(): boolean {
  const v = process.env.SCRAPING_LIVE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function scraperApiUrl(): string {
  return (
    process.env.SCRAPER_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000"
  );
}

/** `SCRAPER_TIMEOUT_MS` ≤ 0 ou absent = pas de timeout HTTP (scraping long autorisé). */
export function scraperFetchTimeoutMs(): number | null {
  const raw = process.env.SCRAPER_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Verrou Agenda pour `scraping-run` (défaut 4 h). */
export function scrapingJobLockMs(): number {
  const n = Number(process.env.SCRAPING_JOB_LOCK_MS ?? 4 * 60 * 60 * 1000);
  return Number.isFinite(n) && n > 60_000 ? n : 4 * 60 * 60 * 1000;
}

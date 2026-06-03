function cleanEnvValue(raw: string | undefined): string {
  if (raw == null) return "";
  return raw
    .trim()
    .replace(/^[\u201c\u201d\u2018\u2019"'`]+|[\u201c\u201d\u2018\u2019"'`]+$/g, "");
}

/** Vérifie que crm-leads-scraper répond sur SCRAPER_API_URL/health. */
export async function checkScraperReachable(): Promise<{
  ok: boolean;
  url: string;
  error?: string;
}> {
  const base = (
    cleanEnvValue(process.env.SCRAPER_API_URL) || "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
  const timeoutMs = Number(cleanEnvValue(process.env.SCRAPER_HEALTH_TIMEOUT_MS) || "15000");
  const url = `${base}/health`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, url: base, error: `HTTP ${res.status}` };
    }
    return { ok: true, url: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      url: base,
      error: msg.includes("abort") ? "timeout — scraper injoignable" : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isScrapingLiveEnabled(): boolean {
  const v = cleanEnvValue(process.env.SCRAPING_LIVE).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

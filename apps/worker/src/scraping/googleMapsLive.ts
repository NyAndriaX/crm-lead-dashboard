import {
  normalizeMissionConfig,
  parseScraperPayload,
  toScraperRequestBody,
  type MissionConfig,
  type ScrapedLead,
} from "@crm/db";
import { cleanEnvValue } from "../envUtil";
import { scraperApiUrl, scraperFetchTimeoutMs } from "./env";

/**
 * Appelle crm-leads-scraper (POST /scrape).
 * Pas de timeout HTTP par défaut — le job tourne en arrière-plan côté worker.
 */
export async function fetchGoogleMapsScraper(cfg: MissionConfig): Promise<ScrapedLead[]> {
  const base = scraperApiUrl();
  const normalized = normalizeMissionConfig(cfg);
  const timeoutMs = scraperFetchTimeoutMs();
  const body = toScraperRequestBody(normalized);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = cleanEnvValue(process.env.SCRAPER_API_KEY);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const endpoint = cleanEnvValue(process.env.SCRAPER_API_PATH) || "/scrape";
  const url = `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const timeoutLabel =
    timeoutMs != null ? `timeout ${Math.round(timeoutMs / 1000)}s` : "sans limite de durée";
  console.log(
    `[worker] [scraping] POST ${url} — keywords="${normalized.keywords}" limit=${normalized.limit} ` +
      `detailed=${normalized.detailed} (${timeoutLabel})`,
  );

  const controller = timeoutMs != null ? new AbortController() : null;
  const timer =
    controller && timeoutMs != null
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Scraper injoignable (${base}). Vérifiez que ./run.sh tourne dans CRM_LEAD_SCRAPER : ${detail}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scraper HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }

  console.log(`[worker] [scraping] réponse HTTP ${res.status} — lecture JSON…`);
  const json: unknown = await res.json();
  const query = normalized.keywords;
  const { leads, query: respQuery } = parseScraperPayload(json, query);
  if (leads.length === 0) {
    const err =
      json && typeof json === "object" && "error" in json
        ? String((json as { error?: unknown }).error ?? "")
        : "";
    if (err) throw new Error(`Scraper : ${err}`);
  }
  return leads.map((l) => ({
    ...l,
    query: l.query ?? respQuery ?? query,
    source: "google_maps" as const,
  }));
}

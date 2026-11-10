/**
 * Scraping Google Maps via crm-leads-scraper (LIVE) ou sandbox local.
 */
import {
  normalizeMissionConfig,
  type MissionConfig,
  type ScrapedLead,
} from "@crm/db";
import { isScrapingLive } from "./env";
import { fetchGoogleMapsScraper } from "./googleMapsLive";

export type { MissionConfig as ScrapeConfig, ScrapedLead } from "@crm/db";

export const LIVE_MODE = isScrapingLive();

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTORS = ["Restauration", "BTP", "Commerce", "Services B2B", "Santé", "Immobilier"];
const STREETS = ["rue de la République", "avenue Jean Jaurès", "place du Marché"];

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function sandboxGenerate(cfg: MissionConfig): ScrapedLead[] {
  const norm = normalizeMissionConfig(cfg);
  const city = norm.location.city || "Paris";
  const country = norm.location.country || "France";
  const rand = mulberry32(seedFrom(`${norm.keywords}|${city}|${country}`));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)] as T;
  const kw = norm.keywords.trim() || "entreprise";
  const n = Math.max(3, Math.min(norm.limit, 15));
  const out: ScrapedLead[] = [];
  for (let i = 0; i < n; i++) {
    const company = `${kw.split(" ")[0] ?? "Société"} ${pick(["Pro", "Group", ""])} ${city}`.trim();
    const domain = `${slug(company).slice(0, 14) || "demo"}.fr`;
    const hasEmail = rand() > 0.35;
    out.push({
      name: null,
      company,
      email: hasEmail ? `contact@${domain}` : null,
      phone: `+33 1 ${String(Math.floor(rand() * 90) + 10)} 00 00 00`,
      website: `https://www.${domain}`,
      address: `${Math.floor(rand() * 200) + 1} ${pick(STREETS)}, ${city}, ${country}`,
      city,
      country,
      sector: pick(SECTORS),
      source: "google_maps",
      rating: Math.round((3 + rand() * 2) * 10) / 10,
      reviews: Math.floor(rand() * 200),
      place_id: `sandbox_${i}_${slug(company)}`,
      email_status: hasEmail ? "found" : "no_email",
      query: kw,
    });
  }
  return out;
}

export async function runScrapingMission(cfg: MissionConfig, onLog: (line: string) => void): Promise<ScrapedLead[]> {
  const norm = normalizeMissionConfig(cfg);
  onLog(`[google_maps] mode ${LIVE_MODE ? "LIVE" : "SANDBOX"} — « ${norm.keywords} » (${norm.location.country ?? "France"})`);
  onLog(
    `[débit] délai ${norm.rate.delayMs} ms · ${norm.rate.retries} nouvelle(s) tentative(s) · rotation UA ` +
      `${norm.rate.rotateUserAgent ? "oui" : "non"} · proxy ${norm.rate.proxyUrl ?? "du scraper (s'il est configuré)"}`,
  );
  if (norm.sectorSites?.length) onLog(`[sites sectoriels] ${norm.sectorSites.length} page(s) : ${norm.sectorSites.join(" · ")}`);

  let attempt = 0;
  while (attempt <= norm.rate.retries) {
    try {
      const res = LIVE_MODE ? await fetchGoogleMapsScraper(norm, onLog) : sandboxGenerate(norm);
      onLog(`[google_maps] ${res.length} résultat(s) brut(s)`);
      return res;
    } catch (e) {
      attempt++;
      const msg = e instanceof Error ? e.message : String(e);
      onLog(`[google_maps] échec tentative ${attempt}: ${msg}`);
      if (attempt > norm.rate.retries) throw e;
      if (norm.rate.delayMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(norm.rate.delayMs, 10000)));
      }
    }
  }
  return [];
}

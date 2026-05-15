/**
 * Adapters de scraping (S-02 → S-05) — architecture "sandbox-first".
 *
 * Par défaut chaque adapter tourne en mode SANDBOX : il génère des
 * résultats mock réalistes, déterministes (seed = mots-clés + ville), ce
 * qui rend tout le module testable/démontrable sans dépendance lourde ni
 * risque légal.
 *
 * Si `process.env.SCRAPING_LIVE === "true"`, l'adapter tente le scraping
 * réel — qui nécessite Playwright + proxies + respect des CGU/robots.txt.
 * Cette partie est volontairement un point d'extension non câblé (lève une
 * erreur explicite) pour ne pas embarquer ~300 Mo de Chromium par défaut
 * ni enfreindre les CGU (LinkedIn notamment).
 */

export type ScrapeSource = "google_maps" | "directories" | "linkedin" | "website";

export type ScrapedLead = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  sector?: string | null;
  source: ScrapeSource;
  rating?: number | null;
};

export type ScrapeConfig = {
  sources: ScrapeSource[];
  keywords: string;
  location: { city?: string | null; country?: string | null; radiusKm?: number | null };
  companyType?: string | null;
  companySize?: string | null;
  language?: string | null;
  limit: number;
  rate: { delayMs: number; retries: number; rotateUserAgent: boolean; proxyUrl?: string | null };
};

export const LIVE_MODE = process.env.SCRAPING_LIVE === "true";

// ── PRNG déterministe (mulberry32) ──────────────────────────────────────────
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

const FIRST = ["Marie", "Jean", "Sophie", "Pierre", "Camille", "Lucas", "Emma", "Thomas", "Léa", "Hugo", "Chloé", "Nicolas", "Julie", "Antoine", "Sarah"];
const LAST = ["Martin", "Bernard", "Dubois", "Robert", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Garcia", "Roux", "Fournier", "Girard"];
const SECTORS = ["Restauration", "BTP", "Commerce", "Services B2B", "Santé", "Industrie", "Conseil", "Artisanat", "Tech", "Immobilier"];
const STREETS = ["rue de la République", "avenue Jean Jaurès", "place du Marché", "boulevard Voltaire", "rue Victor Hugo", "allée des Tilleuls"];

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function sandboxGenerate(source: ScrapeSource, cfg: ScrapeConfig): ScrapedLead[] {
  const city = cfg.location.city || "Paris";
  const rand = mulberry32(seedFrom(`${source}|${cfg.keywords}|${city}|${cfg.companyType ?? ""}`));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)] as T;
  const kw = cfg.keywords.trim() || "entreprise";
  const n = Math.max(3, Math.min(cfg.limit, 40));
  const out: ScrapedLead[] = [];
  for (let i = 0; i < n; i++) {
    const company = `${kw.split(" ")[0] ?? "Société"}${pick(["", " & Fils", " Pro", " Group", " Solutions", " Conseil"])} ${pick(["Lyon", city, "France", ""])}`.trim();
    const domain = `${slug(company).slice(0, 18) || "demo"}.fr`;
    const first = pick(FIRST);
    const last = pick(LAST);
    const hasEmail = rand() > 0.35;
    const hasPhone = rand() > 0.25;
    out.push({
      name: `${first} ${last}`,
      company,
      email: hasEmail ? `${slug(first)}.${slug(last)}@${domain}` : null,
      phone: hasPhone ? `+33 ${Math.floor(rand() * 9) + 1} ${String(Math.floor(rand() * 90) + 10)} ${String(Math.floor(rand() * 90) + 10)} ${String(Math.floor(rand() * 90) + 10)} ${String(Math.floor(rand() * 90) + 10)}` : null,
      website: rand() > 0.4 ? `https://www.${domain}` : null,
      address: `${Math.floor(rand() * 200) + 1} ${pick(STREETS)}, ${city}`,
      city,
      sector: cfg.companyType || pick(SECTORS),
      source,
      rating: source === "google_maps" ? Math.round((3 + rand() * 2) * 10) / 10 : null,
    });
  }
  return out;
}

function liveNotConfigured(source: ScrapeSource): never {
  throw new Error(
    `Scraping LIVE pour "${source}" non câblé : nécessite Playwright + proxies + conformité CGU/robots.txt. ` +
      `Désactivez SCRAPING_LIVE ou implémentez l'adapter réel (point d'extension documenté).`,
  );
}

async function runAdapter(source: ScrapeSource, cfg: ScrapeConfig): Promise<ScrapedLead[]> {
  if (LIVE_MODE) {
    // Point d'extension : brancher ici les scrapers Playwright réels.
    // LinkedIn en particulier interdit le scraping non-API dans ses CGU.
    liveNotConfigured(source);
  }
  return sandboxGenerate(source, cfg);
}

export async function scrapeAllSources(
  cfg: ScrapeConfig,
  onLog: (line: string) => void,
): Promise<ScrapedLead[]> {
  const all: ScrapedLead[] = [];
  for (const source of cfg.sources) {
    onLog(`[${source}] démarrage (mode ${LIVE_MODE ? "LIVE" : "SANDBOX"})`);
    let attempt = 0;
    // S-06 : retry + délai configurable.
    while (attempt <= cfg.rate.retries) {
      try {
        const res = await runAdapter(source, cfg);
        all.push(...res);
        onLog(`[${source}] ${res.length} résultat(s)`);
        break;
      } catch (e) {
        attempt++;
        const msg = e instanceof Error ? e.message : String(e);
        onLog(`[${source}] échec tentative ${attempt}: ${msg}`);
        if (attempt > cfg.rate.retries) {
          onLog(`[${source}] abandonné après ${attempt} tentative(s)`);
          break;
        }
      }
    }
    // Throttle entre sources (S-06).
    if (cfg.rate.delayMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(cfg.rate.delayMs, 10000)));
    }
  }
  return all.slice(0, cfg.limit);
}

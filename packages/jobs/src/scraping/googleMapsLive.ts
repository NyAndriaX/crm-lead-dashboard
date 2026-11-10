import {
  normalizeMissionConfig,
  parseScraperPayload,
  toScraperRequestBody,
  type MissionConfig,
  type ScrapedLead,
} from "@crm/db";
import { getAiConfig } from "@crm/ai";
import { Agent, fetch as undiciFetch } from "undici";
import { scraperApiUrl, scraperFetchTimeoutMs } from "./env";
import { resolveMissionProxy } from "./secret";

/**
 * Appelle le scraper (apps/scraper, POST /scrape).
 *
 * Pas de timeout HTTP par défaut (`SCRAPER_TIMEOUT_MS` vide ou 0) : une mission avec
 * analyse IA peut durer bien plus de 5 minutes. Le `fetch` global de Node impose sinon
 * `headersTimeout`/`bodyTimeout` = 300 s (undici) — d'où un Agent dédié.
 */
export async function fetchGoogleMapsScraper(
  cfg: MissionConfig,
  onLog: (line: string) => void = () => {},
): Promise<ScrapedLead[]> {
  const base = scraperApiUrl();
  const normalized = normalizeMissionConfig(cfg);
  const timeoutMs = scraperFetchTimeoutMs();
  // Proxy chiffré de la mission (S-06) : déchiffré ici seulement, jamais journalisé.
  const body = toScraperRequestBody(normalized, { proxyUrl: resolveMissionProxy(normalized.rate) });
  // Fournisseur d'IA choisi par l'administrateur : l'analyse des sites suit le même réglage que le CRM.
  const ai = await getAiConfig();
  body.ai = {
    enabled: ai.enabled,
    provider: ai.provider.id,
    kind: ai.provider.kind,
    model: ai.model,
    fast_model: ai.fastModel,
    base_url: ai.baseUrl,
    api_key: ai.apiKey,
    json_mode: ai.provider.jsonMode ?? null,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.SCRAPER_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const endpoint = process.env.SCRAPER_API_PATH?.trim() || "/scrape";
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

  // 0 = pas de limite : la réponse n'arrive qu'à la fin de la mission (en-têtes compris).
  const dispatcher = new Agent({ headersTimeout: timeoutMs ?? 0, bodyTimeout: timeoutMs ?? 0 });
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal,
      dispatcher,
    });
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
    const detail = e instanceof Error ? `${e.message}${cause}` : String(e);
    throw new Error(
      `Scraper injoignable (${base}). Vérifiez que le service scraper tourne (apps/scraper, port 8000) : ${detail}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  let json: unknown;
  try {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Scraper HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`);
    }
    console.log(`[worker] [scraping] réponse HTTP ${res.status} — lecture JSON…`);
    json = await res.json();
  } finally {
    void dispatcher.close();
  }
  const query = normalized.keywords;
  const { leads, query: respQuery, meta } = parseScraperPayload(json, query);
  if (meta?.rate) {
    onLog(
      `[scraper] débit : délai ${meta.rate.delay_ms ?? 0} ms · rotation UA ${meta.rate.rotate_user_agent ? "oui" : "non"} · ` +
        `proxy ${meta.rate.proxy ?? "aucun"} (${meta.rate.origin ?? "?"})`,
    );
  }
  if (meta?.robots?.enforced) {
    onLog(
      `[scraper] robots.txt : ${meta.robots.domains_checked ?? 0} domaine(s) contrôlé(s), ` +
        `${meta.robots.pages_disallowed ?? 0} page(s) ignorée(s)` +
        (meta.robots.disallowed_urls?.length ? ` — ${meta.robots.disallowed_urls.slice(0, 5).join(", ")}` : ""),
    );
  }
  if (meta?.sources?.directories) onLog(`[scraper] sites sectoriels : ${meta.sources.directories} établissement(s)`);
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
    source: l.source === "directories" ? ("directories" as const) : ("google_maps" as const),
  }));
}

/**
 * S-05 / S-06 — le worker transmet au scraper les réglages propres à la mission :
 * délai, rotation d'user-agent, proxy (déchiffré au dernier moment) et sites sectoriels.
 * Un faux scraper HTTP local capture la requête POST /scrape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.PII_ENCRYPTION_KEY = "11".repeat(32);

test("le proxy chiffré de la mission est déchiffré et envoyé au scraper avec le débit et les sites sectoriels", async () => {
  const { encryptSecretB64, resolveMissionProxy } = await import("../src/scraping/secret");
  const { normalizeMissionConfig } = await import("@crm/db");
  const { fetchGoogleMapsScraper } = await import("../src/scraping/googleMapsLive");

  const secretProxy = "http://alice:s3cret@proxy.local:3128";
  const cfg = normalizeMissionConfig({
    keywords: "plombier",
    location: { country: "France" },
    limit: 10,
    sectorSites: ["https://annuaire.example/membres"],
    rate: { delayMs: 2500, retries: 1, rotateUserAgent: true, proxyUrl: secretProxy, proxyUrlEnc: encryptSecretB64(secretProxy) },
  });
  assert.equal(cfg.rate.proxyUrl, "http://alice:***@proxy.local:3128");
  assert.equal(resolveMissionProxy(cfg.rate), secretProxy);

  let received: Record<string, unknown> | null = null;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received = JSON.parse(raw) as Record<string, unknown>;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        ok: true,
        query: "plombier France",
        results: [
          { company: "Plomberie Alpha", place_id: "ChIJa", source: "google_maps" },
          { company: "Beta Chauffage", website: "https://beta.example", source: "directories", source_url: "https://annuaire.example/membres" },
        ],
        meta: {
          robots: { enforced: true, domains_checked: 3, pages_disallowed: 1, disallowed_urls: ["https://gamma.example/"] },
          rate: { delay_ms: 2500, rotate_user_agent: true, proxy: "http://alice:***@proxy.local:3128", origin: "mission" },
          sources: { google_maps: 1, directories: 1 },
        },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.SCRAPER_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const logs: string[] = [];
  try {
    const leads = await fetchGoogleMapsScraper(cfg, (l) => logs.push(l));
    assert.deepEqual(leads.map((l) => [l.company, l.source]), [["Plomberie Alpha", "google_maps"], ["Beta Chauffage", "directories"]]);
    assert.equal(leads[1]?.source_url, "https://annuaire.example/membres");
  } finally {
    server.close();
  }
  assert.ok(received);
  const body = received as Record<string, unknown>;
  assert.deepEqual(body.rate, { delayMs: 2500, retries: 1, rotateUserAgent: true, proxyUrl: secretProxy });
  assert.deepEqual(body.sectorSites, ["https://annuaire.example/membres"]);
  // Les journaux de la mission ne contiennent jamais le mot de passe du proxy.
  assert.ok(logs.some((l) => l.includes("robots.txt : 3 domaine(s) contrôlé(s), 1 page(s) ignorée(s)")));
  assert.ok(logs.every((l) => !l.includes("s3cret")));
});

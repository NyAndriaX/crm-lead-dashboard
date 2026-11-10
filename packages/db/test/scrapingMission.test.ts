import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMaskedProxy,
  maskProxyUrl,
  normalizeMissionConfig,
  normalizeSectorSites,
  proxyHasCredentials,
  toScraperRequestBody,
} from "../src/scrapingMission";

const base = { keywords: "plombier", location: { country: "France" }, limit: 20 };

test("S-06 : les réglages de débit de la mission sont transmis au scraper", () => {
  const cfg = normalizeMissionConfig({
    ...base,
    rate: { delayMs: 3500, retries: 1, rotateUserAgent: false, proxyUrl: "http://proxy.local:3128" },
  });
  const body = toScraperRequestBody(cfg);
  assert.deepEqual(body.rate, { delayMs: 3500, retries: 1, rotateUserAgent: false, proxyUrl: "http://proxy.local:3128" });
});

test("S-06 : valeurs par défaut et bornes du débit", () => {
  const cfg = normalizeMissionConfig({ ...base, rate: { delayMs: -10, retries: 99 } });
  assert.deepEqual(cfg.rate, { delayMs: 0, retries: 5, rotateUserAgent: true, proxyUrl: null, proxyUrlEnc: null });
  assert.equal(normalizeMissionConfig(base).rate.delayMs, 2000);
});

test("S-06 : un proxy avec identifiants n'est jamais conservé ni transmis en clair", () => {
  assert.equal(proxyHasCredentials("http://alice:s3cret@proxy.local:3128"), true);
  assert.equal(proxyHasCredentials("proxy.local:3128"), false);
  assert.equal(maskProxyUrl("http://alice:s3cret@proxy.local:3128"), "http://alice:***@proxy.local:3128");
  const cfg = normalizeMissionConfig({ ...base, rate: { proxyUrl: "http://alice:s3cret@proxy.local:3128", proxyUrlEnc: "ZW5j" } });
  assert.equal(cfg.rate.proxyUrl, "http://alice:***@proxy.local:3128");
  assert.ok(isMaskedProxy(cfg.rate.proxyUrl));
  assert.ok(!JSON.stringify(cfg).includes("s3cret"));
  // Sans proxy déchiffré fourni par le worker, rien n'est envoyé (repli sur le proxy du scraper).
  assert.equal((toScraperRequestBody(cfg).rate as { proxyUrl: unknown }).proxyUrl, null);
  const withSecret = toScraperRequestBody(cfg, { proxyUrl: "http://alice:s3cret@proxy.local:3128" });
  assert.equal((withSecret.rate as { proxyUrl: unknown }).proxyUrl, "http://alice:s3cret@proxy.local:3128");
});

test("S-05 : sites sectoriels — URL http(s) valides, dédoublonnées, 10 au plus", () => {
  const sites = normalizeSectorSites([
    "https://www.ffbatiment.fr/adherents",
    "https://www.ffbatiment.fr/adherents",
    "javascript:alert(1)",
    "pas une url",
    ...Array.from({ length: 12 }, (_, i) => `https://annuaire.example/p${i}`),
  ]);
  assert.equal(sites.length, 10);
  assert.equal(sites[0], "https://www.ffbatiment.fr/adherents");
  const body = toScraperRequestBody(normalizeMissionConfig({ ...base, sectorSites: ["https://annuaire.example/membres"] }));
  assert.deepEqual(body.sectorSites, ["https://annuaire.example/membres"]);
  assert.equal(toScraperRequestBody(normalizeMissionConfig(base)).sectorSites, null);
});

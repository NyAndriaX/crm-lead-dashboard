/**
 * Clients des fournisseurs d'enrichissement (INT-03) — `fetch` simulé, aucun appel réseau réel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dropcontactConfidence, dropcontactFindEmail, hunterFindEmail, pappersSearch, rechercheEntreprisesSearch, type FetchLike,
} from "../lib/services/enrichmentApis";

type Call = { url: string; init?: RequestInit };

/** Faux `fetch` : renvoie les réponses JSON dans l'ordre et mémorise les appels. */
function mockFetch(responses: { status?: number; body: unknown }[]): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = queue.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetchImpl, calls };
}

const noSleep = async () => undefined;

test("Hunter.io : email trouvé, clé passée en paramètre", async () => {
  const { fetchImpl, calls } = mockFetch([{ body: { data: { email: "jeanne.dupont@agence.fr", score: 91 } } }]);
  const hit = await hunterFindEmail("hk_test", { domain: "agence.fr", firstName: "Jeanne", lastName: "Dupont" }, fetchImpl);
  assert.deepEqual(hit, { email: "jeanne.dupont@agence.fr", confidence: 91 });
  assert.match(calls[0]!.url, /^https:\/\/api\.hunter\.io\/v2\/email-finder\?domain=agence\.fr&first_name=Jeanne&last_name=Dupont&api_key=hk_test$/);
});

test("Hunter.io : erreur HTTP → null (repli sur le fournisseur suivant)", async () => {
  const { fetchImpl } = mockFetch([{ status: 401, body: { errors: [] } }]);
  assert.equal(await hunterFindEmail("bad", { domain: "a.fr", firstName: "A", lastName: "B" }, fetchImpl), null);
});

test("Dropcontact : envoi, attente du résultat puis email nominatif", async () => {
  const { fetchImpl, calls } = mockFetch([
    { body: { error: false, success: true, request_id: "req42", credits_left: 99 } },
    { body: { error: false, success: false, reason: "Request not ready yet, try again in 30 seconds" } },
    { body: { error: false, success: true, data: [{ email: [{ email: "contact@agence.fr", qualification: "generic@pro" }, { email: "jeanne.dupont@agence.fr", qualification: "nominative@pro" }] }] } },
  ]);
  const hit = await dropcontactFindEmail("dc_test", { firstName: "Jeanne", lastName: "Dupont", company: "Agence", website: "https://agence.fr" }, { fetchImpl, sleep: noSleep });
  assert.deepEqual(hit, { email: "jeanne.dupont@agence.fr", confidence: 95, qualification: "nominative@pro" });
  assert.equal(calls[0]!.url, "https://api.dropcontact.com/v1/enrich/all");
  assert.equal(calls[0]!.init?.method, "POST");
  assert.equal((calls[0]!.init?.headers as Record<string, string>)["X-Access-Token"], "dc_test");
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
    data: [{ first_name: "Jeanne", last_name: "Dupont", company: "Agence", website: "https://agence.fr" }], siren: false, language: "fr",
  });
  assert.equal(calls[1]!.url, "https://api.dropcontact.com/v1/enrich/all/req42");
});

test("Dropcontact : résultat partiel forcé après le délai maximal", async () => {
  const notReady = { body: { success: false, reason: "not ready" } };
  const { fetchImpl, calls } = mockFetch([
    { body: { success: true, request_id: "r1" } }, notReady, notReady,
    { body: { success: true, data: [{ first_name: "Jeanne" }] } },
  ]);
  const hit = await dropcontactFindEmail("k", { firstName: "Jeanne", lastName: "Dupont", company: "Agence", website: null }, { fetchImpl, sleep: noSleep, pollMs: 1, maxWaitMs: 2 });
  assert.equal(hit, null);
  assert.match(calls.at(-1)!.url, /\/r1\?forceResults=true$/);
});

test("Dropcontact : pas d'appel sans prénom + nom + entreprise", async () => {
  const { fetchImpl, calls } = mockFetch([]);
  assert.equal(await dropcontactFindEmail("k", { firstName: "Jeanne", lastName: null, company: "Agence", website: null }, { fetchImpl }), null);
  assert.equal(calls.length, 0);
  assert.equal(dropcontactConfidence("invalid@pro"), 0);
  assert.equal(dropcontactConfidence("nominative@perso"), 50);
});

test("Pappers : premier résultat de la recherche", async () => {
  const { fetchImpl, calls } = mockFetch([{ body: { resultats: [{ nom_entreprise: "DATALIA", siren: "989111216", code_naf: "62.01Z", date_creation: "2025-07-10" }] } }]);
  const hit = await pappersSearch("pp", { company: "Datalia" }, fetchImpl);
  assert.equal(hit?.siren, "989111216");
  assert.equal(hit?.foundedYear, 2025);
  assert.match(calls[0]!.url, /api\.pappers\.fr\/v2\/recherche\?q=Datalia&api_token=pp&par_page=1/);
});

test("Recherche d'entreprises (API publique) : SIREN prioritaire, tranche d'effectif lisible", async () => {
  const { fetchImpl, calls } = mockFetch([{
    body: {
      results: [{
        siren: "989111216", nom_complet: "DATALIA", nom_raison_sociale: "DATALIA", activite_principale: "62.01Z",
        tranche_effectif_salarie: "12", date_creation: "2025-07-10", etat_administratif: "A",
        siege: { adresse: "60 RUE FRANCOIS IER 75008 PARIS" },
      }],
    },
  }]);
  const hit = await rechercheEntreprisesSearch({ company: "Datalia", siren: "989111216" }, fetchImpl);
  assert.deepEqual(hit, {
    legalName: "DATALIA", siren: "989111216", nafCode: "62.01Z", employeesRange: "20 à 49 salariés",
    foundedYear: 2025, address: "60 RUE FRANCOIS IER 75008 PARIS", active: true,
  });
  assert.equal(calls[0]!.url, "https://recherche-entreprises.api.gouv.fr/search?q=989111216&per_page=1&page=1");
});

test("Recherche d'entreprises : aucun résultat → null", async () => {
  const { fetchImpl } = mockFetch([{ body: { results: [], total_results: 0 } }]);
  assert.equal(await rechercheEntreprisesSearch({ company: "Inconnue SARL" }, fetchImpl), null);
});

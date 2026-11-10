import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING_WEIGHTS, aiPotentialOf, computeLeadScore } from "../src/scoring";

const empty = {
  emailHash: null, phoneEnc: null, company: null, website: null, sector: null, city: null, country: null,
  enrichment: null, status: "NOUVEAU" as const, lastReplyAt: null,
};

test("un lead vide vaut 0", () => {
  assert.equal(computeLeadScore(empty), 0);
});

test("le potentiel IA vient de l'adéquation à la cible, sinon du brief (hors repli heuristique)", () => {
  assert.equal(aiPotentialOf({ siteAnalysis: { fitScore: 85 }, aiBrief: { score: 40, source: "ai" } }), 85);
  assert.equal(aiPotentialOf({ aiBrief: { score: 60, source: "ai" } }), 60);
  assert.equal(aiPotentialOf({ aiBrief: { score: 60, source: "fallback" } }), null);
  assert.equal(aiPotentialOf(null), null);
});

test("un lead scrapé bien noté par Claude devient « chaud » (≥ 70)", () => {
  const lead = {
    ...empty, emailHash: "h", phoneEnc: Buffer.from("x"), company: "Agence", website: "https://a.fr",
    sector: "Immobilier", city: "Lyon", enrichment: { siteAnalysis: { fitScore: 85 } },
  };
  assert.ok(computeLeadScore(lead) >= 70);
  const offTarget = { ...lead, enrichment: { siteAnalysis: { fitScore: 5 } } };
  assert.ok(computeLeadScore(offTarget) < computeLeadScore(lead) - 20);
});

test("interactions plafonnées, réponse et statut pris en compte, score borné à 100", () => {
  const full = { ...empty, emailHash: "h", status: "CONVERTI" as const, lastReplyAt: new Date() };
  const s = computeLeadScore(full, { opens: 50, clicks: 50, hasReplied: true });
  const w = DEFAULT_SCORING_WEIGHTS;
  assert.equal(s, Math.min(100, w.hasEmail + w.maxOpens + w.maxClicks + w.replied + (w.statusBonus.CONVERTI ?? 0)));
  assert.equal(computeLeadScore({ ...empty, status: "PERDU" }), 0);
});

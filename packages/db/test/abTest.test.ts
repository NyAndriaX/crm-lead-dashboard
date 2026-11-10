import { test } from "node:test";
import assert from "node:assert/strict";
import { AB_RULES, abVerdict, aggregateAbVariants, twoProportionZ, type AbEvent } from "../src/abTest";

/** n envois par variante ; `opens`/`replies` = nombre de leads distincts ayant ouvert / répondu. */
function campaign(spec: Record<"A" | "B", { sent: number; opens: number; replies: number }>) {
  const sent: AbEvent[] = [];
  const events: AbEvent[] = [];
  for (const v of ["A", "B"] as const) {
    for (let i = 0; i < spec[v].sent; i++) {
      const leadId = `${v}${i}`;
      sent.push({ leadId, eventType: "SENT", variant: v });
      if (i < spec[v].opens) events.push({ leadId, eventType: "OPEN" }, { leadId, eventType: "OPEN" }); // ouverture répétée
      if (i < spec[v].replies) events.push({ leadId, eventType: "REPLIED" });
    }
  }
  return aggregateAbVariants(sent, events);
}

test("agrégation par variante en contacts uniques (ouvertures répétées comptées une fois)", () => {
  const s = campaign({ A: { sent: 10, opens: 4, replies: 1 }, B: { sent: 20, opens: 5, replies: 4 } });
  assert.equal(s.A.sent, 10);
  assert.equal(s.A.opens, 4);
  assert.equal(s.A.openRate, 40);
  assert.equal(s.B.replies, 4);
  assert.equal(s.B.replyRate, 20);
});

test("la variante du lead vient de son envoi, pas de l'événement", () => {
  const s = aggregateAbVariants(
    [{ leadId: "l1", eventType: "SENT", variant: "B" }, { leadId: "l2", eventType: "SENT", variant: null }],
    [{ leadId: "l1", eventType: "CLICK", variant: "A" }, { leadId: "l2", eventType: "REPLIED" }, { leadId: "x", eventType: "OPEN" }],
  );
  assert.equal(s.B.clicks, 1);
  assert.equal(s.A.clicks, 0);
  assert.equal(s.A.sent, 1); // variante absente → A (campagne sans test A/B)
  assert.equal(s.A.replies, 1);
  assert.equal(s.A.opens + s.B.opens, 0); // lead inconnu ignoré
});

test("test z de deux proportions", () => {
  assert.equal(twoProportionZ(0, 100, 0, 100), 0);
  // 20/100 contre 8/100 → z ≈ 2,44 (valeur de référence)
  assert.ok(Math.abs(twoProportionZ(20, 100, 8, 100) - 2.44) < 0.01);
  assert.ok(twoProportionZ(8, 100, 20, 100) < 0);
});

test("pas de gagnant sous le seuil d'envois par variante", () => {
  const s = campaign({ A: { sent: 29, opens: 20, replies: 10 }, B: { sent: 100, opens: 10, replies: 0 } });
  const v = abVerdict(s.A, s.B);
  assert.equal(v.winner, null);
  assert.match(v.reason, /Échantillon insuffisant/);
});

test("gagnant sur le taux de réponse quand l'écart est significatif", () => {
  const s = campaign({ A: { sent: 100, opens: 40, replies: 8 }, B: { sent: 100, opens: 42, replies: 20 } });
  const v = abVerdict(s.A, s.B);
  assert.equal(v.winner, "B");
  assert.equal(v.metric, "replyRate");
  assert.equal(v.gapPts, 12);
});

test("à défaut de réponse, gagnant sur le taux d'ouverture", () => {
  const s = campaign({ A: { sent: 200, opens: 110, replies: 6 }, B: { sent: 200, opens: 70, replies: 5 } });
  const v = abVerdict(s.A, s.B);
  assert.equal(v.winner, "A");
  assert.equal(v.metric, "openRate");
});

test("écart non significatif → pas de gagnant", () => {
  const s = campaign({ A: { sent: 60, opens: 25, replies: 4 }, B: { sent: 60, opens: 27, replies: 5 } });
  const v = abVerdict(s.A, s.B);
  assert.equal(v.winner, null);
  assert.match(v.reason, /non significatif/);
});

test("un écart significatif mais trop faible en points n'est pas retenu", () => {
  const rules = { ...AB_RULES, minGapPts: { replyRate: 50, openRate: 50 } };
  const s = campaign({ A: { sent: 100, opens: 40, replies: 8 }, B: { sent: 100, opens: 42, replies: 20 } });
  assert.equal(abVerdict(s.A, s.B, rules).winner, null);
});

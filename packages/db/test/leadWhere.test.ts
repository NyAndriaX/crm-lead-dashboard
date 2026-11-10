import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeadWhereFromSegmentFilters } from "../src/leadWhere";

test("exclut les leads archivés par défaut", () => {
  assert.deepEqual(buildLeadWhereFromSegmentFilters({}), { deletedAt: null });
});

test("traduit les critères d'un segment", () => {
  const w = buildLeadWhereFromSegmentFilters({ status: "QUALIFIE", tag: "VIP", scoreMin: 50, sector: "SaaS" });
  assert.equal(w.status, "QUALIFIE");
  assert.equal(w.sector, "SaaS");
  assert.deepEqual(w.tags, { array_contains: ["VIP"] });
  assert.deepEqual(w.score, { gte: 50 });
});

test("une clé inconnue (ex. « tags ») n'est pas un filtre : elle est ignorée", () => {
  const w = buildLeadWhereFromSegmentFilters({ tags: ["VIP"] } as never);
  assert.equal(w.tags, undefined);
});

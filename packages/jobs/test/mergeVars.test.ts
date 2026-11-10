import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMergeVariables } from "../src/mergeVars";

const lead = { firstName: "Léa", lastName: "Roux", company: "Acme", email: "lea@acme.fr" };

test("remplace les variables françaises et leurs alias anglais", () => {
  assert.equal(applyMergeVariables("{{prenom}} {{nom}} — {{entreprise}}", lead), "Léa Roux — Acme");
  assert.equal(applyMergeVariables("{{ firstName }}, {{company}} ({{EMAIL}})", lead), "Léa, Acme (lea@acme.fr)");
});

test("aucune accolade ne reste pour les variables connues, même vides", () => {
  const out = applyMergeVariables("Bonjour {{prenom}}{{actu}}{{custom}}", { firstName: null, lastName: null, company: null, email: null });
  assert.equal(out, "Bonjour ");
});

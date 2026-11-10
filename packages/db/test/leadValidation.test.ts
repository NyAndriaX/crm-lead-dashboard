import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEmail, checkImportRow, checkPhone, checkWebsite, defaultRequiredFields, normalizeFrPhone, roundRobinAssignee,
} from "../src/leadValidation";

test("email : même règle que z.string().email(), normalisé en minuscules", () => {
  assert.deepEqual(checkEmail("  Jean.Dupont@Agence.FR "), { ok: true, value: "jean.dupont@agence.fr" });
  for (const bad of ["jean.dupont", "jean@agence", "jean@@agence.fr", "jean dupont@agence.fr", ".jean@agence.fr", "jean..d@agence.fr"]) {
    const r = checkEmail(bad);
    assert.equal(r.ok, false, bad);
  }
  const r = checkEmail("jean@agence");
  assert.ok(!r.ok && r.reason.includes("domaine sans extension"));
  assert.ok(!r.ok && !r.reason.includes("jean"), "la raison ne recopie pas la valeur (PII)");
});

test("téléphone : normalisation E.164 FR (règle du scraper) et numéros internationaux", () => {
  assert.equal(normalizeFrPhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizeFrPhone("+33 (0)4 72 07 45 80"), "+33472074580");
  assert.equal(normalizeFrPhone("0033 1.23.45.67.89"), "+33123456789");
  assert.equal(normalizeFrPhone("00 12 34 56 78"), null);
  assert.deepEqual(checkPhone("+32 2 123 45 67"), { ok: true, value: "+3221234567" });
  const short = checkPhone("06 12 34");
  assert.ok(!short.ok && short.reason.includes("trop court"));
  const letters = checkPhone("appeler le standard");
  assert.ok(!letters.ok && letters.reason.includes("lettres"));
});

test("URL : schéma ajouté, suivi retiré, domaines incomplets refusés", () => {
  assert.deepEqual(checkWebsite("agence.fr"), { ok: true, value: "https://agence.fr" });
  assert.deepEqual(checkWebsite("http://www.agence.fr/contact?utm_source=x"), { ok: true, value: "http://www.agence.fr/contact" });
  for (const bad of ["agence", "ftp://agence.fr", "www.agence fr", "https://"]) assert.equal(checkWebsite(bad).ok, false, bad);
});

test("colonnes obligatoires par défaut : email, sinon entreprise", () => {
  assert.deepEqual(defaultRequiredFields(["company", "email", "phone"]), ["email"]);
  assert.deepEqual(defaultRequiredFields(["company", "phone"]), ["company"]);
  assert.deepEqual(defaultRequiredFields(["phone"]), []);
});

test("ligne d'import : rejet si colonne obligatoire vide ou invalide, nettoyage sinon", () => {
  const ok = checkImportRow(2, { email: "A@B.fr", phone: "06 12 34 56 78", website: "b.fr", company: "B" }, ["email"]);
  assert.equal(ok.rejected, false);
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.values.email, "a@b.fr");
  assert.equal(ok.values.phone, "+33612345678");
  assert.equal(ok.values.website, "https://b.fr");

  const missing = checkImportRow(3, { email: "", company: "Seule SARL" }, ["email"]);
  assert.equal(missing.rejected, true);
  assert.match(missing.issues[0]!.reason, /obligatoire vide : Email/);

  const invalidRequired = checkImportRow(4, { email: "pas-un-email", company: "X" }, ["email"]);
  assert.equal(invalidRequired.rejected, true);
  assert.equal(invalidRequired.issues.length, 1, "pas de double motif pour la même colonne");
  assert.match(invalidRequired.issues[0]!.reason, /format d'email invalide.*colonne obligatoire/);

  const cleaned = checkImportRow(5, { email: "c@d.fr", phone: "12", website: "nope" }, ["email"]);
  assert.equal(cleaned.rejected, false);
  assert.equal(cleaned.values.phone, null);
  assert.equal(cleaned.values.website, null);
  assert.deepEqual(cleaned.issues.map((i) => [i.action, i.field]), [["cleaned", "phone"], ["cleaned", "website"]]);

  const several = checkImportRow(6, { email: "e@f.fr" }, ["email", "company", "phone"]);
  assert.match(several.issues[0]!.reason, /colonnes obligatoires vides : Entreprise, Téléphone/);

  const anonymous = checkImportRow(7, { phone: "0612345678" }, []);
  assert.equal(anonymous.rejected, true);
  assert.match(anonymous.issues[0]!.reason, /aucune donnée identifiable/);
});

test("répartition à tour de rôle", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => roundRobinAssignee(ids, i)), ["a", "b", "c", "a", "b"]);
  assert.equal(roundRobinAssignee([], 0), null);
});

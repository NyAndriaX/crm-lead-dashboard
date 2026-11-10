import { test } from "node:test";
import assert from "node:assert/strict";
import { tagsFromScrapedLead, type ScrapedLead } from "../src/scraping";

test("l'identifiant Google Maps ne pollue plus les tags visibles", () => {
  const tags = tagsFromScrapedLead({ place_id: "ChIJabc", email_status: "no_email", name: "Jeanne Dupont", ai: { fit_score: 82 } } as unknown as ScrapedLead);
  assert.ok(!tags.some((t) => t.startsWith("place:")));
  assert.deepEqual(tags, ["Prospection IA", "Sans email", "Décideur identifié", "Cible IA"]);
});

test("l'URL du site est débarrassée des paramètres de suivi", async () => {
  const { cleanWebsiteUrl } = await import("../src/scraping");
  assert.equal(cleanWebsiteUrl("https://lyonhabitatconseil.fr/?utm_source=gmb&utm_medium=organic"), "https://lyonhabitatconseil.fr");
  assert.equal(cleanWebsiteUrl("www.agence.fr/contact?ref=1&utm_campaign=x"), "https://www.agence.fr/contact?ref=1");
  assert.equal(cleanWebsiteUrl(""), null);
});

test("contacts du site : données d'entreprise en clair, téléphones et ligne directe à part (chiffrés)", async () => {
  const { parseScraperPayload, scraperEnrichment, scrapedPrivateContacts } = await import("../src/scraping");
  const { leads } = parseScraperPayload({
    ok: true,
    results: [{
      company: "Agence des Pentes", place_id: "x",
      ai: { summary: "Agence", fit_score: 85, decision_maker_email: "j.martin@agence.fr", decision_maker_phone: "06 12 34 56 78" },
      contacts: {
        phones: [{ number: "+33472074580", display: "04 72 07 45 80", kind: "fixe" }, { number: "bad" }],
        socials: { facebook: "https://facebook.com/agence", evil: "javascript:alert(1)" },
        contact_url: "https://agence.fr/contact",
        legal: { siren: "812345678", legal_form: "SAS", junk: 1 },
      },
    }],
  }, "q");
  const lead = leads[0]!;
  const enrichment = scraperEnrichment(lead) as { siteContacts: Record<string, unknown> };
  assert.deepEqual(enrichment.siteContacts, {
    legal: { siren: "812345678", legal_form: "SAS" },
    socials: { facebook: "https://facebook.com/agence" },
    contactUrl: "https://agence.fr/contact",
  });
  assert.ok(!JSON.stringify(enrichment).includes("04 72"), "aucun téléphone en clair dans enrichment");
  const priv = scrapedPrivateContacts(lead)!;
  assert.equal(priv.phones.length, 1); // « bad » n'est pas un numéro E.164 : écarté
  assert.deepEqual(priv.decisionMaker, { email: "j.martin@agence.fr", phone: "06 12 34 56 78" });
});

test("pas de prénom inventé à partir d'une adresse générique", async () => {
  const { namesFromEmail } = await import("../src/scraping");
  assert.deepEqual(namesFromEmail("contact@instant-immo.com"), { firstName: null, lastName: null });
  assert.deepEqual(namesFromEmail("agence.lyon@exemple.fr"), { firstName: null, lastName: null });
  assert.deepEqual(namesFromEmail("lyon4.croixrousse@human-immobilier.fr"), { firstName: null, lastName: null });
  assert.deepEqual(namesFromEmail("j.martin@agence.fr"), { firstName: null, lastName: "Martin" });
  assert.deepEqual(namesFromEmail("sophie.lambert@agence.fr"), { firstName: "Sophie", lastName: "Lambert" });
});

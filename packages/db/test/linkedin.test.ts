import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLinkedinUrl, siteLinkedinLinks } from "../src/linkedin";
import { parseScraperPayload, scrapedPrivateContacts, scraperEnrichment } from "../src/scraping";

test("classification des URL LinkedIn", () => {
  assert.equal(classifyLinkedinUrl("https://www.linkedin.com/company/datalia"), "company");
  assert.equal(classifyLinkedinUrl("https://fr.linkedin.com/in/jeanne-dupont"), "person");
  assert.equal(classifyLinkedinUrl("https://www.linkedin.com/feed/"), null);
  assert.equal(classifyLinkedinUrl("https://evil.com/in/jeanne"), null);
  assert.equal(classifyLinkedinUrl("http://www.linkedin.com/in/jeanne"), null);
});

test("liens LinkedIn du site : page entreprise en clair, profils de personnes chiffrés", () => {
  const { leads } = parseScraperPayload({
    ok: true,
    results: [{
      company: "Agence des Pentes",
      contacts: {
        // Format du scraper (app/contacts.py) : tous les liens LinkedIn dans socials.linkedin_links.
        socials: {
          linkedin: "https://linkedin.com/company/agence-des-pentes",
          linkedin_links: "https://www.linkedin.com/company/agence-des-pentes https://www.linkedin.com/in/marie-durand https://www.linkedin.com/feed/",
        },
      },
    }],
  });
  const lead = leads[0]!;
  const enrichment = scraperEnrichment(lead) as { siteContacts: { linkedinCompany?: string[] } };
  assert.deepEqual(enrichment.siteContacts.linkedinCompany, ["https://www.linkedin.com/company/agence-des-pentes"]);
  assert.ok(!JSON.stringify(enrichment).includes("marie-durand"), "aucun profil de personne en clair dans enrichment");
  assert.ok(!JSON.stringify(enrichment).includes("linkedin_links"), "clé de transport non recopiée");
  const priv = scrapedPrivateContacts(lead)!;
  assert.deepEqual(priv.linkedinProfiles, ["https://www.linkedin.com/in/marie-durand"]);

  const links = siteLinkedinLinks(enrichment, priv);
  assert.deepEqual(links, {
    company: ["https://www.linkedin.com/company/agence-des-pentes"], // dédoublonné avec socials.linkedin
    people: ["https://www.linkedin.com/in/marie-durand"],
  });
});

test("ancien format : socials.linkedin seul (profil ou page)", () => {
  assert.deepEqual(siteLinkedinLinks({ siteContacts: { socials: { linkedin: "https://linkedin.com/in/paul" } } }, null), {
    company: [], people: ["https://linkedin.com/in/paul"],
  });
  assert.deepEqual(siteLinkedinLinks(null, null), { company: [], people: [] });
});

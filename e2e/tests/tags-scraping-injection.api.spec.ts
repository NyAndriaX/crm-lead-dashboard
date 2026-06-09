import { test, expect } from "@playwright/test";
import { loginApi } from "../helpers/auth";
import { cleanupE2eArtifacts } from "../helpers/db";
import { defaultMissionConfig, fakeScrapedLead } from "../helpers/scraping";

const runId = `scraping-${Date.now()}`;
const missionName = `e2e-${runId}-mission`;
const injectionTag = `${runId}-inject`;
const company = `e2e-${runId}-corp`;
const email = `e2e-${runId}@test.local`;

test.describe("Scraping — tags à l'injection CRM", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("persiste injectionTags sur la mission, les fusionne à l'injection et les applique au lead", async ({
    request,
  }) => {
    await loginApi(request);

    // 1) Créer une mission avec tags d'injection
    const createRes = await request.post("/api/scraping/missions", {
      data: {
        name: missionName,
        config: defaultMissionConfig({ injectionTags: [injectionTag] }),
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const created = (await createRes.json()) as { data: { id: string; config: { injectionTags?: string[] } } };
    const mission = created.data;
    expect(mission.config.injectionTags).toContain(injectionTag);

    // 2) Mise à jour partielle — ne doit pas effacer keywords ni injectionTags existants
    const patchRes = await request.put(`/api/scraping/missions/${mission.id}`, {
      data: { config: { injectionTags: [injectionTag, "partial-tag-e2e"] } },
    });
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy();
    const patched = (await patchRes.json()) as { data: { config: { keywords: string; injectionTags: string[] } } };
    expect(patched.data.config.keywords).toBe("e2e-test");
    expect(patched.data.config.injectionTags).toEqual(expect.arrayContaining([injectionTag, "partial-tag-e2e"]));

    // 3) Importer un lead scrapé fictif dans le buffer
    const importRes = await request.post(`/api/scraping/missions/${mission.id}/import`, {
      data: { ok: true, results: [fakeScrapedLead({ email, company })] },
    });
    expect(importRes.ok(), await importRes.text()).toBeTruthy();

    const bufferRes = await request.get(`/api/scraping/missions/${mission.id}/results?status=pending`);
    expect(bufferRes.ok()).toBeTruthy();
    const buffer = (await bufferRes.json()) as { data: { id: string }[] };
    expect(buffer.data.length).toBeGreaterThan(0);

    // 4) Accepter puis injecter (tags drawer optionnels en plus de la config mission)
    const acceptRes = await request.patch(`/api/scraping/missions/${mission.id}/results`, {
      data: { ids: buffer.data.map((b) => b.id), status: "accepted" },
    });
    expect(acceptRes.ok()).toBeTruthy();

    const injectRes = await request.post(`/api/scraping/missions/${mission.id}/results`, {
      data: { injectionTags: [`${runId}-drawer`] },
    });
    expect(injectRes.ok(), await injectRes.text()).toBeTruthy();
    const injectBody = (await injectRes.json()) as { data: { injected: number } };
    expect(injectBody.data.injected).toBe(1);

    // 5) Retrouver le lead injecté (recherche par entreprise — l'email est chiffré en base)
    const leadsRes = await request.get("/api/leads", {
      params: { q: company, pageSize: 50 },
    });
    expect(leadsRes.ok(), await leadsRes.text()).toBeTruthy();
    const leads = (await leadsRes.json()) as { data: { id: string; tags: string[] }[] };
    const lead = leads.data.find((l) => l.tags?.includes("scraping"));
    expect(lead, "lead injecté introuvable via recherche entreprise").toBeTruthy();

    const detailRes = await request.get(`/api/leads/${lead!.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as { tags: string[] };
    expect(detail.tags).toContain("scraping");
    expect(detail.tags).toContain(injectionTag);
    expect(detail.tags).toContain("partial-tag-e2e");
    expect(detail.tags).toContain(`${runId}-drawer`);
  });
});

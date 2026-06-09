import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("campaigns").replace("e2e-", "");

test.describe("Campagnes email", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("liste les campagnes et crée une campagne si SMTP/template/segment disponibles", async ({
    authedRequest: req,
  }) => {
    const listRes = await req.get("/api/campaigns");
    expect(listRes.ok()).toBeTruthy();

    const [templatesRes, segmentsRes, smtpRes] = await Promise.all([
      req.get("/api/templates"),
      req.get("/api/segments"),
      req.get("/api/smtp-configs"),
    ]);
    expect(templatesRes.ok()).toBeTruthy();
    expect(segmentsRes.ok()).toBeTruthy();
    expect(smtpRes.ok()).toBeTruthy();

    const templates = (await templatesRes.json()) as { data: { id: string }[] };
    const segments = (await segmentsRes.json()) as { data: { id: string }[] };
    const smtp = (await smtpRes.json()) as { data: { id: string }[] };

    if (!templates.data.length || !segments.data.length || !smtp.data.length) {
      test.skip();
      return;
    }

    const createRes = await req.post("/api/campaigns", {
      data: {
        name: `e2e-${runId}-campaign`,
        templateId: templates.data[0].id,
        segmentId: segments.data[0].id,
        smtpConfigId: smtp.data[0].id,
        subject: "E2E test campagne",
        config: { aiPersonalize: false },
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const created = (await createRes.json()) as { data: { id: string; name: string } };
    expect(created.data.name).toContain(runId);

    const getRes = await req.get(`/api/campaigns/${created.data.id}`);
    expect(getRes.ok()).toBeTruthy();

    const statsRes = await req.get(`/api/campaigns/${created.data.id}/stats`);
    expect(statsRes.ok()).toBeTruthy();
  });
});

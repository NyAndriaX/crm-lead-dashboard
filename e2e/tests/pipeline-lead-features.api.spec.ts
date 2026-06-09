import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("pipe-features").replace("e2e-", "");

test.describe("Pipeline & lead — notes, documents, potentiel EUR, sync statut", () => {
  let leadId: string;
  let stageContacteId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("potentiel EUR, notes RGPD, sync statut → colonne pipeline, analytics", async ({ authedRequest: req }) => {
    const stagesRes = await req.get("/api/pipeline-stages");
    expect(stagesRes.ok()).toBeTruthy();
    const stages = (await stagesRes.json()) as { data: { id: string; name: string }[] };
    const contacte = stages.data.find((s) => s.name.toLowerCase().includes("contact"));
    expect(contacte, "colonne Contacté requise (seed pipeline)").toBeTruthy();
    stageContacteId = contacte!.id;

    const createRes = await req.post("/api/leads", {
      data: {
        email: `e2e-${runId}@test.local`,
        company: `e2e-${runId}-biz`,
        firstName: "Pipe",
        lastName: "Test",
        source: `e2e-${runId}`,
      },
    });
    expect(createRes.status()).toBe(201);
    leadId = ((await createRes.json()) as { id: string }).id;

    const potRes = await req.put(`/api/leads/${leadId}`, {
      data: { businessPotentialEur: 12500.5 },
    });
    expect(potRes.ok(), await potRes.text()).toBeTruthy();
    const withPot = (await potRes.json()) as { businessPotentialEur: number };
    expect(withPot.businessPotentialEur).toBe(12500.5);

    const noteRes = await req.post(`/api/leads/${leadId}/notes`, {
      data: {
        content: "Appel de qualification — intéressé par l'offre",
        legalBasis: "legitimate_interest",
      },
    });
    expect(noteRes.status()).toBe(201);

    const notesList = await req.get(`/api/leads/${leadId}/notes`);
    const notes = (await notesList.json()) as { data: { content: string; legalBasis: string }[] };
    expect(notes.data.some((n) => n.legalBasis === "legitimate_interest")).toBe(true);

    const statusRes = await req.post(`/api/leads/${leadId}/status`, {
      data: { status: "CONTACTE" },
    });
    expect(statusRes.ok()).toBeTruthy();
    const afterStatus = (await statusRes.json()) as { status: string; pipelineStageId: string | null };
    expect(afterStatus.status).toBe("CONTACTE");
    expect(afterStatus.pipelineStageId).toBe(stageContacteId);

    const stageMoveRes = await req.post(`/api/leads/${leadId}/pipeline-stage`, {
      data: { stageId: stageContacteId },
    });
    expect(stageMoveRes.ok()).toBeTruthy();

    const docRes = await req.post(`/api/leads/${leadId}/documents`, {
      multipart: {
        file: {
          name: `e2e-${runId}-brief.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from("Document e2e — proposition commerciale"),
        },
      },
    });
    expect(docRes.status(), await docRes.text()).toBe(201);

    const docsList = await req.get(`/api/leads/${leadId}/documents`);
    const docs = (await docsList.json()) as { data: { fileName: string }[] };
    expect(docs.data.some((d) => d.fileName.includes(runId))).toBe(true);

    const metricsRes = await req.get("/api/analytics/pipeline");
    expect(metricsRes.ok()).toBeTruthy();
    const metrics = (await metricsRes.json()) as {
      data: { totalBusinessPotentialEur: number; stages: { totalBusinessPotentialEur: number }[] };
    };
    expect(metrics.data.totalBusinessPotentialEur).toBeGreaterThanOrEqual(12500.5);
    expect(metrics.data.stages.some((s) => s.totalBusinessPotentialEur > 0)).toBe(true);
  });
});

import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("pipeline").replace("e2e-", "");
const stageName = `e2e-${runId}-stage`;

test.describe("Pipeline Kanban", () => {
  let stageId: string;
  let leadId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée une colonne, assigne un lead, lit les métriques", async ({ authedRequest: req }) => {
    const stageRes = await req.post("/api/pipeline-stages", {
      data: { name: stageName, color: "#1677ff" },
    });
    expect(stageRes.status(), await stageRes.text()).toBe(201);
    const stage = (await stageRes.json()) as { data: { id: string } };
    stageId = stage.data.id;

    const leadRes = await req.post("/api/leads", {
      data: {
        email: `e2e-${runId}@test.local`,
        company: `e2e-${runId}-pipe`,
        source: `e2e-${runId}`,
      },
    });
    expect(leadRes.status()).toBe(201);
    leadId = ((await leadRes.json()) as { id: string }).id;

    const moveRes = await req.post(`/api/leads/${leadId}/pipeline-stage`, {
      data: { stageId },
    });
    expect(moveRes.ok()).toBeTruthy();

    const listRes = await req.get("/api/pipeline-stages");
    expect(listRes.ok()).toBeTruthy();
    const stages = (await listRes.json()) as { data: { id: string; name: string }[] };
    expect(stages.data.some((s) => s.id === stageId)).toBe(true);

    const metricsRes = await req.get("/api/pipeline/metrics");
    expect(metricsRes.ok()).toBeTruthy();
  });
});

import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("segments").replace("e2e-", "");
const segmentName = `e2e-${runId}-segment`;

test.describe("Segments", () => {
  let segmentId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée, lit, met à jour et prévisualise un segment", async ({ authedRequest: req }) => {
    const createRes = await req.post("/api/segments", {
      data: {
        name: segmentName,
        filters: { mode: "filter", status: "NOUVEAU" },
      },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { data: { id: string; name: string } };
    segmentId = created.data.id;
    expect(created.data.name).toBe(segmentName);

    const listRes = await req.get("/api/segments");
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as { data: { id: string }[] };
    expect(list.data.some((s) => s.id === segmentId)).toBe(true);

    const updateRes = await req.put(`/api/segments/${segmentId}`, {
      data: { name: `${segmentName}-renamed` },
    });
    expect(updateRes.ok()).toBeTruthy();

    const previewRes = await req.post("/api/segments/preview", {
      data: { filters: { mode: "filter", status: "NOUVEAU" } },
    });
    expect(previewRes.ok()).toBeTruthy();
    const preview = (await previewRes.json()) as { total: number };
    expect(typeof preview.total).toBe("number");
  });
});

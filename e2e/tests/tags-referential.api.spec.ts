import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("tags-ref").replace("e2e-", "");
const tagName = `e2e-${runId}-tag`;

test.describe("Tags — référentiel", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée un tag et le retrouve dans GET /api/tags", async ({ authedRequest: req }) => {
    const createRes = await req.post("/api/tags", {
      data: { name: tagName, color: "#ff5500" },
    });
    expect([200, 201]).toContain(createRes.status());

    const listRes = await req.get("/api/tags");
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as { data: { name: string; color: string | null }[] };
    const found = list.data.find((t) => t.name === tagName);
    expect(found).toBeTruthy();
    expect(found!.color?.toLowerCase()).toBe("#ff5500");
  });
});

import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("views").replace("e2e-", "");
const viewName = `e2e-${runId}-view`;

test.describe("Vues leads personnalisées", () => {
  let viewId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée et liste une vue personnalisée", async ({ authedRequest: req }) => {
    const createRes = await req.post("/api/lead-views", {
      data: {
        name: viewName,
        filters: { status: "NOUVEAU" },
        columns: ["firstName", "company", "status"],
        shared: false,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string; name: string };
    viewId = created.id;
    expect(created.name).toBe(viewName);

    const listRes = await req.get("/api/lead-views");
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as { data: { id: string }[] };
    expect(list.data.some((v) => v.id === viewId)).toBe(true);
  });
});

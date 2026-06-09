import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("sequences").replace("e2e-", "");
const seqName = `e2e-${runId}-sequence`;

test.describe("Séquences (relances)", () => {
  let sequenceId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée, lit et met à jour une séquence", async ({ authedRequest: req }) => {
    const createRes = await req.post("/api/sequences", {
      data: {
        name: seqName,
        steps: [
          {
            delayDays: 0,
            subject: "E2E relance J0",
            bodyHtml: "<p>Bonjour {{firstName}}, test e2e</p>",
            stopOnReply: true,
          },
          {
            delayDays: 3,
            subject: "E2E relance J+3",
            bodyHtml: "<p>Relance e2e</p>",
          },
        ],
        isPaused: true,
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const created = (await createRes.json()) as { data: { id: string; name: string; steps: unknown[] } };
    sequenceId = created.data.id;
    expect(created.data.name).toBe(seqName);
    expect(created.data.steps.length).toBe(2);

    const getRes = await req.get(`/api/sequences/${sequenceId}`);
    expect(getRes.ok()).toBeTruthy();

    const updateRes = await req.put(`/api/sequences/${sequenceId}`, {
      data: { name: `${seqName}-updated` },
    });
    expect(updateRes.ok()).toBeTruthy();

    const dashRes = await req.get("/api/sequences/dashboard");
    expect(dashRes.ok()).toBeTruthy();
  });
});

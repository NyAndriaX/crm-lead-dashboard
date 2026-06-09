import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("templates").replace("e2e-", "");

test.describe("Templates & Utilisateurs", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée un template email et liste les utilisateurs", async ({ authedRequest: req }) => {
    const createRes = await req.post("/api/templates", {
      data: {
        name: `e2e-${runId}-tpl`,
        subject: "E2E test sujet",
        bodyHtml: "<p>Bonjour {{firstName}}</p>",
        isPublic: true,
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);

    const listRes = await req.get("/api/templates");
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as { data: { name: string }[] };
    expect(list.data.some((t) => t.name === `e2e-${runId}-tpl`)).toBe(true);

    const usersRes = await req.get("/api/users");
    expect(usersRes.ok()).toBeTruthy();
    const users = (await usersRes.json()) as { data: { email: string; role: string }[] };
    expect(users.data.length).toBeGreaterThan(0);
  });

  test("GET /api/rbac/matrix — matrice des permissions", async ({ authedRequest: req }) => {
    const res = await req.get("/api/rbac/matrix");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toBeTruthy();
  });
});

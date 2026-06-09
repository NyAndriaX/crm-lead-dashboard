import { test, expect, e2eId } from "../helpers/fixtures";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = e2eId("leads-crud").replace("e2e-", "");

test.describe("Leads — CRUD et persistance", () => {
  let leadId: string;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("crée, lit, met à jour, change statut et assigne un lead", async ({ authedRequest: req }) => {
    const email = `e2e-${runId}@test.local`;
    const company = `e2e-${runId}-acme`;

    const createRes = await req.post("/api/leads", {
      data: {
        email,
        company,
        firstName: "E2E",
        lastName: "Test",
        source: `e2e-${runId}`,
        tags: ["e2e-tag"],
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const created = (await createRes.json()) as { id: string; company: string; tags: string[] };
    leadId = created.id;
    expect(created.company).toBe(company);
    expect(created.tags).toContain("e2e-tag");

    const getRes = await req.get(`/api/leads/${leadId}`);
    expect(getRes.ok()).toBeTruthy();
    const detail = (await getRes.json()) as { email: string; company: string };
    expect(detail.email).toBe(email);
    expect(detail.company).toBe(company);

    const updateRes = await req.put(`/api/leads/${leadId}`, {
      data: { company: `${company}-updated`, sector: "Tech" },
    });
    expect(updateRes.ok(), await updateRes.text()).toBeTruthy();
    const updated = (await updateRes.json()) as { company: string; sector: string };
    expect(updated.company).toBe(`${company}-updated`);
    expect(updated.sector).toBe("Tech");

    const statusRes = await req.post(`/api/leads/${leadId}/status`, {
      data: { status: "CONTACTE" },
    });
    expect(statusRes.ok()).toBeTruthy();

    const usersRes = await req.get("/api/users");
    expect(usersRes.ok()).toBeTruthy();
    const users = (await usersRes.json()) as { data: { id: string }[] };
    expect(users.data.length).toBeGreaterThan(0);

    const assignRes = await req.post(`/api/leads/${leadId}/assign`, {
      data: { assignedToId: users.data[0].id },
    });
    expect(assignRes.ok()).toBeTruthy();

    const tagsRes = await req.put(`/api/leads/${leadId}/tags`, {
      data: { tags: ["e2e-tag", `e2e-${runId}-set`] },
    });
    expect(tagsRes.ok()).toBeTruthy();
    const tagged = (await tagsRes.json()) as { tags: string[] };
    expect(tagged.tags).toEqual(expect.arrayContaining([`e2e-${runId}-set`]));

    const finalRes = await req.get(`/api/leads/${leadId}`);
    expect(finalRes.ok()).toBeTruthy();
    const finalLead = (await finalRes.json()) as { status: string; assignedToId: string | null };
    expect(finalLead.status).toBe("CONTACTE");
    expect(finalLead.assignedToId).toBeTruthy();

    const listRes = await req.get("/api/leads", { params: { q: `${company}-updated`, pageSize: 50 } });
    expect(listRes.ok(), await listRes.text()).toBeTruthy();
    const list = (await listRes.json()) as { data: { id: string }[] };
    expect(list.data.some((l) => l.id === leadId)).toBe(true);

    const delRes = await req.delete(`/api/leads/${leadId}`);
    expect(delRes.status()).toBe(204);

    const restoreRes = await req.post(`/api/leads/${leadId}/restore`);
    expect(restoreRes.ok()).toBeTruthy();
    const restored = (await restoreRes.json()) as { deletedAt: string | null };
    expect(restored.deletedAt).toBeNull();
  });
});

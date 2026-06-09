import { test, expect } from "@playwright/test";
import { loginApi } from "../helpers/auth";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = `bulk-${Date.now()}`;
const bulkTag = `${runId}-bulk`;

test.describe("Leads — ajout groupé de tags", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("bulk tags-add ajoute les tags sans écraser les existants", async ({ request }) => {
    await loginApi(request);

    for (let i = 0; i < 2; i++) {
      const res = await request.post("/api/leads", {
        data: {
          email: `e2e-${runId}-${i}@test.local`,
          company: `e2e-${runId}-lead-${i}`,
          firstName: "E2E",
          lastName: `Bulk${i}`,
          tags: i === 0 ? ["keep-me"] : [],
        },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      const body = (await res.json()) as { id: string };
      leadIds.push(body.id);
    }

    const bulkRes = await request.post("/api/leads/bulk", {
      data: {
        action: "tags-add",
        ids: leadIds,
        tags: [bulkTag, "keep-me"],
      },
    });
    expect(bulkRes.ok(), await bulkRes.text()).toBeTruthy();
    const bulk = (await bulkRes.json()) as { data: { succeeded: number; requested: number } };
    expect(bulk.data.succeeded).toBe(2);
    expect(bulk.data.requested).toBe(2);

    for (const id of leadIds) {
      const detailRes = await request.get(`/api/leads/${id}`);
      expect(detailRes.ok()).toBeTruthy();
      const lead = (await detailRes.json()) as { tags: string[] };
      expect(lead.tags).toContain(bulkTag);
      expect(lead.tags).toContain("keep-me");
    }
  });
});

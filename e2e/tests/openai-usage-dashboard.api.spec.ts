import { test, expect } from "@playwright/test";
import { loginApi } from "../helpers/auth";
import { cleanupE2eArtifacts, getAdminUserId, recordOpenAiUsage } from "../helpers/db";

const runId = `openai-${Date.now()}`;
const feature = `e2e-${runId}`;

test.describe("Dashboard — consommation OpenAI ($)", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("agrège les coûts org-wide pour un admin après enregistrement d'usage", async ({ request }) => {
    await loginApi(request);
    const adminId = await getAdminUserId();

    await recordOpenAiUsage({
      userId: adminId,
      feature,
      model: "gpt-4o-mini",
      promptTokens: 10_000,
      completionTokens: 2_000,
      totalTokens: 12_000,
    });

    const statsRes = await request.get("/api/dashboard/stats");
    expect(statsRes.ok(), await statsRes.text()).toBeTruthy();
    const stats = (await statsRes.json()) as {
      data: {
        openAi: {
          configured: boolean;
          monthCostUsd: number;
          totalCostUsd: number;
          monthTokens: number;
          requestCount: number;
        } | null;
      };
    };

    const openAi = stats.data.openAi;
    expect(openAi, "openAi summary manquant — carte dashboard masquée").toBeTruthy();
    expect(openAi!.configured).toBe(true);
    expect(openAi!.monthTokens).toBeGreaterThan(0);
    expect(openAi!.requestCount).toBeGreaterThan(0);
    expect(openAi!.monthCostUsd).toBeGreaterThan(0);
    expect(openAi!.totalCostUsd).toBeGreaterThan(0);
  });
});

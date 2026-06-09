import { test, expect } from "@playwright/test";
import { loginUi } from "../helpers/auth";
import { cleanupE2eArtifacts, getAdminUserId, recordOpenAiUsage } from "../helpers/db";

const runId = `openai-ui-${Date.now()}`;
const feature = `e2e-${runId}`;

test.describe("Dashboard UI — carte OpenAI", () => {
  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("affiche un coût mensuel non nul après usage enregistré", async ({ page }) => {
    const adminId = await getAdminUserId();
    await recordOpenAiUsage({
      userId: adminId,
      feature,
      model: "gpt-4o-mini",
      promptTokens: 8_000,
      completionTokens: 1_500,
      totalTokens: 9_500,
    });

    await loginUi(page);
    await page.goto("/dashboard");

    const card = page.getByText("Consommation OpenAI");
    await expect(card).toBeVisible();

    const monthCost = page.locator(".ant-statistic").filter({ hasText: "Coût ce mois" });
    await expect(monthCost).toBeVisible();
    const value = await monthCost.locator(".ant-statistic-content-value").innerText();
    expect(value).toMatch(/^\$0\.\d+/);
    expect(value).not.toBe("$0.0000");
  });
});

import { test, expect } from "@playwright/test";
import { loginUi } from "../helpers/auth";

test.describe("Analytics UI — onglet Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page);
  });

  test("affiche le potentiel commercial par étape", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: /Analytique/i })).toBeVisible();

    const pipelineTab = page.getByRole("tab", { name: /Pipeline/i });
    await pipelineTab.click();
    await expect(pipelineTab).toHaveAttribute("aria-selected", "true");

    await expect(page.getByText("Potentiel commercial total").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Leads en pipeline")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Potentiel total" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Potentiel moyen" })).toBeVisible();
  });
});

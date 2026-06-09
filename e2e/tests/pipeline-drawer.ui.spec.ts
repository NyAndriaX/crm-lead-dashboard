import { test, expect } from "@playwright/test";
import { loginUi } from "../helpers/auth";
import { cleanupE2eArtifacts } from "../helpers/db";

const runId = `pipe-drawer-${Date.now()}`;

test.describe("Pipeline UI — drawer lead sans quitter la page", () => {
  let leadId: string;
  const company = `e2e-${runId}-drawer`;

  test.afterAll(async () => {
    await cleanupE2eArtifacts(runId);
  });

  test("clic sur une carte ouvre le drawer et reste sur /pipeline", async ({ page }) => {
    await loginUi(page);

    const createRes = await page.request.post("/api/leads", {
      data: {
        email: `e2e-${runId}@test.local`,
        company,
        firstName: "Drawer",
        lastName: "Test",
        source: `e2e-${runId}`,
      },
    });
    expect(createRes.status()).toBe(201);
    leadId = ((await createRes.json()) as { id: string }).id;

    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { name: /Pipeline commercial/i })).toBeVisible();

    const search = page.getByPlaceholder(/Rechercher/i);
    await search.fill(company);
    await page.waitForTimeout(400);

    const card = page.getByText(company, { exact: true });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await expect(page).toHaveURL(/\/pipeline/);
    await expect(page.getByRole("dialog").getByText("Drawer Test")).toBeVisible();
    await expect(page.getByText("Potentiel commercial (EUR)")).toBeVisible();
    await expect(page.getByText("Changer le statut")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

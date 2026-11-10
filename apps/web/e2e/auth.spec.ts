import { expect, test } from "@playwright/test";
import { ADMIN } from "./helpers";

test("connexion par le formulaire puis tableau de bord", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[autocomplete=email]").fill(ADMIN.email);
  await page.locator("input[autocomplete=current-password]").fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("À traiter maintenant")).toBeVisible();
});

test("une page protégée redirige vers la connexion", async ({ page }) => {
  await page.goto("/campaigns");
  await page.waitForURL(/\/login/);
});

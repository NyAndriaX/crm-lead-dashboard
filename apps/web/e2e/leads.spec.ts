import { expect, test } from "@playwright/test";
import { login, requireDemoData } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("fiche lead : étape commerciale, activité et coordonnées", async ({ page }) => {
  await requireDemoData(page);
  const res = await page.request.get("/api/leads?pageSize=50");
  const lead = (await res.json()).data[0];
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText("Étape commerciale")).toBeVisible();
  await expect(page.getByText("Activité", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Coordonnées")).toBeVisible();
});

test("carte des leads sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/leads/map");
  await expect(page.getByText("Villes")).toBeVisible();
  expect(errors).toEqual([]);
});

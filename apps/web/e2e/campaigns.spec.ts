import { expect, test } from "@playwright/test";
import { cleanup, login, requireDemoData, uniq } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
  await requireDemoData(page);
});

test("assistant de campagne : audience → message → envoi → brouillon, puis duplication", async ({ page }) => {
  await page.goto("/campaigns/new");
  await expect(page.getByText("À qui s'adresse cette campagne ?")).toBeVisible();
  const name = uniq("Campagne");
  await page.locator("input.nb-display").fill(name);
  await page.locator("div[role=button]").filter({ hasText: "Participants webinar" }).first().click();
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.locator("div[role=button]").filter({ hasText: "Objet :" }).first().click();
  await expect(page.getByText("Tel que le prospect le recevra")).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();

  // Un départ planifié sans date bloque l'étape.
  await page.getByText("Planifier une date").click();
  await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();
  await page.getByText("Dès le lancement").click();
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.getByRole("button", { name: "Enregistrer en brouillon" }).click();
  await page.waitForURL(/\/campaigns\/c[a-z0-9]+$/);
  const id = page.url().split("/").pop()!;
  try {
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText("Progression de l'envoi")).toBeVisible();

    await page.goto(`/campaigns/new?from=${id}`);
    await expect(page.getByText("Nouvelle campagne · copie")).toBeVisible();
    await expect(page.locator("input.nb-display")).toHaveValue(`${name} (copie)`);
  } finally {
    await cleanup(page.request, `/api/campaigns/${id}`);
  }
});

test("créer un segment depuis l'assistant conserve le brouillon", async ({ page }) => {
  await page.goto("/campaigns/new");
  await expect(page.getByText("À qui s'adresse cette campagne ?")).toBeVisible();
  const campaignName = uniq("Brouillon conservé");
  await page.locator("input.nb-display").fill(campaignName);
  await page.getByText("Nouveau segment").first().click();
  await page.waitForURL(/\/campaigns\/segments\/new/);

  const segmentName = uniq("Segment");
  await page.locator("input.nb-display").fill(segmentName);
  await page.locator(".ant-select").filter({ hasText: "Tous les secteurs" }).click();
  await page.locator(".ant-select-item-option").first().click();
  await expect(page.getByText("Destinataires joignables")).toBeVisible();
  await page.getByRole("button", { name: "Créer et revenir à la campagne" }).click();

  await page.waitForURL(/\/campaigns\/new\?segment=/);
  const segmentId = new URL(page.url()).searchParams.get("segment")!;
  try {
    await expect(page.locator("input.nb-display")).toHaveValue(campaignName);
    await expect(page.getByText("Audience sélectionnée")).toBeVisible();
    await expect(page.locator(".nb-chip").filter({ hasText: segmentName })).toBeVisible();
  } finally {
    await cleanup(page.request, `/api/segments/${segmentId}`);
  }
});

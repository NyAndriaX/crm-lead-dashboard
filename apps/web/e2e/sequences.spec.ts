import { expect, test } from "@playwright/test";
import { cleanup, login, uniq } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("constructeur de séquence : deux étapes, enregistrement, page de suivi", async ({ page }) => {
  await page.goto("/sequences/new");
  await expect(page.getByText("Parcours du prospect")).toBeVisible();
  const name = uniq("Séquence");
  await page.locator("input.nb-display").fill(name);

  // Étape 1 : message libre (objet + corps).
  await page.getByPlaceholder("Objet (obligatoire sans template)").first().fill("Bonjour {{prenom}}");
  await page.locator("textarea").first().fill("<p>Bonjour {{prenom}}, une question rapide sur {{entreprise}}.</p>");
  await page.getByRole("button", { name: "Ajouter une relance" }).click();
  await page.getByPlaceholder("Objet (obligatoire sans template)").nth(1).fill("Petite relance");
  await page.locator("textarea").nth(1).fill("<p>Je me permets de revenir vers vous.</p>");

  await page.getByRole("button", { name: "Créer la séquence" }).click();
  await page.waitForURL(/\/sequences\/c[a-z0-9]+$/);
  const id = page.url().split("/").pop()!;
  try {
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText("Où en sont les leads ?")).toBeVisible();
    await expect(page.getByText("Relance 1")).toBeVisible();
  } finally {
    await cleanup(page.request, `/api/sequences/${id}`);
  }
});

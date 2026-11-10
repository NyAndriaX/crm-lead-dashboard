import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("configuration IA : choix d'un fournisseur et contrôle de la clé requise", async ({ page }) => {
  await page.goto("/settings#ai");
  await expect(page.getByText("Choisir le fournisseur")).toBeVisible();
  for (const label of ["Claude (Claude Skills)", "OpenAI (ChatGPT)", "DeepSeek", "Mistral AI", "Google Gemini", "Ollama (modèle local)"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await page.getByText("OpenAI (ChatGPT)", { exact: true }).first().click();
  await expect(page.getByText("Réglages — OpenAI (ChatGPT)")).toBeVisible();
  // L'avertissement ne concerne que l'IA activée (état initial variable selon l'environnement).
  const toggle = page.getByRole("switch");
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await expect(page.getByText("Clé d'API OpenAI requise pour ce fournisseur.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

  // Rien n'est enregistré : retour au fournisseur actif.
  await page.getByRole("button", { name: "Annuler" }).click();
});

test("la clé d'API n'est jamais renvoyée par l'API", async ({ page }) => {
  const res = await page.request.get("/api/admin/ai-config");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.data).not.toHaveProperty("apiKey");
  expect(body.data).not.toHaveProperty("apiKeyEnc");
});

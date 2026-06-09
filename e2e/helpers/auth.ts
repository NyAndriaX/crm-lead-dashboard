import type { APIRequestContext, Page } from "@playwright/test";

export const E2E_ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").toLowerCase();
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2026";

/** Connexion via API — cookies de session posés sur le contexte Playwright. */
export async function loginApi(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/auth/login", {
    data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`E2E login API failed (${res.status()}): ${await res.text()}`);
  }
}

/** Connexion via l'UI /login (pour les scénarios navigateur). */
export async function loginUi(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("vous@entreprise.com").fill(E2E_ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
}

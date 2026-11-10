import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.E2E_EMAIL ?? "admin@crm.local", password: process.env.E2E_PASSWORD ?? "ChangeMe!2026" };

/** Connexion par l'API (rapide) : le cookie de session est partagé avec la page. */
export async function login(page: Page): Promise<void> {
  const res = await page.request.post("/api/auth/login", { data: ADMIN });
  expect(res.ok(), await res.text()).toBeTruthy();
}

/** Suppression best-effort des données créées par un test. */
export async function cleanup(request: APIRequestContext, path: string): Promise<void> {
  await request.delete(path).catch(() => undefined);
}

export const uniq = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

/** Les parcours métier s'appuient sur la base de démo (`pnpm db:seed`) : ignorés sur une base vide (prod). */
export async function requireDemoData(page: Page): Promise<void> {
  const [leads, segments] = await Promise.all([page.request.get("/api/leads?pageSize=50"), page.request.get("/api/segments")]);
  const hasLeads = ((await leads.json()).data ?? []).length > 0;
  const hasDemoSegment = JSON.stringify(await segments.json()).includes("Participants webinar");
  test.skip(!hasLeads || !hasDemoSegment, "données de démo absentes (pnpm db:seed)");
}

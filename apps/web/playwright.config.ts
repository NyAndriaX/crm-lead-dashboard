/**
 * Tests de bout en bout (parcours utilisateur réels dans le navigateur).
 * Prérequis : application démarrée et base de démo chargée (`pnpm db:seed`), puis `pnpm test:e2e`.
 *   E2E_BASE_URL     URL de l'application (défaut http://localhost:3000)
 *   E2E_EMAIL / E2E_PASSWORD  compte administrateur (défaut : celui du seed)
 *   E2E_CHROME_PATH  Chrome/Chromium local à utiliser (sinon : `npx playwright install chromium`)
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
    ignoreHTTPSErrors: true, // stack de prod locale avec certificat auto-signé
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {},
  },
});

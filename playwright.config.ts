import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      name: "ui",
      testMatch: /.*\.ui\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "dotenv -e .env -- yarn workspace @crm/web dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

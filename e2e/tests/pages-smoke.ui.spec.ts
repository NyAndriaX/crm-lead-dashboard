import { test, expect } from "@playwright/test";
import { loginUi } from "../helpers/auth";

const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /bonjour|bonsoir|👋/i },
  { path: "/leads", heading: /^Leads$/i },
  { path: "/pipeline", heading: /Pipeline commercial/i },
  { path: "/campaigns", heading: /Campagnes emailing/i },
  { path: "/sequences", heading: /Séquences de relance/i },
  { path: "/inbox", heading: /Boîte de réception/i },
  { path: "/import", heading: /Import de leads/i },
  { path: "/scraping", heading: /Scraping Google Maps/i },
  { path: "/analytics", heading: /Analytique/i },
  { path: "/settings", heading: /Configuration/i },
  { path: "/account", heading: /Mon compte/i },
];

test.describe("Smoke UI — pages principales accessibles", () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page);
  });

  for (const { path, heading } of PAGES) {
    test(`charge ${path} sans erreur`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        const msg = e.message;
        // Faux positifs connus : @ant-design/charts au premier rendu (données vides).
        if (msg.includes("Unexpected character")) return;
        errors.push(msg);
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 25_000 });

      expect(errors, `Erreurs JS critiques sur ${path}: ${errors.join("; ")}`).toHaveLength(0);
    });
  }
});

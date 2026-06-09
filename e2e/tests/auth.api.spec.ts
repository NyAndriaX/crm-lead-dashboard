import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, loginApi } from "../helpers/auth";

test.describe("Auth", () => {
  test("POST /api/auth/login — connexion admin valide", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  });

  test("GET /api/auth/me — session active après login", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/api/auth/me");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { user: { email: string; role: string } };
    expect(body.user.email.toLowerCase()).toBe(E2E_ADMIN_EMAIL);
    expect(body.user.role).toBe("ADMIN");
  });

  test("GET /api/auth/me — 401 sans session", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });
});

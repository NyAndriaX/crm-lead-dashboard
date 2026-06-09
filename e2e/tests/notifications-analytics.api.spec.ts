import { test, expect } from "../helpers/fixtures";

test.describe("Notifications & Analytics", () => {
  test("GET /api/notifications — liste des notifications", async ({ authedRequest: req }) => {
    const res = await req.get("/api/notifications");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /api/notifications/unread-count", async ({ authedRequest: req }) => {
    const res = await req.get("/api/notifications/unread-count");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: { count: number } };
    expect(typeof body.data.count).toBe("number");
  });

  test("GET /api/analytics/global", async ({ authedRequest: req }) => {
    const res = await req.get("/api/analytics/global");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/analytics/leads-timeline", async ({ authedRequest: req }) => {
    const res = await req.get("/api/analytics/leads-timeline");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/import — historique imports", async ({ authedRequest: req }) => {
    const res = await req.get("/api/import");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});

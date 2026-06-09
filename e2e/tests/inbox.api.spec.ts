import { test, expect } from "../helpers/fixtures";

test.describe("Inbox IMAP", () => {
  test("GET /api/inbox — liste des messages", async ({ authedRequest: req }) => {
    const res = await req.get("/api/inbox");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /api/imap-configs — configurations IMAP", async ({ authedRequest: req }) => {
    const res = await req.get("/api/imap-configs");
    expect(res.ok()).toBeTruthy();
  });
});

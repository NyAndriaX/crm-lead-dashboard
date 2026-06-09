import { test, expect } from "../helpers/fixtures";

test.describe("Dashboard", () => {
  test("GET /api/dashboard/stats — KPIs et structure complète", async ({ authedRequest: req }) => {
    const res = await req.get("/api/dashboard/stats");
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = (await res.json()) as {
      data: {
        kpis: { total: number; activeLeads: number };
        byStatus: Record<string, number>;
        dailyLeads: unknown[];
        recentLeads: unknown[];
        openAi: { configured: boolean } | null;
      };
    };
    expect(typeof body.data.kpis.total).toBe("number");
    expect(body.data.byStatus).toBeTruthy();
    expect(Array.isArray(body.data.dailyLeads)).toBe(true);
    expect(Array.isArray(body.data.recentLeads)).toBe(true);
  });
});

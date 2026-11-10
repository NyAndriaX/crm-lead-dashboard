import { prisma, asStringArray } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

type Facet = { value: string; count: number };

function top(entries: Iterable<[string, number]>, limit = 60): Facet[] {
  return [...entries]
    .filter(([v]) => v.trim() !== "")
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// GET /api/leads/facets — valeurs existantes (et volumes) pour construire des filtres sans saisie libre.
export const GET = handler(async () => {
  await requirePermission("leads:read");
  const where = { deletedAt: null };
  const [sectors, cities, sources, countries, tagRows] = await Promise.all([
    prisma.lead.groupBy({ by: ["sector"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["city"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["source"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["country"], where, _count: { _all: true } }),
    prisma.lead.findMany({ where, select: { tags: true }, take: 20_000 }),
  ]);
  const tags = new Map<string, number>();
  for (const r of tagRows) for (const t of asStringArray(r.tags)) tags.set(t, (tags.get(t) ?? 0) + 1);
  const pairs = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K) =>
    rows.map((r) => [r[key] ?? "", r._count._all] as [string, number]);
  return json({
    data: {
      sectors: top(pairs(sectors, "sector")),
      cities: top(pairs(cities, "city")),
      sources: top(pairs(sources, "source")),
      countries: top(pairs(countries, "country")),
      tags: top(tags.entries()),
    },
  });
});

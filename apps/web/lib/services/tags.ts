/**
 * Tags visibles selon le périmètre leads de l'utilisateur.
 */
import { prisma, buildLeadVisibilityWhere, type DataScope } from "@crm/db";

export type TagItem = { id: string; name: string; color: string | null };

/** Tags présents sur les leads visibles + entrées du référentiel correspondantes. */
export async function listVisibleTags(scope: DataScope): Promise<TagItem[]> {
  const leads = await prisma.lead.findMany({
    where: {
      AND: [buildLeadVisibilityWhere(scope), { deletedAt: null }],
    },
    select: { tags: true },
    take: 50_000,
  });

  const names = new Set<string>();
  for (const lead of leads) {
    if (!Array.isArray(lead.tags)) continue;
    for (const t of lead.tags) {
      if (typeof t === "string" && t.trim()) names.add(t.trim());
    }
  }

  if (names.size === 0) return [];

  const rows = await prisma.tag.findMany({
    where: { name: { in: [...names] } },
    orderBy: { name: "asc" },
  });
  const byName = new Map(rows.map((r) => [r.name, r]));

  return [...names]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => {
      const row = byName.get(name);
      return row
        ? { id: row.id, name: row.name, color: row.color }
        : { id: `adhoc:${name}`, name, color: null };
    });
}

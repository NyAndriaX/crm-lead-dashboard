import { prisma } from "./client";

/** Crée à la volée les tags absents du référentiel `Tag`. */
export async function syncTags(names: string[]): Promise<void> {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (wanted.length === 0) return;
  const existing = await prisma.tag.findMany({ where: { name: { in: wanted } }, select: { name: true } });
  const have = new Set(existing.map((t) => t.name));
  const missing = wanted.filter((n) => !have.has(n));
  for (const name of missing) {
    try {
      await prisma.tag.create({ data: { name } });
    } catch {
      /* course concurrente : violation unique ignorée */
    }
  }
}

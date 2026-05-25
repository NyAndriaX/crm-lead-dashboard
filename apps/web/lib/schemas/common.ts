import { z } from "zod";

export const objectId = z.string().min(1, "ID invalide");

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [50, 100, 200].includes(n), {
    message: "pageSize doit valoir 50, 100 ou 200",
  }).default(50),
  sort: z.string().optional(), // ex: "score:desc", "createdAt:asc"
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export function parseSort(sort: string | undefined, allowed: string[], fallback: Record<string, "asc" | "desc">) {
  if (!sort) return fallback;
  const [field, dir] = sort.split(":");
  if (!field || !allowed.includes(field)) return fallback;
  return { [field]: dir === "asc" ? "asc" : "desc" } as Record<string, "asc" | "desc">;
}

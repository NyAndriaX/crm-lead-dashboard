import { api } from "@/lib/client";

export type TagOption = { id: string; name: string; color: string | null };

/** Charge le référentiel tags (toujours frais — pas de cache HTTP). */
export async function fetchTags(): Promise<TagOption[]> {
  const { data } = await api.get<{ data: TagOption[] }>("/tags");
  return data.data ?? [];
}

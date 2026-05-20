import { z } from "zod";
import { leadFilters } from "./lead";

// Vue personnalisée (CRM-017) : filtres + colonnes + tri sauvegardés.
export const createLeadViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: leadFilters.partial().default({}),
  columns: z.array(z.string()).default([]),
  sort: z.string().optional(),
  shared: z.boolean().default(false),
});
export type CreateLeadViewInput = z.infer<typeof createLeadViewSchema>;

export const updateLeadViewSchema = createLeadViewSchema.partial();
export type UpdateLeadViewInput = z.infer<typeof updateLeadViewSchema>;

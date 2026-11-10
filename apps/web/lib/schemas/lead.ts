import { z } from "zod";
import { entityId, paginationQuery } from "./common";

export const LEAD_STATUSES = [
  "NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU",
] as const;
export const leadStatus = z.enum(LEAD_STATUSES);

const optStr = z.string().trim().min(1).max(255).optional().nullable();

export const createLeadSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: optStr,
  firstName: optStr,
  lastName: optStr,
  company: optStr,
  website: z.string().url().optional().nullable(),
  sector: optStr,
  city: optStr,
  country: optStr,
  source: optStr,
  status: leadStatus.optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  notes: z.string().max(10_000).optional().nullable(),
  assignedToId: entityId.optional().nullable(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

const boolFromQuery = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .transform((v) => v === true || v === "true");

// Filtres communs au listing, à l'export et aux segments (CRM-012).
export const leadFilters = z.object({
  q: z.string().trim().min(1).optional(), // recherche full-text (CRM-013)
  status: leadStatus.optional(),
  source: z.string().optional(),
  sector: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  assignedToId: entityId.optional(),
  tag: z.string().optional(),
  scoreMin: z.coerce.number().int().min(0).max(100).optional(),
  scoreMax: z.coerce.number().int().min(0).max(100).optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  includeDeleted: boolFromQuery.optional().default(false),
});
export type LeadFilters = z.infer<typeof leadFilters>;

export const listLeadsQuery = paginationQuery.merge(leadFilters);
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>;

export const changeStatusSchema = z.object({
  status: leadStatus,
  reason: z.string().max(1000).optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const assignLeadSchema = z.object({
  assignedToId: entityId.nullable(), // null = désassigner
});
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;

export const setTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(64)).max(50),
});
export type SetTagsInput = z.infer<typeof setTagsSchema>;

export const exportLeadsQuery = leadFilters.extend({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  columns: z.string().optional(), // liste séparée par des virgules
});
export type ExportLeadsQuery = z.infer<typeof exportLeadsQuery>;

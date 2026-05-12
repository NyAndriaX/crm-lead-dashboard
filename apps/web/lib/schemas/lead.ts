import { z } from "zod";
import { objectId, paginationQuery } from "./common";

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
  assignedToId: objectId.optional().nullable(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

const boolFromQuery = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .transform((v) => v === true || v === "true");

export const listLeadsQuery = paginationQuery.extend({
  q: z.string().trim().min(1).optional(), // recherche full-text (CRM-013)
  status: leadStatus.optional(),
  source: z.string().optional(),
  sector: z.string().optional(),
  assignedToId: objectId.optional(),
  tag: z.string().optional(),
  includeDeleted: boolFromQuery.optional().default(false),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>;

/**
 * Filtre "lead non supprimé" (soft delete : `deletedAt` NULL).
 *
 * Usage :
 *   prisma.lead.findMany({ where: { ...NOT_DELETED, status: "NOUVEAU" } })
 */
import type { Prisma } from "@crm/db";

export const NOT_DELETED: Prisma.LeadWhereInput = { deletedAt: null };

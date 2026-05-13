/**
 * Filtre "lead non supprimé" — robuste Prisma + MongoDB.
 *
 * Sur MongoDB, un champ optionnel non écrit n'existe PAS dans le document.
 * Conséquence : `where: { deletedAt: null }` NE MATCHE PAS les docs où
 * le champ est absent (cf. Prisma/MongoDB doc — opérateur `isSet`).
 *
 * On accepte donc les deux cas :
 *  - `deletedAt` absent du document (lead jamais supprimé)
 *  - `deletedAt` égal à `null` (lead restauré après suppression)
 *
 * Usage :
 *   prisma.lead.findMany({ where: { ...NOT_DELETED, status: "NOUVEAU" } })
 */
import type { Prisma } from "@prisma/client";

export const NOT_DELETED: Prisma.LeadWhereInput = {
  OR: [
    { deletedAt: null },
    { deletedAt: { isSet: false } },
  ],
};

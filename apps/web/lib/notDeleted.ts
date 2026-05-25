import type { Prisma } from "@prisma/client";

export const NOT_DELETED: Prisma.LeadWhereInput = {
  deletedAt: null,
};

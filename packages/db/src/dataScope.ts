/**
 * Isolation des données par utilisateur.
 *
 * Règles :
 * - Chaque utilisateur ne voit que ses propres ressources (IMAP, SMTP, campagnes, séquences, inbox, KB…).
 * - Les administrateurs (ADMIN) peuvent consulter en lecture seule le pipeline des non-administrateurs.
 * - Les administrateurs ne voient jamais les ressources d'un autre administrateur.
 */
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "./client";

export type DataScope = {
  userId: string;
  role: Role;
};

export function isAdminRole(role: Role): boolean {
  return role === Role.ADMIN;
}

export function ownedByUser(userId: string): { ownerUserId: string } {
  return { ownerUserId: userId };
}

export function createdByUser(userId: string): { createdById: string } {
  return { createdById: userId };
}

/** Filtre propriétaire strict (IMAP, SMTP, inbox, KB). */
export function strictOwnerWhere(userId: string) {
  return { ownerUserId: userId };
}

/** Campagnes, séquences, segments, templates. */
export function strictCreatorWhere(userId: string) {
  return { createdById: userId };
}

/**
 * Leads visibles selon le rôle.
 * - Tous : ses leads (propriétaire ou assigné).
 * - ADMIN : en plus, les leads assignés à des non-administrateurs (supervision pipeline).
 */
export function buildLeadVisibilityWhere(scope: DataScope): Prisma.LeadWhereInput {
  const own: Prisma.LeadWhereInput = {
    OR: [{ ownerUserId: scope.userId }, { assignedToId: scope.userId }],
  };
  if (!isAdminRole(scope.role)) return own;
  return {
    OR: [
      own,
      {
        assignedTo: {
          isActive: true,
          role: { not: Role.ADMIN },
        },
      },
    ],
  };
}

/** Vérifie l'accès à un lead (lecture / écriture). */
export async function assertLeadAccess(scope: DataScope, leadId: string): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...buildLeadVisibilityWhere(scope) },
    select: { id: true },
  });
  if (!lead) throw new DataScopeError("not_found", "Lead introuvable ou accès refusé");
}

/**
 * Un admin peut consulter le pipeline d'un non-admin en lecture seule.
 * Sinon, seul le propriétaire de ses propres étapes.
 */
export async function resolvePipelineOwnerId(
  scope: DataScope,
  requestedOwnerId?: string | null,
): Promise<{ ownerUserId: string; readOnly: boolean }> {
  const target = requestedOwnerId?.trim() || scope.userId;
  if (target === scope.userId) {
    return { ownerUserId: scope.userId, readOnly: false };
  }
  if (!isAdminRole(scope.role)) {
    throw new DataScopeError("forbidden", "Vous ne pouvez consulter que votre propre pipeline");
  }
  const user = await prisma.user.findUnique({
    where: { id: target },
    select: { id: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new DataScopeError("not_found", "Utilisateur introuvable");
  }
  if (user.role === Role.ADMIN) {
    throw new DataScopeError("forbidden", "Impossible de consulter le pipeline d'un autre administrateur");
  }
  return { ownerUserId: target, readOnly: true };
}

/** Leads affichés dans le Kanban d'un propriétaire d'étapes. */
export function buildPipelineLeadsWhere(
  stageOwnerUserId: string,
  scope: DataScope,
): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { deletedAt: null };
  if (stageOwnerUserId === scope.userId) {
    return {
      ...base,
      OR: [{ ownerUserId: scope.userId }, { assignedToId: scope.userId }],
    };
  }
  // Admin en lecture seule sur le pipeline d'un non-admin
  return {
    ...base,
    assignedToId: stageOwnerUserId,
  };
}

export class DataScopeError extends Error {
  constructor(
    public code: "forbidden" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "DataScopeError";
  }
}

const DEFAULT_PIPELINE_STAGES: { name: string; color: string }[] = [
  { name: "Nouveau", color: "#1677ff" },
  { name: "Contacté", color: "#52c41a" },
  { name: "Qualifié", color: "#fa8c16" },
  { name: "En discussion", color: "#722ed1" },
  { name: "Gagné", color: "#13c2c2" },
  { name: "Perdu", color: "#f5222d" },
];

/** Crée les étapes pipeline par défaut pour un utilisateur s'il n'en a pas. */
export async function ensureDefaultPipelineStages(userId: string): Promise<void> {
  const count = await prisma.pipelineStage.count({ where: { ownerUserId: userId } });
  if (count > 0) return;
  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
      name: s.name,
      color: s.color,
      order: i,
      ownerUserId: userId,
    })),
  });
}

/** IDs des utilisateurs non-admin (pour sélecteur pipeline admin). */
export async function listNonAdminUsersForPipeline(): Promise<
  { id: string; name: string; email: string; role: Role }[]
> {
  return prisma.user.findMany({
    where: { isActive: true, role: { not: Role.ADMIN } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

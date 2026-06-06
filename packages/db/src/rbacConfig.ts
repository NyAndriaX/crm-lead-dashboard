/**
 * RBAC configurable — matrice rôle × permission persistée en base.
 * Fallback sur DEFAULT_MATRIX si aucune config enregistrée.
 */
import type { Role } from "@prisma/client";
import { prisma } from "./client";

export type Permission =
  | "leads:read"
  | "leads:write"
  | "leads:delete"
  | "leads:assign"
  | "import:run"
  | "campaigns:read"
  | "campaigns:write"
  | "campaigns:send"
  | "inbox:read"
  | "inbox:reply"
  | "sequences:manage"
  | "pipeline:manage"
  | "analytics:read"
  | "users:manage"
  | "settings:manage"
  | "rgpd:manage";

export const ALL_PERMISSIONS: Permission[] = [
  "leads:read", "leads:write", "leads:delete", "leads:assign",
  "import:run",
  "campaigns:read", "campaigns:write", "campaigns:send",
  "inbox:read", "inbox:reply",
  "sequences:manage", "pipeline:manage", "analytics:read",
  "users:manage", "settings:manage", "rgpd:manage",
];

export const PERMISSION_META: { key: Permission; label: string; group: string }[] = [
  { key: "leads:read", label: "Lire les leads", group: "Leads" },
  { key: "leads:write", label: "Créer / modifier des leads", group: "Leads" },
  { key: "leads:delete", label: "Supprimer des leads", group: "Leads" },
  { key: "leads:assign", label: "Assigner des leads", group: "Leads" },
  { key: "import:run", label: "Lancer un import", group: "Import" },
  { key: "campaigns:read", label: "Lire les campagnes", group: "Emailing" },
  { key: "campaigns:write", label: "Créer / modifier les campagnes", group: "Emailing" },
  { key: "campaigns:send", label: "Envoyer une campagne", group: "Emailing" },
  { key: "inbox:read", label: "Consulter l'inbox", group: "Réponses" },
  { key: "inbox:reply", label: "Répondre depuis l'inbox", group: "Réponses" },
  { key: "sequences:manage", label: "Gérer les séquences de relance", group: "Relances" },
  { key: "pipeline:manage", label: "Gérer le pipeline", group: "Pipeline" },
  { key: "analytics:read", label: "Consulter les analytics", group: "Analytics" },
  { key: "users:manage", label: "Gérer les utilisateurs", group: "Administration" },
  { key: "settings:manage", label: "Modifier les paramètres", group: "Administration" },
  { key: "rgpd:manage", label: "Actions RGPD", group: "Administration" },
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Manager",
  COMMERCIAL: "Commercial",
  LECTEUR: "Lecteur",
};

export const ROLES: Role[] = ["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"];

export const DEFAULT_MATRIX: Record<Role, Permission[]> = {
  ADMIN: [...ALL_PERMISSIONS],
  MANAGER: [
    "leads:read", "leads:write", "leads:delete", "leads:assign",
    "import:run",
    "campaigns:read", "campaigns:write", "campaigns:send",
    "inbox:read", "inbox:reply",
    "sequences:manage", "pipeline:manage", "analytics:read",
  ],
  COMMERCIAL: [
    "leads:read", "leads:write",
    "campaigns:read",
    "inbox:read", "inbox:reply",
    "pipeline:manage", "analytics:read",
  ],
  LECTEUR: ["leads:read", "campaigns:read", "inbox:read", "analytics:read"],
};

function isPermission(v: string): v is Permission {
  return (ALL_PERMISSIONS as string[]).includes(v);
}

function sanitizeMatrix(raw: unknown): Record<Role, Permission[]> {
  const base = { ...DEFAULT_MATRIX };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const role of ROLES) {
    const perms = obj[role];
    if (!Array.isArray(perms)) continue;
    base[role] = perms.filter((p): p is Permission => typeof p === "string" && isPermission(p));
  }
  // ADMIN conserve toujours toutes les permissions (anti-lockout).
  base.ADMIN = [...ALL_PERMISSIONS];
  return base;
}

export async function getRbacMatrix(): Promise<Record<Role, Permission[]>> {
  const row = await prisma.rbacConfig.findUnique({ where: { id: "default" } });
  if (!row) return { ...DEFAULT_MATRIX, ADMIN: [...ALL_PERMISSIONS] };
  return sanitizeMatrix(row.matrix);
}

export async function saveRbacMatrix(
  matrix: Record<string, string[]>,
  updatedBy?: string,
): Promise<Record<Role, Permission[]>> {
  const sanitized = sanitizeMatrix(matrix);
  await prisma.rbacConfig.upsert({
    where: { id: "default" },
    create: { id: "default", matrix: sanitized as object, updatedBy: updatedBy ?? null },
    update: { matrix: sanitized as object, updatedBy: updatedBy ?? null },
  });
  return sanitized;
}

export function matrixToSets(matrix: Record<Role, Permission[]>): Record<Role, Set<Permission>> {
  return {
    ADMIN: new Set(matrix.ADMIN),
    MANAGER: new Set(matrix.MANAGER),
    COMMERCIAL: new Set(matrix.COMMERCIAL),
    LECTEUR: new Set(matrix.LECTEUR),
  };
}

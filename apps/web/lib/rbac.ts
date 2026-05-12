// RBAC — CRM-007 / SEC-02. Matrice rôle × permission.
// 4 rôles : ADMIN, MANAGER, COMMERCIAL, LECTEUR.
import type { Role } from "@crm/db";

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

const ALL: Permission[] = [
  "leads:read", "leads:write", "leads:delete", "leads:assign",
  "import:run",
  "campaigns:read", "campaigns:write", "campaigns:send",
  "inbox:read", "inbox:reply",
  "sequences:manage", "pipeline:manage", "analytics:read",
  "users:manage", "settings:manage", "rgpd:manage",
];

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: ALL,
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

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

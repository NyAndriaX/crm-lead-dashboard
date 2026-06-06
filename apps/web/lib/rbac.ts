// RBAC — CRM-007 / SEC-02. Matrice rôle × permission (configurable en base).
import type { Role } from "@crm/db";
import {
  getRbacMatrix,
  DEFAULT_MATRIX,
  ALL_PERMISSIONS,
  type Permission,
} from "@crm/db";

export type { Permission };

let matrixCache: Record<Role, Permission[]> | null = null;

/** Charge la matrice depuis la base (cache process). */
export async function ensureRbacLoaded(): Promise<void> {
  if (matrixCache) return;
  try {
    matrixCache = await getRbacMatrix();
  } catch {
    matrixCache = { ...DEFAULT_MATRIX, ADMIN: [...ALL_PERMISSIONS] };
  }
}

/** Invalide le cache après mise à jour admin. */
export function invalidateRbacCache(next?: Record<Role, Permission[]>): void {
  matrixCache = next ?? null;
}

export function can(role: Role, permission: Permission): boolean {
  const matrix = matrixCache ?? DEFAULT_MATRIX;
  return matrix[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  const matrix = matrixCache ?? DEFAULT_MATRIX;
  return matrix[role] ?? [];
}

export { ALL_PERMISSIONS, DEFAULT_MATRIX, PERMISSION_META, RBAC_ROLE_LABELS, RBAC_ROLES } from "@crm/db";

import * as path from "node:path";

/** Chemin des uploads en production Docker (web + worker partagent ce répertoire). */
export const PRODUCTION_UPLOAD_DIR = "/app/uploads";

/**
 * Répertoire racine des fichiers uploadés (imports CSV, pièces jointes leads).
 * En production : `/app/uploads` par défaut (défini dans l'image Docker, pas besoin de variable Dokploy).
 * En développement : `./uploads` relatif au cwd.
 */
export function getUploadDir(): string {
  const fromEnv = process.env.UPLOAD_DIR?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return PRODUCTION_UPLOAD_DIR;
  return path.join(process.cwd(), "uploads");
}

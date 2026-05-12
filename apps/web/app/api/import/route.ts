/**
 * POST /api/import — upload CSV/XLSX, crée l'ImportJob, retourne headers + aperçu.
 * GET  /api/import — liste des imports (les siens ou tous pour ADMIN).
 */
import { handler, json, created, requirePermission, requireSession } from "@/lib/api";
import { createImportJob, listImportJobs } from "@/lib/services/import";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const session = await requirePermission("import:run");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    const { ApiError } = await import("@/lib/api");
    throw new ApiError(400, "Fichier manquant", "missing_file");
  }
  if (file.size > 50 * 1024 * 1024) {
    const { ApiError } = await import("@/lib/api");
    throw new ApiError(413, "Fichier trop volumineux (max 50 Mo)", "file_too_large");
  }

  const result = await createImportJob(session.sub, file);
  return created({ data: result });
});

export const GET = handler(async () => {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const jobs = await listImportJobs(session.sub, isAdmin);
  return json({ data: jobs });
});

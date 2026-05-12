import { handler, json, requireRole } from "@/lib/api";
import { buildOpenApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

// GET /api/openapi.json — spécification OpenAPI 3.1 (Admin uniquement).
export const GET = handler(async () => {
  await requireRole("ADMIN");
  return json(buildOpenApiDocument());
});

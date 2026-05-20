/**
 * GET /api/admin/scoring-weights — poids actuels (DB ou defaults).
 * PUT /api/admin/scoring-weights — enregistre de nouveaux poids. ADMIN uniquement.
 */
import { prisma } from "@crm/db";
import { handler, json, parseBody, requireRole, requireSession } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { scoringWeightsSchema } from "@/lib/schemas/import";
import { DEFAULT_WEIGHTS } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const CONFIG_ID = "default";

export const GET = handler(async () => {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    throw new ApiError(403, "Réservé aux administrateurs", "forbidden");
  }
  const config = await prisma.scoringConfig.findUnique({ where: { id: CONFIG_ID } });
  return json({ data: config?.weights ?? DEFAULT_WEIGHTS });
});

export const PUT = handler(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseBody(req, scoringWeightsSchema);

  const config = await prisma.scoringConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, weights: input as object, updatedBy: session.sub },
    update: { weights: input as object, updatedBy: session.sub },
  });
  return json({ data: config.weights });
});

/**
 * GET/PATCH /api/admin/worker-config — fuseau horaire des tâches Agenda / worker.
 * GET : ADMIN + MANAGER (lecture). PATCH : `settings:manage` (typiquement ADMIN).
 */
import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission, requireSession } from "@/lib/api";
import { getWorkerConfig, updateWorkerTimezone } from "@/lib/services/workerConfig";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  agendaTimezone: z.string().trim().min(2).max(80),
});

export const GET = handler(async () => {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    throw new ApiError(403, "Réservé aux administrateurs et managers", "forbidden");
  }
  const data = await getWorkerConfig();
  return json({ data });
});

export const PATCH = handler(async (req) => {
  await requirePermission("settings:manage");
  const body = await parseBody(req, patchSchema);
  const data = await updateWorkerTimezone(body.agendaTimezone);
  return json({
    data: { agendaTimezone: data.agendaTimezone, updatedAt: data.updatedAt },
    info: "Redémarrez le processus worker pour appliquer le fuseau horaire au processus Node (variable TZ).",
  });
});

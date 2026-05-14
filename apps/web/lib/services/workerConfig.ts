import { prisma } from "@crm/db";
import { isValidIanaTimeZone } from "@crm/queue";
import { ApiError } from "../api";

export async function getWorkerConfig() {
  const row = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  return { agendaTimezone: row?.agendaTimezone?.trim() || "UTC" };
}

export async function updateWorkerTimezone(tz: string) {
  const trimmed = tz.trim();
  if (!isValidIanaTimeZone(trimmed)) {
    throw new ApiError(422, "Fuseau horaire IANA invalide (ex. Europe/Paris, UTC).", "invalid_timezone");
  }
  return prisma.workerConfig.upsert({
    where: { id: "default" },
    create: { id: "default", agendaTimezone: trimmed },
    update: { agendaTimezone: trimmed },
  });
}

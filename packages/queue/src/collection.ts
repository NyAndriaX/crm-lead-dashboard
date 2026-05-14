/** Collection MongoDB utilisée par @hokify/agenda (distincte de `jobs` Prisma legacy). */
export function agendaCollectionName(): string {
  return process.env.AGENDA_COLLECTION?.trim() || "crmAgendaJobs";
}

/**
 * Registre des handlers de jobs, indexés par `job.type`.
 * Ajouter ici les handlers au fil des tickets, par ex. :
 *   "email-send":     CRM-035  (envoi régulé)
 *   "imap-sync":      CRM-040  (synchro inbox)
 *   "import-process": CRM-026  (import CSV/XLSX async)
 *   "scoring":        CRM-019  (recalcul lead scoring)
 *   "notification":   CRM-044  (notif nouvelle réponse)
 */
import type { Job } from "@crm/db";

export type JobHandler = (job: Job) => Promise<unknown> | unknown;

export const handlers: Record<string, JobHandler> = {
  // Handler témoin (utile pour valider la boucle de polling de bout en bout).
  "noop": async (job: Job) => ({ ok: true, echoed: job.payload ?? null, at: new Date().toISOString() }),
};

/** Données passées au handler (équivalent à l’ancien `Job.payload` Prisma). */
export type WorkerJobContext = { payload: unknown };

export type WorkerJobHandler = (ctx: WorkerJobContext) => Promise<unknown>;

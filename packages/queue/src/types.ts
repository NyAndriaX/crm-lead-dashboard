export type WorkerJobContext = { payload: unknown };

export type WorkerJobHandler = (ctx: WorkerJobContext) => Promise<unknown>;

export type EnqueueOneOffOptions = {
  runAt?: Date;
  priority?: number | string;
};

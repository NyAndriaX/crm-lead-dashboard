import { enqueueOneOff, type EnqueueOneOffOptions } from "./enqueueOneOff";

export async function getEnqueueAgenda(): Promise<unknown> {
  return {};
}

export async function enqueueFromWeb(
  type: string,
  payload: unknown,
  opts: EnqueueOneOffOptions & { maxAttempts?: number } = {},
): Promise<void> {
  await enqueueOneOff(null, type, payload, opts);
}

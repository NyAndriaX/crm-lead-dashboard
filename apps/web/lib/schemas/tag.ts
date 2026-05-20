import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

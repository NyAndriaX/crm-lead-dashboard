import { z } from "zod";
import { objectId } from "./common";
import { leadFilters } from "./lead";

export const segmentFiltersSchema = leadFilters.omit({ includeDeleted: true }).partial();

export const createSegmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: segmentFiltersSchema.default({}),
});
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

export const updateSegmentSchema = createSegmentSchema.partial().refine((o) => o.name !== undefined || o.filters !== undefined, {
  message: "Au moins un champ à mettre à jour",
});
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;

const campaignConfigSchema = z
  .object({
    throttleMinDelayMs: z.number().int().min(0).max(600_000).optional(),
    bodyHtmlOverride: z.string().max(500_000).optional().nullable(),
    ab: z
      .object({
        enabled: z.boolean().optional(),
        subjectB: z.string().max(300).optional().nullable(),
        bodyHtmlB: z.string().max(500_000).optional().nullable(),
        splitPercent: z.number().int().min(0).max(100).optional(),
      })
      .optional(),
    warmup: z
      .object({
        enabled: z.boolean().optional(),
        startPerDay: z.number().int().min(1).max(50_000).optional(),
        growth: z.number().min(1).max(3).optional(),
      })
      .optional(),
  })
  .optional();

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(150),
  templateId: objectId,
  segmentId: objectId,
  smtpConfigId: objectId,
  subject: z.string().trim().min(1).max(300),
  scheduledAt: z.coerce.date().optional().nullable(),
  dailyLimit: z.number().int().min(1).max(50_000).optional().nullable(),
  config: campaignConfigSchema,
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial();
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
});
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;

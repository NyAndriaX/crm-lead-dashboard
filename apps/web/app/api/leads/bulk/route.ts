/**
 * POST /api/leads/bulk — actions groupées sur une sélection de leads.
 *
 * Body :
 *   { action: "delete" | "restore" | "assign" | "status" | "tags-add" |
 *             "tags-remove" | "enroll-sequence",
 *     ids: string[] (max 1000),
 *     payload: action-specific }
 *
 * Réponse : { data: { requested, succeeded, failed, errors } }
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import {
  bulkSoftDelete, bulkRestore, bulkAssign, bulkSetStatus,
  bulkAddTags, bulkRemoveTags, bulkEnrollInSequence,
} from "@/lib/services/leadsBulk";

export const dynamic = "force-dynamic";

const idsSchema = z.array(z.string().min(1)).min(1).max(1000);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: idsSchema }),
  z.object({ action: z.literal("restore"), ids: idsSchema }),
  z.object({
    action: z.literal("assign"),
    ids: idsSchema,
    assignedToId: z.string().min(1).nullable(),
  }),
  z.object({
    action: z.literal("status"),
    ids: idsSchema,
    status: z.enum(["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"]),
  }),
  z.object({
    action: z.literal("tags-add"),
    ids: idsSchema,
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  }),
  z.object({
    action: z.literal("tags-remove"),
    ids: idsSchema,
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  }),
  z.object({
    action: z.literal("enroll-sequence"),
    ids: idsSchema,
    sequenceId: z.string().min(1),
  }),
]);

export const POST = handler(async (req) => {
  const input = await parseBody(req, bodySchema);

  // Permissions différenciées par action.
  let perm: Parameters<typeof requirePermission>[0];
  switch (input.action) {
    case "delete":
      perm = "leads:delete";
      break;
    case "assign":
      perm = "leads:assign";
      break;
    case "enroll-sequence":
      perm = "sequences:manage";
      break;
    default:
      perm = "leads:write";
  }
  const session = await requirePermission(perm);

  let result;
  switch (input.action) {
    case "delete":
      result = await bulkSoftDelete(input.ids);
      break;
    case "restore":
      result = await bulkRestore(input.ids);
      break;
    case "assign":
      result = await bulkAssign(input.ids, input.assignedToId);
      break;
    case "status":
      result = await bulkSetStatus(input.ids, input.status);
      break;
    case "tags-add":
      result = await bulkAddTags(input.ids, input.tags);
      break;
    case "tags-remove":
      result = await bulkRemoveTags(input.ids, input.tags);
      break;
    case "enroll-sequence":
      result = await bulkEnrollInSequence(input.ids, input.sequenceId);
      break;
    default:
      throw new ApiError(400, "Action inconnue", "unknown_action");
  }

  await audit({
    userId: session.sub,
    action: `lead.bulk.${input.action}`,
    entityType: "Lead",
    ip: clientIp(req),
    diff: {
      action: input.action,
      idCount: input.ids.length,
      result,
    } as object,
  });

  return json({ data: result });
});

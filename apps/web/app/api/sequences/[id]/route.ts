import { z } from "zod";
import { ApiError, handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import {
  deleteSequence,
  getSequence,
  setSequencePaused,
  updateSequence,
} from "@/lib/services/sequences";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const stepSchema = z.object({
  delayDays: z.number().int().min(0).max(365),
  templateId: z.string().trim().min(1).nullable().optional(),
  subject: z.string().trim().min(1).max(500).nullable().optional(),
  bodyHtml: z.string().min(1).max(200_000).nullable().optional(),
  stopOnReply: z.boolean().optional(),
  aiPersonalize: z.boolean().optional(),
});

const configSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1).nullable().optional(),
  knowledgeText: z.string().trim().max(20_000).nullable().optional(),
  smtpConfigId: z.string().trim().min(1).nullable().optional(),
}).optional().nullable();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
  maxSteps: z.number().int().min(1).max(20).nullable().optional(),
  isPaused: z.boolean().optional(),
  campaignId: z.string().trim().min(1).nullable().optional(),
  config: configSchema,
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const seq = await getSequence(id, scope);
  if (!seq) throw new ApiError(404, "Séquence introuvable", "not_found");
  return json({ data: seq });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  const seq = await updateSequence(id, input, scope);
  return json({ data: seq });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const body = await parseBody(req, z.object({ isPaused: z.boolean() }));
  const seq = await setSequencePaused(id, body.isPaused, scope);
  return json({ data: seq });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("sequences:manage");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteSequence(id, scope);
  return noContent();
});

import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { createKnowledgeBase, listKnowledgeBases } from "@/lib/services/knowledgeBases";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  contentMd: z.string().trim().min(1).max(100_000),
});

export const GET = handler(async () => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const data = await listKnowledgeBases(scope);
  return json({ data });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("settings:manage");
  const scope = toScope(s);
  const input = await parseBody(req, createSchema);
  const data = await createKnowledgeBase(input, scope);
  return json({ data });
});

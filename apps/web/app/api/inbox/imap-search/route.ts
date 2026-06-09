import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { searchImapMailbox } from "@/lib/services/imap";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

export const POST = handler(async (req) => {
  await requirePermission("inbox:read");
  const { query, limit } = await parseBody(req, bodySchema);
  const result = await searchImapMailbox(query, limit ?? 30);
  return json({ data: result });
});

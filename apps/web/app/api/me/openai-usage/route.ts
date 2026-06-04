import { getOpenAiUsageSummary } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/me/openai-usage — consommation OpenAI de l'utilisateur connecté. */
export const GET = handler(async () => {
  const session = await requireSession();
  const data = await getOpenAiUsageSummary(session.sub);
  return json({ data });
});

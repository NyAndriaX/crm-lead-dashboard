import { handler, json, requireSession } from "@/lib/api";
import { testOpenAiConfig } from "@/lib/services/openaiConfig";

export const dynamic = "force-dynamic";

/** POST /api/me/openai-config/test — vérifie la clé OpenAI du user courant. */
export const POST = handler(async () => {
  const session = await requireSession();
  const data = await testOpenAiConfig(session.sub);
  return json({ data });
});

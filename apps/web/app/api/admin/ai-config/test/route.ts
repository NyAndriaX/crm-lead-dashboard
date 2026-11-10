/**
 * POST /api/admin/ai-config/test — exécute une vraie tâche (tri d'une réponse de prospect) avec le
 * fournisseur actif et renvoie le résultat, le modèle et la durée. ADMIN uniquement.
 */
import { REPLY_CATEGORIES, replyCategorySchema, runSkillDetailed } from "@crm/ai";
import { handler, json, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  await requireRole("ADMIN");
  const run = await runSkillDetailed<{ category: (typeof REPLY_CATEGORIES)[number] }>({
    skill: "crm-reply-categorize",
    schema: replyCategorySchema,
    model: "haiku",
    timeoutMs: 60_000,
    input: {
      subject: "Re: votre proposition",
      body: "Bonjour, votre offre m'intéresse. Pouvez-vous m'appeler jeudi pour en discuter ? Cordialement.",
    },
  });
  return json({
    data: {
      ok: run.output != null,
      provider: run.provider,
      model: run.model,
      ms: run.ms,
      result: run.output?.category ?? null,
      error: run.error ?? null,
    },
  });
});

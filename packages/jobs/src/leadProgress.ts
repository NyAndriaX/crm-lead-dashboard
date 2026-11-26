import { syncPipelineStageForStatus } from "@crm/db";

type Db = Parameters<typeof syncPipelineStageForStatus>[0];

/**
 * Premier contact par une séquence de relance : même progression que pour une campagne.
 * Un lead encore « NOUVEAU » passe à « CONTACTE » et sa carte est placée dans la colonne « Contacté »
 * du pipeline (créée si le lead n'y figurait pas, cas d'un lead saisi à la main). Un lead déjà plus
 * avancé n'est jamais ramené en arrière ; seule sa date de dernière action est mise à jour.
 */
export async function progressLeadAfterSequenceSend(
  db: Db,
  lead: { id: string; status: string },
): Promise<{ promoted: boolean }> {
  const promoted = lead.status === "NOUVEAU";
  await db.lead.update({
    where: { id: lead.id },
    data: { lastActionAt: new Date(), ...(promoted ? { status: "CONTACTE" as const } : {}) },
  });
  if (promoted) await syncPipelineStageForStatus(db, lead.id, "CONTACTE");
  return { promoted };
}

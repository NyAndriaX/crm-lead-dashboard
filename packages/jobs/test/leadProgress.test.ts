import { test } from "node:test";
import assert from "node:assert/strict";
import { progressLeadAfterSequenceSend } from "../src/leadProgress";

const STAGES = [
  { id: "s-nouveau", name: "Nouveau" },
  { id: "s-contacte", name: "Contacté" },
  { id: "s-discussion", name: "En discussion" },
];

/** Fausse base : mémorise les écritures sur le lead et la carte du pipeline. */
function fakeDb(initial: { status: string; pipelineStageId: string | null }) {
  const lead = { ...initial, lastActionAt: null as Date | null };
  const cards: { leadId: string; stageId: string }[] = [];
  const db = {
    lead: {
      findUnique: async () => ({ pipelineStageId: lead.pipelineStageId }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(lead, data),
    },
    pipelineStage: { findMany: async () => STAGES },
    leadPipeline: {
      upsert: async ({ create }: { create: { leadId: string; stageId: string } }) => {
        cards.push({ leadId: create.leadId, stageId: create.stageId });
        return create;
      },
    },
  };
  return { db: db as never, lead, cards };
}

test("premier email d'une séquence : un lead NOUVEAU hors pipeline passe CONTACTE et entre dans « Contacté »", async () => {
  const { db, lead, cards } = fakeDb({ status: "NOUVEAU", pipelineStageId: null });
  const r = await progressLeadAfterSequenceSend(db, { id: "L1", status: "NOUVEAU" });
  assert.equal(r.promoted, true);
  assert.equal(lead.status, "CONTACTE");
  assert.equal(lead.pipelineStageId, "s-contacte");
  assert.deepEqual(cards, [{ leadId: "L1", stageId: "s-contacte" }]);
  assert.ok(lead.lastActionAt instanceof Date);
});

test("un lead déjà en discussion n'est pas ramené en arrière", async () => {
  const { db, lead, cards } = fakeDb({ status: "EN_DISCUSSION", pipelineStageId: "s-discussion" });
  const r = await progressLeadAfterSequenceSend(db, { id: "L2", status: "EN_DISCUSSION" });
  assert.equal(r.promoted, false);
  assert.equal(lead.status, "EN_DISCUSSION");
  assert.equal(lead.pipelineStageId, "s-discussion");
  assert.equal(cards.length, 0);
  assert.ok(lead.lastActionAt instanceof Date);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { stageForStatus, statusForStageName, syncPipelineStageForStatus } from "../src/pipelineSync";

const STAGES = ["Nouveau", "Contacté", "Qualifié", "En discussion", "Proposition", "Négociation", "Gagné", "Perdu"]
  .map((name, i) => ({ id: `s${i}`, name, order: i }));

function fakeDb(pipelineStageId: string | null) {
  const state = { pipelineStageId, upserts: 0 };
  const db = {
    lead: {
      findUnique: async () => ({ pipelineStageId: state.pipelineStageId }),
      update: async ({ data }: { data: { pipelineStageId: string } }) => { state.pipelineStageId = data.pipelineStageId; return {}; },
    },
    pipelineStage: { findMany: async () => STAGES },
    leadPipeline: { upsert: async () => { state.upserts++; return {}; } },
  };
  return { db: db as never, state };
}

test("correspondances statut ↔ colonne", () => {
  assert.equal(stageForStatus("EN_DISCUSSION", STAGES)?.name, "En discussion");
  assert.equal(stageForStatus("CONVERTI", STAGES)?.name, "Gagné");
  assert.equal(statusForStageName("Proposition"), "EN_DISCUSSION");
  assert.equal(statusForStageName("contacte"), "CONTACTE"); // accents / casse ignorés
  assert.equal(statusForStageName("Colonne perso"), null);
  // Sans colonne « En discussion » (anciennes installations) : repli sur « Négociation ».
  assert.equal(stageForStatus("EN_DISCUSSION", STAGES.filter((s) => s.name !== "En discussion"))?.name, "Négociation");
});

test("réponse intéressée : la carte passe de « Contacté » à « En discussion »", async () => {
  const { db, state } = fakeDb("s1");
  assert.equal(await syncPipelineStageForStatus(db, "l1", "EN_DISCUSSION"), "s3");
  assert.equal(state.pipelineStageId, "s3");
  assert.equal(state.upserts, 1);
});

test("carte déjà dans une colonne du même statut (Proposition) : non déplacée", async () => {
  const { db, state } = fakeDb("s4");
  assert.equal(await syncPipelineStageForStatus(db, "l1", "EN_DISCUSSION"), "s4");
  assert.equal(state.upserts, 0);
});

test("lead hors pipeline : placé dans la colonne de son statut", async () => {
  const { db, state } = fakeDb(null);
  await syncPipelineStageForStatus(db, "l1", "PERDU");
  assert.equal(state.pipelineStageId, "s7");
});

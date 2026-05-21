/**
 * Initialisation PRODUCTION — base propre, AUCUNE donnée de démonstration.
 *
 * Crée strictement :
 *   - 1 compte ADMIN réel (identifiants OBLIGATOIRES via env, pas de défaut)
 *   - les étapes de pipeline standard (pour que le Kanban fonctionne)
 *   - la config worker (fuseau)
 *
 * Aucun lead, aucun compte démo (manager@/lucas.bernard@…), aucune inbox,
 * séquence, campagne. Le seed de démo (seed.mjs) crée TOUJOURS les
 * USER_FIXTURES — il ne convient donc pas à la prod ; d'où ce script dédié.
 *
 * Utilise le driver natif MongoDB (pas Prisma) pour fonctionner sans replica set.
 *
 * Usage :
 *   ADMIN_EMAIL=ops@votredomaine.com ADMIN_PASSWORD='MotDePasseFort!' \
 *     yarn db:init-prod
 *
 * ⚠️ Idempotent sur l'admin (findOne + insert/update) mais NE vide PAS la base.
 */
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { PIPELINE_STAGES } from "./seed/fixtures.mjs";

const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const adminName = process.env.ADMIN_NAME ?? "Administrateur";
const databaseUrl = process.env.DATABASE_URL ?? "";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  fail("ADMIN_EMAIL manquant ou invalide (ex. ADMIN_EMAIL=ops@domaine.com).");
}
if (adminPassword.length < 10) {
  fail("ADMIN_PASSWORD manquant ou trop court (10 caractères minimum exigés en prod).");
}
if (!databaseUrl) {
  fail("DATABASE_URL manquant.");
}

// Extrait le nom de la base depuis l'URL MongoDB (ex. mongodb+srv://…/mabase?…)
function extractDbName(url) {
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : null;
}

const dbName = extractDbName(databaseUrl);
if (!dbName) {
  fail("Impossible d'extraire le nom de la base depuis DATABASE_URL.");
}

const client = new MongoClient(databaseUrl);

async function main() {
  await client.connect();
  const db = client.db(dbName);

  const now = new Date();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // --- Admin user ---
  const users = db.collection("users");
  const existingAdmin = await users.findOne({ email: adminEmail });
  let adminId;
  if (existingAdmin) {
    await users.updateOne(
      { email: adminEmail },
      { $set: { name: adminName, role: "ADMIN", isActive: true, updatedAt: now } }
    );
    adminId = existingAdmin._id;
  } else {
    const result = await users.insertOne({
      _id: new ObjectId(),
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: "ADMIN",
      isActive: true,
      twoFactorOn: false,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    adminId = result.insertedId;
  }

  // --- Pipeline stages ---
  const stages = db.collection("pipelineStages");
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const exists = await stages.findOne({ name: stage.name });
    if (!exists) {
      await stages.insertOne({
        _id: new ObjectId(),
        name: stage.name,
        order: i,
        color: stage.color,
        createdAt: now,
      });
    }
  }

  // --- Worker config ---
  const workerConfig = db.collection("workerConfig");
  const existingConfig = await workerConfig.findOne({ _id: "default" });
  if (!existingConfig) {
    await workerConfig.insertOne({
      _id: "default",
      agendaTimezone: process.env.AGENDA_TIMEZONE || "Europe/Paris",
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log("");
  console.log("┌────────────────────────────────────────────────");
  console.log("│  ✔ Init PRODUCTION terminée (aucune donnée démo)");
  console.log("├────────────────────────────────────────────────");
  console.log(`│  Admin   : ${adminEmail} (id: ${adminId})`);
  console.log(`│  Pipeline: ${PIPELINE_STAGES.length} étapes`);
  console.log("│  Leads/comptes démo : 0");
  console.log("└────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());

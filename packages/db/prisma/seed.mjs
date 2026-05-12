// Seed minimal — crée un utilisateur Admin et les étapes de pipeline par défaut.
// Lancer : yarn workspace @crm/db seed   (ou: yarn db:generate puis yarn workspace @crm/db seed)
//
// Variables optionnelles :
//   SEED_ADMIN_EMAIL    (def. admin@crm.local)
//   SEED_ADMIN_PASSWORD (def. ChangeMe!2026)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@crm.local").toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Administrateur", role: "ADMIN", isActive: true },
  });
  console.log(`✔ Admin: ${admin.email} (mot de passe: ${process.env.SEED_ADMIN_PASSWORD ? "(défini via env)" : password})`);

  const stages = ["Nouveau", "Contacté", "Qualifié", "Proposition", "Négociation", "Gagné", "Perdu"];
  const colors = ["#8c8c8c", "#1677ff", "#13c2c2", "#722ed1", "#fa8c16", "#52c41a", "#ff4d4f"];
  for (let i = 0; i < stages.length; i++) {
    const existing = await prisma.pipelineStage.findFirst({ where: { name: stages[i] } });
    if (!existing) {
      await prisma.pipelineStage.create({ data: { name: stages[i], order: i, color: colors[i] } });
    }
  }
  console.log(`✔ ${stages.length} étapes de pipeline`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

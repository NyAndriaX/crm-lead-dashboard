import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(120),
});

/** PATCH /api/me/profile — met à jour le profil de l'utilisateur connecté. */
export const PATCH = handler(async (req) => {
  const session = await requireSession();
  const body = await parseBody(req, patchSchema);

  const user = await prisma.user.update({
    where: { id: session.sub },
    data: { name: body.name },
    select: { id: true, name: true, email: true, role: true },
  });

  return json({ data: user });
});

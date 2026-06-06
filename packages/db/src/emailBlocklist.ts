/**
 * Liste de blocage email — désabonnements, bounces, suppressions RGPD.
 */
import { prisma } from "./client";

export const GDPR_ERASE_REASON = "rgpd_erase";

export async function isEmailHashBlocked(emailHash: string): Promise<{ blocked: boolean; reason: string | null }> {
  const row = await prisma.blacklist.findUnique({ where: { emailHash }, select: { reason: true } });
  if (!row) return { blocked: false, reason: null };
  return { blocked: true, reason: row.reason };
}

export async function blockEmailHash(args: {
  emailHash: string;
  reason: string;
  erasedBy?: string | null;
}): Promise<void> {
  await prisma.blacklist.upsert({
    where: { emailHash: args.emailHash },
    create: {
      emailHash: args.emailHash,
      reason: args.reason,
      erasedBy: args.erasedBy ?? null,
    },
    update: {
      reason: args.reason,
      ...(args.erasedBy != null ? { erasedBy: args.erasedBy } : {}),
    },
  });
}

export function gdprBlockMessage(reason: string | null): string {
  if (reason === GDPR_ERASE_REASON) {
    return "Cette adresse email a fait l'objet d'une suppression RGPD — réintégration et contact interdits.";
  }
  if (reason === "unsubscribe") return "Cette adresse s'est désabonnée — contact interdit.";
  if (reason === "bounce") return "Cette adresse est en bounce — contact interdit.";
  return "Cette adresse email est bloquée — contact interdit.";
}

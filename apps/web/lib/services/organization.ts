/**
 * Multi-tenant — T-02 (optionnel, scaffold single-tenant par défaut).
 *
 * Tout le CRM fonctionne aujourd'hui en single-tenant : une instance =
 * une organisation `default`. Ce helper centralise la résolution de
 * l'organisation courante pour que le passage multi-tenant (phase 2,
 * cf. docs/architecture/multi-tenant.md) se fasse sans réécrire les
 * appels métier — il suffira de dériver l'orgId du contexte requête.
 */
import { prisma } from "@crm/db";

export const DEFAULT_ORG_ID = "default";

export type OrgInfo = {
  id: string;
  name: string;
  plan: string;
  isActive: boolean;
  settings: unknown;
};

/** Retourne l'organisation courante, en la créant au premier accès. */
export async function currentOrganization(): Promise<OrgInfo> {
  const existing = await prisma.organization.findUnique({
    where: { id: DEFAULT_ORG_ID },
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      plan: existing.plan,
      isActive: existing.isActive,
      settings: existing.settings,
    };
  }
  const created = await prisma.organization.create({
    data: { id: DEFAULT_ORG_ID, name: "Organisation principale", plan: "standard" },
  });
  return {
    id: created.id,
    name: created.name,
    plan: created.plan,
    isActive: created.isActive,
    settings: created.settings,
  };
}

export async function updateOrganization(input: {
  name?: string;
  plan?: string;
}): Promise<OrgInfo> {
  await currentOrganization(); // garantit l'existence
  const updated = await prisma.organization.update({
    where: { id: DEFAULT_ORG_ID },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.plan !== undefined ? { plan: input.plan } : {}),
    },
  });
  return {
    id: updated.id,
    name: updated.name,
    plan: updated.plan,
    isActive: updated.isActive,
    settings: updated.settings,
  };
}

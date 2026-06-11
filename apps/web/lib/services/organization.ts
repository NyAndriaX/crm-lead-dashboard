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

export type OrgBranding = {
  siteName?: string;
  siteIconUrl?: string | null;
};

export type OrgInfo = {
  id: string;
  name: string;
  plan: string;
  isActive: boolean;
  settings: unknown;
  branding: OrgBranding;
};

function parseBranding(settings: unknown): OrgBranding {
  if (!settings || typeof settings !== "object") return {};
  const s = settings as Record<string, unknown>;
  const branding = (s.branding ?? {}) as Record<string, unknown>;
  return {
    siteName: typeof branding.siteName === "string" ? branding.siteName : undefined,
    siteIconUrl: typeof branding.siteIconUrl === "string" ? branding.siteIconUrl : undefined,
  };
}

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
      branding: parseBranding(existing.settings),
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
    branding: parseBranding(created.settings),
  };
}

export async function updateOrganization(input: {
  name?: string;
  plan?: string;
  branding?: OrgBranding;
}): Promise<OrgInfo> {
  await currentOrganization(); // garantit l'existence
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: DEFAULT_ORG_ID } });
  const prevSettings = (current.settings && typeof current.settings === "object"
    ? current.settings
    : {}) as Record<string, unknown>;
  const nextSettings = input.branding !== undefined
    ? { ...prevSettings, branding: input.branding }
    : prevSettings;

  const updated = await prisma.organization.update({
    where: { id: DEFAULT_ORG_ID },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.plan !== undefined ? { plan: input.plan } : {}),
      ...(input.branding !== undefined ? { settings: nextSettings as object } : {}),
    },
  });
  return {
    id: updated.id,
    name: updated.name,
    plan: updated.plan,
    isActive: updated.isActive,
    settings: updated.settings,
    branding: parseBranding(updated.settings),
  };
}

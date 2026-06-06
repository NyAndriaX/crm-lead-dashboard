import { prisma } from "@crm/db";

export interface TemplateInput {
  name: string;
  category?: string;
  subject: string;
  bodyHtml: string;
  variables?: string[];
  isPublic?: boolean;
  includeUnsubscribeLink?: boolean;
}

export interface TemplateUpdateInput {
  name?: string;
  category?: string | null;
  subject?: string;
  bodyHtml?: string;
  variables?: string[];
  isPublic?: boolean;
  includeUnsubscribeLink?: boolean;
}

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  category: true,
  subject: true,
  bodyHtml: true,
  variables: true,
  isPreset: true,
  isPublic: true,
  includeUnsubscribeLink: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listTemplates() {
  return prisma.template.findMany({ orderBy: { updatedAt: "desc" }, select: TEMPLATE_SELECT });
}

export async function getTemplate(id: string) {
  return prisma.template.findUnique({ where: { id }, select: TEMPLATE_SELECT });
}

export async function createTemplate(input: TemplateInput) {
  return prisma.template.create({
    data: {
      name: input.name,
      category: input.category ?? null,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      variables: input.variables ?? [],
      isPreset: false,
      isPublic: input.isPublic ?? true,
      includeUnsubscribeLink: input.includeUnsubscribeLink ?? true,
    },
    select: TEMPLATE_SELECT,
  });
}

export async function updateTemplate(id: string, input: TemplateUpdateInput) {
  return prisma.template.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.bodyHtml !== undefined ? { bodyHtml: input.bodyHtml } : {}),
      ...(input.variables !== undefined ? { variables: input.variables } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.includeUnsubscribeLink !== undefined ? { includeUnsubscribeLink: input.includeUnsubscribeLink } : {}),
    },
    select: TEMPLATE_SELECT,
  });
}

export async function deleteTemplate(id: string) {
  await prisma.template.delete({ where: { id } });
}

/** Duplique un template (y compris un préréglé catalogue) en modèle éditable non-préréglé. */
export async function duplicateTemplate(sourceId: string) {
  const src = await prisma.template.findUnique({ where: { id: sourceId } });
  if (!src) return null;
  const prefix = "Copie — ";
  const maxName = 150;
  const raw = `${prefix}${src.name}`;
  const name = raw.length <= maxName ? raw : `${raw.slice(0, maxName - 1)}…`;
  return prisma.template.create({
    data: {
      name,
      category: src.category,
      subject: src.subject,
      bodyHtml: src.bodyHtml,
      variables: Array.isArray(src.variables) ? [...src.variables] : [],
      isPreset: false,
      isPublic: true,
      includeUnsubscribeLink: src.includeUnsubscribeLink,
    },
    select: TEMPLATE_SELECT,
  });
}

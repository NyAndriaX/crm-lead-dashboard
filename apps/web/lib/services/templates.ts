import { prisma, strictCreatorWhere, type DataScope } from "@crm/db";
import { ApiError } from "../api";

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

export async function listTemplates(scope: DataScope) {
  return prisma.template.findMany({
    where: strictCreatorWhere(scope.userId),
    orderBy: { updatedAt: "desc" },
    select: TEMPLATE_SELECT,
  });
}

export async function getTemplate(id: string, scope: DataScope) {
  const row = await prisma.template.findFirst({
    where: { id, ...strictCreatorWhere(scope.userId) },
    select: TEMPLATE_SELECT,
  });
  if (!row) throw new ApiError(404, "Template introuvable", "not_found");
  return row;
}

export async function createTemplate(input: TemplateInput, scope: DataScope) {
  return prisma.template.create({
    data: {
      name: input.name,
      createdById: scope.userId,
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

export async function updateTemplate(id: string, input: TemplateUpdateInput, scope: DataScope) {
  await getTemplate(id, scope);
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

export async function deleteTemplate(id: string, scope: DataScope) {
  await getTemplate(id, scope);
  await prisma.template.delete({ where: { id } });
}

/** Duplique un template en modèle éditable non-préréglé. */
export async function duplicateTemplate(sourceId: string, scope: DataScope) {
  const src = await getTemplate(sourceId, scope);
  const prefix = "Copie — ";
  const maxName = 150;
  const raw = `${prefix}${src.name}`;
  const name = raw.length <= maxName ? raw : `${raw.slice(0, maxName - 1)}…`;
  return prisma.template.create({
    data: {
      name,
      createdById: scope.userId,
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

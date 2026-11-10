import { asStringArray, prisma } from "@crm/db";

export interface TemplateBlockInput {
  name: string;
  category: string;
  description?: string;
  htmlContent: string;
  variables?: string[];
  isPublic?: boolean;
}

export interface TemplateBlockUpdateInput {
  name?: string;
  category?: string;
  description?: string | null;
  htmlContent?: string;
  variables?: string[];
  isPublic?: boolean;
}

export async function listTemplateBlocks(userId?: string) {
  return prisma.templateBlock.findMany({
    where: userId ? {
      OR: [
        { isPublic: true },
        { createdById: userId }
      ]
    } : { isPublic: true },
    include: {
      createdBy: {
        select: { name: true }
      }
    },
    orderBy: [
      { category: "asc" },
      { name: "asc" }
    ],
  });
}

export async function getTemplateBlock(id: string) {
  return prisma.templateBlock.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { name: true }
      }
    },
  });
}

export async function createTemplateBlock(input: TemplateBlockInput, createdById?: string) {
  return prisma.templateBlock.create({
    data: {
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      htmlContent: input.htmlContent,
      variables: input.variables ?? [],
      isPublic: input.isPublic ?? true,
      createdById,
    },
    include: {
      createdBy: {
        select: { name: true }
      }
    },
  });
}

export async function updateTemplateBlock(id: string, input: TemplateBlockUpdateInput) {
  return prisma.templateBlock.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.htmlContent !== undefined ? { htmlContent: input.htmlContent } : {}),
      ...(input.variables !== undefined ? { variables: input.variables } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    },
    include: {
      createdBy: {
        select: { name: true }
      }
    },
  });
}

export async function deleteTemplateBlock(id: string) {
  await prisma.templateBlock.delete({ where: { id } });
}

/** Duplique un bloc de contenu (même catégorie, copie indépendante). */
export async function duplicateTemplateBlock(sourceId: string, createdById?: string) {
  const src = await prisma.templateBlock.findUnique({ where: { id: sourceId } });
  if (!src) return null;
  const prefix = "Copie — ";
  const maxName = 150;
  const raw = `${prefix}${src.name}`;
  const name = raw.length <= maxName ? raw : `${raw.slice(0, maxName - 1)}…`;
  return prisma.templateBlock.create({
    data: {
      name,
      category: src.category,
      description: src.description,
      htmlContent: src.htmlContent,
      variables: asStringArray(src.variables),
      isPublic: src.isPublic,
      createdById,
    },
    include: {
      createdBy: {
        select: { name: true },
      },
    },
  });
}

export const TEMPLATE_BLOCK_CATEGORIES = [
  { value: 'header', label: 'En-tête' },
  { value: 'content', label: 'Contenu' },
  { value: 'cta', label: 'Call-to-action' },
  { value: 'footer', label: 'Pied de page' },
  { value: 'signature', label: 'Signature' },
  { value: 'divider', label: 'Séparateur' },
  { value: 'image', label: 'Image' },
  { value: 'social', label: 'Réseaux sociaux' },
] as const;

export type TemplateBlockCategory = typeof TEMPLATE_BLOCK_CATEGORIES[number]['value'];

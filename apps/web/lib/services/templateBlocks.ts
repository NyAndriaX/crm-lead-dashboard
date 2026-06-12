import { prisma } from "@crm/db";
import { ApiError } from "@/lib/api";

async function assertBlockAccess(id: string, userId?: string) {
  const block = await prisma.templateBlock.findUnique({
    where: { id },
    select: { id: true, isPublic: true, createdById: true },
  });
  if (!block) throw new ApiError(404, "Bloc introuvable", "not_found");
  if (!block.isPublic && block.createdById !== userId) {
    throw new ApiError(403, "Accès refusé", "forbidden");
  }
  return block;
}

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

export async function getTemplateBlock(id: string, userId?: string) {
  await assertBlockAccess(id, userId);
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

export async function updateTemplateBlock(id: string, input: TemplateBlockUpdateInput, userId?: string) {
  const block = await assertBlockAccess(id, userId);
  if (!block.createdById || block.createdById !== userId) {
    throw new ApiError(403, "Seul le créateur peut modifier ce bloc", "forbidden");
  }
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

export async function deleteTemplateBlock(id: string, userId?: string) {
  const block = await assertBlockAccess(id, userId);
  if (!block.createdById || block.createdById !== userId) {
    throw new ApiError(403, "Seul le créateur peut supprimer ce bloc", "forbidden");
  }
  await prisma.templateBlock.delete({ where: { id } });
}

/** Duplique un bloc de contenu (même catégorie, copie indépendante). */
export async function duplicateTemplateBlock(sourceId: string, createdById?: string) {
  await assertBlockAccess(sourceId, createdById);
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
      variables: Array.isArray(src.variables) ? [...src.variables] : [],
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

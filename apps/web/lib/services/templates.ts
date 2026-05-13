import { prisma } from "@crm/db";

export interface TemplateInput {
  name: string;
  category?: string;
  subject: string;
  bodyHtml: string;
  variables?: string[];
}

export interface TemplateUpdateInput {
  name?: string;
  category?: string | null;
  subject?: string;
  bodyHtml?: string;
  variables?: string[];
}

export async function listTemplates() {
  return prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      category: true,
      subject: true,
      bodyHtml: true,
      variables: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getTemplate(id: string) {
  return prisma.template.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      category: true,
      subject: true,
      bodyHtml: true,
      variables: true,
      createdAt: true,
      updatedAt: true,
    },
  });
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
    },
    select: {
      id: true,
      name: true,
      category: true,
      subject: true,
      bodyHtml: true,
      variables: true,
      createdAt: true,
      updatedAt: true,
    },
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
    },
    select: {
      id: true,
      name: true,
      category: true,
      subject: true,
      bodyHtml: true,
      variables: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteTemplate(id: string) {
  await prisma.template.delete({ where: { id } });
}

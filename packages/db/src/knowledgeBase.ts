/**
 * Bases de connaissances partagées — documents Markdown réutilisables
 * dans campagnes, séquences et auto-réponses.
 */
import { prisma } from "./client";
import type { OpenAiMessage } from "./openaiChat";
import { strictOwnerWhere, type DataScope } from "./dataScope";

const MAX_CONTEXT_CHARS = 12_000;

export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description: string | null;
  contentMd: string;
  createdAt: string;
  updatedAt: string;
};

function toItem(row: {
  id: string;
  name: string;
  description: string | null;
  contentMd: string;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeBaseItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    contentMd: row.contentMd,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listKnowledgeBases(scope: DataScope): Promise<KnowledgeBaseItem[]> {
  const rows = await prisma.knowledgeBase.findMany({
    where: strictOwnerWhere(scope.userId),
    orderBy: { name: "asc" },
  });
  return rows.map(toItem);
}

export async function getKnowledgeBase(id: string, scope: DataScope): Promise<KnowledgeBaseItem | null> {
  const row = await prisma.knowledgeBase.findFirst({
    where: { id, ...strictOwnerWhere(scope.userId) },
  });
  return row ? toItem(row) : null;
}

export async function createKnowledgeBase(
  input: {
    name: string;
    description?: string | null;
    contentMd: string;
  },
  scope: DataScope,
): Promise<KnowledgeBaseItem> {
  const row = await prisma.knowledgeBase.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      contentMd: input.contentMd.trim(),
      ownerUserId: scope.userId,
    },
  });
  return toItem(row);
}

export async function updateKnowledgeBase(
  id: string,
  input: { name?: string; description?: string | null; contentMd?: string },
  scope: DataScope,
): Promise<KnowledgeBaseItem> {
  const existing = await getKnowledgeBase(id, scope);
  if (!existing) throw new Error("Base de connaissances introuvable");
  const row = await prisma.knowledgeBase.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.contentMd !== undefined ? { contentMd: input.contentMd.trim() } : {}),
    },
  });
  return toItem(row);
}

export async function deleteKnowledgeBase(id: string, scope: DataScope): Promise<void> {
  const existing = await getKnowledgeBase(id, scope);
  if (!existing) throw new Error("Base de connaissances introuvable");
  await prisma.knowledgeBase.delete({ where: { id } });
}

/** Contexte Markdown pour injection IA. */
export async function getKnowledgeBaseContext(
  id: string | null | undefined,
  maxChars = MAX_CONTEXT_CHARS,
): Promise<string | null> {
  if (!id) return null;
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id },
    select: { name: true, description: true, contentMd: true },
  });
  if (!kb) return null;
  const parts: string[] = [`### ${kb.name}`];
  if (kb.description?.trim()) parts.push(kb.description.trim());
  if (kb.contentMd.trim()) parts.push(kb.contentMd.trim());
  const joined = parts.join("\n\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

export async function injectKnowledgeBaseIntoMessages(
  knowledgeBaseId: string | null | undefined,
  messages: OpenAiMessage[],
): Promise<OpenAiMessage[]> {
  const knowledge = await getKnowledgeBaseContext(knowledgeBaseId);
  if (!knowledge) return messages;

  const block =
    "\n\n--- Base de connaissances sélectionnée ---\n" +
    "Utilise ces informations pour personnaliser tes réponses.\n\n" +
    knowledge;

  const idx = messages.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    return messages.map((m, i) =>
      i === idx ? { role: "system" as const, content: m.content + block } : m,
    );
  }
  return [{ role: "system" as const, content: block.trim() }, ...messages];
}

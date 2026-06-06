/**
 * Base de connaissances IA par utilisateur — texte libre + fichiers Markdown.
 * Injectée dans les prompts (campagnes, auto-répondeur, etc.).
 */
import { prisma } from "./client";

export type AiKnowledgeDoc = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};

const MAX_CONTEXT_CHARS = 12_000;
const MAX_DOC_CHARS = 8_000;
const MAX_DOCS = 10;

export function parseKnowledgeDocs(raw: unknown): AiKnowledgeDoc[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Partial<AiKnowledgeDoc>;
      if (!o.id || !o.name || typeof o.content !== "string") return null;
      return {
        id: o.id,
        name: o.name.slice(0, 200),
        content: o.content.slice(0, MAX_DOC_CHARS),
        createdAt: o.createdAt ?? new Date().toISOString(),
      };
    })
    .filter(Boolean) as AiKnowledgeDoc[];
}

export function normalizeKnowledgeDocs(docs: AiKnowledgeDoc[]): AiKnowledgeDoc[] {
  return docs.slice(0, MAX_DOCS).map((d) => ({
    id: d.id,
    name: d.name.trim().slice(0, 200),
    content: d.content.trim().slice(0, MAX_DOC_CHARS),
    createdAt: d.createdAt,
  }));
}

/** Contexte concaténé pour injection dans les prompts système. */
export async function getOpenAiKnowledgeContext(
  userId: string,
  maxChars = MAX_CONTEXT_CHARS,
): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiKnowledgeText: true, openAiKnowledgeDocs: true },
  });
  if (!u) return null;

  const parts: string[] = [];
  const text = u.openAiKnowledgeText?.trim();
  if (text) parts.push(text.slice(0, maxChars));

  for (const doc of parseKnowledgeDocs(u.openAiKnowledgeDocs)) {
    parts.push(`### ${doc.name}\n${doc.content}`);
  }

  if (parts.length === 0) return null;
  const joined = parts.join("\n\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

export type OpenAiMessage = { role: "system" | "user"; content: string };

/** Ajoute la base de connaissances au premier message système (ou en crée un). */
export async function injectKnowledgeIntoMessages(
  userId: string | null | undefined,
  messages: OpenAiMessage[],
): Promise<OpenAiMessage[]> {
  if (!userId) return messages;
  const knowledge = await getOpenAiKnowledgeContext(userId);
  if (!knowledge) return messages;

  const block =
    "\n\n--- Base de connaissances (documents et consignes internes) ---\n" +
    "Utilise ces informations pour personnaliser tes réponses, respecter le ton et les offres de l'entreprise.\n\n" +
    knowledge;

  const idx = messages.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    return messages.map((m, i) =>
      i === idx ? { role: "system" as const, content: m.content + block } : m,
    );
  }
  return [{ role: "system" as const, content: block.trim() }, ...messages];
}

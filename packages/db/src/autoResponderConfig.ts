/**
 * Configuration auto-répondeur par utilisateur (assigné au lead).
 */
import { prisma } from "./client";

export type AutoResponderMode = "off" | "draft" | "auto";

export const DEFAULT_AUTO_RESPONDER_MEETING_URL = "https://calendly.com/votre-equipe/30min";

export type AutoResponderSettings = {
  mode: AutoResponderMode;
  meetingUrl: string;
};

export function normalizeAutoResponderMode(raw: string | null | undefined): AutoResponderMode {
  const m = (raw ?? "off").toLowerCase().trim();
  if (m === "auto") return "auto";
  if (m === "draft") return "draft";
  return "off";
}

export async function getAutoResponderSettings(
  userId: string | null | undefined,
): Promise<AutoResponderSettings> {
  if (!userId) {
    return { mode: "off", meetingUrl: DEFAULT_AUTO_RESPONDER_MEETING_URL };
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoResponderMode: true, autoResponderMeetingUrl: true, isActive: true },
  });
  if (!u?.isActive) {
    return { mode: "off", meetingUrl: DEFAULT_AUTO_RESPONDER_MEETING_URL };
  }
  return {
    mode: normalizeAutoResponderMode(u.autoResponderMode),
    meetingUrl: u.autoResponderMeetingUrl?.trim() || DEFAULT_AUTO_RESPONDER_MEETING_URL,
  };
}

/**
 * Résout quel utilisateur porte l'auto-répondeur pour un lead :
 * 1. commercial assigné (si mode ≠ off)
 * 2. sinon premier compte actif avec auto-répondeur auto/draft
 */
export async function resolveAutoResponderUserId(
  assignedToId: string | null | undefined,
): Promise<string | null> {
  if (assignedToId) {
    const s = await getAutoResponderSettings(assignedToId);
    if (s.mode !== "off") return assignedToId;
  }
  const candidates = await prisma.user.findMany({
    where: { isActive: true, autoResponderMode: { in: ["auto", "draft"] } },
    select: { id: true, autoResponderMode: true },
    orderBy: { createdAt: "asc" },
  });
  const auto = candidates.find((c) => normalizeAutoResponderMode(c.autoResponderMode) === "auto");
  if (auto) return auto.id;
  const draft = candidates.find((c) => normalizeAutoResponderMode(c.autoResponderMode) === "draft");
  return draft?.id ?? null;
}

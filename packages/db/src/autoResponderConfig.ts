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
    select: { autoResponderMode: true, autoResponderMeetingUrl: true },
  });
  return {
    mode: normalizeAutoResponderMode(u?.autoResponderMode),
    meetingUrl: u?.autoResponderMeetingUrl?.trim() || DEFAULT_AUTO_RESPONDER_MEETING_URL,
  };
}

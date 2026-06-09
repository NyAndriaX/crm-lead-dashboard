/**
 * Notifications Web Push (navigateur) — complément in-app + email.
 * Nécessite VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT en env.
 */
import { prisma } from "./client";

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function vapidConfigured(): boolean {
  return Boolean(
    getVapidPublicKey() &&
    process.env.VAPID_PRIVATE_KEY?.trim() &&
    process.env.VAPID_SUBJECT?.trim(),
  );
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId, endpoint: sub.endpoint } },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    update: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body?: string | null; link?: string | null },
): Promise<number> {
  if (!vapidConfigured()) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const webpush = await import("web-push");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link: payload.link ?? null,
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
      console.warn(`[web-push] échec userId=${userId}:`, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

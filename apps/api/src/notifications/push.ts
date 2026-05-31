import webpush from 'web-push';
import { db } from '../db';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'hello@orderflow.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// ─── Signal Push Notification ─────────────────────────────────────────────────

export interface PushSignalPayload {
  title:       string;
  body:        string;
  icon?:       string;
  badge?:      string;
  url:         string;
  tag:         string;
  data:        Record<string, unknown>;
}

export async function sendSignalPush(params: {
  userId:      string;
  instrument:  string;
  setupName:   string;
  triggerType: string;
  price:       number;
  signalId:    string;
}): Promise<void> {
  const { userId, instrument, setupName, triggerType, price, signalId } = params;
  const APP_URL = process.env.APP_URL ?? 'https://orderflow.app';

  const subscriptions = await db.notificationChannel.findMany({
    where: { userId, kind: 'browser_push', verified: true },
  });

  if (subscriptions.length === 0) return;

  const payload: PushSignalPayload = {
    title: `${instrument} — ${triggerType.replace(/_/g, ' ').toUpperCase()}`,
    body:  `${setupName} · Price: ${price.toLocaleString('en-US', { maximumFractionDigits: 8 })}`,
    icon:  `${APP_URL}/icon-192.png`,
    badge: `${APP_URL}/badge-72.png`,
    url:   `${APP_URL}/signals/${signalId}`,
    tag:   `signal-${signalId}`,
    data:  { signalId, instrument, price, triggerType },
  };

  await Promise.allSettled(
    subscriptions.map(sub =>
      sendToSubscription(
        sub.config as unknown as webpush.PushSubscription,
        JSON.stringify(payload),
        sub.id,
        userId,
      ),
    ),
  );
}

// ─── Internal: Send to Single Subscription ────────────────────────────────────

async function sendToSubscription(
  subscription: webpush.PushSubscription,
  payload:      string,
  channelId:    string,
  userId:       string,
): Promise<void> {
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL:     60 * 60 * 24, // 24 hours
      urgency: 'normal',
    });
  } catch (err: unknown) {
    // 410 Gone / 404 Not Found means the subscription is expired — clean it up
    if (
      err &&
      typeof err === 'object' &&
      'statusCode' in err &&
      ((err as { statusCode: number }).statusCode === 410 ||
       (err as { statusCode: number }).statusCode === 404)
    ) {
      await db.notificationChannel.delete({ where: { id: channelId } }).catch(() => {});
    } else {
      console.error(`[push] sendToSubscription failed for user ${userId}:`, err);
    }
  }
}

// ─── Daily Recap Push ─────────────────────────────────────────────────────────

export async function sendDailyRecapPush(params: {
  userId:    string;
  summary:   string;
  date:      string;
}): Promise<void> {
  const { userId, summary, date } = params;
  const APP_URL = process.env.APP_URL ?? 'https://orderflow.app';

  const subscriptions = await db.notificationChannel.findMany({
    where: { userId, kind: 'browser_push', verified: true },
  });

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: `OrderFlow Daily Recap — ${date}`,
    body:  summary.slice(0, 120),
    icon:  `${APP_URL}/icon-192.png`,
    url:   `${APP_URL}/dashboard`,
    tag:   `recap-${date}`,
  });

  await Promise.allSettled(
    subscriptions.map(sub =>
      sendToSubscription(
        sub.config as unknown as webpush.PushSubscription,
        payload,
        sub.id,
        userId,
      ),
    ),
  );
}

// ─── Test Push ────────────────────────────────────────────────────────────────

export async function sendTestPush(userId: string, channelId: string): Promise<void> {
  const APP_URL = process.env.APP_URL ?? 'https://orderflow.app';

  const channel = await db.notificationChannel.findUnique({
    where: { id: channelId, userId, kind: 'browser_push' },
  });

  if (!channel) throw new Error('Push subscription not found');

  await sendToSubscription(
    channel.config as unknown as webpush.PushSubscription,
    JSON.stringify({
      title: 'OrderFlow — Push notifications active',
      body:  'You\'ll receive signal alerts here.',
      icon:  `${APP_URL}/icon-192.png`,
      url:   `${APP_URL}/settings`,
      tag:   'test-push',
    }),
    channelId,
    userId,
  );
}

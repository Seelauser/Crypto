import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? 'mailto:ops@orderflow.app',
  process.env.VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? ''
);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

export async function sendBrowserPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload
) {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
    {
      urgency: 'high',
      TTL: 300,
    }
  );
}

export function buildSignalPushPayload(params: {
  instrument: string;
  setupName: string;
  triggerType: string;
  price: number;
  deepLink: string;
}): PushPayload {
  return {
    title: `${params.instrument} Signal`,
    body: `${params.setupName} · ${params.triggerType.replace(/_/g, ' ')} @ ${params.price}`,
    url: params.deepLink,
    icon: '/favicon.ico',
  };
}

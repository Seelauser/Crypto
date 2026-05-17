import crypto from 'crypto';

export function signWebhookPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function deliverWebhook(params: {
  url: string;
  secret: string;
  payload: Record<string, unknown>;
}) {
  const body = JSON.stringify(params.payload);
  const sig = signWebhookPayload(body, params.secret);

  const res = await fetch(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OrderFlow-Signature': sig,
      'X-OrderFlow-Timestamp': Date.now().toString(),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook delivery failed: ${res.status} ${await res.text()}`);
  }
}

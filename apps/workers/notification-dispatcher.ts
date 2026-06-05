/**
 * notification-dispatcher.ts
 *
 * Long-running Node.js worker that subscribes to the Redis `signal:triggered`
 * pub/sub channel and fans out notifications to all configured channels for a
 * user whenever a signal fires.
 *
 * Start:  node --loader ts-node/esm notification-dispatcher.ts
 *         (or: tsx notification-dispatcher.ts)
 */

import Redis from 'ioredis';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { callLlm, prewarmCache, type LlmModel } from '@orderflow/llm';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import type { SignalSnapshot } from '@orderflow/types';

// ─── Clients ──────────────────────────────────────────────────────────────────

const db = new PrismaClient({ log: ['error'] });

let _resend: Resend | null = null;
const resend = {
  get emails() {
    if (!_resend) {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
      _resend = new Resend(process.env.RESEND_API_KEY);
    }
    return _resend.emails;
  },
};

const REDIS_URL   = process.env.REDIS_URL ?? 'redis://localhost:6379';
const subscriber  = new Redis(REDIS_URL);   // dedicated connection for subscribe
const redisClient = new Redis(REDIS_URL);   // separate connection for commands

const BASE_URL = process.env.APP_URL ?? 'http://localhost:3000';
const FROM     = process.env.EMAIL_FROM ?? 'OrderFlow <notify@orderflow.app>';

// Configure web-push VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'hello@orderflow.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_AI_QUOTA  = 10;
const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN ?? '';

// ─── Inbound Redis message shape ──────────────────────────────────────────────

interface SignalTriggeredMessage {
  setup_id:   string;
  user_id:    string;
  instrument: string;
  snapshot:   SignalSnapshot;
  ts:         number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── AI explanation ───────────────────────────────────────────────────────────

async function generateExplanation(
  userId: string,
  tier: 'free' | 'premium',
  snapshot: SignalSnapshot,
  setupName: string,
): Promise<{ explanation: string; model: LlmModel; costCents: number } | null> {
  // Free tier: enforce the daily AI quota here (Redis counter + DB mirror)
  // before spending. Premium metering happens inside callLlm via the ledger.
  if (tier === 'free') {
    const today    = todayUtc();
    const redisKey = `ai:daily:${userId}:${today}`;
    const used     = await redisClient.incr(redisKey);
    if (used === 1) await redisClient.expire(redisKey, 86400);

    if (used > FREE_AI_QUOTA) {
      await redisClient.decr(redisKey);
      console.log(`[dispatcher] Free quota exhausted for user ${userId} — skipping AI`);
      return null;
    }

    // Mirror to DB
    const dateObj = new Date(`${today}T00:00:00.000Z`);
    await db.aiUsageDaily.upsert({
      where:  { userId_date: { userId, date: dateObj } },
      create: { userId, date: dateObj, callCount: 1 },
      update: { callCount: { increment: 1 } },
    });
  }

  // Route through the shared LLM router — it resolves the model (Haiku for
  // free, Sonnet for premium-with-balance, Haiku fallback when exhausted),
  // writes the `llm_calls` audit row and debits the ledger.
  try {
    const result = await callLlm({
      db,
      feature:      'signal_explanation',
      userId,
      userTier:     tier,
      maxTokens:    512,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages: (model) => [{
        role: 'user',
        content: model === 'claude-haiku-4-5-20251001'
          ? buildSignalExplanationHaikuPrompt(snapshot, setupName)
          : buildSignalExplanationPrompt(snapshot, setupName),
      }],
    });
    return { explanation: result.text, model: result.model, costCents: result.costCents };
  } catch (err) {
    console.error('[dispatcher] callLlm error:', err);
    return null;
  }
}

// ─── Notification channel helpers ─────────────────────────────────────────────

async function sendEmail(params: {
  email:       string;
  username:    string;
  instrument:  string;
  setupName:   string;
  explanation: string;
  price:       number;
  triggerType: string;
  deepLink:    string;
}): Promise<void> {
  await resend.emails.send({
    from:    FROM,
    to:      params.email,
    subject: `Signal: ${params.instrument} — ${params.setupName}`,
    html: `
      <div style="background:#0a0a0b;color:#e6e8ee;font-family:Inter,sans-serif;padding:32px;max-width:560px;margin:auto;">
        <div style="border-left:3px solid #22d3ee;padding-left:12px;margin-bottom:20px;">
          <h2 style="color:#e6e8ee;margin:0;">${params.instrument}</h2>
          <p style="color:#8a8f9b;margin:4px 0 0;">${params.setupName} · ${params.triggerType.replace(/_/g, ' ')}</p>
        </div>
        <p style="font-family:'JetBrains Mono',monospace;font-size:20px;color:#22d3ee;margin-bottom:16px;">@ ${params.price}</p>
        <p style="color:#e6e8ee;line-height:1.6;margin-bottom:20px;">${params.explanation}</p>
        <a href="${params.deepLink}" style="display:inline-block;background:#22d3ee;color:#0a0a0b;padding:10px 20px;border-radius:6px;font-weight:600;text-decoration:none;">View Signal</a>
        <p style="color:#5a5f6a;margin-top:24px;font-size:11px;">Not investment advice. OrderFlow Analytics.</p>
      </div>
    `,
  });
}

async function sendBrowserPush(params: {
  endpoint:    string;
  p256dh:      string;
  auth:        string;
  instrument:  string;
  setupName:   string;
  explanation: string;
  deepLink:    string;
}): Promise<void> {
  const pushSubscription = {
    endpoint: params.endpoint,
    keys: { p256dh: params.p256dh, auth: params.auth },
  };

  const payload = JSON.stringify({
    title: `Signal: ${params.instrument}`,
    body:  params.explanation.slice(0, 120),
    url:   params.deepLink,
    badge: '/favicon.ico',
  });

  await webpush.sendNotification(pushSubscription, payload);
}

async function sendTelegram(chatId: string, html: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                chatId,
      text:                   html,
      parse_mode:             'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram error: ${await res.text()}`);
  }
}

async function deliverWebhook(url: string, secret: string, payload: Record<string, unknown>): Promise<void> {
  const { createHmac } = await import('crypto');
  const body = JSON.stringify(payload);
  const sig  = createHmac('sha256', secret).update(body).digest('hex');

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-OrderFlow-Signature':  sig,
      'X-OrderFlow-Timestamp':  Date.now().toString(),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook error: ${res.status} ${await res.text()}`);
  }
}

// ─── Core event handler ───────────────────────────────────────────────────────

async function handleSignalTriggered(raw: string): Promise<void> {
  let msg: SignalTriggeredMessage;
  try {
    msg = JSON.parse(raw) as SignalTriggeredMessage;
  } catch {
    console.error('[dispatcher] Failed to parse message:', raw.slice(0, 200));
    return;
  }

  const { setup_id, user_id, instrument, snapshot, ts } = msg;

  console.log(`[dispatcher] Signal triggered: setup=${setup_id} instrument=${instrument}`);

  // a. Load setup + user + channels
  const [setup, user] = await Promise.all([
    db.signalSetup.findUnique({
      where: { id: setup_id },
    }),
    db.user.findUnique({
      where:   { id: user_id },
      include: { notificationChannels: true, tokenLedger: true },
    }),
  ]);

  if (!setup || !user) {
    console.error(`[dispatcher] Setup or user not found: setup=${setup_id} user=${user_id}`);
    return;
  }

  // Map the user's subscription tier (free | starter | pro) onto the billing
  // dimension callLlm understands. Only Pro draws Sonnet against the token
  // ledger; Free + Starter take the Haiku daily-quota path.
  const billingTier: 'free' | 'premium' = user.tier === 'pro' ? 'premium' : 'free';

  // b & c. Generate AI explanation. The prompt builders crash on snapshots
  // missing optional numeric fields, and Anthropic calls can fail when no
  // ANTHROPIC_API_KEY is set — catch everything so a transient AI failure
  // never prevents the event from being persisted + dispatched.
  let aiResult: Awaited<ReturnType<typeof generateExplanation>> = null;
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      aiResult = await generateExplanation(user_id, billingTier, snapshot, setup.name);
    }
  } catch (err) {
    console.error('[dispatcher] generateExplanation failed (continuing without AI):', err);
  }
  const explanation = aiResult?.explanation ?? `Signal triggered on ${instrument} — ${setup.name}.`;
  const aiModel     = aiResult?.model ?? null;
  const aiCostCents = aiResult?.costCents ?? 0;

  // d. Create SignalEvent in DB
  const event = await db.signalEvent.create({
    data: {
      setupId:       setup_id,
      userId:        user_id,
      instrument,
      snapshot:      snapshot as any,
      aiExplanation: explanation,
      aiModel,
      aiCostCents,
    },
  });

  const deepLink   = `${BASE_URL}/signals/${setup_id}/events/${event.id}`;
  const triggerType = snapshot.triggerType;
  const price       = snapshot.price;

  // e. Fan out to all configured channels
  const channelKinds = setup.notificationChannels as string[];

  for (const channel of user.notificationChannels) {
    const kind   = channel.kind as string;
    const config = channel.config as Record<string, string>;

    if (!channelKinds.includes(kind)) continue;

    // Telegram + outbound webhook are Pro-only (rework spec §12.2). Defense in
    // depth: skip them for non-Pro users even if a stale channel row exists.
    if ((kind === 'telegram' || kind === 'webhook') && user.tier !== 'pro') continue;

    try {
      if (kind === 'email') {
        // Email with retry once after 5s
        const sendAttempt = async () => sendEmail({
          email:       user.email,
          username:    user.username,
          instrument,
          setupName:   setup.name,
          explanation,
          price,
          triggerType,
          deepLink,
        });

        try {
          await sendAttempt();
        } catch (err) {
          console.warn('[dispatcher] Email failed (attempt 1), retrying in 5s:', err);
          await new Promise(r => setTimeout(r, 5000));
          try {
            await sendAttempt();
          } catch (retryErr) {
            console.error('[dispatcher] Email retry also failed:', retryErr);
          }
        }

      } else if (kind === 'browser_push') {
        await sendBrowserPush({
          endpoint:    config.endpoint,
          p256dh:      config.p256dh,
          auth:        config.auth,
          instrument,
          setupName:   setup.name,
          explanation,
          deepLink,
        });

      } else if (kind === 'telegram') {
        const html = `<b>${instrument}</b> · ${setup.name}\n<code>${triggerType.replace(/_/g, ' ').toUpperCase()}</code> @ <code>${price}</code>\n\n${explanation}\n\n<a href="${deepLink}">View Signal →</a>\n\n<i>Not investment advice · OrderFlow Analytics</i>`;
        await sendTelegram(config.chatId, html);

      } else if (kind === 'webhook') {
        await deliverWebhook(config.url, config.secret, {
          event:       'signal_trigger',
          setup_id,
          event_id:    event.id,
          instrument,
          setup_name:  setup.name,
          trigger_type: triggerType,
          price,
          explanation,
          snapshot,
          ts,
          deep_link:   deepLink,
        });
      }

      console.log(`[dispatcher] Sent ${kind} notification for ${instrument}`);
    } catch (err) {
      // Per-channel failure must not crash the worker
      console.error(`[dispatcher] ${kind} notification failed for user ${user_id}:`, err);
    }
  }

  // f. Mark event as notified
  await db.signalEvent.update({
    where: { id: event.id },
    data:  { notifiedAt: new Date() },
  });

  console.log(`[dispatcher] Completed dispatch for event=${event.id}`);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  console.log('[dispatcher] Starting notification dispatcher...');

  // C5 — pre-warm the prompt cache before traffic arrives. signal_explanation
  // is the dispatcher's only LLM feature; warming it covers free-tier (Haiku
  // forced fallback inside callLlm) and premium (Sonnet) in one pass.
  prewarmCache([
    { model: 'claude-haiku-4-5-20251001', feature: 'signal_explanation_haiku' },
    { model: 'claude-sonnet-4-6',         feature: 'signal_explanation' },
  ]).catch(err => console.warn('[dispatcher] prewarm failed (non-fatal):', err?.message ?? err));

  await subscriber.subscribe('signal:triggered', (err) => {
    if (err) {
      console.error('[dispatcher] Failed to subscribe to signal:triggered:', err);
      process.exit(1);
    }
    console.log('[dispatcher] Subscribed to signal:triggered');
  });

  subscriber.on('message', (_channel: string, message: string) => {
    // Process each message independently — errors are logged but don't block the loop
    handleSignalTriggered(message).catch(err => {
      console.error('[dispatcher] Unhandled error in handleSignalTriggered:', err);
    });
  });

  subscriber.on('error', (err) => {
    console.error('[dispatcher] Redis subscriber error:', err);
  });

  redisClient.on('error', (err) => {
    console.error('[dispatcher] Redis client error:', err);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[dispatcher] Received ${signal}, shutting down...`);
    await subscriber.quit();
    await redisClient.quit();
    await db.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('[dispatcher] Ready. Waiting for signals...');
}

main().catch(err => {
  console.error('[dispatcher] Fatal startup error:', err);
  process.exit(1);
});

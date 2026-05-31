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

import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import type { SignalSnapshot } from '@orderflow/types';

// ─── Clients ──────────────────────────────────────────────────────────────────

const db        = new PrismaClient({ log: ['error'] });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
const MODEL_HAIKU    = 'claude-haiku-4-5'  as const;
const MODEL_SONNET   = 'claude-sonnet-4-6' as const;
const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN ?? '';

const MODEL_PRICE_MAP = {
  [MODEL_HAIKU]: { input: 0.100, output: 0.500, cacheRead: 0.050, cacheWrite: 0.125 },
  [MODEL_SONNET]:{ input: 0.300, output: 1.500, cacheRead: 0.015, cacheWrite: 0.375 },
} as const;

type SupportedModel = keyof typeof MODEL_PRICE_MAP;

// ─── Inbound Redis message shape ──────────────────────────────────────────────

interface SignalTriggeredMessage {
  setup_id:   string;
  user_id:    string;
  instrument: string;
  snapshot:   SignalSnapshot;
  ts:         number;
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

interface UsageTokens {
  input_tokens:                number;
  output_tokens:               number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?:    number;
}

function computeCostCents(model: SupportedModel, usage: UsageTokens): number {
  const p          = MODEL_PRICE_MAP[model];
  const input      = (usage.input_tokens / 1000) * p.input;
  const output     = (usage.output_tokens / 1000) * p.output;
  const cacheRead  = ((usage.cache_read_input_tokens  ?? 0) / 1000) * p.cacheRead;
  const cacheWrite = ((usage.cache_creation_input_tokens ?? 0) / 1000) * p.cacheWrite;
  return Math.ceil(input + output + cacheRead + cacheWrite);
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
): Promise<{ explanation: string; model: SupportedModel; costCents: number } | null> {
  let model: SupportedModel;

  if (tier === 'free') {
    // Check daily quota
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

    model = MODEL_HAIKU;
  } else {
    // Premium: Sonnet if balance > 0, else Haiku
    const ledger = await db.tokenLedger.findUnique({
      where:  { userId },
      select: { balanceCents: true },
    });
    const balance = ledger?.balanceCents ?? 0;
    model = balance > 0 ? MODEL_SONNET : MODEL_HAIKU;
  }

  const promptText = model === MODEL_HAIKU
    ? buildSignalExplanationHaikuPrompt(snapshot, setupName)
    : buildSignalExplanationPrompt(snapshot, setupName);

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system:   [SYSTEM_PROMPT_CACHE_BLOCK],
      messages: [{ role: 'user', content: promptText }],
    });
  } catch (err) {
    console.error('[dispatcher] Anthropic error:', err);
    return null;
  }

  const rawUsage = response.usage as UsageTokens & Record<string, number>;
  const usage: UsageTokens = {
    input_tokens:                rawUsage.input_tokens,
    output_tokens:               rawUsage.output_tokens,
    cache_creation_input_tokens: rawUsage.cache_creation_input_tokens,
    cache_read_input_tokens:     rawUsage.cache_read_input_tokens,
  };

  const costCents = computeCostCents(model, usage);

  const explanation = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Write LlmCall
  await db.llmCall.create({
    data: {
      userId,
      feature:                  'signal_explanation',
      model,
      inputTokens:              usage.input_tokens,
      outputTokens:             usage.output_tokens,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens:     usage.cache_read_input_tokens ?? 0,
      costCents,
      batched: false,
    },
  });

  // Deduct from ledger (premium only)
  if (tier === 'premium' && costCents > 0) {
    await db.$executeRaw`
      UPDATE token_ledger
      SET balance_cents = balance_cents - ${costCents}
      WHERE user_id = ${userId}
    `;
  }

  return { explanation, model, costCents };
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

  const tier = user.tier as 'free' | 'premium';

  // b & c. Generate AI explanation
  const aiResult = await generateExplanation(user_id, tier, snapshot, setup.name);
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

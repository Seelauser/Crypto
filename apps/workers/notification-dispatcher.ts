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
import { PrismaClient, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import type { Logger } from 'pino';
import { callLlm, prewarmCache, type LlmModel } from '@orderflow/llm';
import {
  buildSignalExplanationPrompt,
  buildSignalExplanationHaikuPrompt,
  SYSTEM_PROMPT_CACHE_BLOCK,
} from '@orderflow/llm-prompts';
import type { SignalSnapshot } from '@orderflow/types';
import { createWorkerLogger, newCorrelationId } from './lib/logger';

const log = createWorkerLogger('dispatcher');

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

// ─── LLM Circuit Breaker ──────────────────────────────────────────────────────
// After CB_MAX_FAILURES consecutive callLlm errors the breaker trips and AI
// calls are skipped for CB_COOLDOWN_MS. This prevents hammering Anthropic when
// the key is invalid / the account has zero credits — the behaviour seen in
// logs from 2026-06-03 onward where every single call errored.
// After the cooldown the breaker resets to half-open and allows one probe call.

const CB_MAX_FAILURES = 5;
const CB_COOLDOWN_MS  = 60 * 60 * 1000; // 1 hour

let cbFailures  = 0;
let cbTrippedAt = 0; // epoch ms; 0 = not tripped

function cbIsOpen(): boolean {
  if (cbTrippedAt === 0) return false;
  if (Date.now() - cbTrippedAt >= CB_COOLDOWN_MS) {
    // Cooldown expired — reset so the next call is a half-open probe
    cbFailures  = 0;
    cbTrippedAt = 0;
    log.info('LLM circuit breaker cooldown expired — half-open probe next');
    return false;
  }
  return true;
}

function cbRecordSuccess(): void {
  if (cbFailures > 0 || cbTrippedAt !== 0) {
    log.info({ prevFailures: cbFailures }, 'LLM circuit breaker reset after success');
  }
  cbFailures  = 0;
  cbTrippedAt = 0;
}

function cbRecordFailure(): void {
  cbFailures++;
  if (cbFailures >= CB_MAX_FAILURES && cbTrippedAt === 0) {
    cbTrippedAt = Date.now();
    log.error(
      { failures: cbFailures, cooldownMin: CB_COOLDOWN_MS / 60_000 },
      'LLM circuit breaker TRIPPED — pausing AI calls for 1 hour. ' +
      'Check Anthropic key validity and account credit balance.',
    );
  }
}

// ─── Explanation Dedup Cache ──────────────────────────────────────────────────
// When multiple signals fire on the same instrument+triggerType within the same
// 5-minute window (common at midnight when all setups re-evaluate together),
// re-use the first explanation instead of making N identical LLM calls.
// TTL is 10 minutes — longer than the 5-min bucket so the last call in a bucket
// can still hit the cache.

const DEDUP_TTL_SEC = 600; // 10 minutes

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
  logger: Logger,
): Promise<{ explanation: string; model: LlmModel; costCents: number } | null> {

  // ── Circuit breaker ────────────────────────────────────────────────────────
  // Skip if too many consecutive Anthropic errors (e.g. zero credits, bad key).
  if (cbIsOpen()) {
    const resetAt = new Date(cbTrippedAt + CB_COOLDOWN_MS).toISOString();
    logger.warn({ resetAt }, 'LLM circuit breaker open — skipping AI explanation');
    return null;
  }

  // ── Dedup cache ────────────────────────────────────────────────────────────
  // Multiple signals for the same instrument+triggerType in the same 5-minute
  // window all get the same explanation without extra API calls.
  const triggerKey = snapshot.triggerType ?? 'unknown';
  const timeBucket = Math.floor(Date.now() / 300_000); // 5-min epoch bucket
  const dedupKey   = `llm:explain:dedup:${snapshot.instrument}:${triggerKey}:${timeBucket}`;

  const cachedRaw = await redisClient.get(dedupKey).catch(() => null);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as { explanation: string; model: LlmModel };
      logger.info({ dedupKey }, 'LLM explanation dedup hit — reusing cached result');
      return { explanation: cached.explanation, model: cached.model, costCents: 0 };
    } catch {
      // Corrupt entry — fall through to a fresh call
    }
  }

  // ── Free tier quota ────────────────────────────────────────────────────────
  // Enforce daily Haiku quota before spending. Premium metering happens inside
  // callLlm via the token ledger.
  // quotaKey is kept so we can roll back on API error.
  let quotaKey: string | null = null;
  if (tier === 'free') {
    const today = todayUtc();
    quotaKey    = `ai:daily:${userId}:${today}`;
    const used  = await redisClient.incr(quotaKey);
    if (used === 1) await redisClient.expire(quotaKey, 86400);

    if (used > FREE_AI_QUOTA) {
      await redisClient.decr(quotaKey);
      logger.info({ userId, quota: FREE_AI_QUOTA }, 'free quota exhausted — skipping AI');
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

  // ── LLM call ───────────────────────────────────────────────────────────────
  // Route through the shared LLM router — it resolves the model (Haiku for
  // free, Sonnet for premium-with-balance, Haiku fallback when exhausted),
  // writes the `llm_calls` audit row and debits the ledger.
  try {
    const result = await callLlm({
      db,
      feature:      'signal_explanation',
      userId,
      userTier:     tier,
      maxTokens:    256,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages: (model) => [{
        role: 'user',
        content: model === 'claude-haiku-4-5-20251001'
          ? buildSignalExplanationHaikuPrompt(snapshot, setupName)
          : buildSignalExplanationPrompt(snapshot, setupName),
      }],
    });

    cbRecordSuccess();

    // Populate dedup cache for this instrument+trigger window
    await redisClient
      .setex(dedupKey, DEDUP_TTL_SEC, JSON.stringify({ explanation: result.text, model: result.model }))
      .catch(() => {});

    return { explanation: result.text, model: result.model, costCents: result.costCents };
  } catch (err) {
    cbRecordFailure();
    // Roll back the quota slot so the user doesn't lose a daily credit on a
    // transient API error (zero credits, network issue, rate-limit, etc.).
    if (quotaKey) await redisClient.decr(quotaKey).catch(() => {});
    logger.error({ err: (err as Error)?.message ?? String(err) }, 'callLlm error');
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
  const cid = newCorrelationId();
  const evLog = log.child({ cid });

  let msg: SignalTriggeredMessage;
  try {
    msg = JSON.parse(raw) as SignalTriggeredMessage;
  } catch {
    evLog.error({ rawPreview: raw.slice(0, 200) }, 'failed to parse message');
    return;
  }

  const { setup_id, user_id, instrument, snapshot, ts } = msg;
  const ctxLog = evLog.child({ setupId: setup_id, userId: user_id, instrument });
  ctxLog.info('signal triggered');

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
    ctxLog.error({ setupFound: !!setup, userFound: !!user }, 'setup or user not found');
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
      aiResult = await generateExplanation(user_id, billingTier, snapshot, setup.name, ctxLog);
    }
  } catch (err) {
    ctxLog.error({ err: (err as Error)?.message ?? String(err) }, 'generateExplanation failed — continuing without AI');
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
      snapshot:      snapshot as unknown as Prisma.InputJsonObject,
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
          ctxLog.warn({ err: (err as Error)?.message ?? String(err) }, 'email attempt 1 failed — retrying in 5s');
          await new Promise(r => setTimeout(r, 5000));
          try {
            await sendAttempt();
          } catch (retryErr) {
            ctxLog.error({ err: (retryErr as Error)?.message ?? String(retryErr) }, 'email retry also failed');
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

      ctxLog.info({ channel: kind }, 'notification sent');
    } catch (err) {
      // Per-channel failure must not crash the worker
      ctxLog.error({ channel: kind, err: (err as Error)?.message ?? String(err) }, 'notification failed');
    }
  }

  // f. Mark event as notified
  await db.signalEvent.update({
    where: { id: event.id },
    data:  { notifiedAt: new Date() },
  });

  ctxLog.info({ eventId: event.id }, 'dispatch complete');
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  log.info('starting notification dispatcher');

  // C5 — boot-time pre-warm: writes the cache so the first real signal call
  // reads from it instead of paying the cache-write inline.
  const PREWARM_TARGETS = [
    { model: 'claude-haiku-4-5-20251001' as const, feature: 'signal_explanation_haiku' as const },
    { model: 'claude-sonnet-4-6'         as const, feature: 'signal_explanation'        as const },
  ];
  prewarmCache(PREWARM_TARGETS)
    .catch(err => log.warn({ err: err?.message ?? String(err) }, 'prewarm failed (non-fatal)'));

  // Periodic re-warm every 4 minutes so the ephemeral cache (5-min TTL) never
  // expires during low-traffic windows. Cost: ~$0.0006/warm per model pair.
  const rewarmTimer = setInterval(() => {
    prewarmCache(PREWARM_TARGETS)
      .catch(err => log.warn({ err: err?.message ?? String(err) }, 'periodic re-warm failed (non-fatal)'));
  }, 4 * 60 * 1000);
  rewarmTimer.unref(); // don't block process exit on shutdown

  await subscriber.subscribe('signal:triggered', (err) => {
    if (err) {
      log.fatal({ err: err.message }, 'failed to subscribe to signal:triggered');
      process.exit(1);
    }
    log.info('subscribed to signal:triggered');
  });

  subscriber.on('message', (_channel: string, message: string) => {
    // Process each message independently — errors are logged but don't block the loop
    handleSignalTriggered(message).catch(err => {
      log.error({ err: err?.message ?? String(err) }, 'unhandled error in handleSignalTriggered');
    });
  });

  subscriber.on('error', (err) => {
    log.error({ err: err?.message ?? String(err) }, 'redis subscriber error');
  });

  redisClient.on('error', (err) => {
    log.error({ err: err?.message ?? String(err) }, 'redis client error');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    await subscriber.quit();
    await redisClient.quit();
    await db.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.info('ready — waiting for signals');
}

main().catch(err => {
  log.fatal({ err: err?.message ?? String(err) }, 'fatal startup error');
  process.exit(1);
});

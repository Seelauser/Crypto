/**
 * daily-recap.ts
 *
 * Scheduled script that generates AI-powered daily order flow recaps for all
 * premium users with active signal setups.
 *
 * Meant to be triggered via cron:
 *   - Crypto: 00:00 UTC
 *   - Stocks/Futures: 16:30 ET (21:30 UTC)
 *
 * Usage:  tsx daily-recap.ts
 *         node --loader ts-node/esm daily-recap.ts
 */

import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { buildDailyRecapPrompt, SYSTEM_PROMPT_CACHE_BLOCK } from '@orderflow/llm-prompts';
import { callLlm } from '@orderflow/llm';
import type { SignalSnapshot, SweepEvent } from '@orderflow/types';

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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const FROM      = process.env.EMAIL_FROM ?? 'OrderFlow <notify@orderflow.app>';
const BASE_URL  = process.env.APP_URL ?? 'http://localhost:3000';

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    timeZone: 'UTC',
  });
}

// ─── Per-user recap generation ────────────────────────────────────────────────

interface RecapStats {
  userId:    string;
  costCents: number;
  success:   boolean;
}

async function generateUserRecap(
  user: {
    id:       string;
    email:    string;
    username: string;
    notificationChannels: Array<{ kind: string; config: Record<string, string> }>;
  },
  date: string,
): Promise<RecapStats> {
  const userId = user.id;

  // a. Load last 24h signal events
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events = await db.signalEvent.findMany({
    where:   { userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take:    100,
    include: { setup: { select: { name: true } } },
  });

  // Load user's watchlists
  const watchlists = await db.watchlist.findMany({
    where:  { userId },
    select: { instruments: true },
  });
  const watchlistInstruments = Array.from(
    new Set(watchlists.flatMap(w => w.instruments as string[])),
  );

  // b. Extract top 3 regime changes from event snapshots
  interface RegimeChange { instrument: string; from: string; to: string; ts: number }
  const regimeChanges: RegimeChange[] = [];

  for (const event of events) {
    const snap = event.snapshot as unknown as SignalSnapshot;
    if (snap?.regime && snap.ts) {
      regimeChanges.push({
        instrument: event.instrument,
        from:       'unknown',
        to:         snap.regime,
        ts:         snap.ts,
      });
      if (regimeChanges.length >= 3) break;
    }
  }

  // c. Extract top 3 sweeps from event snapshots
  interface SweepSummary { instrument: string; side: string; notionalUsd: number; ts: number }
  const sweeps: SweepSummary[] = [];

  for (const event of events) {
    const snap = event.snapshot as unknown as SignalSnapshot;
    if (snap?.recentSweep) {
      const s = snap.recentSweep as SweepEvent;
      sweeps.push({
        instrument:  event.instrument,
        side:        s.side,
        notionalUsd: s.notionalUsd,
        ts:          s.ts,
      });
    }
  }
  sweeps.sort((a, b) => b.notionalUsd - a.notionalUsd);

  // Build top signals list
  const topSignals = events.slice(0, 5).map(e => {
    const snap = e.snapshot as unknown as SignalSnapshot;
    return {
      instrument:  e.instrument,
      triggerType: snap?.triggerType ?? 'unknown',
      price:       snap?.price ?? 0,
      cvd:         snap?.cvd ?? 0,
      ts:          e.createdAt.getTime(),
    };
  });

  // d. Call Claude Opus with buildDailyRecapPrompt
  const promptText = buildDailyRecapPrompt({
    date,
    watchlistInstruments: watchlistInstruments.length > 0 ? watchlistInstruments : ['N/A'],
    topSignals,
    regimeChanges,
    topSweeps: sweeps.slice(0, 3),
  });

  let content: string;
  let model: string;
  let costCents: number;
  try {
    const result = await callLlm({
      db,
      feature:      'daily_recap',
      userId,
      userTier:     'premium', // only premium users reach this path (see main())
      maxTokens:    1024,
      systemBlocks: [SYSTEM_PROMPT_CACHE_BLOCK],
      messages:     [{ role: 'user', content: promptText }],
    });
    content   = result.text;
    model     = result.model;
    costCents = result.costCents;
  } catch (err) {
    console.error(`[daily-recap] callLlm error for user ${userId}:`, err);
    return { userId, costCents: 0, success: false };
  }

  // f. Store DailyRecap record (llm_calls + ledger debit happen inside callLlm)
  const recap = await db.dailyRecap.create({
    data: {
      userId,
      content,
      model,
      costCents,
    },
  });

  // g. Deliver via email + Telegram if connected
  const formattedDate = formatDate(date);

  for (const channel of user.notificationChannels) {
    const kind   = channel.kind;
    const config = channel.config;

    try {
      if (kind === 'email') {
        await resend.emails.send({
          from:    FROM,
          to:      user.email,
          subject: `Daily Flow Recap — ${formattedDate}`,
          html: `
            <div style="background:#0a0a0b;color:#e6e8ee;font-family:Inter,sans-serif;padding:32px;max-width:600px;margin:auto;">
              <h2 style="color:#22d3ee;margin-bottom:4px;">Daily Flow Recap</h2>
              <p style="color:#5a5f6a;font-size:12px;margin-bottom:20px;">${formattedDate}</p>
              <div style="white-space:pre-wrap;line-height:1.7;color:#e6e8ee;">${content}</div>
              <a href="${BASE_URL}/dashboard" style="display:inline-block;margin-top:24px;background:#13141a;border:1px solid #1f2128;color:#e6e8ee;padding:10px 20px;border-radius:6px;text-decoration:none;">Open Dashboard</a>
              <p style="color:#5a5f6a;margin-top:24px;font-size:11px;">Not investment advice. OrderFlow Analytics.</p>
            </div>
          `,
        });
      } else if (kind === 'telegram' && config.chatId && BOT_TOKEN) {
        const telegramMsg = `<b>Daily Flow Recap</b>\n<i>${formattedDate}</i>\n\n${content.slice(0, 3800)}\n\n<a href="${BASE_URL}/dashboard">Open Dashboard →</a>\n\n<i>Not investment advice · OrderFlow Analytics</i>`;

        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id:                config.chatId,
            text:                   telegramMsg,
            parse_mode:             'HTML',
            disable_web_page_preview: true,
          }),
        });
        if (!res.ok) {
          throw new Error(`Telegram error: ${await res.text()}`);
        }
      }

      console.log(`[daily-recap] Sent ${kind} recap to user ${userId}`);
    } catch (err) {
      console.error(`[daily-recap] Failed to deliver ${kind} recap to user ${userId}:`, err);
    }
  }

  // Mark as delivered
  await db.dailyRecap.update({
    where: { id: recap.id },
    data:  { deliveredAt: new Date() },
  });

  return { userId, costCents, success: true };
}

// ─── Batch processor ──────────────────────────────────────────────────────────

async function processBatch(
  users: Array<{
    id:       string;
    email:    string;
    username: string;
    notificationChannels: Array<{ kind: string; config: Record<string, string> }>;
  }>,
  date: string,
): Promise<RecapStats[]> {
  return Promise.all(users.map(user => generateUserRecap(user, date)));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const date = todayDateString();
  console.log(`[daily-recap] Starting daily recap generation for ${date}...`);

  // 1. Load all premium users with at least one active (armed) signal setup
  const premiumUsers = await db.user.findMany({
    where: {
      tier:   'premium',
      status: 'active',
      signalSetups: {
        some: { status: { in: ['armed', 'paused'] } },
      },
    },
    select: {
      id:       true,
      email:    true,
      username: true,
      notificationChannels: {
        where:  { verified: true },
        select: { kind: true, config: true },
      },
    },
  });

  console.log(`[daily-recap] Processing ${premiumUsers.length} premium user(s)...`);

  let totalProcessed = 0;
  let totalCostCents = 0;
  let totalSuccesses = 0;

  // 3. Process users in batches of BATCH_SIZE (parallel within each batch)
  for (let i = 0; i < premiumUsers.length; i += BATCH_SIZE) {
    const batch = premiumUsers.slice(i, i + BATCH_SIZE) as Array<{
      id: string;
      email: string;
      username: string;
      notificationChannels: Array<{ kind: string; config: Record<string, string> }>;
    }>;

    console.log(`[daily-recap] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (users ${i + 1}–${Math.min(i + BATCH_SIZE, premiumUsers.length)})...`);

    const results = await processBatch(batch, date);

    for (const r of results) {
      totalProcessed++;
      totalCostCents += r.costCents;
      if (r.success) totalSuccesses++;
    }
  }

  // 4. Log completion stats
  const totalCostUsd = (totalCostCents / 100).toFixed(4);
  console.log(`[daily-recap] Done.`);
  console.log(`  Users processed : ${totalProcessed}`);
  console.log(`  Successes       : ${totalSuccesses}`);
  console.log(`  Failures        : ${totalProcessed - totalSuccesses}`);
  console.log(`  Total cost      : ${totalCostCents} cents ($${totalCostUsd})`);

  await db.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[daily-recap] Fatal error:', err);
  db.$disconnect().finally(() => process.exit(1));
});

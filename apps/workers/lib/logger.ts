// Structured logger shared across Node workers (P6-1).
//
// Each worker creates a root logger with its `worker` name, and per-event
// handlers create child loggers bound to a `correlationId` so a single signal
// can be traced from dispatch → email/push/telegram in the journal.
//
// Output: NDJSON to stdout. systemd journal captures it as-is; downstream
// log aggregators (Loki, Vector, Cribl) consume the same stream without
// reformatting.

import pino, { type Logger } from 'pino';
import { randomUUID } from 'crypto';

const LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Create a worker root logger. Pass the worker name (e.g. "dispatcher",
 * "daily-recap") — it appears as the `worker` field on every line and lets
 * `journalctl | jq` filter cleanly across the workers' shared journal.
 */
export function createWorkerLogger(worker: string): Logger {
  return pino({
    level: LEVEL,
    base:  { worker },
    // ISO 8601 — Anthropic/Stripe/etc. all emit ISO; matching simplifies
    // grep'ing across vendor logs.
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Pretty-print only when stdout is a TTY (dev). systemd's pipe is not a
    // TTY so prod stays on NDJSON.
    transport: process.stdout.isTTY ? {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,worker' },
    } : undefined,
  });
}

/**
 * Mint a short correlation ID (8 hex chars from a UUID v4) — long enough to
 * be unique within a journal day, short enough to read at a glance.
 */
export function newCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

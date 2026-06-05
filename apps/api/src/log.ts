// Base pino logger for modules invoked outside the Fastify request lifecycle
// (cron-triggered helpers, BullMQ batch processors, etc.). Inside route
// handlers prefer `request.log` so each line gets a Fastify request ID.
//
// Same field shape as the worker logger (`worker` field) so journald +
// downstream collectors can union all OrderFlow logs without per-service
// transforms.

import pino from 'pino';

const LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const log = pino({
  level: LEVEL,
  base:  { worker: 'api' },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});

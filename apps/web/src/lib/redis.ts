import Redis from 'ioredis';

// Module-level singleton with hot-reload safety (Next.js dev server re-imports modules).
// Follows the same pattern as apps/web/src/lib/db.ts for Prisma.
declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

const redis =
  globalThis.__redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect:         true,
    enableOfflineQueue:  false,
    connectTimeout:      2000,
    maxRetriesPerRequest: 1,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
}

export default redis;

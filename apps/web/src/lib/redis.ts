import Redis from 'ioredis';

// Module-level singleton with hot-reload safety (Next.js dev server re-imports modules).
// Follows the same pattern as apps/web/src/lib/db.ts for Prisma.
declare global {
  var __redis: Redis | undefined;
}

const redis =
  globalThis.__redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    // lazyConnect avoids blocking module import; enableOfflineQueue lets
    // the first few commands buffer until the connection is ready instead
    // of erroring out with "Stream isn't writeable" on every fresh boot.
    // connectTimeout + maxRetriesPerRequest still bound failure under a
    // real Redis outage.
    lazyConnect:          true,
    enableOfflineQueue:   true,
    connectTimeout:       2000,
    maxRetriesPerRequest: 1,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
}

export default redis;

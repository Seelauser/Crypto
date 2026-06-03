import redis from './redis';

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Returns `{ allowed: false, retryAfterSec }` once `limit` is exceeded within
 * `windowSec`, otherwise `{ allowed: true, remaining }`. Fails open (allowed)
 * on Redis errors so a transient outage doesn't lock out user-facing endpoints
 * — the trade-off is acceptable for low-cost endpoints like signup; for harder
 * limits (billing, auth bypass) callers should layer additional checks.
 */
export async function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: true; remaining: number } | { allowed: false; retryAfterSec: number }> {
  const redisKey = `ratelimit:${bucket}:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }
    if (count > limit) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.error(`[rateLimit] redis error for ${redisKey}:`, err);
    return { allowed: true, remaining: limit };
  }
}

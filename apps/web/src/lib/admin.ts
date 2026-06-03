import type { Session } from 'next-auth';

/**
 * Admin access is gated by an env allowlist of usernames rather than a DB
 * role column — this keeps the cost-center KPI self-contained and avoids a
 * breaking schema migration ahead of the Phase 2 tier/role rework.
 *
 *   ADMIN_USERNAMES=alice,bob
 *
 * When the allowlist is empty/unset, no one is an admin (fail-closed).
 */
export function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return getAdminUsernames().includes(username.toLowerCase());
}

/**
 * Returns true when the session belongs to an allow-listed admin. The session
 * `user.name` is the username (set in the credentials provider).
 */
export function isAdminSession(session: Session | null): boolean {
  return isAdminUsername(session?.user?.name);
}

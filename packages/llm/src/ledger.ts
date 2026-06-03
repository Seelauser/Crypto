import type { PrismaClient } from '@prisma/client';

/** Reads current token balance. Returns 0 when there's no ledger row. */
export async function getBalance(db: PrismaClient, userId: string): Promise<number> {
  const ledger = await db.tokenLedger.findUnique({
    where:  { userId },
    select: { balanceCents: true },
  });
  return ledger?.balanceCents ?? 0;
}

/** Adds `cents` to the user's balance (upsert, atomic). No-op if cents ≤ 0. */
export async function creditBalance(
  db: PrismaClient,
  userId: string,
  cents: number,
): Promise<void> {
  if (cents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${cents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents + ${cents},
          updated_at    = now()
  `;
}

/** Subtracts `cents` from the user's balance (upsert, atomic). No-op if cents ≤ 0. */
export async function deductBalance(
  db: PrismaClient,
  userId: string,
  cents: number,
): Promise<void> {
  if (cents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${-cents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents - ${cents},
          updated_at    = now()
  `;
}

export async function hasBalance(
  db: PrismaClient,
  userId: string,
  minCents = 1,
): Promise<boolean> {
  return (await getBalance(db, userId)) >= minCents;
}

export async function getUsageSummary(
  db: PrismaClient,
  userId: string,
  days = 30,
): Promise<{
  totalCostCents: number;
  callsByFeature: Record<string, { calls: number; costCents: number }>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.llmCall.findMany({
    where:  { userId, createdAt: { gte: since } },
    select: { feature: true, costCents: true },
  });

  const callsByFeature: Record<string, { calls: number; costCents: number }> = {};
  let totalCostCents = 0;
  for (const r of rows) {
    totalCostCents += r.costCents;
    const entry = callsByFeature[r.feature] ?? { calls: 0, costCents: 0 };
    entry.calls     += 1;
    entry.costCents += r.costCents;
    callsByFeature[r.feature] = entry;
  }
  return { totalCostCents, callsByFeature };
}

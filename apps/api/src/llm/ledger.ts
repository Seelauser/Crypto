import { db } from '../db';

export async function getBalance(userId: string): Promise<number> {
  const ledger = await db.tokenLedger.findUnique({
    where:  { userId },
    select: { balanceCents: true },
  });
  return ledger?.balanceCents ?? 0;
}

export async function creditBalance(userId: string, cents: number): Promise<void> {
  if (cents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${cents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents + ${cents},
          updated_at    = now()
  `;
}

export async function deductBalance(userId: string, cents: number): Promise<void> {
  if (cents <= 0) return;
  await db.$executeRaw`
    INSERT INTO token_ledger (user_id, balance_cents, updated_at)
    VALUES (${userId}, ${-cents}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = token_ledger.balance_cents - ${cents},
          updated_at    = now()
  `;
}

export async function hasBalance(userId: string, minCents = 1): Promise<boolean> {
  const bal = await getBalance(userId);
  return bal >= minCents;
}

export async function getUsageSummary(userId: string, days = 30): Promise<{
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

  for (const row of rows) {
    totalCostCents += row.costCents;
    if (!callsByFeature[row.feature]) {
      callsByFeature[row.feature] = { calls: 0, costCents: 0 };
    }
    callsByFeature[row.feature].calls++;
    callsByFeature[row.feature].costCents += row.costCents;
  }

  return { totalCostCents, callsByFeature };
}

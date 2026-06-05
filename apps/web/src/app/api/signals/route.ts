import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits, buildTierGateError } from '@/lib/limits';
import { z } from 'zod';
import type { UserTier } from '@orderflow/types';

const createSignalSchema = z.object({
  name: z.string().min(1).max(100),
  market: z.enum(['crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources']),
  triggerConfig: z.object({
    type: z.enum(['cvd_cross', 'bid_ask_imbalance', 'large_print', 'sweep', 'absorption', 'iceberg', 'custom_expression']),
    params: z.record(z.union([z.number(), z.string(), z.boolean()])),
  }),
  instruments: z.array(z.string().min(1).max(20)).min(1).max(10),
  notificationChannels: z.array(z.enum(['email', 'browser_push', 'telegram', 'webhook'])).min(1),
  cooldownMinutes: z.number().min(1).max(1440).default(15),
  activeHours: z.object({ start: z.string(), end: z.string(), tz: z.string() }).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const setups = await db.signalSetup.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(setups);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = (session.user.tier ?? 'free') as UserTier;
  const limits = getLimits(tier);

  // Check setup count
  const count = await db.signalSetup.count({
    where: { userId: session.user.id, status: { not: 'archived' } },
  });
  if (count >= limits.signal_setups_max) {
    return NextResponse.json(buildTierGateError('signal_setups_max', 'signal_setup'), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const parsed = createSignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { name, market, triggerConfig, instruments, notificationChannels, cooldownMinutes, activeHours } = parsed.data;

  // Check instrument count gate
  if (instruments.length > limits.instruments_per_setup_max) {
    return NextResponse.json(buildTierGateError('instruments_per_setup_max', 'signal_instruments'), { status: 403 });
  }

  // Check notification channels
  const disallowedChannels = notificationChannels.filter(ch => !limits.notification_channels.includes(ch));
  if (disallowedChannels.length > 0) {
    return NextResponse.json(buildTierGateError('notification_channels', `notification_${disallowedChannels[0]}`), { status: 403 });
  }

  const setup = await db.signalSetup.create({
    data: {
      userId: session.user.id,
      name,
      market,
      triggerConfig,
      instruments,
      notificationChannels,
      cooldownMinutes,
      activeHours: activeHours ?? {},
      status: 'armed',
    },
  });

  return NextResponse.json(setup, { status: 201 });
}

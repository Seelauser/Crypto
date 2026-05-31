import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLimits, buildTierGateError } from '@/lib/limits';
import { z } from 'zod';
import type { UserTier } from '@orderflow/types';

// ─── Validation ───────────────────────────────────────────────────────────────

const patchSignalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['armed', 'paused', 'archived']).optional(),
  triggerConfig: z
    .object({
      type: z.enum([
        'cvd_cross',
        'bid_ask_imbalance',
        'large_print',
        'sweep',
        'absorption',
        'iceberg',
        'custom_expression',
      ]),
      params: z.record(z.union([z.number(), z.string(), z.boolean()])),
    })
    .optional(),
  instruments: z.array(z.string().min(1).max(20)).min(1).max(10).optional(),
  notificationChannels: z
    .array(z.enum(['email', 'browser_push', 'telegram', 'webhook']))
    .min(1)
    .optional(),
  cooldownMinutes: z.number().min(1).max(1440).optional(),
  activeHours: z
    .object({ start: z.string(), end: z.string(), tz: z.string() })
    .optional()
    .nullable(),
});

// ─── PATCH /api/signals/{id} ──────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const tier   = ((session.user as any).tier ?? 'free') as UserTier;
  const limits = getLimits(tier);
  const { id } = await params;

  // Ownership check
  const existing = await db.signalSetup.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = patchSignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Tier gate: instrument count
  if (data.instruments !== undefined && data.instruments.length > limits.instruments_per_setup_max) {
    return NextResponse.json(
      buildTierGateError('instruments_per_setup_max', 'signal_instruments'),
      { status: 403 },
    );
  }

  // Tier gate: notification channels
  if (data.notificationChannels !== undefined) {
    const disallowed = data.notificationChannels.filter(
      ch => !limits.notification_channels.includes(ch),
    );
    if (disallowed.length > 0) {
      return NextResponse.json(
        buildTierGateError('notification_channels', `notification_${disallowed[0]}`),
        { status: 403 },
      );
    }
  }

  const updated = await db.signalSetup.update({
    where: { id },
    data: {
      ...(data.name                 !== undefined && { name:                 data.name }),
      ...(data.status               !== undefined && { status:               data.status }),
      ...(data.triggerConfig        !== undefined && { triggerConfig:        data.triggerConfig }),
      ...(data.instruments          !== undefined && { instruments:          data.instruments }),
      ...(data.notificationChannels !== undefined && { notificationChannels: data.notificationChannels }),
      ...(data.cooldownMinutes      !== undefined && { cooldownMinutes:      data.cooldownMinutes }),
      ...(data.activeHours          !== undefined && { activeHours:          data.activeHours ?? {} }),
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/signals/{id} ─────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  // Ownership check
  const existing = await db.signalSetup.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Soft-delete: archive to preserve event history
  await db.signalSetup.update({
    where: { id },
    data:  { status: 'archived' },
  });

  return NextResponse.json({ ok: true });
}

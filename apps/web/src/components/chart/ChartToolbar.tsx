'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { UserTier } from '@orderflow/types';

const C = {
  panel:  '#0d0e12',
  border: '#1f2128',
  bg:     '#0a0a0b',
  ink:    '#e6e8ee',
  dim:    '#8a8f9b',
  long:   '#22d3ee',
  warn:   '#fbbf24',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

export type ChartLayerKey =
  | 'placement'
  | 'footprint'
  | 'orderbook'
  | 'volume_profile'
  | 'derivatives';

export interface ChartLayerState {
  placement:      boolean;
  footprint:      boolean;
  orderbook:      boolean;
  volume_profile: boolean;
  derivatives:    boolean;
}

export const DEFAULT_LAYERS: ChartLayerState = {
  placement:      true,
  footprint:      false,
  orderbook:      false,
  volume_profile: false,
  derivatives:    false,
};

interface LayerSpec {
  key:    ChartLayerKey;
  label:  string;
  /** Min tier required to enable this layer. */
  tier:   'free' | 'starter' | 'pro';
  hint:   string;
}

const LAYERS: LayerSpec[] = [
  { key: 'placement',      label: 'Placement',    tier: 'starter', hint: 'Long/short markers with confidence' },
  { key: 'footprint',      label: 'Footprint',    tier: 'pro',     hint: 'Per-bar bid/ask volume by price' },
  { key: 'orderbook',      label: 'Depth',        tier: 'pro',     hint: 'L2 book heatmap overlay' },
  { key: 'volume_profile', label: 'Vol Profile',  tier: 'starter', hint: 'POC / VAH / VAL bands' },
  { key: 'derivatives',    label: 'Derivs',       tier: 'starter', hint: 'Funding + OI rails' },
];

interface Props {
  tier:    UserTier;
  layers:  ChartLayerState;
  onChange: (next: ChartLayerState) => void;
}

function tierRank(t: UserTier): number {
  return t === 'pro' ? 2 : t === 'starter' ? 1 : 0;
}
function requiredRank(t: 'free' | 'starter' | 'pro'): number {
  return t === 'pro' ? 2 : t === 'starter' ? 1 : 0;
}

/**
 * Chart layer toggles for the markets page (P5-9). Each toggle is tier-gated:
 *   - allowed: regular checkbox-style chip
 *   - gated:   shows the min-tier pill and links to /billing/upgrade on click
 *
 * Server-side enforcement still belongs in each API route — this only drives
 * the client-side render state.
 */
export default function ChartToolbar({ tier, layers, onChange }: Props) {
  const [popover, setPopover] = useState<ChartLayerKey | null>(null);
  const userRank = tierRank(tier);

  const toggle = (k: ChartLayerKey) => {
    onChange({ ...layers, [k]: !layers[k] });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderBottom: `1px solid ${C.border}`,
        background: C.panel,
      }}
    >
      <span style={{ fontSize: 9, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', ...mono, marginRight: 4 }}>
        Layers
      </span>
      {LAYERS.map(L => {
        const required = requiredRank(L.tier);
        const isGated  = userRank < required;
        const isOn     = layers[L.key];
        const accent   = L.tier === 'pro' ? C.warn : C.long;

        if (isGated) {
          // Gated chip — links to upgrade.
          return (
            <Link
              key={L.key}
              href={`/billing/upgrade?from=chart_${L.key}`}
              title={`${L.hint} — requires ${L.tier}`}
              style={{
                ...mono,
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${accent}30`,
                background: `${accent}0a`,
                color: accent,
                textDecoration: 'none',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                display: 'inline-flex',
                gap: 4,
                alignItems: 'center',
              }}
            >
              <span style={{ opacity: 0.6 }}>🔒</span>
              {L.label}
              <span style={{ fontSize: 8, opacity: 0.7, letterSpacing: '0.1em' }}>
                {L.tier.toUpperCase()}
              </span>
            </Link>
          );
        }

        return (
          <button
            key={L.key}
            onClick={() => toggle(L.key)}
            onMouseEnter={() => setPopover(L.key)}
            onMouseLeave={() => setPopover(p => (p === L.key ? null : p))}
            title={L.hint}
            style={{
              ...mono,
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isOn ? accent + '50' : C.border}`,
              background: isOn ? `${accent}14` : 'transparent',
              color: isOn ? accent : C.dim,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'background 120ms, color 120ms, border-color 120ms',
            }}
          >
            <span style={{ marginRight: 4, opacity: isOn ? 1 : 0.4 }}>
              {isOn ? '●' : '○'}
            </span>
            {L.label}
          </button>
        );
      })}
      {popover && (
        <span style={{ fontSize: 10, color: C.dim, ...mono, marginLeft: 4 }}>
          — {LAYERS.find(L => L.key === popover)?.hint}
        </span>
      )}
    </div>
  );
}

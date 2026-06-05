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
  { key: 'placement',      label: 'Placement',    tier: 'starter', hint: 'AI-detected long/short order placements' },
  { key: 'footprint',      label: 'Footprint',    tier: 'pro',     hint: 'Order flow: bid/ask volume per price level' },
  { key: 'orderbook',      label: 'Depth',        tier: 'pro',     hint: 'L2 order book depth heatmap' },
  { key: 'volume_profile', label: 'Vol Profile',  tier: 'starter', hint: 'Volume concentration: POC, VAH, VAL' },
  { key: 'derivatives',    label: 'Derivs',       tier: 'starter', hint: 'Funding rates + open interest' },
];

interface Props {
  tier:    UserTier;
  layers:  ChartLayerState;
  onChange: (next: ChartLayerState) => void;
  sidebarCollapsed?: boolean;
  onSidebarToggle?: (collapsed: boolean) => void;
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
export default function ChartToolbar({ tier, layers, onChange, sidebarCollapsed, onSidebarToggle }: Props) {
  const [popover, setPopover] = useState<ChartLayerKey | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const userRank = tierRank(tier);

  const toggle = (k: ChartLayerKey) => {
    onChange({ ...layers, [k]: !layers[k] });
  };

  return (
    <div
      style={{
        position: 'relative',
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

      {/* Sidebar toggle */}
      {onSidebarToggle && (
        <button
          onClick={() => onSidebarToggle(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show symbol list' : 'Hide symbol list'}
          style={{
            ...mono,
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.dim,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 120ms, color 120ms, border-color 120ms',
            marginLeft: 4,
          }}
        >
          {sidebarCollapsed ? '◀' : '▶'}
        </button>
      )}

      {/* Spacer + Legend toggle */}
      <div style={{ flex: 1 }} />

      <button
        onClick={() => setShowLegend(!showLegend)}
        onMouseEnter={() => setPopover(null)}
        title="Toggle color legend"
        style={{
          ...mono,
          fontSize: 10,
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${C.border}`,
          background: showLegend ? `${C.long}14` : 'transparent',
          color: showLegend ? C.long : C.dim,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          transition: 'background 120ms, color 120ms, border-color 120ms',
        }}
      >
        <span style={{ marginRight: 4, opacity: showLegend ? 1 : 0.4 }}>
          {showLegend ? '●' : '○'}
        </span>
        Legend
      </button>

      {showLegend && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '10px',
            marginTop: '2px',
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 10,
            color: C.ink,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            ...mono,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
            <strong style={{ color: C.long }}>COLORS</strong>
          </div>
          <div style={{ lineHeight: '1.6', color: '#aaa' }}>
            <div>▮ <span style={{ color: C.long }}>Cyan</span> = BUY / Long</div>
            <div>▮ <span style={{ color: '#f97366' }}>Red</span> = SELL / Short</div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
              <div>▮ <span style={{ color: '#fbbf24' }}>Warn</span> = Alert state</div>
              <div>▮ <span style={{ color: C.dim }}>Gray</span> = Neutral</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

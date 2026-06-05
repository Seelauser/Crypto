'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const C = {
  panel: '#13141a',
  border: '#1f2128',
  bg: '#0a0a0b',
  ink: '#e6e8ee',
  dim: '#8a8f9b',
  long: '#22d3ee',
  warn: '#fbbf24',
} as const;
const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;

interface Props {
  feature:      string;
  tierRequired: 'starter' | 'pro';
  /** Optional descriptive blurb shown above the CTA. */
  blurb?:       ReactNode;
  /** When true, dims the underlying layer instead of fully replacing it
   *  (used for chart layers that show a preview behind the lock). */
  translucent?: boolean;
  /** Where the user lands on click — campaign source telemetry. */
  source?:      string;
}

/**
 * Reusable lock overlay for tier-gated chart layers (rework spec §8.4 / P5-7).
 * Used by ChartToolbar above premium layers and by panes that need a soft
 * paywall — purely presentational; the backend always gates on its own.
 */
export default function TierGateOverlay({
  feature, tierRequired, blurb, translucent = false, source,
}: Props) {
  const accent = tierRequired === 'pro' ? C.warn : C.long;
  const label  = tierRequired === 'pro' ? 'PRO' : 'STARTER';
  const upgradeUrl = `/billing/upgrade?from=${source ?? feature}`;

  return (
    <div
      role="dialog"
      aria-label={`${feature} requires ${label}`}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 20,
        background: translucent ? '#0a0a0bcc' : C.bg,
        backdropFilter: translucent ? 'blur(2px)' : undefined,
        WebkitBackdropFilter: translucent ? 'blur(2px)' : undefined,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.16em',
          padding: '3px 9px',
          borderRadius: 4,
          border: `1px solid ${accent}50`,
          background: `${accent}14`,
          color: accent,
          ...mono,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '0.02em' }}>
        {feature}
      </div>
      {blurb && (
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, maxWidth: 320 }}>
          {blurb}
        </div>
      )}
      <Link
        href={upgradeUrl}
        style={{
          marginTop: 4,
          background: accent,
          color: C.bg,
          padding: '8px 18px',
          borderRadius: 6,
          fontWeight: 700,
          fontSize: 13,
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}
      >
        Unlock with {label} →
      </Link>
    </div>
  );
}

'use client';

type Variant = 'buy' | 'sell' | 'warn' | 'ok' | 'info' | 'neutral' | 'pro' | 'true-l2' | 'inferred';

const STYLES: Record<Variant, { color: string; border: string }> = {
  buy: { color: '#22d3ee', border: '#22d3ee' },
  sell: { color: '#f97366', border: '#f97366' },
  warn: { color: '#fbbf24', border: '#fbbf24' },
  ok: { color: '#22c55e', border: '#22c55e' },
  info: { color: '#60a5fa', border: '#60a5fa' },
  neutral: { color: '#8a8f9b', border: '#2a2d36' },
  pro: { color: '#fbbf24', border: '#fbbf24' },
  'true-l2': { color: '#22d3ee', border: '#22d3ee' },
  inferred: { color: '#fbbf24', border: '#fbbf24' },
};

interface Props {
  variant?: Variant;
  children: React.ReactNode;
  size?: 'xs' | 'sm';
}

export function Badge({ variant = 'neutral', children, size = 'xs' }: Props) {
  const s = STYLES[variant];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      border: `1px solid ${s.border}`,
      color: s.color,
      borderRadius: 3,
      padding: size === 'xs' ? '1px 5px' : '2px 8px',
      fontSize: size === 'xs' ? 10 : 12,
      fontFamily: 'JetBrains Mono, monospace',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      fontWeight: 500,
      lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

'use client';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, #1f2128 25%, #2a2d36 50%, #1f2128 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonCard({ rows = 3, height = 80 }: { rows?: number; height?: number }) {
  return (
    <div style={{
      background: '#13141a',
      border: '1px solid #1f2128',
      borderRadius: 8,
      padding: 16,
      height,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      justifyContent: 'center',
    }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? '60%' : i === rows - 1 ? '40%' : '80%'} height={12} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '10px 14px', background: '#13141a', borderBottom: '1px solid #1f2128' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={11} width={j === 0 ? '70%' : '50%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

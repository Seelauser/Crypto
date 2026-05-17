'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT_STYLES = {
  primary: {
    background: '#22d3ee',
    color: '#0a0a0b',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: '#e6e8ee',
    border: '1px solid #2a2d36',
  },
  ghost: {
    background: 'transparent',
    color: '#8a8f9b',
    border: 'none',
  },
  danger: {
    background: 'transparent',
    color: '#ef4444',
    border: '1px solid #ef4444',
  },
};

const SIZE_STYLES = {
  sm: { padding: '5px 12px', fontSize: 12, height: 28 },
  md: { padding: '8px 16px', fontSize: 13, height: 34 },
  lg: { padding: '11px 22px', fontSize: 14, height: 42 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, children, disabled, style, ...props }, ref) => {
    const varStyle = VARIANT_STYLES[variant];
    const sizeStyle = SIZE_STYLES[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={{
          ...varStyle,
          ...sizeStyle,
          borderRadius: 6,
          fontWeight: 600,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          opacity: disabled || loading ? 0.45 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'opacity 120ms, background 120ms',
          whiteSpace: 'nowrap',
          outline: 'none',
          ...style,
        }}
        {...props}
      >
        {loading ? <Loader2 size={14} style={{ animation: 'spin 600ms linear infinite' }} /> : icon}
        {children}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </button>
    );
  }
);
Button.displayName = 'Button';

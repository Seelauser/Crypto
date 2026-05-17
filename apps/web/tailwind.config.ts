import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: '#0a0a0b',
        panel: '#13141a',
        'panel-hi': '#181a21',
        border: '#1f2128',
        'border-hi': '#2a2d36',
        // Text
        fg: '#e6e8ee',
        'fg-muted': '#8a8f9b',
        'fg-dim': '#5a5f6a',
        // Accents
        buy: '#22d3ee',
        'buy-glow': '#22d3ee33',
        sell: '#f97366',
        'sell-glow': '#f9736633',
        // Semantic
        warn: '#fbbf24',
        info: '#60a5fa',
        ok: '#22c55e',
        danger: '#ef4444',
        // Imbalance
        'imb-3x': '#fbbf24',
        'imb-10x': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4' }],
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['13px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.5' }],
        lg: ['16px', { lineHeight: '1.4' }],
        xl: ['18px', { lineHeight: '1.3' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        lg: '8px',
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
      },
      keyframes: {
        'flash-buy': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: '#22d3ee22' },
        },
        'flash-sell': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: '#f9736622' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'flash-buy': 'flash-buy 150ms ease-in-out',
        'flash-sell': 'flash-sell 150ms ease-in-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;

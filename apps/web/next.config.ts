import type { NextConfig } from 'next';

// Content-Security-Policy — tight allowlist for a SaaS with no external embeds.
// 'unsafe-inline' on style-src is required for Tailwind / CSS-in-JS at build time.
// Tighten further once a nonce-based approach is wired into the middleware.
const CSP = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline' for its runtime chunk + inline scripts.
  // susy-x.com hosts the shared design-system (device-detect.js, bootstrap.js).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.susy-x.com https://js.stripe.com",
  // Tailwind and CSS-in-JS inline styles; Google Fonts stylesheet.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  // Google Fonts actual font files served from gstatic.
  "font-src 'self' data: https://fonts.gstatic.com",
  // WebSocket (wss:) for the live chart feed; Anthropic + Stripe for API calls.
  "connect-src 'self' wss: https://api.anthropic.com https://js.stripe.com https://api.stripe.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy',        value: CSP },
  { key: 'X-Frame-Options',                value: 'DENY' },
  { key: 'X-Content-Type-Options',         value: 'nosniff' },
  { key: 'Referrer-Policy',                value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',             value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security',      value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client'],
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        // Apply to all routes except the Stripe webhook (which must not have CSP)
        source: '/((?!api/billing/webhook).*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, punycode: false };
    return config;
  },
};

export default nextConfig;

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'OrderFlow Analytics',
    template: '%s | OrderFlow',
  },
  description: 'Professional order flow analytics for active traders — crypto, stocks, futures, forex, commodities.',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0a0a0b',
};

const DS_BASE = 'https://www.susy-x.com/design-system';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {/* Shared design-system loader — sets body.device-ios|android|desktop
            and auto-injects Liquid Glass (iOS) or Material 3 (Android) CSS.
            Desktop loads nothing. Per VPS design-system master rule. */}
        <Script
          src={`${DS_BASE}/shared/device-detect.js`}
          strategy="beforeInteractive"
        />
        <Script
          src={`${DS_BASE}/shared/bootstrap.js`}
          strategy="beforeInteractive"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

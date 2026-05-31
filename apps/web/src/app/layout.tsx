import type { Metadata } from 'next';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

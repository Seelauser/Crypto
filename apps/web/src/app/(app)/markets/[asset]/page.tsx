import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { normalizeTier } from '@/lib/limits';
import MarketView from './market-view';
import type { AssetClass } from '@orderflow/types';

// ─── Allowed asset classes ────────────────────────────────────────────────────

const ALLOWED_ASSETS: AssetClass[] = [
  'crypto',
  'stocks',
  'futures',
  'forex',
  'commodities',
  'resources',
];

function isValidAsset(value: string): value is AssetClass {
  return (ALLOWED_ASSETS as string[]).includes(value);
}

// ─── Page metadata ────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ asset: string }>;
}) {
  const { asset } = await params;
  const label = isValidAsset(asset)
    ? asset.charAt(0).toUpperCase() + asset.slice(1)
    : 'Markets';
  return { title: `${label} Markets — OrderFlow Analytics` };
}

// ─── Page (Server Component) ──────────────────────────────────────────────────

export default async function MarketsAssetPage({
  params,
}: {
  params: Promise<{ asset: string }>;
}) {
  const { asset } = await params;

  // Validate asset class; redirect to crypto if unknown
  if (!isValidAsset(asset)) {
    redirect('/markets/crypto');
  }

  // Auth — layout already guards, but we need tier here
  const session = await auth();
  if (!session?.user) redirect('/login');

  const tier = normalizeTier(session.user.tier);

  return <MarketView asset={asset} tier={tier} />;
}

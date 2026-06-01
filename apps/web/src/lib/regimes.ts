import type { AssetClass, MarketRegime } from '@orderflow/types';

export const ASSET_CLASSES: AssetClass[] = [
  'crypto', 'stocks', 'futures', 'forex', 'commodities', 'resources',
];

export const REGIME_META: Record<MarketRegime, { label: string; color: string; tip: string }> = {
  trending_up:    {
    label: 'Trending ↑',
    color: '#22c55e',
    tip:   'Buyers in control — price and CVD rising together. Follow-through on long signals is strongest here.',
  },
  trending_down:  {
    label: 'Trending ↓',
    color: '#f97366',
    tip:   'Sellers in control — price and CVD falling together. Short signals are highest-probability in this state.',
  },
  accumulating:   {
    label: 'Accumulating',
    color: '#22d3ee',
    tip:   'Price is flat but CVD is rising — large buyers are building positions quietly without moving price.',
  },
  distributing:   {
    label: 'Distributing',
    color: '#fbbf24',
    tip:   'Price is flat but CVD is falling — large sellers are offloading positions without crashing price.',
  },
  mean_reverting: {
    label: 'Ranging',
    color: '#8a8f9b',
    tip:   'No clear trend — price oscillating. Trade reversals at extremes, not breakouts, in this state.',
  },
};

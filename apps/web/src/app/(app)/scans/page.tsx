'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import ScanBuilder, { type ScanFilter } from '@/components/scans/ScanBuilder';
import ScanResults, { type ScanResult } from '@/components/scans/ScanResults';

export default function ScansPage() {
  const { data: session } = useSession();
  const tier = (session?.user as { tier?: string } | undefined)?.tier ?? 'free';

  const [scope,     setScope]   = useState<'single_market' | 'cross_market'>('single_market');
  const [market,    setMarket]  = useState('crypto');
  const [logic,     setLogic]   = useState<'AND' | 'OR'>('AND');
  const [filters,   setFilters] = useState<ScanFilter[]>([{ field: 'cvd', op: 'gt', value: '' }]);
  const [results,   setResults] = useState<ScanResult[]>([]);
  const [loading,   setLoading] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  async function runScan() {
    if (scanCount >= 10 && tier === 'free') {
      alert('Daily scan limit reached. Upgrade to Pro for unlimited scans.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope:      tier === 'premium' ? scope : 'single_market',
          market,
          conditions: {
            logic,
            filters: filters.map(f => ({ field: f.field, op: f.op, value: parseFloat(f.value) || 0 })),
          },
        }),
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setScanCount(c => c + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleExplain(instrument: string) {
    window.open(`/markets/crypto?instrument=${instrument}&panel=deep_analysis`, '_blank');
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 24px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6e8ee', margin: 0 }}>Live Order Flow Scan</h1>
          <p style={{ color: '#8a8f9b', fontSize: 13, marginTop: 4 }}>
            Find instruments matching your order flow criteria right now
          </p>
        </div>
      </div>

      <ScanBuilder
        scope={scope}
        market={market}
        logic={logic}
        filters={filters}
        isLoading={loading}
        tier={tier}
        scanCount={scanCount}
        onScopeChange={setScope}
        onMarketChange={setMarket}
        onLogicChange={setLogic}
        onFiltersChange={setFilters}
        onRun={runScan}
      />

      <ScanResults results={results} onExplain={handleExplain} />

      <style>{`.spin { animation: spin 600ms linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

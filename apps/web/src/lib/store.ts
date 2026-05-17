'use client';

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { AssetClass, WsMessageType } from '@orderflow/types';

// ─── UI preferences ───────────────────────────────────────────────────────────

interface UiStore {
  // Chart preferences
  chartTimeframe: string;
  setChartTimeframe: (tf: string) => void;

  // Active instrument per asset class
  activeInstruments: Partial<Record<AssetClass, string>>;
  setActiveInstrument: (asset: AssetClass, instrument: string) => void;

  // Chart panel layout (which panels visible)
  showFootprint: boolean;
  showHeatmap: boolean;
  showDom: boolean;
  showTape: boolean;
  togglePanel: (panel: 'footprint' | 'heatmap' | 'dom' | 'tape') => void;

  // Tape filter
  tapeMinNotional: number;
  setTapeMinNotional: (v: number) => void;

  // Sidebar collapsed
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Deep analysis panel open
  deepAnalysisOpen: boolean;
  setDeepAnalysisOpen: (v: boolean) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    subscribeWithSelector((set) => ({
      chartTimeframe: '5m',
      setChartTimeframe: (tf) => set({ chartTimeframe: tf }),

      activeInstruments: {
        crypto: 'BTCUSDT',
        stocks: 'AAPL',
        futures: 'ES',
        forex: 'EURUSD',
        commodities: 'GC',
        resources: 'VALE',
      },
      setActiveInstrument: (asset, instrument) =>
        set((s) => ({ activeInstruments: { ...s.activeInstruments, [asset]: instrument } })),

      showFootprint: false,
      showHeatmap: false,
      showDom: false,
      showTape: true,
      togglePanel: (panel) =>
        set((s) => ({
          showFootprint: panel === 'footprint' ? !s.showFootprint : s.showFootprint,
          showHeatmap: panel === 'heatmap' ? !s.showHeatmap : s.showHeatmap,
          showDom: panel === 'dom' ? !s.showDom : s.showDom,
          showTape: panel === 'tape' ? !s.showTape : s.showTape,
        })),

      tapeMinNotional: 100_000,
      setTapeMinNotional: (v) => set({ tapeMinNotional: v }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      deepAnalysisOpen: false,
      setDeepAnalysisOpen: (v) => set({ deepAnalysisOpen: v }),
    })),
    {
      name: 'orderflow-ui',
      partialize: (s) => ({
        chartTimeframe: s.chartTimeframe,
        activeInstruments: s.activeInstruments,
        showFootprint: s.showFootprint,
        showHeatmap: s.showHeatmap,
        showDom: s.showDom,
        showTape: s.showTape,
        tapeMinNotional: s.tapeMinNotional,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);

// ─── Live market state ─────────────────────────────────────────────────────────

interface MarketSnapshot {
  instrument: string;
  lastPrice: number;
  cvd: number;
  delta: number;
  imbalanceRatio: number;
  bidVolume: number;
  askVolume: number;
  priceChange1m: number;
  ts: number;
}

interface MarketStore {
  snapshots: Record<string, MarketSnapshot>;
  updateSnapshot: (instrument: string, patch: Partial<MarketSnapshot>) => void;
  lastSignal: { instrument: string; setupName: string; ts: number } | null;
  setLastSignal: (s: MarketStore['lastSignal']) => void;
}

export const useMarketStore = create<MarketStore>()(
  subscribeWithSelector((set) => ({
    snapshots: {},
    updateSnapshot: (instrument, patch) =>
      set((s) => ({
        snapshots: {
          ...s.snapshots,
          [instrument]: { ...s.snapshots[instrument], instrument, ts: Date.now(), ...patch } as MarketSnapshot,
        },
      })),
    lastSignal: null,
    setLastSignal: (signal) => set({ lastSignal: signal }),
  }))
);

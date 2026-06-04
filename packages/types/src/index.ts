// ─── Market ───────────────────────────────────────────────────────────────────

export type AssetClass = 'crypto' | 'stocks' | 'futures' | 'forex' | 'commodities' | 'resources';

export type TradeSide = 'buy' | 'sell' | 'unknown';

export interface Tick {
  instrument: string;
  exchange: string;
  ts: number;        // unix ms
  price: number;
  size: number;
  side: TradeSide;
  tradeId?: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  instrument: string;
  exchange: string;
  ts: number;
  bids: OrderBookLevel[];   // sorted desc by price
  asks: OrderBookLevel[];   // sorted asc by price
  seq?: number;
}

export interface OhlcvBar {
  instrument: string;
  exchange: string;
  ts: number;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  delta?: number;   // inferred buy_vol - sell_vol
  cvd?: number;     // cumulative volume delta
}

// ─── Order Flow Analytics ─────────────────────────────────────────────────────

export interface CvdPoint {
  ts: number;
  cvd: number;
  delta: number;
}

export interface ImbalanceResult {
  instrument: string;
  ts: number;
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number;   // bidVolume / askVolume or inverse
  dominantSide: TradeSide;
}

export interface SweepEvent {
  instrument: string;
  exchange: string;
  ts: number;
  side: TradeSide;
  notionalUsd: number;
  priceStart: number;
  priceEnd: number;
  levelsConsumed: number;
  tradeCount: number;
}

export interface AbsorptionEvent {
  instrument: string;
  ts: number;
  side: TradeSide;        // the side being absorbed
  priceLevel: number;
  volumeAbsorbed: number;
  priceDelta: number;     // how little price moved vs volume
}

export interface VolumeProfileLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  delta: number;
  isVpoc?: boolean;
  isVah?: boolean;
  isVal?: boolean;
}

export type MarketRegime =
  | 'trending_up'
  | 'trending_down'
  | 'mean_reverting'
  | 'distributing'
  | 'accumulating';

export interface RegimeState {
  instrument: string;
  ts: number;
  regime: MarketRegime;
  confidence: number;
  prevRegime?: MarketRegime;
  transitionAt?: number;
}

export type WhaleLabel =
  | 'aggressive_buy'
  | 'aggressive_sell'
  | 'iceberg'
  | 'hidden'
  | 'spoof_likely'
  | 'genuine';

export interface WhaleClassification {
  instrument: string;
  ts: number;
  label: WhaleLabel;
  notionalUsd: number;
  confidence: number;
  summary: string;   // Haiku one-liner
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'cvd_cross'
  | 'bid_ask_imbalance'
  | 'large_print'
  | 'sweep'
  | 'absorption'
  | 'iceberg'
  | 'custom_expression';

export interface TriggerConfig {
  type: TriggerType;
  params: Record<string, number | string | boolean>;
  // e.g. { threshold: 500000 } for large_print
  // e.g. { ratio: 3, direction: 'bid' } for bid_ask_imbalance
}

export interface SignalSnapshot {
  instrument: string;
  exchange: string;
  ts: number;
  price: number;
  cvd: number;
  delta: number;
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number;
  recentSweep?: SweepEvent;
  recentAbsorption?: AbsorptionEvent;
  regime?: MarketRegime;
  triggerType: TriggerType;
  triggerValues: Record<string, number | string>;
}

// ─── Scans ────────────────────────────────────────────────────────────────────

export interface ScanFilter {
  field: string;    // cvd | imbalance_ratio | delta | trade_size | vwap_distance | oi_change
  op: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
}

export interface ScanCondition {
  logic: 'AND' | 'OR';
  filters: ScanFilter[];
}

export interface ScanResultRow {
  instrument: string;
  exchange: string;
  market: AssetClass;
  matchedConditions: string[];
  cvd: number;
  delta: number;
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number;
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  dataQuality: 'true_l2' | 'inferred';
}

// ─── Users / Auth ─────────────────────────────────────────────────────────────

export type UserTier = 'free' | 'starter' | 'pro';

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  tier: UserTier;
  tokenBalanceCents: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationKind = 'email' | 'browser_push' | 'telegram' | 'webhook';

export interface NotificationPayload {
  userId: string;
  kind: NotificationKind;
  event: 'signal_trigger' | 'scan_complete' | 'daily_recap' | 'token_low';
  instrument?: string;
  setupName?: string;
  snapshot?: SignalSnapshot;
  explanation?: string;
  deepLink?: string;
  timestamp: number;
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

export type LlmFeature =
  | 'signal_triage'
  | 'signal_explanation'
  | 'scan_synthesis'
  | 'daily_recap'
  | 'tape_narrator'
  | 'deep_analysis'
  | 'regime_narration'
  | 'whale_forensic'
  | 'qa_retrieval'
  | 'qa_synthesis'
  | 'correlation_alert';

export type LlmModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8';

export interface LlmCallRecord {
  userId: string;
  feature: LlmFeature;
  model: LlmModel;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costCents: number;
  batched: boolean;
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────

export type WsMessageType =
  // As emitted by the WS gateway: it serialises each Redis channel as
  // `channel.replace(':','_')`, hence the `market_*` forms below.
  | 'market_ticks'
  | 'market_orderbook'
  | 'market_cvd_update'
  | 'market_imbalance_update'
  | 'market_sweep_detected'
  | 'market_absorption_detected'
  | 'market_regime_change'
  | 'market_whale_classified'
  // Legacy / control message types (kept for back-compat).
  | 'tick'
  | 'orderbook'
  | 'cvd_update'
  | 'imbalance_update'
  | 'sweep_detected'
  | 'absorption_detected'
  | 'signal_triggered'
  | 'regime_change'
  | 'whale_classified'
  | 'tape_narration'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  data: T;
  ts: number;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  feature?: string;
  tierRequired?: UserTier;
  upgradeUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

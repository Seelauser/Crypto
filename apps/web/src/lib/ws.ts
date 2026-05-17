'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { WsMessage, Tick, CvdPoint, SignalSnapshot } from '@orderflow/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4001';
const MAX_CVD_POINTS = 500;
const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 30000];

// ─── Per-instrument tick store (module-level for cross-hook sharing) ──────────

type TickListener = (tick: Tick) => void;
type CvdListener = (point: CvdPoint) => void;
type SignalListener = (snapshot: SignalSnapshot) => void;

const tickListeners = new Map<string, Set<TickListener>>();
const cvdListeners  = new Map<string, Set<CvdListener>>();
const signalListeners = new Set<SignalListener>();

function emitTick(instrument: string, tick: Tick) {
  tickListeners.get(instrument)?.forEach(fn => fn(tick));
  tickListeners.get('*')?.forEach(fn => fn(tick));
}

function emitCvd(instrument: string, point: CvdPoint) {
  cvdListeners.get(instrument)?.forEach(fn => fn(point));
}

function emitSignal(snapshot: SignalSnapshot) {
  signalListeners.forEach(fn => fn(snapshot));
}

// ─── Shared singleton WebSocket connection ────────────────────────────────────

interface WsState {
  socket: WebSocket | null;
  connected: boolean;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  subscribedChannels: Set<string>;
  userId: string | null;
  lastMessage: WsMessage<unknown> | null;
  stateListeners: Set<() => void>;
}

const wsState: WsState = {
  socket: null,
  connected: false,
  retryCount: 0,
  retryTimer: null,
  subscribedChannels: new Set(),
  userId: null,
  lastMessage: null,
  stateListeners: new Set(),
};

function notifyStateListeners() {
  wsState.stateListeners.forEach(fn => fn());
}

function getBackoffMs(attempt: number): number {
  return BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)];
}

function sendSubscription() {
  if (!wsState.socket || wsState.socket.readyState !== WebSocket.OPEN) return;
  const channels = Array.from(wsState.subscribedChannels);
  const msg = {
    type: 'subscribe',
    channels,
    ...(wsState.userId ? { userId: wsState.userId } : {}),
  };
  wsState.socket.send(JSON.stringify(msg));
}

function handleMessage(raw: MessageEvent<string>) {
  let msg: WsMessage<unknown>;
  try {
    msg = JSON.parse(raw.data) as WsMessage<unknown>;
  } catch {
    return;
  }

  wsState.lastMessage = msg;
  notifyStateListeners();

  if (msg.type === 'tick') {
    const tick = msg.data as Tick;
    if (tick?.instrument) {
      emitTick(tick.instrument, tick);
    }
    return;
  }

  if (msg.type === 'cvd_update') {
    const point = msg.data as CvdPoint & { instrument?: string };
    if (point) {
      emitCvd((point as any).instrument ?? 'unknown', point);
    }
    return;
  }

  if (msg.type === 'signal_triggered') {
    const snapshot = msg.data as SignalSnapshot;
    if (snapshot) {
      emitSignal(snapshot);
    }
    return;
  }
}

function connectWs() {
  if (typeof window === 'undefined') return;
  if (
    wsState.socket &&
    (wsState.socket.readyState === WebSocket.OPEN ||
      wsState.socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const socket = new WebSocket(WS_URL);
  wsState.socket = socket;

  socket.onopen = () => {
    wsState.connected = true;
    wsState.retryCount = 0;
    if (wsState.retryTimer) {
      clearTimeout(wsState.retryTimer);
      wsState.retryTimer = null;
    }
    sendSubscription();
    notifyStateListeners();
  };

  socket.onmessage = handleMessage;

  socket.onclose = () => {
    wsState.connected = false;
    wsState.socket = null;
    notifyStateListeners();
    scheduleReconnect();
  };

  socket.onerror = () => {
    wsState.connected = false;
    notifyStateListeners();
    // onclose will follow
  };
}

function scheduleReconnect() {
  if (wsState.retryTimer) return;
  const delay = getBackoffMs(wsState.retryCount);
  wsState.retryCount += 1;
  wsState.retryTimer = setTimeout(() => {
    wsState.retryTimer = null;
    connectWs();
  }, delay);
}

function ensureChannelsSubscribed(channels: string[], userId: string | null) {
  let changed = false;

  if (userId && wsState.userId !== userId) {
    wsState.userId = userId;
    const userChannel = `signal:triggered:${userId}`;
    if (!wsState.subscribedChannels.has(userChannel)) {
      wsState.subscribedChannels.add(userChannel);
      changed = true;
    }
  }

  for (const ch of channels) {
    if (!wsState.subscribedChannels.has(ch)) {
      wsState.subscribedChannels.add(ch);
      changed = true;
    }
  }

  if (changed && wsState.connected) {
    sendSubscription();
  }
}

// ─── useMarketSocket ──────────────────────────────────────────────────────────

export interface MarketSocketReturn {
  connected: boolean;
  lastMessage: WsMessage<unknown> | null;
  send: (msg: object) => void;
}

export function useMarketSocket(
  instruments: string[],
  channels: string[],
): MarketSocketReturn {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;

  const [, forceUpdate] = useState(0);

  const send = useCallback((msg: object) => {
    if (wsState.socket?.readyState === WebSocket.OPEN) {
      wsState.socket.send(JSON.stringify(msg));
    }
  }, []);

  // Stable string keys for effect dependency
  const channelsKey = channels.join(',');
  const instrumentsKey = instruments.join(',');

  useEffect(() => {
    const listener = () => forceUpdate(n => n + 1);
    wsState.stateListeners.add(listener);

    // Ensure base market channels + per-instrument channels are subscribed
    const allChannels = [
      ...channels,
      'market:ticks',
      'market:cvd_update',
    ];

    // Add user-specific signal channel if userId is available
    if (userId) {
      allChannels.push(`signal:triggered:${userId}`);
    }

    ensureChannelsSubscribed(allChannels, userId ?? null);

    // Connect if not already connected
    connectWs();

    return () => {
      wsState.stateListeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsKey, instrumentsKey, userId]);

  return {
    connected: wsState.connected,
    lastMessage: wsState.lastMessage,
    send,
  };
}

// ─── useInstrumentTick ────────────────────────────────────────────────────────

export function useInstrumentTick(instrument: string): Tick | null {
  const [tick, setTick] = useState<Tick | null>(null);

  useEffect(() => {
    // Ensure we're connected with tick channel
    ensureChannelsSubscribed(['market:ticks'], null);
    connectWs();

    if (!tickListeners.has(instrument)) {
      tickListeners.set(instrument, new Set());
    }

    const listener: TickListener = (t) => setTick(t);
    tickListeners.get(instrument)!.add(listener);

    return () => {
      tickListeners.get(instrument)?.delete(listener);
      if (tickListeners.get(instrument)?.size === 0) {
        tickListeners.delete(instrument);
      }
    };
  }, [instrument]);

  return tick;
}

// ─── useCvdStream ─────────────────────────────────────────────────────────────

export function useCvdStream(instrument: string): CvdPoint[] {
  const [points, setPoints] = useState<CvdPoint[]>([]);

  useEffect(() => {
    // Skip disabled placeholder used by CvdChart when not in real-time mode
    if (instrument === '__disabled__') return;

    ensureChannelsSubscribed(['market:cvd_update'], null);
    connectWs();

    if (!cvdListeners.has(instrument)) {
      cvdListeners.set(instrument, new Set());
    }

    const listener: CvdListener = (point) => {
      setPoints(prev => {
        const next = [...prev, point];
        if (next.length > MAX_CVD_POINTS) {
          return next.slice(next.length - MAX_CVD_POINTS);
        }
        return next;
      });
    };

    cvdListeners.get(instrument)!.add(listener);

    return () => {
      cvdListeners.get(instrument)?.delete(listener);
      if (cvdListeners.get(instrument)?.size === 0) {
        cvdListeners.delete(instrument);
      }
    };
  }, [instrument]);

  return points;
}

// ─── useSignalStream ──────────────────────────────────────────────────────────

export function useSignalStream(userId: string): SignalSnapshot | null {
  const [snapshot, setSnapshot] = useState<SignalSnapshot | null>(null);

  useEffect(() => {
    if (!userId) return;

    const userChannel = `signal:triggered:${userId}`;
    ensureChannelsSubscribed([userChannel], userId);
    connectWs();

    const listener: SignalListener = (s) => {
      // Accept snapshot if it targets this user or has no userId restriction
      if ((s as any).userId === userId || !('userId' in s)) {
        setSnapshot(s);
      }
    };

    signalListeners.add(listener);

    return () => {
      signalListeners.delete(listener);
    };
  }, [userId]);

  return snapshot;
}

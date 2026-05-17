import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from 'redis';
import { IncomingMessage } from 'http';

const PORT = parseInt(process.env.WS_PORT ?? '4001');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Channels subscribed by connected clients: Map<ws, Set<channel>>
const clientSubscriptions = new Map<WebSocket, Set<string>>();
// Reverse: channel → set of subscribed clients
const channelClients = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ port: PORT });

const sub = createClient({ url: REDIS_URL });
const pub = createClient({ url: REDIS_URL });

// Redis channels we forward to WS clients
const FORWARDED_CHANNELS = [
  'market:ticks',
  'market:orderbook',
  'market:cvd_update',
  'market:imbalance_update',
  'market:sweep_detected',
  'market:absorption_detected',
  'market:regime_change',
  'market:whale_classified',
  'signal:triggered',
  'tape:narration',
];

async function bootstrap() {
  await sub.connect();
  await pub.connect();

  // Subscribe to all market channels in Redis and fan out to WS clients
  await sub.subscribe(FORWARDED_CHANNELS, (message, channel) => {
    let parsed: unknown;
    try { parsed = JSON.parse(message); } catch { return; }

    const targets = channelClients.get(channel);
    if (!targets) return;
    const serialized = JSON.stringify({ type: channel.replace(':', '_'), data: parsed, ts: Date.now() });

    for (const ws of targets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  });

  // Also subscribe per-user signal events (signal:triggered:<userId>)
  // These are handled dynamically as clients subscribe

  console.log(`WS Gateway listening on :${PORT}`);
}

function addSubscription(ws: WebSocket, channel: string) {
  if (!clientSubscriptions.has(ws)) clientSubscriptions.set(ws, new Set());
  clientSubscriptions.get(ws)!.add(channel);
  if (!channelClients.has(channel)) channelClients.set(channel, new Set());
  channelClients.get(channel)!.add(ws);

  // Dynamic per-user channels: subscribe to Redis if first subscriber
  if (channel.startsWith('signal:triggered:') && channelClients.get(channel)!.size === 1) {
    sub.subscribe(channel, (message) => {
      let parsed: unknown;
      try { parsed = JSON.parse(message); } catch { return; }
      const targets = channelClients.get(channel);
      if (!targets) return;
      const out = JSON.stringify({ type: 'signal_triggered', data: parsed, ts: Date.now() });
      for (const client of targets) {
        if (client.readyState === WebSocket.OPEN) client.send(out);
      }
    });
  }
}

function removeClient(ws: WebSocket) {
  const subs = clientSubscriptions.get(ws);
  if (subs) {
    for (const ch of subs) {
      channelClients.get(ch)?.delete(ws);
    }
  }
  clientSubscriptions.delete(ws);
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // Ping/pong to detect dead connections
  (ws as any).isAlive = true;
  ws.on('pong', () => { (ws as any).isAlive = true; });

  ws.on('message', (raw) => {
    let msg: { type: string; channels?: string[]; userId?: string };
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'subscribe' && Array.isArray(msg.channels)) {
      const allowed = [
        ...FORWARDED_CHANNELS,
        ...(msg.userId ? [`signal:triggered:${msg.userId}`] : []),
      ];
      for (const ch of msg.channels) {
        if (allowed.includes(ch)) addSubscription(ws, ch);
      }
      ws.send(JSON.stringify({ type: 'subscribed', channels: msg.channels }));
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    }
  });

  ws.on('close', () => removeClient(ws));
  ws.on('error', () => removeClient(ws));
});

// Heartbeat — remove stale connections every 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!(ws as any).isAlive) { ws.terminate(); return; }
    (ws as any).isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

bootstrap().catch(err => {
  console.error('WS Gateway bootstrap failed:', err);
  process.exit(1);
});

import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from 'redis';
import { IncomingMessage, createServer } from 'http';
import pino from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base:  { worker: 'ws-gateway' },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});

const PORT = parseInt(process.env.WS_PORT ?? '4001');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Channels subscribed by connected clients: Map<ws, Set<channel>>
const clientSubscriptions = new Map<WebSocket, Set<string>>();
// Reverse: channel → set of subscribed clients
const channelClients = new Map<string, Set<WebSocket>>();

const sub = createClient({ url: REDIS_URL });
const pub = createClient({ url: REDIS_URL });

// HTTP server backing the WS upgrade — also serves a /health probe (P6-2).
const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    const ok = sub.isReady && pub.isReady;
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:  ok ? 'ok' : 'degraded',
      service: 'ws-gateway',
      checks:  { redis: ok ? 'ok' : 'down' },
      clients: wss.clients.size,
      ts:      Date.now(),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

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

  httpServer.listen(PORT, process.env.WS_HOST ?? '127.0.0.1', () => log.info({ port: PORT, channels: FORWARDED_CHANNELS.length }, 'ws gateway listening (+ /health)'));
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

wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
  // Ping/pong to detect dead connections
  (ws as WebSocket & { isAlive: boolean }).isAlive = true;
  ws.on('pong', () => { (ws as WebSocket & { isAlive: boolean }).isAlive = true; });

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
    if (!(ws as WebSocket & { isAlive: boolean }).isAlive) { ws.terminate(); return; }
    (ws as WebSocket & { isAlive: boolean }).isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

bootstrap().catch(err => {
  log.fatal({ err: err?.message ?? String(err) }, 'bootstrap failed');
  process.exit(1);
});

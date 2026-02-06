const { WebSocketServer } = require('ws');

const port = Number(process.argv[2]);
if (!Number.isFinite(port) || port <= 0) {
  // eslint-disable-next-line no-console
  console.error('Port argument required');
  process.exit(1);
}

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port,
});

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (!msg || msg.type !== 'req') {
        return;
      }

      const payload = msg.method === 'sessions_spawn'
        ? { sessionKey: `daemon-session-${Date.now()}` }
        : {};

      ws.send(JSON.stringify({
        type: 'res',
        id: msg.id,
        ok: true,
        payload,
      }));
    } catch {
      // Ignore malformed requests in fixture.
    }
  });
});

function shutdown() {
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Run live integration scenarios against a locally started Godel API server.
 *
 * This prevents false positives from describe.skip guards tied to
 * RUN_LIVE_INTEGRATION_TESTS and provides a reproducible local readiness check.
 */

import { spawn } from 'child_process';
import { startServer } from '../src/api/server-factory';
import type { Socket } from 'net';

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runJest(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const jestBin = require.resolve('jest/bin/jest');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [jestBin, ...args], {
      stdio: 'inherit',
      env,
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const port = parsePort(process.env['PORT'], 7373);
  const host = process.env['HOST'] || '127.0.0.1';
  const apiKey = process.env['GODEL_API_KEY'] || 'test-key';

  const jestArgs = process.argv.slice(2);
  const args = jestArgs.length > 0
    ? jestArgs
    : ['tests/integration/scenarios', '--runInBand', '--testTimeout=120000'];

  process.env['GODEL_API_KEY'] = apiKey;
  process.env['GODEL_ENABLE_AUTH'] = process.env['GODEL_ENABLE_AUTH'] || 'true';
  process.env['GODEL_ALLOW_DEV_AUTH'] = process.env['GODEL_ALLOW_DEV_AUTH'] || 'true';
  process.env['RUN_LIVE_INTEGRATION_TESTS'] = 'true';

  const server = await startServer({
    host,
    port,
    apiKey,
    enableAuth: true,
    rateLimit: 250000,
  });
  const openSockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });

  let exitCode = 1;
  try {
    exitCode = await runJest(args, {
      ...process.env,
      RUN_LIVE_INTEGRATION_TESTS: 'true',
      GODEL_API_URL: `http://${host}:${port}`,
      TEST_WEBSOCKET_URL: `ws://${host}:${port}/events`,
      GODEL_API_KEY: apiKey,
    });
  } finally {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);

    for (const socket of openSockets) {
      socket.destroy();
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Live integration runner failed:', error);
  process.exit(1);
});

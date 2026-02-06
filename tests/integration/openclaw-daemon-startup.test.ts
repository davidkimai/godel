import { join } from 'path';
import { createServer } from 'net';
import { MessageBus } from '../../src/bus';
import { OpenClawCore } from '../../src/core/openclaw';

const describeLive = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true' ? describe : describe.skip;

async function allocatePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate test port'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.once('error', reject);
  });
}

describeLive('OpenClaw daemon startup integration', () => {
  it(
    'auto-starts gateway from configured command and initializes successfully',
    async () => {
      const port = await allocatePort();
      const gatewayScript = join(process.cwd(), 'tests', 'fixtures', 'fake-openclaw-gateway.js');

      const command = `${process.execPath} ${gatewayScript} ${port}`;
      const core = new OpenClawCore(
        new MessageBus(),
        { host: '127.0.0.1', port },
        {
          autoStartGateway: true,
          gatewayStartCommand: command,
          gatewayStartupTimeoutMs: 8000,
          gatewayStartupProbeIntervalMs: 100,
        }
      );

      try {
        await core.initialize();
        expect(core.isInitialized).toBe(true);
      } finally {
        const daemonProcess = (core as any).gatewayProcess;
        await core.disconnect().catch(() => undefined);
        if (daemonProcess?.pid) {
          try {
            process.kill(daemonProcess.pid, 'SIGTERM');
          } catch {
            // Process may already be gone.
          }
        }
      }
    },
    30000
  );
});

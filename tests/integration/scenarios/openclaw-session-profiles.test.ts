import { logger } from '../../../src/utils/logger';
import { OpenClawAdapter, type SpawnAgentOptions } from '../../../src/integrations/openclaw/adapter';
import { calculateLatencyStats, testConfig } from '../config';

const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Scenario: OpenClaw Session Concurrency Profiles', () => {
  let adapter: OpenClawAdapter;
  let createdSessionKeys: string[] = [];

  beforeAll(async () => {
    adapter = new OpenClawAdapter({
      godelApiUrl: testConfig.godelApiUrl,
      godelApiKey: testConfig.godelApiKey,
      openclawSessionKey: testConfig.openclawSessionKey,
    });
  });

  afterEach(async () => {
    const sessions = [...createdSessionKeys];
    createdSessionKeys = [];
    await Promise.allSettled(
      sessions.map((sessionKey) => adapter.killAgent(sessionKey, true))
    );
  });

  async function runProfile(concurrency: number): Promise<void> {
    const latencies: number[] = [];
    const sessionKeys = Array.from({ length: concurrency }, (_, i) => `profile-${concurrency}-${Date.now()}-${i}`);
    createdSessionKeys.push(...sessionKeys);

    const spawnPromises = sessionKeys.map(async (sessionKey, idx) => {
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'code-review',
        task: `Profile ${concurrency} task ${idx}`,
        model: idx % 2 === 0 ? 'kimi-k2.5' : 'claude-sonnet-4-5',
      };

      const start = Date.now();
      const result = await adapter.spawnAgent(sessionKey, spawnRequest);
      latencies.push(Date.now() - start);
      return result;
    });

    const start = Date.now();
    const results = await Promise.all(spawnPromises);
    const duration = Date.now() - start;
    const stats = calculateLatencyStats(latencies);

    expect(results).toHaveLength(concurrency);
    expect(results.every((result) => Boolean(result.godelAgentId))).toBe(true);
    expect(new Set(results.map((result) => result.godelAgentId)).size).toBe(concurrency);

    // Keep a conservative gate for profile readiness.
    expect(stats.p95).toBeLessThan(1000);
    expect(stats.p99).toBeLessThan(1500);

    logger.info(
      `[SessionProfile] concurrency=${concurrency} duration=${duration}ms p95=${stats.p95}ms p99=${stats.p99}ms`
    );
  }

  it('validates 10 concurrent OpenClaw session spawns', async () => {
    await runProfile(10);
  }, testConfig.longTestTimeout);

  it('validates 25 concurrent OpenClaw session spawns', async () => {
    await runProfile(25);
  }, testConfig.longTestTimeout);

  it('validates 50 concurrent OpenClaw session spawns', async () => {
    await runProfile(50);
  }, testConfig.longTestTimeout);
});

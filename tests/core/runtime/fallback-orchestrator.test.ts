/**
 * FallbackOrchestrator Tests
 *
 * Tests automatic fallback between runtime providers with circuit breaker
 * and health checking. Validates <1s failover time requirement.
 *
 * @module tests/core/runtime/fallback-orchestrator
 * @version 1.0.0
 * @since 2026-02-08
 */

import { FallbackOrchestrator, FallbackConfig } from '../../../src/core/runtime/fallback-orchestrator';
import { SpawnConfig, RuntimeType } from '../../../src/core/runtime/runtime-provider';

// ============================================================================
// Mocks
// ============================================================================

const createMockProvider = (name: string, shouldFail: boolean = false) => ({
  spawn: jest.fn().mockImplementation(async (config: SpawnConfig) => {
    if (shouldFail) {
      throw new Error(`${name} provider failed`);
    }
    return {
      id: `${name}-${Date.now()}`,
      runtime: name.toLowerCase() as RuntimeType,
      state: 'running',
      resources: { cpu: 0, memory: 0, disk: 0, network: { rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0 } },
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: { type: name.toLowerCase() as RuntimeType, createdAt: new Date() },
    };
  }),
  terminate: jest.fn().mockResolvedValue(undefined),
  getStatus: jest.fn().mockResolvedValue({
    id: 'test',
    state: 'running',
    resources: { cpu: 0, memory: 0, disk: 0, network: { rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0 } },
    health: 'healthy',
    uptime: 1000,
  }),
  listRuntimes: jest.fn().mockResolvedValue([]),
  execute: jest.fn(),
  executeStream: jest.fn(),
  executeInteractive: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  uploadDirectory: jest.fn(),
  downloadDirectory: jest.fn(),
  snapshot: jest.fn(),
  restore: jest.fn(),
  listSnapshots: jest.fn().mockResolvedValue([]),
  deleteSnapshot: jest.fn(),
  on: jest.fn().mockReturnThis(),
  waitForState: jest.fn().mockResolvedValue(true),
});

// ============================================================================
// Test Suite
// ============================================================================

describe('FallbackOrchestrator', () => {
  let orchestrator: FallbackOrchestrator;

  beforeEach(() => {
    orchestrator = new FallbackOrchestrator();
  });

  afterEach(() => {
    orchestrator.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      expect(orchestrator).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: FallbackConfig = {
        providerOrder: ['kata', 'worktree'],
        maxFailoverTime: 500,
        healthCheckInterval: 5000,
        circuitBreakerThreshold: 3,
        costAware: true,
      };

      const customOrchestrator = new FallbackOrchestrator(config);
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.dispose();
    });

    it('should use default provider order', () => {
      const defaultOrchestrator = new FallbackOrchestrator();
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.dispose();
    });
  });

  describe('Provider Registration', () => {
    it('should register providers', () => {
      const e2bProvider = createMockProvider('e2b');
      const kataProvider = createMockProvider('kata');
      const worktreeProvider = createMockProvider('worktree');

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);
      orchestrator.registerProvider('worktree', worktreeProvider as any);

      // Providers should be registered
      expect(orchestrator.getProviderHealth('e2b')).toBeDefined();
      expect(orchestrator.getProviderHealth('kata')).toBeDefined();
      expect(orchestrator.getProviderHealth('worktree')).toBeDefined();
    });

    it('should track provider health', () => {
      const provider = createMockProvider('e2b');
      orchestrator.registerProvider('e2b', provider as any);

      const health = orchestrator.getProviderHealth('e2b');
      expect(health).toBeDefined();
      expect(health?.type).toBe('e2b');
      expect(health?.healthy).toBe(true);
    });
  });

  describe('Fallback Spawning', () => {
    it('should spawn with primary provider', async () => {
      const e2bProvider = createMockProvider('e2b', false);
      orchestrator.registerProvider('e2b', e2bProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const result = await orchestrator.spawnWithFallback(config);

      expect(result).toBeDefined();
      expect(result.runtime).toBeDefined();
      expect(result.providerType).toBe('e2b');
      expect(result.failoverCount).toBe(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('should failover to secondary provider on failure', async () => {
      const e2bProvider = createMockProvider('e2b', true); // Will fail
      const kataProvider = createMockProvider('kata', false);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const result = await orchestrator.spawnWithFallback(config);

      expect(result).toBeDefined();
      expect(result.providerType).toBe('kata');
      expect(result.failoverCount).toBe(1);
    });

    it('should failover through multiple providers', async () => {
      const e2bProvider = createMockProvider('e2b', true); // Will fail
      const kataProvider = createMockProvider('kata', true); // Will fail
      const worktreeProvider = createMockProvider('worktree', false);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);
      orchestrator.registerProvider('worktree', worktreeProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const result = await orchestrator.spawnWithFallback(config);

      expect(result).toBeDefined();
      expect(result.providerType).toBe('worktree');
      expect(result.failoverCount).toBe(2);
    });

    it('should complete failover in less than 1 second', async () => {
      const e2bProvider = createMockProvider('e2b', true);
      const kataProvider = createMockProvider('kata', false);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const startTime = Date.now();
      const result = await orchestrator.spawnWithFallback(config);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should throw error when all providers fail', async () => {
      const e2bProvider = createMockProvider('e2b', true);
      const kataProvider = createMockProvider('kata', true);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      await expect(orchestrator.spawnWithFallback(config)).rejects.toThrow('All runtime providers failed');
    });

    it('should emit spawnSuccess event', async () => {
      const provider = createMockProvider('e2b');
      orchestrator.registerProvider('e2b', provider as any);

      const successHandler = jest.fn();
      orchestrator.on('spawnSuccess', successHandler);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      await orchestrator.spawnWithFallback(config);

      expect(successHandler).toHaveBeenCalled();
      expect(successHandler.mock.calls[0][0]).toHaveProperty('runtime');
      expect(successHandler.mock.calls[0][0]).toHaveProperty('providerType');
    });

    it('should emit spawnFailure event', async () => {
      const e2bProvider = createMockProvider('e2b', true);
      const kataProvider = createMockProvider('kata', false);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);

      const failureHandler = jest.fn();
      orchestrator.on('spawnFailure', failureHandler);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      await orchestrator.spawnWithFallback(config);

      expect(failureHandler).toHaveBeenCalled();
      expect(failureHandler.mock.calls[0][0]).toHaveProperty('providerType', 'e2b');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const failingProvider = createMockProvider('e2b', true);
      orchestrator.registerProvider('e2b', failingProvider as any);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      // Attempt multiple spawns that will fail
      for (let i = 0; i < 6; i++) {
        try {
          await orchestrator.spawnWithFallback(config);
        } catch (e) {
          // Expected
        }
      }

      const health = orchestrator.getProviderHealth('e2b');
      expect(health?.circuitOpen).toBe(true);
    });

    it('should reset circuit breaker', async () => {
      const failingProvider = createMockProvider('e2b', true);
      orchestrator.registerProvider('e2b', failingProvider as any);

      // Force circuit open
      orchestrator.markProviderUnhealthy('e2b', 'Test failure');

      let health = orchestrator.getProviderHealth('e2b');
      expect(health?.circuitOpen).toBe(true);

      // Reset circuit
      orchestrator.resetCircuitBreaker('e2b');

      health = orchestrator.getProviderHealth('e2b');
      expect(health?.circuitOpen).toBe(false);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should skip providers with open circuits', async () => {
      const e2bProvider = createMockProvider('e2b', true);
      const kataProvider = createMockProvider('kata', false);

      orchestrator.registerProvider('e2b', e2bProvider as any);
      orchestrator.registerProvider('kata', kataProvider as any);

      // Force e2b circuit open
      orchestrator.markProviderUnhealthy('e2b');

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const result = await orchestrator.spawnWithFallback(config);

      // Should skip e2b and use kata directly
      expect(result.providerType).toBe('kata');
      expect(result.failoverCount).toBe(0); // No failover, e2b was skipped
    });
  });

  describe('Health Checking', () => {
    it('should start and stop health checks', () => {
      orchestrator.startHealthChecks();
      orchestrator.stopHealthChecks();
      // Should not throw
    });

    it('should mark provider as unhealthy', () => {
      const provider = createMockProvider('e2b');
      orchestrator.registerProvider('e2b', provider as any);

      orchestrator.markProviderUnhealthy('e2b', 'Manual unhealth');

      const health = orchestrator.getProviderHealth('e2b');
      expect(health?.healthy).toBe(false);
      expect(health?.lastError).toBe('Manual unhealth');
    });

    it('should emit providerUnhealthy event', () => {
      const handler = jest.fn();
      orchestrator.on('providerUnhealthy', handler);

      const provider = createMockProvider('e2b');
      orchestrator.registerProvider('e2b', provider as any);
      orchestrator.markProviderUnhealthy('e2b', 'Test reason');

      expect(handler).toHaveBeenCalledWith({
        type: 'e2b',
        reason: 'Test reason',
      });
    });
  });

  describe('Best Provider Selection', () => {
    it('should select best provider based on health', async () => {
      const healthyProvider = createMockProvider('e2b');
      const unhealthyProvider = createMockProvider('kata');

      orchestrator.registerProvider('e2b', healthyProvider as any);
      orchestrator.registerProvider('kata', unhealthyProvider as any);

      // Mark kata as unhealthy
      orchestrator.markProviderUnhealthy('kata');

      const best = await orchestrator.getBestProvider();
      expect(best).toBe('e2b');
    });

    it('should return null when no providers available', async () => {
      const best = await orchestrator.getBestProvider();
      expect(best).toBeNull();
    });
  });

  describe('Provider Health Information', () => {
    it('should return health for all providers', () => {
      orchestrator.registerProvider('e2b', createMockProvider('e2b') as any);
      orchestrator.registerProvider('kata', createMockProvider('kata') as any);

      const allHealth = orchestrator.getAllHealth();
      expect(Object.keys(allHealth)).toContain('e2b');
      expect(Object.keys(allHealth)).toContain('kata');
    });

    it('should return null for non-existent provider health', () => {
      const health = orchestrator.getProviderHealth('nonexistent' as RuntimeType);
      expect(health).toBeNull();
    });
  });

  describe('Global Instance Management', () => {
    const {
      getGlobalFallbackOrchestrator,
      initializeGlobalFallbackOrchestrator,
      resetGlobalFallbackOrchestrator,
    } = jest.requireActual('../../../src/core/runtime/fallback-orchestrator');

    beforeEach(() => {
      resetGlobalFallbackOrchestrator();
    });

    afterEach(() => {
      resetGlobalFallbackOrchestrator();
    });

    it('should create global instance', () => {
      const global = getGlobalFallbackOrchestrator();
      expect(global).toBeDefined();
    });

    it('should return same instance', () => {
      const global1 = getGlobalFallbackOrchestrator();
      const global2 = getGlobalFallbackOrchestrator();
      expect(global1).toBe(global2);
    });

    it('should reinitialize with initializeGlobalFallbackOrchestrator', () => {
      const global1 = initializeGlobalFallbackOrchestrator({ maxFailoverTime: 500 });
      const global2 = initializeGlobalFallbackOrchestrator({ maxFailoverTime: 1000 });
      expect(global1).not.toBe(global2);
    });
  });

  describe('Dispose', () => {
    it('should cleanup on dispose', () => {
      orchestrator.startHealthChecks();
      orchestrator.dispose();
      // Should not throw and should cleanup
    });
  });
});

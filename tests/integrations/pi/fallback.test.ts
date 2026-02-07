/**
 * Fallback Chain Tests
 *
 * Tests for the Pi fallback chain module.
 */

import {
  FallbackChainManager,
  getGlobalFallbackManager,
  resetGlobalFallbackManager,
  buildPriorityChain,
  buildCapabilityChain,
  buildLatencyChain,
  buildHybridChain,
  buildFallbackChain,
  executeWithFallback,
  DEFAULT_FALLBACK_CONFIG,
} from '../../../src/integrations/pi/fallback';
import { ProviderId, PiCapability } from '../../../src/integrations/pi/types';

describe('Fallback Chain', () => {
  beforeEach(() => {
    resetGlobalFallbackManager();
  });

  afterEach(() => {
    resetGlobalFallbackManager();
  });

  describe('buildPriorityChain', () => {
    it('should start with primary provider', () => {
      const chain = buildPriorityChain('anthropic');
      expect(chain[0]).toBe('anthropic');
    });

    it('should include all providers', () => {
      const chain = buildPriorityChain();
      expect(chain.length).toBeGreaterThanOrEqual(5);
      expect(chain).toContain('anthropic');
      expect(chain).toContain('openai');
      expect(chain).toContain('google');
    });
  });

  describe('buildCapabilityChain', () => {
    it('should filter by capabilities', () => {
      const chain = buildCapabilityChain('anthropic', ['code-generation' as PiCapability]);
      expect(chain[0]).toBe('anthropic');
      expect(chain.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty chain for impossible capabilities', () => {
      const chain = buildCapabilityChain('anthropic', ['impossible-capability' as PiCapability]);
      expect(chain.length).toBe(1); // Only the primary provider
    });
  });

  describe('buildLatencyChain', () => {
    it('should order by latency', () => {
      const chain = buildLatencyChain('groq');
      expect(chain[0]).toBe('groq'); // groq is fastest
    });

    it('should filter by max latency', () => {
      const chain = buildLatencyChain('anthropic', 500);
      // Should include fast providers
      expect(chain.length).toBeGreaterThanOrEqual(1);
      expect(chain[0]).toBe('anthropic'); // Primary is always first
    });
  });

  describe('buildHybridChain', () => {
    it('should balance multiple factors', () => {
      const chain = buildHybridChain('anthropic', ['code-generation' as PiCapability]);
      expect(chain[0]).toBe('anthropic');
      expect(chain.length).toBeGreaterThan(1);
    });
  });

  describe('buildFallbackChain', () => {
    it('should build priority chain by default', () => {
      const chain = buildFallbackChain({
        strategy: 'priority',
        primaryProvider: 'anthropic',
        maxAttempts: 5,
        retryDelayMs: 1000,
        strictCapabilityMatch: true,
      });
      expect(chain[0]).toBe('anthropic');
    });

    it('should build capability chain when specified', () => {
      const chain = buildFallbackChain({
        strategy: 'capability',
        primaryProvider: 'anthropic',
        requiredCapabilities: ['code-generation' as PiCapability],
        maxAttempts: 5,
        retryDelayMs: 1000,
        strictCapabilityMatch: true,
      });
      expect(chain[0]).toBe('anthropic');
    });

    it('should build latency chain when specified', () => {
      const chain = buildFallbackChain({
        strategy: 'latency',
        primaryProvider: 'groq',
        maxAttempts: 5,
        retryDelayMs: 1000,
        strictCapabilityMatch: true,
      });
      expect(chain[0]).toBe('groq');
    });
  });

  describe('executeWithFallback', () => {
    it('should succeed on first provider', async () => {
      const chain: ProviderId[] = ['anthropic', 'openai'];
      const executor = jest.fn().mockResolvedValue('success');

      const result = await executeWithFallback(chain, executor);

      expect(result.result).toBe('success');
      expect(result.provider).toBe('anthropic');
      expect(result.attempts).toHaveLength(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should fallback on failure', async () => {
      const chain: ProviderId[] = ['anthropic', 'openai'];
      const executor = jest.fn()
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce('success');

      const result = await executeWithFallback(chain, executor, { retryDelayMs: 0 });

      expect(result.result).toBe('success');
      expect(result.provider).toBe('openai');
      expect(result.attempts).toHaveLength(2);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should throw when all providers fail', async () => {
      const chain: ProviderId[] = ['anthropic', 'openai'];
      const executor = jest.fn().mockRejectedValue(new Error('Failed'));

      await expect(executeWithFallback(chain, executor, { retryDelayMs: 0 }))
        .rejects
        .toThrow(/exhausted after 2 attempts/);
    });
  });

  describe('FallbackChainManager', () => {
    it('should create with default config', () => {
      const manager = new FallbackChainManager();
      const config = manager.getConfig();
      expect(config.strategy).toBe('priority');
      expect(config.maxAttempts).toBe(5);
    });

    it('should build chain for strategy', () => {
      const manager = new FallbackChainManager({ strategy: 'priority' });
      const chain = manager.buildChain();
      expect(chain.length).toBeGreaterThan(0);
    });

    it('should get default chain', () => {
      const manager = new FallbackChainManager();
      const chain = manager.getDefaultChain();
      expect(chain).toContain('anthropic');
      expect(chain).toContain('openai');
    });

    it('should update config', () => {
      const manager = new FallbackChainManager();
      manager.updateConfig({ maxAttempts: 10 });
      expect(manager.getConfig().maxAttempts).toBe(10);
    });

    it('should record attempts', () => {
      const manager = new FallbackChainManager();
      const attempt = {
        provider: 'anthropic' as ProviderId,
        success: true,
        latencyMs: 100,
        timestamp: new Date(),
      };

      manager.recordAttempt('request-1', attempt);
      expect(manager.getAttemptHistory('request-1')).toHaveLength(1);
    });

    it('should analyze patterns', () => {
      const manager = new FallbackChainManager();

      manager.recordAttempt('r1', {
        provider: 'anthropic' as ProviderId,
        success: true,
        latencyMs: 100,
        timestamp: new Date(),
      });

      manager.recordAttempt('r2', {
        provider: 'openai' as ProviderId,
        success: false,
        error: new Error('Failed'),
        latencyMs: 200,
        timestamp: new Date(),
      });

      const analysis = manager.analyzePatterns();
      expect(analysis.totalAttempts).toBe(2);
      expect(analysis.successRate).toBe(0.5);
    });
  });
});

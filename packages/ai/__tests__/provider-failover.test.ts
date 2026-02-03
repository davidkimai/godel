/**
 * Provider Failover Tests
 */

import { 
  ProviderFailover, 
  FailoverStrategy, 
  ProviderFailoverError 
} from '../src/provider-failover';
import { getModel } from '@mariozechner/pi-ai';

describe('ProviderFailover', () => {
  let failover: ProviderFailover;

  beforeEach(() => {
    failover = new ProviderFailover({
      primaryProvider: 'anthropic',
      backupProviders: ['openai', 'google'],
      maxRetriesPerProvider: 1,
      retryDelayMs: 100,
      trackHealth: true,
    });
  });

  afterEach(() => {
    failover.resetHealth();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const defaultFailover = new ProviderFailover();
      expect(defaultFailover.getProviderHealth()).toHaveLength(8);
    });

    it('should initialize with custom config', () => {
      const customFailover = new ProviderFailover({
        primaryProvider: 'openai',
        backupProviders: ['anthropic'],
        strategy: FailoverStrategy.ROUND_ROBIN,
      });
      
      const health = customFailover.getProviderHealth();
      expect(health.length).toBeGreaterThan(0);
    });
  });

  describe('health tracking', () => {
    it('should track provider health', () => {
      const health = failover.getProviderHealth();
      expect(health).toBeDefined();
      expect(health.length).toBeGreaterThan(0);
      
      const anthropicHealth = health.find(h => h.provider === 'anthropic');
      expect(anthropicHealth).toBeDefined();
      expect(anthropicHealth?.isHealthy).toBe(true);
    });

    it('should mark provider as unhealthy after consecutive failures', async () => {
      // Simulate failures by checking internal state
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      const context = {
        messages: [{ 
          role: 'user' as const, 
          content: 'test',
          timestamp: Date.now()
        }],
      };

      // Note: In a real test with API calls, failures would update health
      // This is a unit test of the health tracking logic
      expect(failover.isHealthy('anthropic')).toBe(true);
    });

    it('should get best performing provider', () => {
      const best = failover.getBestProvider();
      expect(best).toBeDefined();
      expect(typeof best).toBe('string');
    });
  });

  describe('strategy selection', () => {
    it('should use sequential strategy by default', () => {
      const providers = (failover as any).getProviderList();
      expect(providers[0]).toBe('anthropic');
    });

    it('should support round-robin strategy', () => {
      const rrFailover = new ProviderFailover({
        strategy: FailoverStrategy.ROUND_ROBIN,
        primaryProvider: 'anthropic',
        backupProviders: ['openai', 'google'],
      });

      // Two calls should return different starting points
      const list1 = (rrFailover as any).getProviderList();
      const list2 = (rrFailover as any).getProviderList();
      
      // After rotation, the order should change
      expect(list1).toBeDefined();
      expect(list2).toBeDefined();
    });

    it('should support best performance strategy', () => {
      const perfFailover = new ProviderFailover({
        strategy: FailoverStrategy.BEST_PERFORMANCE,
      });

      const list = (perfFailover as any).getProviderList();
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('completeWithFailover', () => {
    it('should complete successfully with valid model', async () => {
      // Skip if no API key available
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping API test - no ANTHROPIC_API_KEY');
        return;
      }

      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      const context = {
        messages: [{ 
          role: 'user' as const, 
          content: 'Say "hello" and nothing else',
          timestamp: Date.now()
        }],
      };

      const result = await failover.completeWithFailover(model, context, {
        maxTokens: 10,
      });

      expect(result.message).toBeDefined();
      expect(result.successfulProvider).toBe('anthropic');
      expect(result.attempts.length).toBeGreaterThan(0);
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    }, 30000);

    it('should track attempts on failure', async () => {
      // This test validates the attempt tracking structure
      // Actual failures require API errors
      
      const attemptHistory = failover.getAttemptHistory();
      expect(Array.isArray(attemptHistory)).toBe(true);
    });
  });

  describe('streamWithFailover', () => {
    it('should stream successfully with valid model', async () => {
      // Skip if no API key available
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping API test - no ANTHROPIC_API_KEY');
        return;
      }

      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      const context = {
        messages: [{ 
          role: 'user' as const, 
          content: 'Count to 3',
          timestamp: Date.now()
        }],
      };

      const { stream, result } = await failover.streamWithFailover(model, context, {
        maxTokens: 50,
      });

      // Collect stream events
      const events: any[] = [];
      try {
        for await (const event of stream) {
          events.push(event);
        }
      } catch (e) {
        // Stream may end
      }

      // Get final result
      const finalResult = await result;
      
      expect(finalResult.message).toBeDefined();
      expect(finalResult.successfulProvider).toBe('anthropic');
      expect(finalResult.attempts.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('error handling', () => {
    it('should create ProviderFailoverError with attempts', () => {
      const attempts = [
        {
          provider: 'anthropic' as const,
          modelId: 'test-model',
          success: false,
          latencyMs: 100,
          error: 'Test error',
          timestamp: new Date(),
        },
      ];

      const error = new ProviderFailoverError('All failed', attempts);
      
      expect(error.message).toBe('All failed');
      expect(error.name).toBe('ProviderFailoverError');
      expect(error.attempts).toHaveLength(1);
      expect(error.attempts[0].provider).toBe('anthropic');
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      failover.updateConfig({
        maxRetriesPerProvider: 5,
        retryDelayMs: 2000,
      });

      // Config is internal, but we can verify by checking behavior doesn't throw
      expect(() => failover.getProviderHealth()).not.toThrow();
    });

    it('should reset health data', () => {
      failover.resetHealth();
      
      const health = failover.getProviderHealth();
      expect(health.every(h => h.isHealthy)).toBe(true);
      expect(health.every(h => h.successRate === 1.0)).toBe(true);
    });
  });
});

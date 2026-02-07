/**
 * Cost Router Tests
 *
 * Tests for the Pi cost-optimized router module.
 */

import {
  CostRouter,
  getGlobalCostRouter,
  resetGlobalCostRouter,
  estimateCost,
  getCheapestModel,
  calculateCostScore,
  calculateQualityScore,
  DEFAULT_BUDGET_CONFIG,
  MODEL_PRICING,
} from '../../../src/integrations/pi/cost-router';
import { ProviderId } from '../../../src/integrations/pi/types';

describe('Cost Router', () => {
  beforeEach(() => {
    resetGlobalCostRouter();
  });

  afterEach(() => {
    resetGlobalCostRouter();
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for major models', () => {
      expect(MODEL_PRICING['claude-sonnet-4-5']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING['gemini-1.5-pro']).toBeDefined();
    });

    it('should have input and output prices', () => {
      const pricing = MODEL_PRICING['claude-sonnet-4-5'];
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    });

    it('should have zero pricing for ollama', () => {
      expect(MODEL_PRICING['ollama-default'].input).toBe(0);
      expect(MODEL_PRICING['ollama-default'].output).toBe(0);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost correctly', () => {
      const instance = {
        id: 'test',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
      } as any;

      const estimate = estimateCost(instance, 1000);

      expect(estimate.provider).toBe('anthropic');
      expect(estimate.model).toBe('claude-sonnet-4-5');
      expect(estimate.inputTokens).toBe(700); // 70% of 1000
      expect(estimate.outputTokens).toBe(300); // 30% of 1000
      expect(estimate.totalCost).toBeGreaterThan(0);
      expect(estimate.currency).toBe('USD');
    });

    it('should handle custom input ratio', () => {
      const instance = {
        id: 'test',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
      } as any;

      const estimate = estimateCost(instance, 1000, 0.5);

      expect(estimate.inputTokens).toBe(500);
      expect(estimate.outputTokens).toBe(500);
    });

    it('should use fallback pricing for unknown model', () => {
      const instance = {
        id: 'test',
        provider: 'custom' as ProviderId,
        model: 'unknown-model',
      } as any;

      const estimate = estimateCost(instance, 1000);

      expect(estimate.totalCost).toBeGreaterThan(0);
    });
  });

  describe('getCheapestModel', () => {
    it('should return cheapest model for provider', () => {
      const cheapest = getCheapestModel('anthropic');
      expect(cheapest).toBeDefined();
      expect(MODEL_PRICING[cheapest]).toBeDefined();
    });

    it('should return default for unknown provider', () => {
      const cheapest = getCheapestModel('unknown' as ProviderId);
      expect(cheapest).toBe('default');
    });
  });

  describe('calculateCostScore', () => {
    it('should return high score for low cost', () => {
      const estimate = { totalCost: 0.01 } as any;
      const score = calculateCostScore(estimate, 1.0);
      expect(score).toBeGreaterThan(90);
    });

    it('should return low score for high cost', () => {
      const estimate = { totalCost: 0.9 } as any;
      const score = calculateCostScore(estimate, 1.0);
      expect(score).toBeLessThan(20);
    });

    it('should return 0 for cost exceeding max', () => {
      const estimate = { totalCost: 1.5 } as any;
      const score = calculateCostScore(estimate, 1.0);
      expect(score).toBe(0);
    });
  });

  describe('calculateQualityScore', () => {
    it('should return high score for quality providers', () => {
      expect(calculateQualityScore('anthropic')).toBe(95);
      expect(calculateQualityScore('openai')).toBe(95);
    });

    it('should return default for unknown provider', () => {
      expect(calculateQualityScore('unknown' as ProviderId)).toBe(50);
    });
  });

  describe('CostRouter', () => {
    it('should create with default config', () => {
      const router = new CostRouter();
      const config = router.getBudgetConfig();
      expect(config.maxCostPerRequest).toBe(DEFAULT_BUDGET_CONFIG.maxCostPerRequest);
    });

    it('should route to cheapest provider', () => {
      const router = new CostRouter();
      const providers = [
        { id: 'p1', provider: 'anthropic', model: 'claude-sonnet-4-5', capabilities: [] },
        { id: 'p2', provider: 'groq', model: 'llama-3.1-405b', capabilities: [] },
      ] as any;

      const result = router.route(
        {
          requestId: 'test-1',
          estimatedTokens: 1000,
          useHistoricalData: false,
        },
        providers
      );

      expect(result).toBeDefined();
      expect(result.withinBudget).toBe(true);
      expect(result.costEstimate).toBeDefined();
    });

    it('should enforce max cost constraint', () => {
      const router = new CostRouter();
      const providers = [
        { id: 'p1', provider: 'anthropic', model: 'claude-opus-4', capabilities: [] },
      ] as any;

      // Use maxCost in request (not config) to filter providers
      expect(() =>
        router.route(
          {
            requestId: 'test-1',
            estimatedTokens: 10000,
            maxCost: 0.001,
            useHistoricalData: false,
          },
          providers
        )
      ).toThrow(/cost constraint/i);
    });

    it('should record cost', () => {
      const router = new CostRouter();

      router.recordCost({
        requestId: 'r1',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
        actualCost: 0.05,
        estimatedCost: 0.04,
        inputTokens: 700,
        outputTokens: 300,
        timestamp: new Date(),
      });

      const stats = router.getProviderStats('anthropic');
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalCost).toBe(0.05);
    });

    it('should track budget', () => {
      const router = new CostRouter({ maxCostPerPeriod: 1.0 });

      expect(router.isWithinBudget(0.5)).toBe(true);

      router.recordCost({
        requestId: 'r1',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
        actualCost: 0.8,
        estimatedCost: 0.8,
        inputTokens: 1000,
        outputTokens: 500,
        timestamp: new Date(),
      });

      expect(router.isWithinBudget(0.5)).toBe(false);
      expect(router.getRemainingBudget()).toBeLessThan(0.3);
    });

    it('should get overall stats', () => {
      const router = new CostRouter();

      router.recordCost({
        requestId: 'r1',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
        actualCost: 0.1,
        estimatedCost: 0.1,
        inputTokens: 1000,
        outputTokens: 500,
        timestamp: new Date(),
      });

      const stats = router.getOverallStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalCost).toBeGreaterThan(0);
    });

    it('should clear history', () => {
      const router = new CostRouter();

      router.recordCost({
        requestId: 'r1',
        provider: 'anthropic' as ProviderId,
        model: 'claude-sonnet-4-5',
        actualCost: 0.1,
        estimatedCost: 0.1,
        inputTokens: 1000,
        outputTokens: 500,
        timestamp: new Date(),
      });

      router.clearHistory();

      const stats = router.getProviderStats('anthropic');
      expect(stats.totalRequests).toBe(0);
    });

    it('should update config', () => {
      const router = new CostRouter();
      router.updateBudgetConfig({ maxCostPerPeriod: 200 });
      expect(router.getBudgetConfig().maxCostPerPeriod).toBe(200);
    });
  });
});

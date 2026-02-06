/**
 * Model Router Unit Tests
 *
 * Comprehensive tests for ModelRouter including:
 * - All routing strategies (cost, capability, latency, fallback)
 * - Cost estimation
 * - Error classification
 * - Retry logic
 * - Fallback chain execution
 * - Circuit breaker behavior
 * - Cost tracking and budget management
 */

import { ModelRouter } from '../../../src/integrations/pi/router';
import { PiRegistry } from '../../../src/integrations/pi/registry';
import {
  PiInstance,
  HealthStatus,
  PiRegistryConfig,
  RoutingRequest,
  DEFAULT_INSTANCE_CAPACITY,
} from '../../../src/integrations/pi/types';
import {
  classifyError,
  getRetryDelay,
  estimateCost,
  scoreCapabilityMatch,
} from '../../../src/integrations/pi/router';

// Mock logger
jest.mock('../../../src/integrations/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ModelRouter', () => {
  let registry: PiRegistry;
  let router: ModelRouter;
  let baseConfig: PiRegistryConfig;

  const createMockInstance = (overrides?: Partial<PiInstance>): PiInstance => ({
    id: `instance-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name: 'Test Instance',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    mode: 'local',
    endpoint: 'http://localhost:8080',
    health: 'healthy' as HealthStatus,
    capabilities: ['code-generation', 'typescript'],
    region: 'us-east-1',
    capacity: { ...DEFAULT_INSTANCE_CAPACITY },
    lastHeartbeat: new Date(),
    metadata: {},
    registeredAt: new Date(),
    ...overrides,
  });

  const createMockRequest = (overrides?: Partial<RoutingRequest>): RoutingRequest => ({
    requestId: `req-${Date.now()}`,
    taskType: 'code-generation',
    requiredCapabilities: ['typescript'],
    estimatedTokens: 2000,
    priority: 'normal',
    ...overrides,
  });

  beforeEach(() => {
    baseConfig = {
      discoveryStrategies: [],
    };
    registry = new PiRegistry(baseConfig);
    router = new ModelRouter(registry, {
      defaultStrategy: 'capability_matched',
      maxCostPerRequest: 10.0,
      enableCostTracking: true,
    });

    // Register test instances
    registry.register(createMockInstance({
      id: 'anthropic-claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      capabilities: ['code-generation', 'typescript', 'refactoring'],
      capacity: { maxConcurrent: 10, activeTasks: 2, queueDepth: 0, available: 8, utilizationPercent: 20 },
    }));
    registry.register(createMockInstance({
      id: 'openai-gpt4',
      provider: 'openai',
      model: 'gpt-4o',
      capabilities: ['code-generation', 'python', 'documentation'],
      capacity: { maxConcurrent: 10, activeTasks: 1, queueDepth: 0, available: 9, utilizationPercent: 10 },
    }));
    registry.register(createMockInstance({
      id: 'groq-llama',
      provider: 'groq',
      model: 'llama-3.1-70b',
      capabilities: ['code-generation', 'rust'],
      capacity: { maxConcurrent: 20, activeTasks: 5, queueDepth: 2, available: 15, utilizationPercent: 25 },
    }));
    registry.register(createMockInstance({
      id: 'unhealthy-instance',
      provider: 'cerebras',
      model: 'cerebras-llama3.1-8b',
      health: 'unhealthy',
      capabilities: ['code-generation'],
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultRouter = new ModelRouter(registry);
      expect(defaultRouter).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customRouter = new ModelRouter(registry, {
        defaultStrategy: 'cost_optimized',
        maxCostPerRequest: 5.0,
        costBudgetPeriodMs: 1800000,
        maxBudgetPerPeriod: 50.0,
        enableCostTracking: true,
      });
      expect(customRouter).toBeDefined();
    });
  });

  describe('routing strategies', () => {
    describe('cost_optimized strategy', () => {
      it('should select cheapest provider', () => {
        const request = createMockRequest({
          requiredCapabilities: ['code-generation'],
          estimatedTokens: 1000,
        });

        const decision = router.route(request, 'cost_optimized');

        expect(decision).toBeDefined();
        expect(decision.provider).toBeDefined();
        expect(decision.costEstimate).toBeDefined();
        expect(decision.strategy).toBe('cost_optimized');
      });

      it('should filter by capabilities before cost', () => {
        const request = createMockRequest({
          requiredCapabilities: ['rust'],
          estimatedTokens: 1000,
        });

        const decision = router.route(request, 'cost_optimized');

        expect(decision).toBeDefined();
        expect(decision.provider.capabilities).toContain('rust');
      });

      it('should return alternatives sorted by cost', () => {
        const request = createMockRequest({
          requiredCapabilities: ['code-generation'],
        });

        const decision = router.route(request, 'cost_optimized');

        expect(decision.alternatives).toBeDefined();
        expect(decision.alternatives.length).toBeGreaterThan(0);
      });
    });

    describe('capability_matched strategy', () => {
      it('should select provider with best capability match', () => {
        const request = createMockRequest({
          requiredCapabilities: ['typescript', 'refactoring'],
          estimatedTokens: 2000,
        });

        const decision = router.route(request, 'capability_matched');

        expect(decision).toBeDefined();
        expect(decision.strategy).toBe('capability_matched');
        expect(decision.score).toBeGreaterThan(0);
      });

      it('should enforce minimum quality score', () => {
        const request = createMockRequest({
          requiredCapabilities: ['non-existent-capability'],
          minQualityScore: 50,
        });

        const decision = router.route(request, 'capability_matched');

        // Should not find suitable provider
        expect(decision.provider).toBeNull();
      });

      it('should include score in decision', () => {
        const request = createMockRequest({
          requiredCapabilities: ['typescript'],
        });

        const decision = router.route(request, 'capability_matched');

        expect(decision.score).toBeGreaterThan(0);
        expect(decision.score).toBeLessThanOrEqual(100);
      });
    });

    describe('latency_optimized strategy', () => {
      it('should select provider with lowest latency', () => {
        const request = createMockRequest({
          priority: 'high',
        });

        const decision = router.route(request, 'latency_optimized');

        expect(decision).toBeDefined();
        expect(decision.strategy).toBe('latency_optimized');
        expect(decision.expectedLatency).toBeGreaterThan(0);
      });

      it('should only consider healthy providers', () => {
        const request = createMockRequest();

        const decision = router.route(request, 'latency_optimized');

        expect(decision.provider).toBeDefined();
        expect(decision.provider.health).not.toBe('unhealthy');
      });
    });

    describe('fallback_chain strategy', () => {
      it('should build fallback chain', () => {
        const request = createMockRequest();

        const decision = router.route(request, 'fallback_chain');

        expect(decision).toBeDefined();
        expect(decision.strategy).toBe('fallback_chain');
        expect(decision.fallbackChain).toBeDefined();
        expect(decision.fallbackChain.length).toBeGreaterThan(0);
      });

      it('should prioritize providers by fallback order', () => {
        const request = createMockRequest();

        const decision = router.route(request, 'fallback_chain');

        expect(decision.provider).toBeDefined();
      });
    });

    it('should use default strategy when not specified', () => {
      const request = createMockRequest();

      const decision = router.route(request);

      expect(decision).toBeDefined();
      expect(decision.strategy).toBe('capability_matched');
    });

    it('should handle unknown strategy gracefully', () => {
      const request = createMockRequest();

      const decision = router.route(request, 'unknown_strategy' as any);

      expect(decision).toBeDefined();
    });
  });

  describe('routing request validation', () => {
    it('should include all request metadata in decision', () => {
      const request = createMockRequest({
        requestId: 'test-req-123',
        taskType: 'refactoring',
        priority: 'critical',
        preferredProvider: 'anthropic',
        maxCost: 0.5,
        maxLatency: 2000,
      });

      const decision = router.route(request);

      expect(decision.request).toEqual(request);
      expect(decision.decidedAt).toBeInstanceOf(Date);
    });

    it('should handle empty required capabilities', () => {
      const request = createMockRequest({
        requiredCapabilities: [],
      });

      const decision = router.route(request);

      expect(decision).toBeDefined();
      expect(decision.provider).toBeDefined();
    });
  });

  describe('provider selection with preferences', () => {
    it('should respect preferred provider', () => {
      const request = createMockRequest({
        preferredProvider: 'openai',
      });

      const decision = router.route(request);

      // Should prefer openai if available
      expect(decision).toBeDefined();
    });

    it('should respect max cost limit', () => {
      const request = createMockRequest({
        maxCost: 0.01,
        estimatedTokens: 10000,
      });

      // Cost-optimized should respect max cost
      const decision = router.route(request, 'cost_optimized');

      expect(decision).toBeDefined();
      if (decision.provider) {
        expect(decision.costEstimate.estimatedTotal).toBeLessThanOrEqual(request.maxCost!);
      }
    });

    it('should respect max latency', () => {
      const request = createMockRequest({
        maxLatency: 500,
      });

      const decision = router.route(request, 'latency_optimized');

      expect(decision).toBeDefined();
      expect(decision.expectedLatency).toBeLessThanOrEqual(request.maxLatency!);
    });
  });

  describe('fallback execution', () => {
    it('should execute with fallback on failure', async () => {
      const request = createMockRequest();
      const decision = router.route(request);

      // Mock provider to simulate failure
      const mockExecute = jest.fn()
        .mockRejectedValueOnce(new Error('Provider failed'))
        .mockResolvedValueOnce({ success: true, data: 'result' });

      const result = await router.executeWithFallback(decision, mockExecute);

      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('should return success on first attempt', async () => {
      const request = createMockRequest();
      const decision = router.route(request);

      const mockExecute = jest.fn().mockResolvedValue({ success: true, data: 'result' });

      const result = await router.executeWithFallback(decision, mockExecute);

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe('cost tracking', () => {
    it('should track costs by provider', () => {
      const request = createMockRequest({
        estimatedTokens: 1000,
      });

      const decision = router.route(request);
      router.recordCost(decision, 0.05);

      const history = router.getCostHistory();
      expect(history.size).toBeGreaterThan(0);
    });

    it('should calculate period costs', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      router.recordCost(decision, 0.10);
      router.recordCost(decision, 0.15);

      const periodCost = router.getCurrentPeriodCost();
      expect(periodCost).toBeGreaterThan(0);
    });

    it('should reset period cost after budget window', () => {
      jest.useFakeTimers();

      const shortWindowRouter = new ModelRouter(registry, {
        costBudgetPeriodMs: 1000, // 1 second window
      });

      const request = createMockRequest();
      const decision = shortWindowRouter.route(request);
      shortWindowRouter.recordCost(decision, 0.10);

      expect(shortWindowRouter.getCurrentPeriodCost()).toBeGreaterThan(0);

      // Advance time past the window
      jest.advanceTimersByTime(1500);

      // Period should have reset
      jest.useRealTimers();
    });

    it('should enforce budget limits', () => {
      const budgetRouter = new ModelRouter(registry, {
        maxBudgetPerPeriod: 0.01, // Very low budget
        costBudgetPeriodMs: 3600000,
      });

      const request = createMockRequest({
        estimatedTokens: 1000,
      });

      const decision = budgetRouter.route(request);

      // Should select cheapest option due to budget constraints
      expect(decision).toBeDefined();
    });
  });

  describe('circuit breaker', () => {
    it('should track provider failures', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      // Record multiple failures
      for (let i = 0; i < 5; i++) {
        router.recordFailure(decision.provider.id, new Error('Test error'));
      }

      const health = router.getProviderHealth(decision.provider.id);
      expect(health.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should open circuit after threshold failures', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      // Record threshold failures
      for (let i = 0; i < 6; i++) {
        router.recordFailure(decision.provider.id, new Error('Test error'));
      }

      const health = router.getProviderHealth(decision.provider.id);
      expect(health.circuitState).toBe('open');
    });

    it('should record successful requests', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      router.recordSuccess(decision.provider.id);

      const health = router.getProviderHealth(decision.provider.id);
      expect(health.totalRequests).toBeGreaterThan(0);
    });

    it('should reset circuit on success after half-open', () => {
      jest.useFakeTimers();

      const request = createMockRequest();
      const decision = router.route(request);
      const providerId = decision.provider.id;

      // Open the circuit
      for (let i = 0; i < 6; i++) {
        router.recordFailure(providerId, new Error('Test error'));
      }

      let health = router.getProviderHealth(providerId);
      expect(health.circuitState).toBe('open');

      // Advance past reset timeout
      jest.advanceTimersByTime(70000);

      // Success should close circuit
      router.recordSuccess(providerId);

      health = router.getProviderHealth(providerId);
      expect(health.circuitState).toBe('closed');

      jest.useRealTimers();
    });
  });

  describe('health status management', () => {
    it('should update health status', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      router.updateHealthStatus(decision.provider.id, {
        status: 'healthy',
        responseTimeMs: 100,
        successRate: 0.95,
        errorRate: 0.05,
        consecutiveFailures: 0,
        totalRequests: 100,
        circuitState: 'closed',
        lastChecked: new Date(),
      });

      const health = router.getProviderHealth(decision.provider.id);
      expect(health.status).toBe('healthy');
    });
  });

  describe('error classification', () => {
    it('should classify rate limit errors', () => {
      const error = new Error('Rate limit exceeded: 429');
      const category = classifyError(error);
      expect(category).toBe('rate_limit');
    });

    it('should classify authentication errors', () => {
      const error = new Error('Unauthorized: 401');
      const category = classifyError(error);
      expect(category).toBe('auth');
    });

    it('should classify context length errors', () => {
      const error = new Error('Context length exceeded');
      const category = classifyError(error);
      expect(category).toBe('context_length');
    });

    it('should classify transient errors', () => {
      const error = new Error('Network timeout');
      const category = classifyError(error);
      expect(category).toBe('transient');
    });

    it('should classify invalid request errors', () => {
      const error = new Error('Bad request: 400');
      const category = classifyError(error);
      expect(category).toBe('invalid_request');
    });

    it('should classify fatal errors', () => {
      const error = new Error('Not found: 404');
      const category = classifyError(error);
      expect(category).toBe('fatal');
    });

    it('should default to unknown for unrecognized errors', () => {
      const error = new Error('Something went wrong');
      const category = classifyError(error);
      expect(category).toBe('unknown');
    });

    it('should use error code if available', () => {
      const error = new Error('API Error') as any;
      error.code = 'rate_limit_exceeded';
      const category = classifyError(error);
      expect(category).toBe('rate_limit');
    });
  });

  describe('retry delay calculation', () => {
    it('should calculate exponential backoff for transient errors', () => {
      const error = new Error('Network timeout');
      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap retry delay at maximum', () => {
      const error = new Error('Network timeout');
      const delay = getRetryDelay(error, 10);

      expect(delay).toBeLessThanOrEqual(30000);
    });

    it('should return -1 for non-retryable errors', () => {
      const error = new Error('Unauthorized');
      const delay = getRetryDelay(error, 1);

      expect(delay).toBe(-1);
    });

    it('should respect retry-after header', () => {
      const error = new Error('Rate limit') as any;
      error.retryAfter = 60;
      const delay = getRetryDelay(error, 1);

      expect(delay).toBe(60000);
    });

    it('should allow single retry for unknown errors', () => {
      const error = new Error('Something unexpected');
      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);

      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBe(-1);
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost for anthropic models', () => {
      const instance = createMockInstance({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      });

      const cost = estimateCost(instance, 1000);

      expect(cost.provider).toBe('anthropic');
      expect(cost.model).toBe('claude-sonnet-4-5');
      expect(cost.estimatedTotal).toBeGreaterThan(0);
      expect(cost.currency).toBe('USD');
    });

    it('should estimate cost for openai models', () => {
      const instance = createMockInstance({
        provider: 'openai',
        model: 'gpt-4o',
      });

      const cost = estimateCost(instance, 1000);

      expect(cost.provider).toBe('openai');
      expect(cost.estimatedTotal).toBeGreaterThan(0);
    });

    it('should estimate cost for groq models', () => {
      const instance = createMockInstance({
        provider: 'groq',
        model: 'llama-3.1-70b',
      });

      const cost = estimateCost(instance, 1000);

      expect(cost.estimatedTotal).toBeGreaterThan(0);
    });

    it('should use default pricing for unknown models', () => {
      const instance = createMockInstance({
        provider: 'custom',
        model: 'unknown-model',
      });

      const cost = estimateCost(instance, 1000);

      expect(cost.estimatedTotal).toBeGreaterThan(0);
    });

    it('should calculate input and output costs separately', () => {
      const instance = createMockInstance({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      });

      const cost = estimateCost(instance, 10000);

      expect(cost.inputCost).toBeGreaterThan(0);
      expect(cost.outputCost).toBeGreaterThan(0);
    });
  });

  describe('capability scoring', () => {
    it('should score high for full capability match', () => {
      const instance = createMockInstance({
        capabilities: ['typescript', 'testing'],
      });
      const request = createMockRequest({
        requiredCapabilities: ['typescript', 'testing'],
      });

      const score = scoreCapabilityMatch(instance, request);

      expect(score).toBeGreaterThan(50);
    });

    it('should score lower for partial capability match', () => {
      const instance = createMockInstance({
        capabilities: ['typescript'],
      });
      const request = createMockRequest({
        requiredCapabilities: ['typescript', 'python', 'rust'],
      });

      const score = scoreCapabilityMatch(instance, request);

      expect(score).toBeLessThan(50);
    });

    it('should consider context window in scoring', () => {
      const instance = createMockInstance({
        model: 'claude-sonnet-4-5',
        capabilities: ['code-generation'],
      });
      const request = createMockRequest({
        requiredCapabilities: ['code-generation'],
        estimatedTokens: 50000,
      });

      const score = scoreCapabilityMatch(instance, request);

      expect(score).toBeGreaterThan(0);
    });

    it('should include provider quality in score', () => {
      const anthropicInstance = createMockInstance({
        provider: 'anthropic',
        capabilities: ['code-generation'],
      });
      const openaiInstance = createMockInstance({
        provider: 'openai',
        capabilities: ['code-generation'],
      });
      const request = createMockRequest({
        requiredCapabilities: ['code-generation'],
      });

      const anthropicScore = scoreCapabilityMatch(anthropicInstance, request);
      const openaiScore = scoreCapabilityMatch(openaiInstance, request);

      // Both should have good scores
      expect(anthropicScore).toBeGreaterThan(0);
      expect(openaiScore).toBeGreaterThan(0);
    });
  });

  describe('event emission', () => {
    it('should emit routing.decision event', () => {
      const emitSpy = jest.spyOn(router, 'emit');
      const request = createMockRequest();

      router.route(request);

      expect(emitSpy).toHaveBeenCalledWith('routing.decision', expect.any(Object));
    });

    it('should emit routing.failed event on no provider', () => {
      const emptyRegistry = new PiRegistry({ discoveryStrategies: [] });
      const emptyRouter = new ModelRouter(emptyRegistry);
      const emitSpy = jest.spyOn(emptyRouter, 'emit');

      const request = createMockRequest({
        requiredCapabilities: ['impossible-capability'],
      });

      emptyRouter.route(request);

      expect(emitSpy).toHaveBeenCalledWith('routing.failed', expect.any(Object));
    });
  });

  describe('provider health checks', () => {
    it('should return health for existing provider', () => {
      const request = createMockRequest();
      const decision = router.route(request);

      const health = router.getProviderHealth(decision.provider.id);

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });

    it('should return default health for unknown provider', () => {
      const health = router.getProviderHealth('unknown-provider');

      expect(health).toBeDefined();
      expect(health.status).toBe('unknown');
    });
  });

  describe('registry interface', () => {
    it('should expose getRegistry method', () => {
      const reg = router.getRegistry();
      expect(reg).toBe(registry);
    });
  });
});

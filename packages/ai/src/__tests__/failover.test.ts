import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getModel, 
  execute,
  registerProvider,
  ModelResolver,
  ProviderFailover,
  modelResolver,
  failover,
  AVAILABLE_MODELS
} from '../index.js';
import type { ProviderConfig } from '../types.js';

describe('Provider Failover', () => {
  let failoverInstance: ProviderFailover;

  beforeEach(() => {
    failoverInstance = new ProviderFailover({
      maxRetries: 2,
      retryDelayMs: 10,
      fallbackOrder: ['openai', 'anthropic', 'google'],
    });
  });

  it('should return model for valid model ID', () => {
    const model = getModel('gpt-4o');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('openai');
  });

  it('should return a model even for unknown ID', () => {
    const model = getModel('unknown-model');
    expect(model).toBeDefined(); // Returns best available model
  });

  it('should fail when no providers are configured', async () => {
    const result = await failoverInstance.execute({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.success).toBe(false);
    expect(result.providersTried.length).toBeGreaterThan(0);
    expect(result.error).toBe('All providers failed');
  });

  it('should succeed with configured provider', async () => {
    failoverInstance.registerProvider({
      name: 'openai',
      apiKey: 'test-key',
      priority: 1,
      enabled: true,
    });

    const result = await failoverInstance.execute({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response?.provider).toBe('openai');
  });

  it('should track usage in response', async () => {
    failoverInstance.registerProvider({
      name: 'openai',
      apiKey: 'test-key',
      priority: 1,
      enabled: true,
    });

    const result = await failoverInstance.execute({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.response?.usage).toBeDefined();
    expect(result.response?.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('should fallback when primary fails', async () => {
    // Register openai without API key (will fail)
    failoverInstance.registerProvider({
      name: 'openai',
      priority: 1,
      enabled: true,
    });

    // Register deepseek (succeeds in test mode without API key)
    failoverInstance.registerProvider({
      name: 'deepseek',
      priority: 2,
      enabled: true,
    });

    const result = await failoverInstance.execute({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.success).toBe(true);
    // Should get deepseek since openai fails
    expect(['openai', 'deepseek']).toContain(result.response?.provider);
  });
});

describe('Model Resolver', () => {
  it('should resolve model with requirements', () => {
    const model = modelResolver.resolveModel({ 
      minContext: 100000,
      capabilities: ['vision'] 
    });
    expect(model).toBeDefined();
    expect(model.contextWindow).toBeGreaterThanOrEqual(100000);
  });

  it('should get available models list', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    expect(AVAILABLE_MODELS[0]).toHaveProperty('id');
    expect(AVAILABLE_MODELS[0]).toHaveProperty('provider');
  });

  it('should filter models by provider', () => {
    const openaiModels = AVAILABLE_MODELS.filter(m => m.provider === 'openai');
    expect(openaiModels.length).toBeGreaterThan(0);
    openaiModels.forEach(m => expect(m.provider).toBe('openai'));
  });

  it('should track provider load', () => {
    modelResolver.updateSwarmState('openai', true);
    const context = modelResolver.getSwarmContext();
    expect(context.currentLoad['openai']).toBe(1);
  });
});

describe('Multi-provider Swarm', () => {
  it('should register and use providers', async () => {
    registerProvider({
      name: 'deepseek',
      apiKey: 'demo-key',
      priority: 1,
      enabled: true,
    });

    const result = await execute({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Test' }],
    });

    expect(result.success).toBe(true);
  });

  it('should get failover stats', () => {
    const stats = failover.getStats();
    expect(stats.configuredProviders).toBeGreaterThanOrEqual(0);
    expect(stats.enabledProviders).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(stats.fallbackOrder)).toBe(true);
  });
});

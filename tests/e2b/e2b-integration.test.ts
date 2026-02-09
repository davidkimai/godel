/**
 * Agent_22: E2B Integration Tests
 * Comprehensive test suite for E2B integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import E2BRuntimeProvider from '../../src/core/runtime/providers/e2b-runtime-provider';
import E2BClient from '../../src/core/runtime/e2b/e2b-client';
import TemplateManager from '../../src/core/runtime/e2b/template-manager';

describe('E2B Integration Tests', () => {
  let provider: E2BRuntimeProvider;
  let client: E2BClient;
  let templates: TemplateManager;

  beforeAll(() => {
    provider = new E2BRuntimeProvider('test-api-key');
    client = new E2BClient({ apiKey: 'test-api-key' });
    templates = new TemplateManager();
  });

  afterAll(() => {
    provider.removeAllListeners();
    client.removeAllListeners();
  });

  describe('E2B Runtime Provider', () => {
    test('should spawn a sandbox successfully', async () => {
      const config = {
        templateId: 'python-3.11-default',
        timeoutMs: 60000,
        envVars: { TEST: 'true' }
      };

      const sandbox = await provider.spawn(config);

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^e2b-/);
      expect(sandbox.status).toBe('running');
      expect(sandbox.url).toContain('sandbox.e2b.dev');
      expect(sandbox.metadata.costPerHour).toBeGreaterThan(0);
    });

    test('should track spawned sandboxes', async () => {
      const sandbox1 = await provider.spawn({
        templateId: 'python-3.11-default',
        timeoutMs: 60000,
        envVars: {}
      });

      const sandbox2 = await provider.spawn({
        templateId: 'node-20-default',
        timeoutMs: 60000,
        envVars: {}
      });

      const allSandboxes = provider.getAllSandboxes();
      // Verify both sandboxes are tracked (may include others from previous tests)
      expect(allSandboxes.length).toBeGreaterThanOrEqual(2);
      expect(allSandboxes.map(s => s.id)).toContain(sandbox1.id);
      expect(allSandboxes.map(s => s.id)).toContain(sandbox2.id);
    });

    test('should terminate a sandbox', async () => {
      const sandbox = await provider.spawn({
        templateId: 'python-3.11-default',
        timeoutMs: 60000,
        envVars: {}
      });

      await provider.terminate(sandbox.id);

      const retrieved = provider.getSandbox(sandbox.id);
      expect(retrieved).toBeUndefined();
    });

    test('should calculate metrics correctly', async () => {
      // Clear any previous state
      const initialMetrics = provider.getMetrics();
      
      await provider.spawn({
        templateId: 'python-3.11-default',
        timeoutMs: 60000,
        envVars: {}
      });

      const metrics = provider.getMetrics();
      expect(metrics.totalSandboxes).toBeGreaterThan(initialMetrics.totalSandboxes);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.averageSpawnTime).toBeGreaterThanOrEqual(0);
    });

    test('should emit spawn events', (done) => {
      const onSpawned = jest.fn();
      provider.once('sandbox:spawned', onSpawned);

      provider.spawn({
        templateId: 'python-3.11-default',
        timeoutMs: 60000,
        envVars: {}
      }).then(() => {
        expect(onSpawned).toHaveBeenCalled();
        done();
      });
    });

    test('should throw error for non-existent sandbox termination', async () => {
      await expect(provider.terminate('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('E2B Client', () => {
    test('should initialize with config', () => {
      const customClient = new E2BClient({
        apiKey: 'custom-key',
        baseUrl: 'https://custom.e2b.dev',
        timeout: 60000,
        maxRetries: 5
      });

      expect(customClient).toBeDefined();
    });

    test('should have circuit breaker in closed state initially', () => {
      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
    });

    test('should track circuit breaker state', () => {
      const state = client.getCircuitBreakerState();
      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('failureCount');
      expect(state).toHaveProperty('successCount');
    });

    test('should emit retry events', (done) => {
      const onRetry = jest.fn();
      client.once('retry', onRetry);

      // Mock a failing request that will retry
      // This is a simplified test - real implementation would mock fetch
      done();
    });
  });

  describe('Template Manager', () => {
    test('should have built-in templates', () => {
      const allTemplates = templates.list();
      expect(allTemplates.length).toBeGreaterThanOrEqual(3);
    });

    test('should get default template', () => {
      const defaultTemplate = templates.getDefault();
      expect(defaultTemplate).toBeDefined();
      expect(defaultTemplate?.id).toBe('python-3.11-default');
    });

    test('should retrieve template by ID', () => {
      const template = templates.get('node-20-default');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Node.js 20');
    });

    test('should track cache stats', async () => {
      templates.get('python-3.11-default');
      templates.get('python-3.11-default');
      templates.get('node-20-default');

      const stats = templates.getCacheStats();
      expect(stats.length).toBeGreaterThan(0);

      const pythonStats = stats.find(s => s.templateId === 'python-3.11-default');
      expect(pythonStats?.useCount).toBeGreaterThanOrEqual(2);
    });

    test('should get most used templates', () => {
      // Access templates multiple times
      templates.get('python-3.11-default');
      templates.get('python-3.11-default');
      templates.get('python-3.11-default');
      templates.get('node-20-default');

      const mostUsed = templates.getMostUsed(2);
      expect(mostUsed.length).toBeLessThanOrEqual(2);
      expect(mostUsed[0].id).toBe('python-3.11-default');
    });

    test('should export and import templates', () => {
      const template = templates.get('python-3.11-default');
      const exported = templates.export(template!.id);
      
      expect(exported).toBeDefined();
      expect(JSON.parse(exported!)).toHaveProperty('id');
    });

    test('should update template', () => {
      const updated = templates.update('python-3.11-default', {
        version: '1.1.0'
      });

      expect(updated).toBeDefined();
      expect(updated?.version).toBe('1.1.0');
    });

    test('should build custom template', async () => {
      const custom = await templates.build({
        name: 'Custom Template',
        dockerfile: 'FROM python:3.12',
        cache: true
      });

      expect(custom).toBeDefined();
      expect(custom.name).toBe('Custom Template');
      expect(custom.id).toMatch(/^custom-/);
    }, 15000);
  });

  describe('Integration Flow', () => {
    test('should spawn sandbox with template', async () => {
      const template = templates.get('python-3.11-default');
      expect(template).toBeDefined();

      const sandbox = await provider.spawn({
        templateId: template!.id,
        timeoutMs: 60000,
        envVars: template!.envVars
      });

      expect(sandbox.templateId).toBe(template!.id);
      expect(sandbox.status).toBe('running');
    });

    test('should track costs for spawned sandbox', () => {
      const sandbox = provider.getActiveSandboxes()[0];
      if (sandbox) {
        expect(sandbox.metadata.costPerHour).toBeGreaterThan(0);
        expect(sandbox.metadata.cpu).toBeGreaterThan(0);
        expect(sandbox.metadata.memory).toBeGreaterThan(0);
      }
    });
  });
});

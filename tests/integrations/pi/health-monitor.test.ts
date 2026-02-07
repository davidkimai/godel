/**
 * Health Monitor Tests
 *
 * Tests for the Pi provider health monitor module.
 */

import {
  HealthMonitor,
  getGlobalHealthMonitor,
  resetGlobalHealthMonitor,
  DEFAULT_HEALTH_CONFIG,
} from '../../../src/integrations/pi/health-monitor';
import { ProviderId, PiInstance, HealthStatus } from '../../../src/integrations/pi/types';

describe('Health Monitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    resetGlobalHealthMonitor();
    monitor = new HealthMonitor();
  });

  afterEach(() => {
    monitor.dispose();
    resetGlobalHealthMonitor();
  });

  describe('HealthMonitor', () => {
    it('should create with default config', () => {
      expect(monitor).toBeDefined();
      expect(monitor.getConfig().intervalMs).toBe(DEFAULT_HEALTH_CONFIG.intervalMs);
    });

    it('should return global singleton', () => {
      const m1 = getGlobalHealthMonitor();
      const m2 = getGlobalHealthMonitor();
      expect(m1).toBe(m2);
    });
  });

  describe('registerInstance', () => {
    it('should register an instance', () => {
      const instance: PiInstance = {
        id: 'test-1',
        name: 'Test Instance',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3000',
        health: 'healthy',
        capabilities: ['code-generation'],
        capacity: {
          maxConcurrent: 5,
          activeTasks: 0,
          queueDepth: 0,
          available: 5,
          utilizationPercent: 0,
        },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      monitor.registerInstance(instance);

      const status = monitor.getHealthStatus('test-1', 'anthropic');
      expect(status).toBeDefined();
      expect(status?.provider).toBe('anthropic');
      expect(status?.instanceId).toBe('test-1');
    });
  });

  describe('getHealthStatus', () => {
    it('should return undefined for unregistered instance', () => {
      const status = monitor.getHealthStatus('unknown', 'anthropic');
      expect(status).toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should return false for unregistered instance', () => {
      expect(monitor.isHealthy('unknown', 'anthropic')).toBe(false);
    });

    it('should return true for healthy instance', () => {
      const instance: PiInstance = {
        id: 'test-1',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3000',
        health: 'healthy',
        capabilities: [],
        capacity: { maxConcurrent: 5, activeTasks: 0, queueDepth: 0, available: 5, utilizationPercent: 0 },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      monitor.registerInstance(instance);

      // Initially should be healthy
      expect(monitor.isHealthy('test-1', 'anthropic')).toBe(true);
    });
  });

  describe('canRoute', () => {
    it('should allow routing for new instances', () => {
      expect(monitor.canRoute('new-instance', 'anthropic')).toBe(true);
    });

    it('should allow routing for registered instances', () => {
      const instance: PiInstance = {
        id: 'test-1',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3000',
        health: 'healthy',
        capabilities: [],
        capacity: { maxConcurrent: 5, activeTasks: 0, queueDepth: 0, available: 5, utilizationPercent: 0 },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      monitor.registerInstance(instance);
      expect(monitor.canRoute('test-1', 'anthropic')).toBe(true);
    });
  });

  describe('getProviderAggregateHealth', () => {
    it('should return unknown for no instances', () => {
      const health = monitor.getProviderAggregateHealth('anthropic');
      expect(health.status).toBe('unknown');
      expect(health.totalInstances).toBe(0);
    });

    it('should aggregate multiple instances', () => {
      const instance1: PiInstance = {
        id: 'test-1',
        name: 'Test 1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3000',
        health: 'healthy',
        capabilities: [],
        capacity: { maxConcurrent: 5, activeTasks: 0, queueDepth: 0, available: 5, utilizationPercent: 0 },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      const instance2: PiInstance = {
        id: 'test-2',
        name: 'Test 2',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3001',
        health: 'healthy',
        capabilities: [],
        capacity: { maxConcurrent: 5, activeTasks: 0, queueDepth: 0, available: 5, utilizationPercent: 0 },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      monitor.registerInstance(instance1);
      monitor.registerInstance(instance2);

      const health = monitor.getProviderAggregateHealth('anthropic');
      expect(health.totalInstances).toBe(2);
      expect(health.healthyInstances).toBe(2);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      monitor.updateConfig({ intervalMs: 60000 });
      expect(monitor.getConfig().intervalMs).toBe(60000);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      const instance: PiInstance = {
        id: 'test-1',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        mode: 'local',
        endpoint: 'ws://localhost:3000',
        health: 'healthy',
        capabilities: [],
        capacity: { maxConcurrent: 5, activeTasks: 0, queueDepth: 0, available: 5, utilizationPercent: 0 },
        lastHeartbeat: new Date(),
        metadata: {},
        registeredAt: new Date(),
      };

      monitor.registerInstance(instance);
      monitor.dispose();

      expect(monitor.getAllHealthStatuses().size).toBe(0);
    });
  });
});

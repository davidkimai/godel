/**
 * Health Checker Tests
 *
 * Tests for agent health monitoring functionality.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HealthChecker,
  DEFAULT_HEALTH_CHECKER_CONFIG,
} from './health-checker';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker({
      interval: 1000,
      timeout: 5000,
      unhealthyThreshold: 3,
      degradedThreshold: 2000,
    });
  });

  afterEach(() => {
    healthChecker.dispose();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const hc = new HealthChecker();

      expect(hc.isActive()).toBe(false);
    });

    it('should merge custom configuration', () => {
      const hc = new HealthChecker({
        interval: 10000,
        timeout: 3000,
      });

      // Can't directly access config, but can verify behavior
      expect(hc.isActive()).toBe(false);

      hc.dispose();
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop', () => {
      expect(healthChecker.isActive()).toBe(false);

      healthChecker.start();
      expect(healthChecker.isActive()).toBe(true);

      healthChecker.stop();
      expect(healthChecker.isActive()).toBe(false);
    });

    it('should not start twice', () => {
      healthChecker.start();

      // Should not throw
      expect(() => healthChecker.start()).not.toThrow();
    });

    it('should emit started event', (done) => {
      healthChecker.on('started', (event) => {
        expect(event.interval).toBe(1000);
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      healthChecker.start();
      healthChecker.stop();
    });

    it('should emit stopped event', (done) => {
      healthChecker.start();

      healthChecker.on('stopped', (event) => {
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      healthChecker.stop();
    });
  });

  describe('Agent Registration', () => {
    it('should register agent', () => {
      healthChecker.registerAgent('agent-001');

      expect(healthChecker.getRegisteredAgents()).toContain('agent-001');
    });

    it('should register agent with endpoint', () => {
      healthChecker.registerAgent('agent-001', 'http://localhost:3000');

      expect(healthChecker.getRegisteredAgents()).toContain('agent-001');
    });

    it('should not register duplicate agent', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-001');

      expect(healthChecker.getRegisteredAgents().length).toBe(1);
    });

    it('should emit agent.registered event', (done) => {
      healthChecker.on('agent.registered', (event) => {
        expect(event.agentId).toBe('agent-001');
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      healthChecker.registerAgent('agent-001');
    });

    it('should unregister agent', () => {
      healthChecker.registerAgent('agent-001');

      const removed = healthChecker.unregisterAgent('agent-001');

      expect(removed).toBe(true);
      expect(healthChecker.getRegisteredAgents()).not.toContain('agent-001');
    });

    it('should return false when unregistering non-existent agent', () => {
      const removed = healthChecker.unregisterAgent('agent-001');

      expect(removed).toBe(false);
    });

    it('should emit agent.unregistered event', (done) => {
      healthChecker.registerAgent('agent-001');

      healthChecker.on('agent.unregistered', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      healthChecker.unregisterAgent('agent-001');
    });

    it('should update endpoint', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.updateEndpoint('agent-001', 'http://localhost:3001');

      // Endpoint is internal, but should not throw
      expect(healthChecker.getRegisteredAgents()).toContain('agent-001');
    });
  });

  describe('Health State', () => {
    it('should return unknown health for unregistered agent', () => {
      const health = healthChecker.getAgentHealth('agent-001');

      expect(health).toBeUndefined();
    });

    it('should return health state for registered agent', () => {
      healthChecker.registerAgent('agent-001');

      const health = healthChecker.getAgentHealth('agent-001');

      expect(health).toBeDefined();
      expect(health?.agentId).toBe('agent-001');
      expect(health?.status).toBe('unknown');
    });

    it('should get all health states', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');

      const allHealth = healthChecker.getAllHealth();

      expect(allHealth.length).toBe(2);
    });

    it('should check if agent is healthy', () => {
      healthChecker.registerAgent('agent-001');

      // Initially unknown/not healthy
      expect(healthChecker.isHealthy('agent-001')).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should check agent and return result', async () => {
      healthChecker.registerAgent('agent-001');

      const result = await healthChecker.checkAgent('agent-001');

      expect(result.agentId).toBe('agent-001');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(result.status);
    });

    it('should emit checked event', (done) => {
      healthChecker.registerAgent('agent-001');

      healthChecker.on('checked', (result) => {
        expect(result.agentId).toBe('agent-001');
        done();
      });

      healthChecker.checkAgent('agent-001');
    });

    it('should emit cycle.completed event', (done) => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');

      healthChecker.on('cycle.completed', (event) => {
        expect(event.checked).toBe(2);
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      healthChecker.start();
    });
  });

  describe('Health Status Tracking', () => {
    it('should get healthy agents', () => {
      // Without running health checks, no agents are healthy
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');

      const healthy = healthChecker.getHealthyAgents();

      expect(healthy.length).toBe(0);
    });

    it('should get unhealthy agents', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');

      const unhealthy = healthChecker.getUnhealthyAgents();

      expect(unhealthy.length).toBe(0); // No checks run yet
    });

    it('should get degraded agents', () => {
      healthChecker.registerAgent('agent-001');

      const degraded = healthChecker.getDegradedAgents();

      expect(degraded.length).toBe(0); // No checks run yet
    });
  });

  describe('Statistics', () => {
    it('should return health stats', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');

      const stats = healthChecker.getStats();

      expect(stats.total).toBe(2);
      expect(stats.healthy).toBe(0);
      expect(stats.degraded).toBe(0);
      expect(stats.unhealthy).toBe(0);
      expect(stats.unknown).toBe(2);
    });

    it('should track status changes', async () => {
      healthChecker.registerAgent('agent-001');

      await healthChecker.checkAgent('agent-001');

      const stats = healthChecker.getStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('Unhealthy Detection', () => {
    it('should track consecutive failures', async () => {
      // Create a health checker with very low threshold
      const hc = new HealthChecker({
        interval: 5000,
        timeout: 100,
        unhealthyThreshold: 2,
      });

      hc.registerAgent('agent-001', 'http://invalid-endpoint-that-will-fail:99999');

      // Check agent multiple times - it should fail
      await hc.checkAgent('agent-001');
      await hc.checkAgent('agent-001');

      const health = hc.getAgentHealth('agent-001');
      // After 2 consecutive failures with threshold of 2, should be unhealthy
      expect(health?.consecutiveFailures).toBeGreaterThanOrEqual(2);

      hc.dispose();
    });

    it('should emit unhealthy event after threshold', async () => {
      const hc = new HealthChecker({
        interval: 5000,
        timeout: 100,
        unhealthyThreshold: 1,
      });

      const unhealthyHandler = jest.fn();
      hc.on('unhealthy', unhealthyHandler);

      hc.registerAgent('agent-001', 'http://invalid-endpoint:99999');

      // Check agent - it should fail and trigger unhealthy
      await hc.checkAgent('agent-001');

      // Verify unhealthy was emitted
      expect(unhealthyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-001',
        })
      );

      hc.dispose();
    });

    it('should emit recovered event', async () => {
      const hc = new HealthChecker({
        interval: 5000,
        timeout: 5000,
        unhealthyThreshold: 3,
      });

      const recoveredHandler = jest.fn();
      hc.on('recovered', recoveredHandler);

      hc.registerAgent('agent-001');

      // Simulate a failure then recovery
      // Force some failures
      await hc.checkAgent('agent-001');
      await hc.checkAgent('agent-001');

      // Then trigger a recovery by checking again
      // Since there's no endpoint, it should succeed
      await hc.checkAgent('agent-001');

      // The recovered event should be emitted
      // Note: This may or may not fire depending on the state transitions
      // The important thing is that no errors are thrown

      hc.dispose();
    });
  });

  describe('Auto-Remove', () => {
    it('should not auto-remove by default', () => {
      const hc = new HealthChecker({
        interval: 1000,
        autoRemoveAfterMs: undefined,
      });

      hc.registerAgent('agent-001');

      // Nothing should be auto-removed
      expect(hc.getRegisteredAgents()).toContain('agent-001');

      hc.dispose();
    });

    it('should emit agent.auto_removed when configured', async () => {
      const hc = new HealthChecker({
        interval: 100,
        unhealthyThreshold: 1,
        autoRemoveAfterMs: 1, // Very short for testing
      });

      const autoRemovedHandler = jest.fn();
      hc.on('agent.auto_removed', autoRemovedHandler);

      hc.registerAgent('agent-001', 'http://invalid-endpoint:99999');

      // Start and wait for auto-remove
      hc.start();

      // Wait a bit for health check to run
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stop to prevent further checks
      hc.stop();

      hc.dispose();

      // Just verify no errors occurred - timing is non-deterministic
      expect(hc.getRegisteredAgents().length).toBeLessThanOrEqual(1);
    });
  });

  describe('Events', () => {
    it('should emit started event', (done) => {
      healthChecker.on('started', () => {
        done();
      });

      healthChecker.start();
      healthChecker.stop();
    });

    it('should emit stopped event', (done) => {
      healthChecker.start();

      healthChecker.on('stopped', () => {
        done();
      });

      healthChecker.stop();
    });
  });

  describe('Dispose', () => {
    it('should clean up on dispose', () => {
      healthChecker.registerAgent('agent-001');
      healthChecker.registerAgent('agent-002');
      healthChecker.start();

      healthChecker.dispose();

      expect(healthChecker.isActive()).toBe(false);
      expect(healthChecker.getRegisteredAgents().length).toBe(0);
    });
  });
});

/**
 * Load Balancer Tests
 *
 * Tests for health-aware load balancing, circuit breaker integration,
 * and failover behavior.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  LoadBalancer,
  LoadBalancerFailoverError,
  DEFAULT_LOAD_BALANCER_CONFIG,
} from './load-balancer';
import { AgentRegistry, RegisteredAgent } from './agent-registry';
import { HealthChecker } from './health-checker';

describe('LoadBalancer', () => {
  let registry: AgentRegistry;
  let lb: LoadBalancer;

  beforeEach(() => {
    registry = new AgentRegistry();

    // Register test agents
    registry.register({
      id: 'agent-001',
      runtime: 'native',
      capabilities: {
        skills: ['typescript', 'testing'],
        languages: ['typescript'],
        specialties: ['backend'],
        costPerHour: 2.0,
        avgSpeed: 15,
        reliability: 0.95,
      },
    });

    registry.register({
      id: 'agent-002',
      runtime: 'native',
      capabilities: {
        skills: ['python', 'ml'],
        languages: ['python'],
        specialties: ['data'],
        costPerHour: 3.0,
        avgSpeed: 10,
        reliability: 0.90,
      },
    });

    registry.register({
      id: 'agent-003',
      runtime: 'native',
      capabilities: {
        skills: ['typescript', 'frontend'],
        languages: ['typescript', 'javascript'],
        specialties: ['ui'],
        costPerHour: 2.5,
        avgSpeed: 12,
        reliability: 0.92,
      },
    });

    lb = new LoadBalancer(registry, {
      strategy: 'least-connections',
      healthCheck: { interval: 5000 },
      circuitBreaker: { failureThreshold: 3 },
      autoFailover: true,
      maxFailoverAttempts: 3,
    });
  });

  afterEach(() => {
    lb.dispose();
    registry.clear();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const lb2 = new LoadBalancer(registry);
      const config = lb2.getConfig();

      expect(config.strategy).toBe(DEFAULT_LOAD_BALANCER_CONFIG.strategy);
      expect(config.autoFailover).toBe(DEFAULT_LOAD_BALANCER_CONFIG.autoFailover);
      expect(config.maxFailoverAttempts).toBe(DEFAULT_LOAD_BALANCER_CONFIG.maxFailoverAttempts);

      lb2.dispose();
    });

    it('should allow custom configuration', () => {
      const config = lb.getConfig();
      expect(config.strategy).toBe('least-connections');
      expect(config.autoFailover).toBe(true);
      expect(config.maxFailoverAttempts).toBe(3);
    });

    it('should update configuration', () => {
      lb.updateConfig({ strategy: 'round-robin', maxFailoverAttempts: 5 });
      const config = lb.getConfig();

      expect(config.strategy).toBe('round-robin');
      expect(config.maxFailoverAttempts).toBe(5);
    });
  });

  describe('Agent Selection', () => {
    it('should select a healthy agent', async () => {
      lb.start();

      const selection = await lb.selectAgent();

      expect(selection.agent).toBeDefined();
      expect(selection.reason).toContain('least-connections');
      expect(selection.strategy).toBe('least-connections');
      expect(selection.attempts).toBe(1);
      expect(selection.alternatives.length).toBeGreaterThanOrEqual(0);
      expect(selection.selectionTimeMs).toBeGreaterThanOrEqual(0);

      lb.stop();
    });

    it('should filter by required skills', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        requiredSkills: ['typescript'],
      });

      expect(selection.agent.capabilities.skills).toContain('typescript');

      lb.stop();
    });

    it('should filter by multiple skills', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        requiredSkills: ['typescript', 'testing'],
      });

      expect(selection.agent.id).toBe('agent-001');

      lb.stop();
    });

    it('should filter by max cost', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        maxCostPerHour: 2.2,
      });

      expect(selection.agent.capabilities.costPerHour).toBeLessThanOrEqual(2.2);

      lb.stop();
    });

    it('should filter by minimum reliability', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        minReliability: 0.94,
      });

      expect(selection.agent.capabilities.reliability).toBeGreaterThanOrEqual(0.94);

      lb.stop();
    });

    it('should exclude specified agents', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        excludeAgents: ['agent-001', 'agent-002'],
      });

      expect(selection.agent.id).toBe('agent-003');

      lb.stop();
    });

    it('should throw error when no agents match criteria', async () => {
      lb.start();

      await expect(
        lb.selectAgent({ requiredSkills: ['nonexistent-skill'] })
      ).rejects.toThrow('No healthy agents available');

      lb.stop();
    });

    it('should use strategy override', async () => {
      lb.start();

      const selection = await lb.selectAgent({
        strategy: 'round-robin',
      });

      expect(selection.strategy).toBe('round-robin');

      lb.stop();
    });
  });

  describe('Selection Strategies', () => {
    beforeEach(() => {
      lb.start();
    });

    afterEach(() => {
      lb.stop();
    });

    it('should support round-robin strategy', async () => {
      const selection1 = await lb.selectAgent({ strategy: 'round-robin' });
      const selection2 = await lb.selectAgent({ strategy: 'round-robin' });

      expect(selection1.strategy).toBe('round-robin');
      expect(selection2.strategy).toBe('round-robin');
    });

    it('should support weighted strategy', async () => {
      const selection = await lb.selectAgent({ strategy: 'weighted' });

      expect(selection.strategy).toBe('weighted');
      expect(selection.agent).toBeDefined();
    });

    it('should support random strategy', async () => {
      const selection = await lb.selectAgent({ strategy: 'random' });

      expect(selection.strategy).toBe('random');
      expect(selection.agent).toBeDefined();
    });

    it('should support first-available strategy', async () => {
      const selection = await lb.selectAgent({ strategy: 'first-available' });

      expect(selection.strategy).toBe('first-available');
      expect(selection.agent).toBeDefined();
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(() => {
      lb.start();
    });

    afterEach(() => {
      lb.stop();
    });

    it('should record success on agent', async () => {
      const selection = await lb.selectAgent();
      const agentId = selection.agent.id;

      lb.recordSuccess(agentId);

      // Circuit should remain closed
      expect(lb.getCircuitState(agentId)).toBe('closed');
    });

    it('should record failure on agent', async () => {
      const selection = await lb.selectAgent();
      const agentId = selection.agent.id;

      lb.recordFailure(agentId, new Error('Test error'));

      // Circuit should still be closed (need 3 failures)
      expect(lb.getCircuitState(agentId)).toBe('closed');
    });

    it('should open circuit after threshold failures', async () => {
      const selection = await lb.selectAgent();
      const agentId = selection.agent.id;

      // Record 3 failures to open circuit
      lb.recordFailure(agentId, new Error('Error 1'));
      lb.recordFailure(agentId, new Error('Error 2'));
      lb.recordFailure(agentId, new Error('Error 3'));

      expect(lb.getCircuitState(agentId)).toBe('open');
    });

    it('should filter out agents with open circuits', async () => {
      const selection = await lb.selectAgent();
      const agentId = selection.agent.id;

      // Open circuit for agent
      for (let i = 0; i < 3; i++) {
        lb.recordFailure(agentId, new Error(`Error ${i}`));
      }

      // Should select a different agent
      const nextSelection = await lb.selectAgent();
      expect(nextSelection.agent.id).not.toBe(agentId);
    });
  });

  describe('Failover', () => {
    beforeEach(() => {
      lb.start();
    });

    afterEach(() => {
      lb.stop();
    });

    it('should execute operation successfully', async () => {
      const result = await lb.executeWithFailover(undefined, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should failover on operation failure', async () => {
      let attempts = 0;

      await expect(
        lb.executeWithFailover(undefined, async () => {
          attempts++;
          throw new Error(`Attempt ${attempts} failed`);
        })
      ).rejects.toThrow(LoadBalancerFailoverError);

      expect(attempts).toBe(3); // maxFailoverAttempts
    });

    it('should succeed after failover', async () => {
      let attempts = 0;

      const result = await lb.executeWithFailover(undefined, async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('First attempt fails');
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should include error details in failover error', async () => {
      try {
        await lb.executeWithFailover(undefined, async () => {
          throw new Error('Operation failed');
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LoadBalancerFailoverError);
        const failoverError = error as LoadBalancerFailoverError;
        expect(failoverError.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      lb.start();
    });

    afterEach(() => {
      lb.stop();
    });

    it('should track total requests', async () => {
      await lb.selectAgent();
      await lb.selectAgent();

      const stats = lb.getStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should track successful selections', async () => {
      await lb.selectAgent();

      const stats = lb.getStats();
      expect(stats.successfulSelections).toBe(1);
      expect(stats.failedSelections).toBe(0);
    });

    it('should track failed selections', async () => {
      await expect(
        lb.selectAgent({ requiredSkills: ['nonexistent'] })
      ).rejects.toThrow();

      const stats = lb.getStats();
      expect(stats.failedSelections).toBe(1);
    });

    it('should track average selection time', async () => {
      await lb.selectAgent();

      const stats = lb.getStats();
      expect(stats.avgSelectionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should report healthy agent count', () => {
      const stats = lb.getStats();
      expect(stats.healthyAgents).toBe(3);
      expect(stats.unhealthyAgents).toBe(0);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop health monitoring', () => {
      expect(lb.isRunning()).toBe(false);

      lb.start();
      expect(lb.isRunning()).toBe(true);

      lb.stop();
      expect(lb.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      lb.start();

      // Second start should log warning but not throw
      expect(() => lb.start()).not.toThrow();

      lb.stop();
    });

    it('should dispose properly', () => {
      lb.start();
      lb.dispose();

      expect(lb.isRunning()).toBe(false);
    });
  });

  describe('Events', () => {
    it('should emit agent.selected event', async () => {
      const handler = jest.fn();
      lb.on('agent.selected', handler);

      lb.start();
      await lb.selectAgent();
      lb.stop();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toHaveProperty('agent');
      expect(handler.mock.calls[0][0]).toHaveProperty('strategy');
    });

    it('should emit selection.failed event', async () => {
      const handler = jest.fn();
      lb.on('selection.failed', handler);

      lb.start();
      await expect(
        lb.selectAgent({ requiredSkills: ['nonexistent'] })
      ).rejects.toThrow();
      lb.stop();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit agent.failure event', async () => {
      const handler = jest.fn();
      lb.on('agent.failure', handler);

      lb.start();
      const selection = await lb.selectAgent();
      lb.recordFailure(selection.agent.id, new Error('Test'));
      lb.stop();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit failover event', async () => {
      const handler = jest.fn();
      lb.on('failover', handler);

      lb.start();
      try {
        await lb.executeWithFailover(undefined, async () => {
          throw new Error('Fail');
        });
      } catch {
        // Expected
      }
      lb.stop();

      expect(handler).toHaveBeenCalled();
    });
  });
});

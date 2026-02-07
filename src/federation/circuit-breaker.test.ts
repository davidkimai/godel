/**
 * Agent Circuit Breaker Tests
 *
 * Tests for agent-specific circuit breaker functionality.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  AgentCircuitBreaker,
  AgentCircuitBreakerRegistry,
  DEFAULT_AGENT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker';

describe('AgentCircuitBreaker', () => {
  let breaker: AgentCircuitBreaker;

  beforeEach(() => {
    breaker = new AgentCircuitBreaker('agent-001', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 60000, // Long timeout to avoid auto-recovery during tests
    });
  });

  describe('Initialization', () => {
    it('should initialize with closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);
    });

    it('should store agent ID', () => {
      expect(breaker.getAgentId()).toBe('agent-001');
    });

    it('should use default config when not provided', () => {
      const defaultBreaker = new AgentCircuitBreaker('agent-002');
      expect(defaultBreaker.getAgentId()).toBe('agent-002');
      expect(defaultBreaker.isClosed()).toBe(true);
    });
  });

  describe('State Transitions', () => {
    it('should remain closed on fewer failures than threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getState()).toBe('closed');
    });

    it('should open after failure threshold reached', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getState()).toBe('open');
    });

    it('should track consecutive failures', () => {
      const stats1 = breaker.getStats();
      expect(stats1.consecutiveFailures).toBe(0);

      breaker.recordFailure();

      const stats2 = breaker.getStats();
      expect(stats2.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should reset consecutive failures on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();

      breaker.recordSuccess();

      const stats = breaker.getStats();
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('Manual Control', () => {
    it('should open when forced', () => {
      breaker.forceOpen();

      expect(breaker.isOpen()).toBe(true);
      expect(breaker.isClosed()).toBe(false);
    });

    it('should close when forced', () => {
      breaker.forceOpen();
      breaker.forceClose();

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
    });

    it('should reset to closed state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      breaker.reset();

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track failure count', () => {
      breaker.recordFailure();
      breaker.recordFailure();

      const stats = breaker.getStats();
      expect(stats.failureCount).toBeGreaterThanOrEqual(2);
    });

    it('should track success count', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();

      const stats = breaker.getStats();
      expect(stats.successCount).toBeGreaterThanOrEqual(2);
    });

    it('should track last failure time', () => {
      breaker.recordFailure(new Error('Test'));

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should track last success time', () => {
      breaker.recordSuccess();

      const stats = breaker.getStats();
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
    });
  });

  describe('Events', () => {
    it('should emit state.changed event', (done) => {
      breaker.on('state.changed', (event) => {
        expect(event.agentId).toBe('agent-001');
        expect(event.newState).toBe('open');
        done();
      });

      breaker.forceOpen();
    });

    it('should emit opened event when circuit opens', (done) => {
      breaker.on('opened', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
    });

    it('should emit closed event when circuit closes', (done) => {
      breaker.forceOpen();

      breaker.on('closed', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      breaker.forceClose();
    });

    it('should emit agent.unhealthy when circuit opens', (done) => {
      breaker.on('agent.unhealthy', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
    });
  });
});

describe('AgentCircuitBreakerRegistry', () => {
  let registry: AgentCircuitBreakerRegistry;

  beforeEach(() => {
    registry = new AgentCircuitBreakerRegistry({
      failureThreshold: 3,
      timeout: 1000,
    });
  });

  describe('Registration', () => {
    it('should create breaker for new agent', () => {
      const breaker = registry.getOrCreate('agent-001');

      expect(breaker).toBeDefined();
      expect(breaker.getAgentId()).toBe('agent-001');
    });

    it('should return existing breaker', () => {
      const breaker1 = registry.getOrCreate('agent-001');
      const breaker2 = registry.getOrCreate('agent-001');

      expect(breaker1).toBe(breaker2);
    });

    it('should check if breaker exists', () => {
      registry.getOrCreate('agent-001');

      expect(registry.has('agent-001')).toBe(true);
      expect(registry.has('agent-002')).toBe(false);
    });

    it('should get breaker by agent ID', () => {
      const created = registry.getOrCreate('agent-001');
      const retrieved = registry.get('agent-001');

      expect(retrieved).toBe(created);
    });
  });

  describe('Management', () => {
    it('should remove breaker', () => {
      registry.getOrCreate('agent-001');

      const removed = registry.remove('agent-001');

      expect(removed).toBe(true);
      expect(registry.has('agent-001')).toBe(false);
    });

    it('should return false when removing non-existent breaker', () => {
      const removed = registry.remove('agent-001');

      expect(removed).toBe(false);
    });

    it('should get all breakers', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');
      registry.getOrCreate('agent-003');

      const all = registry.getAll();

      expect(all.length).toBe(3);
    });

    it('should get all agent IDs', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');

      const ids = registry.getAgentIds();

      expect(ids).toContain('agent-001');
      expect(ids).toContain('agent-002');
    });
  });

  describe('Health Filtering', () => {
    it('should get healthy breakers (closed)', () => {
      const breaker1 = registry.getOrCreate('agent-001');
      const breaker2 = registry.getOrCreate('agent-002');

      breaker2.forceOpen();

      const healthy = registry.getHealthyBreakers();

      expect(healthy.length).toBe(1);
      expect(healthy[0].getAgentId()).toBe('agent-001');
    });

    it('should get unhealthy breakers (open)', () => {
      const breaker1 = registry.getOrCreate('agent-001');
      const breaker2 = registry.getOrCreate('agent-002');

      breaker2.forceOpen();

      const unhealthy = registry.getUnhealthyBreakers();

      expect(unhealthy.length).toBe(1);
      expect(unhealthy[0].getAgentId()).toBe('agent-002');
    });
  });

  describe('Statistics', () => {
    it('should get stats for all breakers', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');

      const stats = registry.getAllStats();

      expect(stats.length).toBe(2);
      expect(stats[0].agentId).toBeDefined();
    });

    it('should get state counts', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');
      registry.getOrCreate('agent-003');

      registry.get('agent-002')?.forceOpen();

      const counts = registry.getStateCounts();

      expect(counts.closed).toBe(2);
      expect(counts.open).toBe(1);
      expect(counts.halfOpen).toBe(0);
    });
  });

  describe('Bulk Operations', () => {
    it('should reset all breakers', () => {
      const breaker = registry.getOrCreate('agent-001');
      breaker.forceOpen();

      registry.resetAll();

      expect(breaker.isClosed()).toBe(true);
    });

    it('should force open all breakers', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');

      registry.forceOpenAll();

      expect(registry.getStateCounts().open).toBe(2);
    });

    it('should force close all breakers', () => {
      registry.getOrCreate('agent-001').forceOpen();
      registry.getOrCreate('agent-002').forceOpen();

      registry.forceCloseAll();

      expect(registry.getStateCounts().closed).toBe(2);
    });

    it('should clear all breakers', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');

      registry.clear();

      expect(registry.getAll().length).toBe(0);
    });
  });

  describe('Sync', () => {
    it('should sync with agent IDs', () => {
      registry.getOrCreate('agent-001');
      registry.getOrCreate('agent-002');

      // Sync with new set of agents
      registry.syncWithAgentIds(['agent-002', 'agent-003']);

      expect(registry.has('agent-001')).toBe(false); // Removed
      expect(registry.has('agent-002')).toBe(true);  // Kept
      expect(registry.has('agent-003')).toBe(true);  // Added
    });
  });

  describe('Events', () => {
    it('should forward state.changed events', (done) => {
      const breaker = registry.getOrCreate('agent-001');

      registry.on('state.changed', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      breaker.forceOpen();
    });

    it('should forward agent.unhealthy events', (done) => {
      registry.getOrCreate('agent-001');

      registry.on('agent.unhealthy', (event) => {
        expect(event.agentId).toBe('agent-001');
        done();
      });

      const breaker = registry.get('agent-001');
      breaker?.recordFailure();
      breaker?.recordFailure();
      breaker?.recordFailure();
    });
  });
});

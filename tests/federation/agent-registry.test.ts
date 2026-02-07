/**
 * Agent Registry Tests
 *
 * Comprehensive tests for the AgentRegistry class.
 */

import {
  AgentRegistry,
  RegisteredAgent,
  AgentCapabilities,
  DEFAULT_CAPABILITIES,
} from '../../src/federation/agent-registry';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  // ============================================================================
  // Registration Tests
  // ============================================================================

  describe('register', () => {
    it('should register an agent with minimal config', () => {
      const agent = registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(agent.id).toBeDefined();
      expect(agent.runtime).toBe('pi');
      expect(agent.status).toBe('idle');
      expect(agent.currentLoad).toBe(0);
      expect(agent.capabilities.skills).toContain('typescript');
    });

    it('should register an agent with explicit ID', () => {
      const agent = registry.register({
        id: 'custom-agent-001',
        runtime: 'native',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['data-science'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
      });

      expect(agent.id).toBe('custom-agent-001');
    });

    it('should throw when registering duplicate ID', () => {
      registry.register({
        id: 'duplicate-test',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(() =>
        registry.register({
          id: 'duplicate-test',
          runtime: 'native',
          capabilities: {
            skills: ['rust'],
            languages: ['rust'],
            specialties: ['systems'],
            costPerHour: 4.0,
            avgSpeed: 12,
            reliability: 0.98,
          },
        })
      ).toThrow(/already registered/);
    });

    it('should apply default capabilities', () => {
      const agent = registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(agent.capabilities.costPerHour).toBe(2.5);
      expect(agent.capabilities.reliability).toBe(0.95);
    });

    it('should emit agent.registered event', (done) => {
      registry.on('agent.registered', (agent) => {
        expect(agent.runtime).toBe('pi');
        done();
      });

      registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
    });
  });

  describe('unregister', () => {
    it('should unregister an existing agent', () => {
      const agent = registry.register({
        id: 'to-remove',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const result = registry.unregister(agent.id);

      expect(result).toBe(true);
      expect(registry.has(agent.id)).toBe(false);
    });

    it('should return false for non-existent agent', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });

    it('should emit agent.unregistered event', (done) => {
      registry.register({
        id: 'to-remove',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.on('agent.unregistered', (agentId) => {
        expect(agentId).toBe('to-remove');
        done();
      });

      registry.unregister('to-remove');
    });
  });

  // ============================================================================
  // Query Tests
  // ============================================================================

  describe('get', () => {
    it('should return agent by ID', () => {
      registry.register({
        id: 'test-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const agent = registry.get('test-agent');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('test-agent');
    });

    it('should return undefined for non-existent agent', () => {
      const agent = registry.get('non-existent');
      expect(agent).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing agent', () => {
      registry.register({
        id: 'test-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(registry.has('test-agent')).toBe(true);
    });

    it('should return false for non-existent agent', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered agents', () => {
      registry.register({
        id: 'agent-1',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'agent-2',
        runtime: 'native',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
      });

      const agents = registry.list();
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('agent-1');
      expect(agents.map(a => a.id)).toContain('agent-2');
    });
  });

  describe('count', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return correct count', () => {
      registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.register({
        runtime: 'native',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
      });

      expect(registry.count()).toBe(2);
    });
  });

  // ============================================================================
  // Skill-based Discovery Tests
  // ============================================================================

  describe('findBySkills', () => {
    beforeEach(() => {
      registry.register({
        id: 'frontend-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react', 'css'],
          languages: ['typescript', 'javascript'],
          specialties: ['frontend'],
          costPerHour: 3.0,
          avgSpeed: 12,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'backend-agent',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'nodejs', 'postgres'],
          languages: ['typescript', 'javascript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.90,
        },
      });

      registry.register({
        id: 'fullstack-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react', 'nodejs', 'postgres'],
          languages: ['typescript', 'javascript', 'python'],
          specialties: ['fullstack'],
          costPerHour: 4.0,
          avgSpeed: 15,
          reliability: 0.98,
        },
      });
    });

    it('should find agents with all required skills (match: all)', () => {
      const agents = registry.findBySkills(['typescript', 'react']);

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('frontend-agent');
      expect(agents.map(a => a.id)).toContain('fullstack-agent');
    });

    it('should find agents with any of the skills (match: any)', () => {
      const agents = registry.findBySkills(['react', 'python'], { match: 'any' });

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('frontend-agent');
      expect(agents.map(a => a.id)).toContain('fullstack-agent');
    });

    it('should be case insensitive by default', () => {
      const agents = registry.findBySkills(['TYPESCRIPT', 'REACT']);

      expect(agents).toHaveLength(2);
    });

    it('should be case sensitive when configured', () => {
      const agents = registry.findBySkills(['TypeScript'], { caseSensitive: true });

      expect(agents).toHaveLength(0);
    });

    it('should return empty array when no matches found', () => {
      const agents = registry.findBySkills(['rust', 'go']);

      expect(agents).toHaveLength(0);
    });
  });

  describe('findBySpecialty', () => {
    beforeEach(() => {
      registry.register({
        id: 'frontend-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react'],
          languages: ['typescript'],
          specialties: ['frontend', 'ui-design'],
          costPerHour: 3.0,
          avgSpeed: 12,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'backend-agent',
        runtime: 'native',
        capabilities: {
          skills: ['nodejs', 'postgres'],
          languages: ['typescript'],
          specialties: ['backend', 'database'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.90,
        },
      });
    });

    it('should find agents by specialty (match: any)', () => {
      const agents = registry.findBySpecialty(['frontend']);

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('frontend-agent');
    });

    it('should find agents with multiple specialties', () => {
      const agents = registry.findBySpecialty(['frontend', 'database'], { match: 'any' });

      expect(agents).toHaveLength(2);
    });
  });

  describe('findByLanguages', () => {
    beforeEach(() => {
      registry.register({
        id: 'ts-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript', 'javascript'],
          specialties: ['frontend'],
          costPerHour: 3.0,
          avgSpeed: 12,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'python-agent',
        runtime: 'native',
        capabilities: {
          skills: ['python'],
          languages: ['python', 'rust'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.90,
        },
      });
    });

    it('should find agents by language', () => {
      const agents = registry.findByLanguages(['typescript']);

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('ts-agent');
    });

    it('should find agents with multiple languages (match: all)', () => {
      const agents = registry.findByLanguages(['typescript', 'javascript'], { match: 'all' });

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('ts-agent');
    });
  });

  // ============================================================================
  // Health & Status Tests
  // ============================================================================

  describe('getHealthyAgents', () => {
    it('should return only healthy agents', () => {
      const now = new Date();

      registry.register({
        id: 'healthy-idle',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
        currentLoad: 0,
      });
      registry.get('healthy-idle')!.lastHeartbeat = now;

      registry.register({
        id: 'healthy-busy',
        runtime: 'native',
        status: 'busy',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
        currentLoad: 0.5,
      });
      registry.get('healthy-busy')!.lastHeartbeat = now;

      registry.register({
        id: 'unhealthy-agent',
        runtime: 'pi',
        status: 'unhealthy',
        capabilities: {
          skills: ['rust'],
          languages: ['rust'],
          specialties: ['systems'],
          costPerHour: 4.0,
          avgSpeed: 12,
          reliability: 0.98,
        },
        currentLoad: 0,
      });
      registry.get('unhealthy-agent')!.lastHeartbeat = now;

      const healthy = registry.getHealthyAgents();

      expect(healthy).toHaveLength(2);
      expect(healthy.map(a => a.id)).toContain('healthy-idle');
      expect(healthy.map(a => a.id)).toContain('healthy-busy');
    });

    it('should exclude agents with stale heartbeats', () => {
      const oldDate = new Date(Date.now() - 120000); // 2 minutes ago

      registry.register({
        id: 'stale-agent',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
      registry.get('stale-agent')!.lastHeartbeat = oldDate;

      const healthy = registry.getHealthyAgents();

      expect(healthy).toHaveLength(0);
    });
  });

  describe('getAvailableAgents', () => {
    it('should return only idle and healthy agents', () => {
      const now = new Date();

      registry.register({
        id: 'available-agent',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
      registry.get('available-agent')!.lastHeartbeat = now;

      registry.register({
        id: 'busy-agent',
        runtime: 'native',
        status: 'busy',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
      });
      registry.get('busy-agent')!.lastHeartbeat = now;

      const available = registry.getAvailableAgents();

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('available-agent');
    });
  });

  describe('updateStatus', () => {
    it('should update agent status', () => {
      registry.register({
        id: 'status-test',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const result = registry.updateStatus('status-test', 'busy');

      expect(result).toBe(true);
      expect(registry.get('status-test')?.status).toBe('busy');
    });

    it('should return false for non-existent agent', () => {
      const result = registry.updateStatus('non-existent', 'busy');
      expect(result).toBe(false);
    });

    it('should emit status_changed event', (done) => {
      registry.register({
        id: 'status-test',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.on('agent.status_changed', (agentId, previous, current) => {
        expect(agentId).toBe('status-test');
        expect(previous).toBe('idle');
        expect(current).toBe('busy');
        done();
      });

      registry.updateStatus('status-test', 'busy');
    });
  });

  describe('updateLoad', () => {
    it('should update agent load', () => {
      registry.register({
        id: 'load-test',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const result = registry.updateLoad('load-test', 0.75);

      expect(result).toBe(true);
      expect(registry.get('load-test')?.currentLoad).toBe(0.75);
    });

    it('should throw for invalid load values', () => {
      registry.register({
        id: 'load-test',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(() => registry.updateLoad('load-test', 1.5)).toThrow(/between 0 and 1/);
      expect(() => registry.updateLoad('load-test', -0.5)).toThrow(/between 0 and 1/);
    });

    it('should return false for non-existent agent', () => {
      const result = registry.updateLoad('non-existent', 0.5);
      expect(result).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat timestamp', () => {
      const before = new Date();

      registry.register({
        id: 'heartbeat-test',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      // Wait a tiny bit to ensure timestamp difference
      const oldHeartbeat = registry.get('heartbeat-test')!.lastHeartbeat;

      registry.heartbeat('heartbeat-test');

      const newHeartbeat = registry.get('heartbeat-test')!.lastHeartbeat;
      expect(newHeartbeat.getTime()).toBeGreaterThanOrEqual(oldHeartbeat.getTime());
    });

    it('should bring unhealthy agents back to idle', () => {
      registry.register({
        id: 'recovering-agent',
        runtime: 'pi',
        status: 'unhealthy',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.heartbeat('recovering-agent');

      expect(registry.get('recovering-agent')?.status).toBe('idle');
    });

    it('should return false for non-existent agent', () => {
      const result = registry.heartbeat('non-existent');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Utility Tests
  // ============================================================================

  describe('clear', () => {
    it('should remove all agents', () => {
      registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.register({
        runtime: 'native',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 8,
          reliability: 0.90,
        },
      });

      registry.clear();

      expect(registry.count()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      registry.register({
        id: 'agent-1',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
        currentLoad: 0.2,
      });

      registry.register({
        id: 'agent-2',
        runtime: 'native',
        status: 'busy',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.5,
          avgSpeed: 8,
          reliability: 0.90,
        },
        currentLoad: 0.8,
      });

      const stats = registry.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byStatus.idle).toBe(1);
      expect(stats.byStatus.busy).toBe(1);
      expect(stats.avgLoad).toBe(0.5);
      expect(stats.avgCostPerHour).toBe(3.0);
      expect(stats.avgReliability).toBe(0.925);
    });

    it('should handle empty registry', () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(0);
      expect(stats.avgLoad).toBe(0);
      expect(stats.avgCostPerHour).toBe(0);
      expect(stats.avgReliability).toBe(0);
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('singleton', () => {
    it('should return same instance', () => {
      const { getAgentRegistry, resetAgentRegistry } = require('../../src/federation/agent-registry');
      resetAgentRegistry();

      const instance1 = getAgentRegistry();
      const instance2 = getAgentRegistry();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const { getAgentRegistry, resetAgentRegistry } = require('../../src/federation/agent-registry');

      const instance1 = getAgentRegistry();
      resetAgentRegistry();
      const instance2 = getAgentRegistry();

      expect(instance1).not.toBe(instance2);
    });
  });
});

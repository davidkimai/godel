/**
 * Agent Selector Tests
 *
 * Comprehensive tests for the AgentSelector class.
 */

import {
  AgentRegistry,
  RegisteredAgent,
} from '../../src/federation/agent-registry';
import {
  AgentSelector,
  SelectionCriteria,
  SelectionError,
  ScoreWeights,
} from '../../src/federation/agent-selector';

describe('AgentSelector', () => {
  let registry: AgentRegistry;
  let selector: AgentSelector;

  beforeEach(() => {
    registry = new AgentRegistry();
    selector = new AgentSelector(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  // Helper to register agents with specific capabilities
  const registerAgent = (
    id: string,
    runtime: string,
    skills: string[],
    options: {
      costPerHour?: number;
      avgSpeed?: number;
      reliability?: number;
      currentLoad?: number;
      status?: 'idle' | 'busy' | 'unhealthy' | 'offline';
    } = {}
  ): RegisteredAgent => {
    return registry.register({
      id,
      runtime,
      status: options.status ?? 'idle',
      capabilities: {
        skills,
        languages: ['typescript'],
        specialties: ['general'],
        costPerHour: options.costPerHour ?? 2.5,
        avgSpeed: options.avgSpeed ?? 10,
        reliability: options.reliability ?? 0.95,
      },
      currentLoad: options.currentLoad ?? 0,
    });
  };

  // ============================================================================
  // Basic Selection Tests
  // ============================================================================

  describe('selectAgent', () => {
    it('should select agent by skill match', async () => {
      registerAgent('agent-1', 'pi', ['typescript', 'react']);
      registerAgent('agent-2', 'native', ['python', 'django']);
      registerAgent('agent-3', 'pi', ['typescript', 'react', 'nodejs']);

      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
      });

      expect(result.agent).toBeDefined();
      expect(result.strategy).toBe('skill-match');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should throw when no agents match criteria', async () => {
      registerAgent('agent-1', 'pi', ['python']);

      await expect(
        selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        })
      ).rejects.toThrow(SelectionError);
    });

    it('should throw when no healthy agents available', async () => {
      registerAgent('agent-1', 'pi', ['typescript'], { status: 'unhealthy' });

      await expect(
        selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        })
      ).rejects.toThrow(SelectionError);
    });

    it('should throw for unknown strategy', async () => {
      registerAgent('agent-1', 'pi', ['typescript']);

      await expect(
        selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'unknown-strategy' as any,
        })
      ).rejects.toThrow(SelectionError);
    });
  });

  // ============================================================================
  // Strategy Tests
  // ============================================================================

  describe('skill-match strategy', () => {
    beforeEach(() => {
      registerAgent('frontend-dev', 'pi', ['typescript', 'react', 'css'], {
        costPerHour: 3.0,
        reliability: 0.95,
      });
      registerAgent('backend-dev', 'native', ['typescript', 'nodejs', 'postgres'], {
        costPerHour: 2.5,
        reliability: 0.90,
      });
      registerAgent('fullstack-dev', 'pi', ['typescript', 'react', 'nodejs', 'postgres'], {
        costPerHour: 4.0,
        reliability: 0.98,
      });
    });

    it('should select agent with most skill matches', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'react'],
        strategy: 'skill-match',
      });

      // Both frontend-dev and fullstack-dev have typescript and react
      // fullstack-dev has more skills overall but same match for required
      expect(['frontend-dev', 'fullstack-dev']).toContain(result.agent.id);
    });

    it('should consider preferred skills', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        preferredSkills: ['react', 'css'],
        strategy: 'skill-match',
      });

      // frontend-dev has both react and css as preferred
      expect(result.agent.id).toBe('frontend-dev');
    });
  });

  describe('cost-optimized strategy', () => {
    beforeEach(() => {
      registerAgent('expensive-agent', 'pi', ['typescript'], {
        costPerHour: 10.0,
        reliability: 0.99,
      });
      registerAgent('cheap-agent', 'native', ['typescript'], {
        costPerHour: 1.5,
        reliability: 0.85,
      });
      registerAgent('mid-agent', 'pi', ['typescript'], {
        costPerHour: 3.0,
        reliability: 0.95,
      });
    });

    it('should prefer lower cost agents', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'cost-optimized',
      });

      // cheap-agent should be preferred due to lower cost
      expect(result.agent.id).toBe('cheap-agent');
    });

    it('should still require matching skills', async () => {
      await expect(
        selector.selectAgent({
          requiredSkills: ['python'],
          strategy: 'cost-optimized',
        })
      ).rejects.toThrow(SelectionError);
    });
  });

  describe('speed-optimized strategy', () => {
    beforeEach(() => {
      registerAgent('slow-agent', 'pi', ['typescript'], {
        avgSpeed: 5,
        currentLoad: 0.1,
      });
      registerAgent('fast-agent', 'native', ['typescript'], {
        avgSpeed: 20,
        currentLoad: 0.3,
      });
      registerAgent('medium-agent', 'pi', ['typescript'], {
        avgSpeed: 12,
        currentLoad: 0.2,
      });
    });

    it('should prefer faster agents', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'speed-optimized',
      });

      expect(result.agent.id).toBe('fast-agent');
    });

    it('should consider current load', async () => {
      // Add a very fast but fully loaded agent
      registerAgent('fast-but-busy', 'pi', ['typescript'], {
        avgSpeed: 25,
        currentLoad: 1.0,
      });

      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'speed-optimized',
      });

      // Should prefer less loaded agent even if slower
      expect(result.agent.currentLoad).toBeLessThan(1.0);
    });
  });

  describe('reliability-optimized strategy', () => {
    beforeEach(() => {
      registerAgent('unreliable-agent', 'pi', ['typescript'], {
        reliability: 0.70,
      });
      registerAgent('reliable-agent', 'native', ['typescript'], {
        reliability: 0.98,
      });
      registerAgent('mid-reliable-agent', 'pi', ['typescript'], {
        reliability: 0.90,
      });
    });

    it('should prefer more reliable agents', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'reliability-optimized',
      });

      expect(result.agent.id).toBe('reliable-agent');
      expect(result.agent.capabilities.reliability).toBe(0.98);
    });
  });

  describe('load-balanced strategy', () => {
    beforeEach(() => {
      registerAgent('busy-agent', 'pi', ['typescript'], {
        currentLoad: 0.9,
      });
      registerAgent('idle-agent', 'native', ['typescript'], {
        currentLoad: 0.1,
      });
      registerAgent('medium-agent', 'pi', ['typescript'], {
        currentLoad: 0.5,
      });
    });

    it('should prefer less loaded agents', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'load-balanced',
      });

      expect(result.agent.id).toBe('idle-agent');
      expect(result.agent.currentLoad).toBe(0.1);
    });
  });

  describe('balanced strategy', () => {
    beforeEach(() => {
      // Well-rounded agent
      registerAgent('balanced-agent', 'pi', ['typescript', 'react'], {
        costPerHour: 3.0,
        reliability: 0.95,
        currentLoad: 0.3,
      });

      // Specialized but expensive
      registerAgent('expensive-expert', 'pi', ['typescript', 'react', 'nodejs'], {
        costPerHour: 8.0,
        reliability: 0.99,
        currentLoad: 0.2,
      });

      // Cheap but less reliable
      registerAgent('cheap-novice', 'native', ['typescript'], {
        costPerHour: 1.0,
        reliability: 0.80,
        currentLoad: 0.1,
      });
    });

    it('should balance multiple factors', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'balanced',
      });

      expect(result.agent).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
    });

    it('should support custom weights', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'balanced',
        weights: {
          skillMatch: 0.1,
          costEfficiency: 0.5,
          reliability: 0.1,
          loadAvailability: 0.3,
        },
      });

      // With high cost weight, should prefer cheap-novice
      expect(result.agent.id).toBe('cheap-novice');
    });
  });

  // ============================================================================
  // Constraint Tests
  // ============================================================================

  describe('hard constraints', () => {
    beforeEach(() => {
      registerAgent('agent-1', 'pi', ['typescript', 'react'], {
        costPerHour: 5.0,
        reliability: 0.95,
        avgSpeed: 10,
      });
      registerAgent('agent-2', 'native', ['typescript', 'react'], {
        costPerHour: 2.0,
        reliability: 0.85,
        avgSpeed: 8,
      });
    });

    it('should filter by max cost', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
        maxCostPerHour: 3.0,
      });

      expect(result.agent.capabilities.costPerHour).toBeLessThanOrEqual(3.0);
      expect(result.agent.id).toBe('agent-2');
    });

    it('should filter by min reliability', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
        minReliability: 0.90,
      });

      expect(result.agent.capabilities.reliability).toBeGreaterThanOrEqual(0.90);
      expect(result.agent.id).toBe('agent-1');
    });

    it('should filter by min speed', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
        minSpeed: 9,
      });

      expect(result.agent.capabilities.avgSpeed).toBeGreaterThanOrEqual(9);
      expect(result.agent.id).toBe('agent-1');
    });

    it('should filter by preferred runtime', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
        preferredRuntime: 'native',
      });

      expect(result.agent.runtime).toBe('native');
      expect(result.agent.id).toBe('agent-2');
    });

    it('should throw when constraints eliminate all candidates', async () => {
      await expect(
        selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
          maxCostPerHour: 1.0,
        })
      ).rejects.toThrow(SelectionError);
    });
  });

  describe('specialty constraints', () => {
    beforeEach(() => {
      registry.register({
        id: 'frontend-specialist',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend', 'ui-design'],
          costPerHour: 3.0,
          avgSpeed: 12,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'backend-specialist',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend', 'database'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.90,
        },
      });
    });

    it('should filter by required specialties', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        requiredSpecialties: ['frontend'],
        strategy: 'skill-match',
      });

      expect(result.agent.id).toBe('frontend-specialist');
    });
  });

  describe('language constraints', () => {
    beforeEach(() => {
      registry.register({
        id: 'ts-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['web-dev'],
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
          skills: ['ml'],
          languages: ['python', 'rust'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.90,
        },
      });
    });

    it('should filter by required languages', async () => {
      const result = await selector.selectAgent({
        requiredLanguages: ['python'],
        strategy: 'skill-match',
      });

      expect(result.agent.id).toBe('python-agent');
    });
  });

  // ============================================================================
  // Multiple Selection Tests
  // ============================================================================

  describe('selectMultipleAgents', () => {
    beforeEach(() => {
      registerAgent('agent-1', 'pi', ['typescript'], { costPerHour: 1.0 });
      registerAgent('agent-2', 'native', ['typescript'], { costPerHour: 2.0 });
      registerAgent('agent-3', 'pi', ['typescript'], { costPerHour: 3.0 });
      registerAgent('agent-4', 'native', ['typescript'], { costPerHour: 4.0 });
    });

    it('should select multiple agents', async () => {
      const results = await selector.selectMultipleAgents(
        {
          requiredSkills: ['typescript'],
          strategy: 'cost-optimized',
        },
        3
      );

      expect(results).toHaveLength(3);
      expect(results[0].agent.id).toBe('agent-1');
      expect(results[1].agent.id).toBe('agent-2');
      expect(results[2].agent.id).toBe('agent-3');
    });

    it('should throw for invalid count', async () => {
      await expect(
        selector.selectMultipleAgents(
          {
            requiredSkills: ['typescript'],
            strategy: 'skill-match',
          },
          0
        )
      ).rejects.toThrow(SelectionError);
    });

    it('should throw when not enough agents available', async () => {
      await expect(
        selector.selectMultipleAgents(
          {
            requiredSkills: ['typescript'],
            strategy: 'skill-match',
          },
          10
        )
      ).rejects.toThrow(SelectionError);
    });
  });

  // ============================================================================
  // Ranking Tests
  // ============================================================================

  describe('rankAgents', () => {
    beforeEach(() => {
      registerAgent('agent-1', 'pi', ['typescript'], {
        costPerHour: 1.0,
        reliability: 0.95,
      });
      registerAgent('agent-2', 'native', ['typescript'], {
        costPerHour: 2.0,
        reliability: 0.98,
      });
      registerAgent('agent-3', 'pi', ['typescript'], {
        costPerHour: 3.0,
        reliability: 0.90,
      });
    });

    it('should return all agents ranked', async () => {
      const results = await selector.rankAgents({
        requiredSkills: ['typescript'],
        strategy: 'cost-optimized',
      });

      expect(results).toHaveLength(3);
      expect(results[0].agent.id).toBe('agent-1');
      expect(results[1].agent.id).toBe('agent-2');
      expect(results[2].agent.id).toBe('agent-3');
    });

    it('should return empty array when no agents match', async () => {
      const results = await selector.rankAgents({
        requiredSkills: ['python'],
        strategy: 'skill-match',
      });

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // Result Structure Tests
  // ============================================================================

  describe('selection result', () => {
    beforeEach(() => {
      registerAgent('test-agent', 'pi', ['typescript', 'react'], {
        costPerHour: 3.0,
        reliability: 0.95,
        avgSpeed: 12,
        currentLoad: 0.3,
      });
    });

    it('should include score details', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'balanced',
      });

      expect(result.details).toBeDefined();
      expect(typeof result.details.skillScore).toBe('number');
      expect(typeof result.details.costScore).toBe('number');
      expect(typeof result.details.reliabilityScore).toBe('number');
      expect(typeof result.details.loadScore).toBe('number');
      expect(typeof result.details.speedScore).toBe('number');
    });

    it('should include candidates count', async () => {
      registerAgent('agent-2', 'native', ['typescript'], {
        costPerHour: 2.5,
      });

      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'skill-match',
      });

      expect(result.candidatesConsidered).toBe(2);
    });

    it('should include strategy used', async () => {
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'cost-optimized',
      });

      expect(result.strategy).toBe('cost-optimized');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty required skills', async () => {
      registerAgent('agent-1', 'pi', ['typescript'], { costPerHour: 2.0 });

      const result = await selector.selectAgent({
        strategy: 'cost-optimized',
      });

      expect(result.agent).toBeDefined();
    });

    it('should handle case insensitive skill matching', async () => {
      registerAgent('agent-1', 'pi', ['TypeScript', 'React'], { costPerHour: 2.0 });

      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'REACT'],
        strategy: 'skill-match',
      });

      expect(result.agent.id).toBe('agent-1');
    });

    it('should handle agents with no matching preferred skills', async () => {
      registerAgent('agent-1', 'pi', ['typescript'], { costPerHour: 2.0 });

      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        preferredSkills: ['rust', 'go'],
        strategy: 'skill-match',
      });

      // Should still select based on required skills
      expect(result.agent.id).toBe('agent-1');
    });

    it('should handle all agents having zero score', async () => {
      registerAgent('agent-1', 'pi', ['python'], { costPerHour: 2.0 });

      // Try to select with skills that don't match any agent
      await expect(
        selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        })
      ).rejects.toThrow(SelectionError);
    });
  });
});

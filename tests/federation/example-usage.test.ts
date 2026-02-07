/**
 * Federation Module Example Usage
 *
 * Demonstrates real-world usage patterns for the agent selection system.
 */

import {
  AgentRegistry,
  AgentSelector,
  getAgentRegistry,
  resetAgentRegistry,
} from '../../src/federation/agent-registry';
import {
  AgentSelector as AgentSelectorClass,
  selectAgent,
} from '../../src/federation/agent-selector';

describe('Federation Examples', () => {
  let registry: AgentRegistry;
  let selector: AgentSelectorClass;

  beforeEach(() => {
    resetAgentRegistry();
    registry = getAgentRegistry();
    selector = new AgentSelectorClass(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Example 1: Basic Skill-based Selection', () => {
    it('should select agent for TypeScript task', async () => {
      // Register agents with different skills
      registry.register({
        id: 'pi-claude',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react', 'nodejs', 'testing'],
          languages: ['typescript', 'javascript', 'python'],
          specialties: ['frontend', 'fullstack'],
          costPerHour: 3.50,
          avgSpeed: 15,
          reliability: 0.97,
        },
      });

      registry.register({
        id: 'native-kimi',
        runtime: 'native',
        capabilities: {
          skills: ['python', 'ml', 'data-science'],
          languages: ['python', 'rust'],
          specialties: ['backend', 'ai'],
          costPerHour: 2.50,
          avgSpeed: 12,
          reliability: 0.95,
        },
      });

      // Select agent for TypeScript/React task
      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'react'],
        strategy: 'skill-match',
      });

      expect(result.agent.id).toBe('pi-claude');
      expect(result.agent.capabilities.skills).toContain('typescript');
      expect(result.agent.capabilities.skills).toContain('react');
    });
  });

  describe('Example 2: Cost-Optimized Selection', () => {
    it('should select cheapest agent that meets requirements', async () => {
      // Register agents at different price points
      registry.register({
        id: 'premium-claude',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'rust'],
          languages: ['typescript', 'rust'],
          specialties: ['systems'],
          costPerHour: 8.00,
          avgSpeed: 18,
          reliability: 0.99,
        },
      });

      registry.register({
        id: 'standard-gpt4',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'rust'],
          languages: ['typescript', 'rust'],
          specialties: ['general'],
          costPerHour: 4.00,
          avgSpeed: 14,
          reliability: 0.96,
        },
      });

      registry.register({
        id: 'budget-kimi',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'rust'],
          languages: ['typescript', 'rust'],
          specialties: ['backend'],
          costPerHour: 2.00,
          avgSpeed: 10,
          reliability: 0.92,
        },
      });

      // Select cheapest agent for TypeScript/Rust task
      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'rust'],
        strategy: 'cost-optimized',
      });

      expect(result.agent.id).toBe('budget-kimi');
      expect(result.agent.capabilities.costPerHour).toBe(2.00);
    });
  });

  describe('Example 3: Balanced Selection with Constraints', () => {
    it('should select best balanced agent within budget', async () => {
      // Register multiple agents
      registry.register({
        id: 'agent-a',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'testing'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 5.00,
          avgSpeed: 20,
          reliability: 0.98,
        },
        currentLoad: 0.8, // Heavily loaded
      });

      registry.register({
        id: 'agent-b',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'testing', 'auth'],
          languages: ['typescript', 'javascript'],
          specialties: ['fullstack'],
          costPerHour: 3.50,
          avgSpeed: 15,
          reliability: 0.95,
        },
        currentLoad: 0.3, // Lightly loaded
      });

      registry.register({
        id: 'agent-c',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.00,
          avgSpeed: 8,
          reliability: 0.85,
        },
        currentLoad: 0.1, // Mostly idle
      });

      // Select balanced agent within budget constraints
      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'testing'],
        strategy: 'balanced',
        maxCostPerHour: 4.00,
        minReliability: 0.90,
      });

      // agent-b is the best choice: meets skills, within budget,
      // good reliability, and low load
      expect(result.agent.id).toBe('agent-b');
      expect(result.score).toBeGreaterThan(0.5);
    });
  });

  describe('Example 4: Parallel Agent Selection', () => {
    it('should select multiple agents for parallel execution', async () => {
      // Register a pool of similar agents
      for (let i = 1; i <= 5; i++) {
        registry.register({
          id: `worker-${i}`,
          runtime: i % 2 === 0 ? 'pi' : 'native',
          capabilities: {
            skills: ['typescript', 'data-processing'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0 + i * 0.5,
            avgSpeed: 10 + i,
            reliability: 0.90 + i * 0.02,
          },
          currentLoad: i * 0.15, // Increasing load
        });
      }

      // Select top 3 agents for parallel work
      const results = await selector.selectMultipleAgents(
        {
          requiredSkills: ['typescript', 'data-processing'],
          strategy: 'load-balanced',
        },
        3
      );

      expect(results).toHaveLength(3);
      // Should select least loaded agents
      expect(results[0].agent.currentLoad).toBeLessThanOrEqual(results[1].agent.currentLoad);
      expect(results[1].agent.currentLoad).toBeLessThanOrEqual(results[2].agent.currentLoad);
    });
  });

  describe('Example 5: Agent Ranking for Queue Management', () => {
    it('should rank all agents by suitability', async () => {
      // Register agents with varying capabilities
      registry.register({
        id: 'expert-1',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react', 'nodejs', 'postgres'],
          languages: ['typescript', 'javascript'],
          specialties: ['fullstack'],
          costPerHour: 5.00,
          avgSpeed: 20,
          reliability: 0.98,
        },
      });

      registry.register({
        id: 'expert-2',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'react', 'nodejs'],
          languages: ['typescript', 'javascript'],
          specialties: ['frontend'],
          costPerHour: 4.00,
          avgSpeed: 18,
          reliability: 0.96,
        },
      });

      registry.register({
        id: 'junior-1',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'react'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.00,
          avgSpeed: 10,
          reliability: 0.88,
        },
      });

      // Get ranked list of all agents using skill-match strategy
      const ranked = await selector.rankAgents({
        requiredSkills: ['typescript', 'react'],
        strategy: 'skill-match',
      });

      expect(ranked).toHaveLength(3);
      // All agents have same required skills match (100%), so they all have same score
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[2].score);
      // All agents match the required skills (typescript, react)
      // The skill score combines required (70%) and preferred (30%) skills
      // Since all have 100% required match, base is 0.7, plus preferred bonus
      expect(ranked[0].details.skillScore).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Example 6: Specialty-based Selection', () => {
    it('should find agents by specialty', async () => {
      registry.register({
        id: 'security-expert',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'auth', 'encryption'],
          languages: ['typescript', 'rust'],
          specialties: ['security', 'backend'],
          costPerHour: 6.00,
          avgSpeed: 15,
          reliability: 0.99,
        },
      });

      registry.register({
        id: 'ui-designer',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'css', 'animation'],
          languages: ['typescript', 'javascript'],
          specialties: ['ui-design', 'frontend'],
          costPerHour: 4.00,
          avgSpeed: 12,
          reliability: 0.94,
        },
      });

      // Find agents by specialty
      const securityAgents = registry.findBySpecialty(['security']);
      expect(securityAgents).toHaveLength(1);
      expect(securityAgents[0].id).toBe('security-expert');

      // Select security expert for auth task
      const result = await selector.selectAgent({
        requiredSkills: ['typescript', 'auth'],
        requiredSpecialties: ['security'],
        strategy: 'skill-match',
      });

      expect(result.agent.id).toBe('security-expert');
    });
  });

  describe('Example 7: Load Balancing Across Runtimes', () => {
    it('should distribute load across different runtimes', async () => {
      // Register agents across different runtimes with varying loads
      registry.register({
        id: 'pi-1',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 3.00,
          avgSpeed: 15,
          reliability: 0.95,
        },
        currentLoad: 0.8,
      });

      registry.register({
        id: 'pi-2',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 3.00,
          avgSpeed: 15,
          reliability: 0.95,
        },
        currentLoad: 0.4,
      });

      registry.register({
        id: 'native-1',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.00,
          avgSpeed: 10,
          reliability: 0.90,
        },
        currentLoad: 0.2,
      });

      // Select using load-balanced strategy
      const result = await selector.selectAgent({
        requiredSkills: ['typescript'],
        strategy: 'load-balanced',
      });

      // Should select the least loaded agent
      expect(result.agent.id).toBe('native-1');
      expect(result.agent.currentLoad).toBe(0.2);
    });
  });

  describe('Example 8: Quick Select Function', () => {
    it('should use quick select helper', async () => {
      // Register using global registry
      const globalRegistry = getAgentRegistry();
      globalRegistry.register({
        id: 'quick-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'api-design'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 3.00,
          avgSpeed: 14,
          reliability: 0.96,
        },
      });

      // Use the quick select function
      const result = await selectAgent({
        requiredSkills: ['typescript', 'api-design'],
        strategy: 'balanced',
      });

      expect(result.agent.id).toBe('quick-agent');
    });
  });

  describe('Example 9: Registry Statistics', () => {
    it('should provide registry statistics', async () => {
      // Register agents with different statuses
      registry.register({
        id: 'idle-agent',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.50,
          avgSpeed: 10,
          reliability: 0.95,
        },
        currentLoad: 0.1,
      });

      registry.register({
        id: 'busy-agent',
        runtime: 'native',
        status: 'busy',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 3.50,
          avgSpeed: 12,
          reliability: 0.92,
        },
        currentLoad: 0.9,
      });

      registry.register({
        id: 'unhealthy-agent',
        runtime: 'pi',
        status: 'unhealthy',
        capabilities: {
          skills: ['rust'],
          languages: ['rust'],
          specialties: ['systems'],
          costPerHour: 4.00,
          avgSpeed: 15,
          reliability: 0.98,
        },
        currentLoad: 0.0,
      });

      const stats = registry.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byStatus.idle).toBe(1);
      expect(stats.byStatus.busy).toBe(1);
      expect(stats.byStatus.unhealthy).toBe(1);
      expect(stats.avgLoad).toBeCloseTo(0.33, 1);
      expect(stats.avgCostPerHour).toBeCloseTo(3.33, 1);
    });
  });

  describe('Example 10: Agent Heartbeat and Health', () => {
    it('should track agent health via heartbeat', () => {
      const agent = registry.register({
        id: 'health-test',
        runtime: 'pi',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 2.50,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      // Initial health check
      let healthy = registry.getHealthyAgents();
      expect(healthy).toHaveLength(1);

      // Simulate agent becoming unhealthy
      registry.updateStatus(agent.id, 'unhealthy');
      healthy = registry.getHealthyAgents();
      expect(healthy).toHaveLength(0);

      // Agent recovers and sends heartbeat
      registry.heartbeat(agent.id);
      healthy = registry.getHealthyAgents();
      expect(healthy).toHaveLength(1);
      expect(healthy[0].status).toBe('idle');
    });
  });
});

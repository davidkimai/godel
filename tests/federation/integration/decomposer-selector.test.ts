/**
 * TaskDecomposer + AgentSelector Integration Tests
 *
 * Tests the integration between task decomposition and agent selection,
 * ensuring that decomposed tasks are properly routed to appropriate agents
 * based on their skill requirements.
 */

import { TaskDecomposer } from '../../../src/federation/task-decomposer';
import {
  AgentRegistry,
  resetAgentRegistry,
  getAgentRegistry,
} from '../../../src/federation/agent-registry';
import { AgentSelector } from '../../../src/federation/agent-selector';

describe('TaskDecomposer + AgentSelector Integration', () => {
  let registry: AgentRegistry;
  let selector: AgentSelector;
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    resetAgentRegistry();
    registry = getAgentRegistry();
    selector = new AgentSelector(registry);
    decomposer = new TaskDecomposer();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Skill-Based Task Routing', () => {
    it('should route decomposed tasks to appropriate agents', async () => {
      // Register agents with different skills
      registry.register({
        id: 'frontend-dev',
        runtime: 'pi',
        capabilities: {
          skills: ['react', 'typescript', 'css', 'frontend'],
          languages: ['typescript', 'javascript'],
          specialties: ['frontend'],
          costPerHour: 2.5,
          avgSpeed: 12,
          reliability: 0.92,
        },
      });

      registry.register({
        id: 'backend-dev',
        runtime: 'native',
        capabilities: {
          skills: ['nodejs', 'postgres', 'api', 'backend'],
          languages: ['typescript', 'javascript'],
          specialties: ['backend'],
          costPerHour: 3.0,
          avgSpeed: 15,
          reliability: 0.94,
        },
      });

      registry.register({
        id: 'fullstack-dev',
        runtime: 'pi',
        capabilities: {
          skills: ['react', 'nodejs', 'typescript', 'database'],
          languages: ['typescript', 'javascript'],
          specialties: ['fullstack'],
          costPerHour: 3.5,
          avgSpeed: 14,
          reliability: 0.93,
        },
      });

      // Decompose full-stack task
      const result = await decomposer.decompose('Build a full-stack todo app', {
        strategy: 'component-based',
      });

      expect(result.subtasks.length).toBeGreaterThan(0);

      // Route each subtask to an appropriate agent
      for (const subtask of result.subtasks) {
        const agent = await selector.selectAgent({
          requiredSkills: subtask.requiredCapabilities || [],
          strategy: 'skill-match',
        });

        // Verify agent was selected
        expect(agent).toBeDefined();
        expect(agent.agent).toBeDefined();
        expect(agent.agent.id).toBeDefined();
        expect(agent.score).toBeGreaterThan(0);
      }
    });

    it('should prefer specialists over generalists for specific domains', async () => {
      registry.register({
        id: 'react-specialist',
        runtime: 'pi',
        capabilities: {
          skills: ['react', 'typescript', 'css', 'redux'],
          languages: ['typescript'],
          specialties: ['frontend', 'react'],
          costPerHour: 3.0,
          avgSpeed: 15,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'generalist',
        runtime: 'native',
        capabilities: {
          skills: ['react', 'nodejs', 'python'],
          languages: ['typescript', 'python'],
          specialties: ['fullstack'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      // Decompose a React-specific task
      const result = await decomposer.decompose('Create React components with Redux', {
        strategy: 'component-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['react'],
          strategy: 'skill-match',
        });

        // Specialist should be preferred
        expect(selection.agent.id).toBe('react-specialist');
        expect(selection.score).toBeGreaterThan(0.8);
      }
    });

    it('should handle tasks requiring multiple skills', async () => {
      registry.register({
        id: 'auth-expert',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'oauth', 'jwt', 'security'],
          languages: ['typescript'],
          specialties: ['security', 'backend'],
          costPerHour: 4.0,
          avgSpeed: 18,
          reliability: 0.96,
        },
      });

      registry.register({
        id: 'api-developer',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'api', 'nodejs'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 12,
          reliability: 0.9,
        },
      });

      const result = await decomposer.decompose('Implement OAuth2 authentication API', {
        strategy: 'domain-based',
      });

      // Find subtasks related to auth
      const authTasks = result.subtasks.filter(
        (st) =>
          st.title.toLowerCase().includes('auth') ||
          st.description.toLowerCase().includes('oauth')
      );

      for (const task of authTasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['oauth', 'jwt', 'security'],
          strategy: 'skill-match',
        });

        expect(selection.agent.id).toBe('auth-expert');
      }
    });

    it('should fall back to generalists when no specialist is available', async () => {
      registry.register({
        id: 'general-backend',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'api', 'database'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 12,
          reliability: 0.9,
        },
      });

      // Decompose a task requiring ML skills (which no agent has)
      const result = await decomposer.decompose('Build API with ML recommendation', {
        strategy: 'domain-based',
      });

      // Should still find an agent using partial matching
      const selection = await selector.selectAgent({
        requiredSkills: ['api'],
        strategy: 'skill-match',
      });

      expect(selection.agent.id).toBe('general-backend');
    });
  });

  describe('Cost Optimization Integration', () => {
    it('should select cost-effective agents for routine tasks', async () => {
      registry.register({
        id: 'junior-dev',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'testing'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 1.5,
          avgSpeed: 8,
          reliability: 0.85,
        },
      });

      registry.register({
        id: 'senior-dev',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'testing', 'architecture'],
          languages: ['typescript', 'rust'],
          specialties: ['fullstack'],
          costPerHour: 5.0,
          avgSpeed: 20,
          reliability: 0.97,
        },
      });

      const result = await decomposer.decompose('Write unit tests for existing functions', {
        strategy: 'file-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['testing'],
          strategy: 'cost-optimized',
        });

        // Should select the cheaper option for routine testing
        expect(selection.agent.id).toBe('junior-dev');
        expect(selection.agent.capabilities.costPerHour).toBe(1.5);
      }
    });

    it('should balance cost and quality for critical tasks', async () => {
      registry.register({
        id: 'budget-agent',
        runtime: 'native',
        capabilities: {
          skills: ['security', 'auth'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 1.0,
          avgSpeed: 5,
          reliability: 0.7,
        },
      });

      registry.register({
        id: 'expert-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['security', 'auth', 'encryption'],
          languages: ['typescript', 'rust'],
          specialties: ['security'],
          costPerHour: 6.0,
          avgSpeed: 18,
          reliability: 0.98,
        },
      });

      const result = await decomposer.decompose('Implement payment processing security', {
        strategy: 'domain-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['security'],
          minReliability: 0.9,
          strategy: 'balanced',
        });

        // Should select the expert for critical security work
        expect(selection.agent.id).toBe('expert-agent');
      }
    });

    it('should respect budget constraints', async () => {
      registry.register({
        id: 'expensive-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 10.0,
          avgSpeed: 25,
          reliability: 0.99,
        },
      });

      registry.register({
        id: 'affordable-agent',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.88,
        },
      });

      const result = await decomposer.decompose('Refactor utility functions', {
        strategy: 'file-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['typescript'],
          maxCostPerHour: 5.0,
          strategy: 'cost-optimized',
        });

        // Should select agent within budget
        expect(selection.agent.capabilities.costPerHour).toBeLessThanOrEqual(5.0);
        expect(selection.agent.id).toBe('affordable-agent');
      }
    });
  });

  describe('Load Balancing Integration', () => {
    it('should distribute decomposed tasks across available agents', async () => {
      // Register multiple agents with same skills but different loads
      for (let i = 0; i < 5; i++) {
        registry.register({
          id: `worker-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript', 'testing'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
          currentLoad: i * 0.2, // Increasing load
        });
      }

      const result = await decomposer.decompose('Write comprehensive test suite', {
        strategy: 'component-based',
      });

      const selections: string[] = [];
      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['testing'],
          strategy: 'load-balanced',
        });
        selections.push(selection.agent.id);
      }

      // Should distribute across agents (not all on one agent)
      const uniqueAgents = new Set(selections);
      expect(uniqueAgents.size).toBeGreaterThan(1);
    });

    it('should prefer idle agents over busy ones', async () => {
      registry.register({
        id: 'busy-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
        currentLoad: 0.9, // Very busy
      });

      registry.register({
        id: 'idle-agent',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
        currentLoad: 0.1, // Mostly idle
      });

      const result = await decomposer.decompose('Simple refactoring', {
        strategy: 'file-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'load-balanced',
        });

        expect(selection.agent.id).toBe('idle-agent');
      }
    });
  });

  describe('Complex Task Decomposition', () => {
    it('should handle microservices decomposition', async () => {
      registry.register({
        id: 'api-gateway-dev',
        runtime: 'pi',
        capabilities: {
          skills: ['api', 'gateway', 'typescript', 'routing'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 3.5,
          avgSpeed: 15,
          reliability: 0.94,
        },
      });

      registry.register({
        id: 'service-dev',
        runtime: 'native',
        capabilities: {
          skills: ['microservices', 'typescript', 'docker', 'kubernetes'],
          languages: ['typescript'],
          specialties: ['backend', 'devops'],
          costPerHour: 4.0,
          avgSpeed: 16,
          reliability: 0.93,
        },
      });

      const result = await decomposer.decompose(
        'Build microservices architecture with API gateway, auth service, and user service',
        {
          strategy: 'domain-based',
        }
      );

      expect(result.subtasks.length).toBeGreaterThan(2);

      // Each subtask should be routable
      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: subtask.requiredCapabilities || ['typescript'],
          strategy: 'skill-match',
        });

        expect(selection.agent).toBeDefined();
      }
    });

    it('should handle database-related tasks', async () => {
      registry.register({
        id: 'db-expert',
        runtime: 'pi',
        capabilities: {
          skills: ['postgres', 'sql', 'database', 'optimization'],
          languages: ['sql', 'typescript'],
          specialties: ['database'],
          costPerHour: 4.5,
          avgSpeed: 18,
          reliability: 0.96,
        },
      });

      const result = await decomposer.decompose(
        'Design database schema with indexing and query optimization',
        {
          strategy: 'component-based',
        }
      );

      const dbTasks = result.subtasks.filter(
        (st) =>
          st.title.toLowerCase().includes('database') ||
          st.title.toLowerCase().includes('schema') ||
          st.description.toLowerCase().includes('sql')
      );

      for (const task of dbTasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['database', 'sql'],
          strategy: 'skill-match',
        });

        expect(selection.agent.id).toBe('db-expert');
      }
    });

    it('should handle frontend framework-specific tasks', async () => {
      registry.register({
        id: 'nextjs-dev',
        runtime: 'pi',
        capabilities: {
          skills: ['nextjs', 'react', 'typescript', 'ssr'],
          languages: ['typescript'],
          specialties: ['frontend'],
          costPerHour: 3.5,
          avgSpeed: 15,
          reliability: 0.93,
        },
      });

      registry.register({
        id: 'vue-dev',
        runtime: 'native',
        capabilities: {
          skills: ['vue', 'javascript', 'frontend'],
          languages: ['javascript'],
          specialties: ['frontend'],
          costPerHour: 3.0,
          avgSpeed: 14,
          reliability: 0.91,
        },
      });

      const result = await decomposer.decompose('Build Next.js application with SSR', {
        strategy: 'component-based',
      });

      for (const subtask of result.subtasks) {
        const selection = await selector.selectAgent({
          requiredSkills: ['nextjs', 'react'],
          strategy: 'skill-match',
        });

        expect(selection.agent.id).toBe('nextjs-dev');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle no matching agents gracefully', async () => {
      // Register agents with limited skills
      registry.register({
        id: 'limited-agent',
        runtime: 'native',
        capabilities: {
          skills: ['html', 'css'],
          languages: ['javascript'],
          specialties: ['frontend'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      const result = await decomposer.decompose('Implement Rust kernel module', {
        strategy: 'component-based',
      });

      // Should throw or return error when no agent matches
      await expect(
        selector.selectAgent({
          requiredSkills: ['rust', 'kernel'],
          strategy: 'skill-match',
        })
      ).rejects.toThrow();
    });

    it('should handle empty task decomposition', async () => {
      // Clear registry
      registry.clear();

      const result = await decomposer.decompose('', {
        strategy: 'component-based',
      });

      // Empty task may still produce at least one subtask
      expect(result.subtasks).toBeDefined();
    });
  });
});

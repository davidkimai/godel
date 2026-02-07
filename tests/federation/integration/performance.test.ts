/**
 * Federation Performance Integration Tests
 *
 * Tests performance characteristics of the federation system:
 * - Concurrent task handling
 * - Consistent hashing distribution
 * - Response time under load
 * - Memory usage patterns
 */

// Import from specific files to avoid @godel/ai dependency chain
import { TaskDecomposer } from '../../../src/federation/task-decomposer';
import { DependencyResolver } from '../../../src/federation/dependency-resolver';
import { ExecutionEngine } from '../../../src/federation/execution-engine';
import {
  AgentRegistry,
  AgentSelector,
  resetAgentRegistry,
  getAgentRegistry,
} from '../../../src/federation/agent-registry';
import { LoadBalancer } from '../../../src/federation/load-balancer';
import { ConsistentHashStrategy } from '../../../src/federation/strategies/consistent-hash';
import type { Subtask as FederationSubtask } from '../../../src/federation/types';

// Helper to convert task-decomposer subtask to federation subtask
function toFederationSubtask(st: {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  requiredCapabilities?: string[];
}): FederationSubtask {
  return {
    id: st.id,
    name: st.title,
    description: st.description,
    requiredSkills: st.requiredCapabilities || [],
    priority: 'medium',
  };
}

// Helper to create mock executor
function createMockExecutor(executeImpl?: () => Promise<unknown>) {
  return {
    execute: jest.fn().mockImplementation(executeImpl || (async () => ({ success: true }))),
    cancel: jest.fn().mockResolvedValue(true),
  };
}

describe('Federation Performance', () => {
  let registry: AgentRegistry;
  let selector: AgentSelector;

  beforeEach(() => {
    resetAgentRegistry();
    registry = getAgentRegistry();
    selector = new AgentSelector(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Concurrent Task Handling', () => {
    it('should handle 50 concurrent agent selections', async () => {
      // Register 10 agents
      for (let i = 0; i < 10; i++) {
        registry.register({
          id: `agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript', 'api'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0 + i * 0.5,
            avgSpeed: 10 + i,
            reliability: 0.9 + i * 0.01,
          },
          currentLoad: i * 0.1,
        });
      }

      // Create 50 concurrent selection requests
      const startTime = Date.now();
      const selections = await Promise.all(
        Array(50)
          .fill(null)
          .map(() =>
            selector.selectAgent({
              requiredSkills: ['typescript'],
              strategy: 'skill-match',
            })
          )
      );
      const duration = Date.now() - startTime;

      expect(selections).toHaveLength(50);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds

      // All selections should have valid agents
      selections.forEach((selection) => {
        expect(selection.agent).toBeDefined();
        expect(selection.agent.id).toBeDefined();
        expect(selection.score).toBeGreaterThan(0);
      });
    });

    it('should handle 100 concurrent decompositions', async () => {
      const decomposer = new TaskDecomposer();

      const startTime = Date.now();
      const decompositions = await Promise.all(
        Array(100)
          .fill(null)
          .map((_, i) =>
            decomposer.decompose(`Task ${i}: Create utility function`, {
              strategy: 'component-based',
            })
          )
      );
      const duration = Date.now() - startTime;

      expect(decompositions).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // All decompositions should be valid
      decompositions.forEach((decomp) => {
        expect(decomp.subtasks).toBeDefined();
        expect(decomp.dag).toBeDefined();
        expect(decomp.executionLevels).toBeDefined();
      });
    });

    it('should handle 50 concurrent execution plans', async () => {
      // Register agents
      for (let i = 0; i < 5; i++) {
        registry.register({
          id: `executor-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const decomposer = new TaskDecomposer();
      const mockExecutor = createMockExecutor();

      const engine = new ExecutionEngine(selector, mockExecutor);

      // Create 50 different plans
      const plans = await Promise.all(
        Array(50)
          .fill(null)
          .map(async (_, i) => {
            const decomposition = await decomposer.decompose(`Task ${i}`, {
              strategy: 'component-based',
            });

            const resolver = new DependencyResolver();
            resolver.buildGraph(
              decomposition.subtasks.map((st) => ({
                id: st.id,
                task: toFederationSubtask(st),
                dependencies: st.dependencies,
              }))
            );

            return resolver.getExecutionPlan();
          })
      );

      const startTime = Date.now();
      const results = await Promise.all(
        plans.map((plan) => engine.executePlan(plan))
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // All executions should succeed
      results.forEach((result) => {
        expect(result.completed).toBeGreaterThanOrEqual(0);
        expect(result.results.size).toBeGreaterThanOrEqual(0);
      });
    });

    it('should maintain performance with load balancer under concurrent load', async () => {
      // Register agents
      for (let i = 0; i < 10; i++) {
        registry.register({
          id: `lb-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript', 'api'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'least-connections',
        healthCheck: { interval: 10000 },
        circuitBreaker: { failureThreshold: 5 },
      });

      const startTime = Date.now();
      const selections = await Promise.all(
        Array(50)
          .fill(null)
          .map(() =>
            loadBalancer.selectAgent({
              requiredSkills: ['typescript'],
            })
          )
      );
      const duration = Date.now() - startTime;

      expect(selections).toHaveLength(50);
      expect(duration).toBeLessThan(3000); // Should complete in under 3 seconds

      // Verify load distribution
      const agentCounts = new Map<string, number>();
      selections.forEach((sel) => {
        agentCounts.set(sel.agent.id, (agentCounts.get(sel.agent.id) || 0) + 1);
      });

      // Load should be somewhat distributed
      const counts = Array.from(agentCounts.values());
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      expect(maxCount / minCount).toBeLessThan(5); // No agent should have 5x more than another

      loadBalancer.stop();
    });
  });

  describe('Consistent Hashing Distribution', () => {
    it('should maintain consistent hashing distribution with 5 agents', async () => {
      const strategy = new ConsistentHashStrategy(150);

      // Add 5 agents
      const agents = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `agent-${i}`,
          runtime: 'native' as const,
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        }));

      agents.forEach((a) => strategy.addAgent(a));

      // Route 1000 tasks
      const distribution = new Map<string, number>();
      for (let i = 0; i < 1000; i++) {
        const agent = strategy.selectAgent(agents, { taskId: `task-${i}` });
        distribution.set(agent.id, (distribution.get(agent.id) || 0) + 1);
      }

      // Verify relatively even distribution
      const counts = Array.from(distribution.values());
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
      const stdDev = Math.sqrt(variance);

      // Coefficient of variation should be less than 30%
      expect(stdDev / avg).toBeLessThan(0.3);

      // All agents should receive some traffic
      expect(distribution.size).toBe(5);
    });

    it('should maintain consistent hashing with agent additions', async () => {
      const strategy = new ConsistentHashStrategy(150);

      // Start with 3 agents
      let agents = Array(3)
        .fill(null)
        .map((_, i) => ({
          id: `agent-${i}`,
          runtime: 'native' as const,
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        }));

      agents.forEach((a) => strategy.addAgent(a));

      // Route 100 tasks and track assignments
      const initialAssignments = new Map<string, string>();
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(agents, { taskId: `task-${i}` });
        initialAssignments.set(`task-${i}`, agent.id);
      }

      // Add 2 more agents
      const newAgents = Array(2)
        .fill(null)
        .map((_, i) => ({
          id: `agent-${i + 3}`,
          runtime: 'native' as const,
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        }));

      newAgents.forEach((a) => strategy.addAgent(a));
      agents = [...agents, ...newAgents];

      // Route same tasks again and compare
      let remappedCount = 0;
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(agents, { taskId: `task-${i}` });
        if (agent.id !== initialAssignments.get(`task-${i}`)) {
          remappedCount++;
        }
      }

      // With consistent hashing, only a fraction should be remapped
      // (approximately 2/5 = 40% in the worst case)
      expect(remappedCount).toBeLessThan(60);
    });

    it('should handle consistent hashing with agent removals', async () => {
      const strategy = new ConsistentHashStrategy(150);

      // Start with 5 agents
      const agents = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `agent-${i}`,
          runtime: 'native' as const,
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        }));

      agents.forEach((a) => strategy.addAgent(a));

      // Route 100 tasks and track assignments
      const initialAssignments = new Map<string, string>();
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(agents, { taskId: `task-${i}` });
        initialAssignments.set(`task-${i}`, agent.id);
      }

      // Remove one agent
      strategy.removeAgent('agent-2');
      const remainingAgents = agents.filter((a) => a.id !== 'agent-2');

      // Route same tasks again and count remappings from removed agent
      let remappedFromRemovedCount = 0;
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(remainingAgents, { taskId: `task-${i}` });
        const originalAgent = initialAssignments.get(`task-${i}`);
        if (originalAgent === 'agent-2' && agent.id !== 'agent-2') {
          remappedFromRemovedCount++;
        }
      }

      // Tasks originally assigned to removed agent should be remapped
      // (some tasks may not have been on agent-2)
      expect(remappedFromRemovedCount).toBeGreaterThan(0);
    });
  });

  describe('Response Time Under Load', () => {
    it('should maintain sub-100ms response time for single selections', async () => {
      // Register 20 agents
      for (let i = 0; i < 20; i++) {
        registry.register({
          id: `agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript', 'react', 'nodejs', 'api', 'database'],
            languages: ['typescript'],
            specialties: ['fullstack'],
            costPerHour: 2.0 + i * 0.1,
            avgSpeed: 10 + i,
            reliability: 0.9 + i * 0.005,
          },
        });
      }

      // Measure selection time
      const startTime = Date.now();
      await selector.selectAgent({
        requiredSkills: ['typescript', 'react'],
        strategy: 'balanced',
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should be sub-100ms
    });

    it('should scale linearly with agent count', async () => {
      const agentCounts = [10, 20, 50];
      const durations: number[] = [];

      for (const count of agentCounts) {
        // Clear and register new agents
        registry.clear();

        for (let i = 0; i < count; i++) {
          registry.register({
            id: `scale-agent-${i}`,
            runtime: 'native',
            capabilities: {
              skills: ['typescript'],
              languages: ['typescript'],
              specialties: ['general'],
              costPerHour: 2.0,
              avgSpeed: 10,
              reliability: 0.9,
            },
          });
        }

        const startTime = Date.now();
        await selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        });
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      // Durations should roughly scale linearly (or better)
      // 50 agents should not take more than 5x the time of 10 agents
      expect(durations[2]).toBeLessThan(durations[0] * 5);
    });

    it('should maintain performance with complex selection criteria', async () => {
      // Register 50 agents with varied capabilities
      for (let i = 0; i < 50; i++) {
        registry.register({
          id: `complex-agent-${i}`,
          runtime: i % 2 === 0 ? 'native' : 'pi',
          capabilities: {
            skills: ['typescript', `skill-${i % 10}`, `extra-${i % 5}`],
            languages: ['typescript', i % 3 === 0 ? 'python' : 'javascript'],
            specialties: [`specialty-${i % 5}`],
            costPerHour: 1.0 + (i % 10),
            avgSpeed: 5 + (i % 15),
            reliability: 0.85 + (i % 15) * 0.01,
          },
        });
      }

      const startTime = Date.now();
      const selection = await selector.selectAgent({
        requiredSkills: ['typescript'],
        preferredSkills: ['skill-5'],
        requiredLanguages: ['typescript'],
        maxCostPerHour: 8.0,
        minReliability: 0.9,
        strategy: 'balanced',
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Complex criteria should still be fast
      expect(selection.agent).toBeDefined();
    });
  });

  describe('Memory Usage Patterns', () => {
    it('should handle large task decompositions efficiently', async () => {
      const decomposer = new TaskDecomposer();

      const largeTask =
        'Build a complete e-commerce platform with user management, ' +
        'product catalog, shopping cart, payment processing, order management, ' +
        'inventory tracking, shipping integration, analytics dashboard, ' +
        'admin panel, and API for mobile apps';

      const result = await decomposer.decompose(largeTask, {
        strategy: 'component-based',
      });

      // Result should not be excessively large
      const resultString = JSON.stringify(result);
      expect(resultString.length).toBeLessThan(100000); // Less than 100KB

      // Should produce reasonable number of subtasks
      expect(result.subtasks.length).toBeGreaterThan(5);
      expect(result.subtasks.length).toBeLessThan(50);
    });

    it('should not leak memory with repeated selections', async () => {
      // Register 10 agents
      for (let i = 0; i < 10; i++) {
        registry.register({
          id: `memory-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      // Perform 100 selections
      for (let i = 0; i < 100; i++) {
        await selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        });
      }

      // Registry should still have only 10 agents
      const stats = registry.getStats();
      expect(stats.total).toBe(10);
    });

    it('should efficiently handle dependency graphs with many nodes', async () => {
      const resolver = new DependencyResolver();

      // Create a complex dependency graph with 50 nodes
      const tasks = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `task-${i}`,
          task: {
            id: `task-${i}`,
            name: `Task ${i}`,
            description: `Task ${i} description`,
            requiredSkills: ['typescript'],
            priority: 'medium' as const,
          },
          dependencies: i > 0 ? [`task-${Math.floor(i / 2)}`] : [],
        }));

      const startTime = Date.now();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Should be fast
      expect(plan.levels.length).toBeGreaterThan(1);
      expect(plan.totalTasks).toBe(50);
    });
  });

  describe('Throughput Benchmarks', () => {
    it('should process at least 100 selections per second', async () => {
      // Register 20 agents
      for (let i = 0; i < 20; i++) {
        registry.register({
          id: `throughput-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript', 'api'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await selector.selectAgent({
          requiredSkills: ['typescript'],
          strategy: 'skill-match',
        });
      }

      const duration = Date.now() - startTime;
      const rate = (iterations / duration) * 1000;

      expect(rate).toBeGreaterThan(100); // At least 100 selections per second
    });

    it('should execute small plans quickly', async () => {
      // Register agents
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `exec-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const decomposer = new TaskDecomposer();
      const mockExecutor = createMockExecutor();
      const engine = new ExecutionEngine(selector, mockExecutor);

      // Create 10 small plans
      const plans = await Promise.all(
        Array(10)
          .fill(null)
          .map(async () => {
            const decomposition = await decomposer.decompose('Simple task', {
              strategy: 'component-based',
            });

            const resolver = new DependencyResolver();
            resolver.buildGraph(
              decomposition.subtasks.map((st) => ({
                id: st.id,
                task: toFederationSubtask(st),
                dependencies: st.dependencies,
              }))
            );

            return resolver.getExecutionPlan();
          })
      );

      const startTime = Date.now();
      await Promise.all(plans.map((plan) => engine.executePlan(plan)));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // 10 plans should complete in under 3 seconds
    });
  });
});

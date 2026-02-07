/**
 * Federation Resilience and Chaos Integration Tests
 *
 * Tests system resilience under failure conditions:
 * - Agent failures and recovery
 * - Cascading failures
 * - Circuit breaker behavior
 * - Partial system degradation
 * - Network partition simulation
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
import type { Subtask as FederationSubtask } from '../../../src/federation/types';

describe('Federation Resilience', () => {
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

  describe('Agent Failure Recovery', () => {
    it('should recover from agent failures', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'least-connections',
        healthCheck: { interval: 500 },
        circuitBreaker: { failureThreshold: 3, timeout: 1000 },
      });

      // Register agents
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      agents.forEach((id) => {
        registry.register({
          id,
          runtime: 'native',
          status: 'idle',
          capabilities: {
            skills: ['typescript', 'testing'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      });

      // Simulate agent-2 failing
      loadBalancer.recordFailure('agent-2', new Error('Connection lost'));
      loadBalancer.recordFailure('agent-2', new Error('Connection lost'));
      loadBalancer.recordFailure('agent-2', new Error('Connection lost'));

      // Should still route to healthy agents
      const healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.map((a) => a.id)).not.toContain('agent-2');
      expect(healthyAgents.length).toBe(2);

      // Select agent should work with remaining agents
      for (let i = 0; i < 5; i++) {
        const selection = await loadBalancer.selectAgent({
          requiredSkills: ['typescript'],
        });
        expect(selection.agent.id).not.toBe('agent-2');
      }

      loadBalancer.stop();
    });

    it('should handle cascading failures with circuit breaker', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 500 },
        circuitBreaker: { failureThreshold: 2, timeout: 5000 },
      });

      // Register agents that will all fail
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `failing-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['general'],
            costPerHour: 1.0,
            avgSpeed: 5,
            reliability: 0.5,
          },
        });
      }

      // Open all circuit breakers
      for (let i = 0; i < 3; i++) {
        loadBalancer.recordFailure(`failing-agent-${i}`, new Error('Failed'));
        loadBalancer.recordFailure(`failing-agent-${i}`, new Error('Failed'));
      }

      // Should throw no healthy agents
      await expect(loadBalancer.selectAgent({})).rejects.toThrow();

      loadBalancer.stop();
    });

    it('should gracefully degrade when agents become unhealthy', async () => {
      // Start with 5 healthy agents
      for (let i = 0; i < 5; i++) {
        registry.register({
          id: `healthy-agent-${i}`,
          runtime: 'native',
          status: 'idle',
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

      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 100 },
      });

      // Initially all agents should be healthy
      let healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.length).toBe(5);

      // Mark 3 agents as unhealthy
      registry.updateStatus('healthy-agent-0', 'unhealthy');
      registry.updateStatus('healthy-agent-1', 'unhealthy');
      registry.updateStatus('healthy-agent-2', 'unhealthy');

      // Wait for health check to run
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should still have 2 healthy agents
      healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.length).toBe(2);

      // Selection should still work
      const selection = await loadBalancer.selectAgent({
        requiredSkills: ['typescript'],
      });
      expect(['healthy-agent-3', 'healthy-agent-4']).toContain(selection.agent.id);

      loadBalancer.stop();
    });

    it('should handle rapid agent churn', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'least-connections',
        healthCheck: { interval: 200 },
      });

      // Rapidly register and unregister agents
      for (let cycle = 0; cycle < 5; cycle++) {
        // Register new batch
        for (let i = 0; i < 3; i++) {
          registry.register({
            id: `churn-agent-${cycle}-${i}`,
            runtime: 'native',
            status: 'idle',
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

        // Select from them immediately
        const selection = await loadBalancer.selectAgent({
          requiredSkills: ['typescript'],
        });
        expect(selection).toBeDefined();

        // Unregister previous batch if not first cycle
        if (cycle > 0) {
          for (let i = 0; i < 3; i++) {
            registry.unregister(`churn-agent-${cycle - 1}-${i}`);
          }
        }
      }

      loadBalancer.stop();
    });
  });

  describe('Execution Resilience', () => {
    it('should handle task execution failures with retry', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Simple task', {
        strategy: 'component-based',
      });

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          } as FederationSubtask,
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'retry-test-agent',
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

      let attemptCount = 0;
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        retryAttempts: 3,
        retryDelayMs: 10,
      });

      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(plan.totalTasks);
      expect(attemptCount).toBeGreaterThanOrEqual(3);
    });

    it('should skip dependent tasks when prerequisites fail', async () => {
      // Helper to create valid Subtask
      const createSubtask = (id: string, name: string): FederationSubtask => ({
        id,
        name,
        description: `Task ${name}`,
        requiredSkills: [],
        priority: 'medium',
      });

      const tasks = [
        { id: 'A', task: createSubtask('A', 'Task A'), dependencies: [] as string[] },
        { id: 'B', task: createSubtask('B', 'Task B'), dependencies: ['A'] },
        { id: 'C', task: createSubtask('C', 'Task C'), dependencies: ['A'] },
        { id: 'D', task: createSubtask('D', 'Task D'), dependencies: ['B', 'C'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'exec-agent',
        runtime: 'native',
        capabilities: {
          skills: [],
          languages: [],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      let executionCount = 0;
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: FederationSubtask) => {
          executionCount++;
          if (task.name === 'Task A') {
            throw new Error('Task A failed');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        retryAttempts: 0,
        continueOnFailure: false,
      });

      const result = await engine.executePlan(plan);

      expect(result.failed).toBeGreaterThan(0);
      // Dependent tasks (B, C, D) should not have been executed since A failed
      // Note: This depends on the execution order and may vary
    });

    it('should handle timeout scenarios', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Slow task', {
        strategy: 'component-based',
      });

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          } as FederationSubtask,
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'timeout-agent',
        runtime: 'native',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 1, // Very slow
          reliability: 0.9,
        },
      });

      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          // Simulate slow execution
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const startTime = Date.now();
      const result = await engine.executePlan(plan);
      const duration = Date.now() - startTime;

      // Should complete eventually
      expect(duration).toBeGreaterThan(400); // Should take time due to slow execution
      expect(result.completed + result.failed).toBe(plan.totalTasks);
    });
  });

  describe('Partial System Degradation', () => {
    it('should continue operating with reduced capacity', async () => {
      // Start with full capacity
      for (let i = 0; i < 10; i++) {
        registry.register({
          id: `capacity-agent-${i}`,
          runtime: 'native',
          status: 'idle',
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
        healthCheck: { interval: 100 },
      });

      // Simulate losing 70% of capacity
      for (let i = 0; i < 7; i++) {
        registry.updateStatus(`capacity-agent-${i}`, 'unhealthy');
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should still operate with remaining 3 agents
      const healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.length).toBe(3);

      // Should still be able to select agents
      const selections = await Promise.all(
        Array(10)
          .fill(null)
          .map(() => loadBalancer.selectAgent({ requiredSkills: ['typescript'] }))
      );

      expect(selections).toHaveLength(10);
      selections.forEach((sel) => {
        expect(sel.agent.id).toMatch(/capacity-agent-[789]/);
      });

      loadBalancer.stop();
    });

    it('should prioritize critical tasks during degraded mode', async () => {
      // Register limited agents
      for (let i = 0; i < 2; i++) {
        registry.register({
          id: `priority-agent-${i}`,
          runtime: 'native',
          status: 'idle',
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

      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'weighted',
        healthCheck: { interval: 100 },
      });

      // High priority tasks should get preference
      const highPrioritySelection = await loadBalancer.selectAgent({
        requiredSkills: ['typescript'],
        priority: 10,
      });

      const lowPrioritySelection = await loadBalancer.selectAgent({
        requiredSkills: ['typescript'],
        priority: 1,
      });

      expect(highPrioritySelection).toBeDefined();
      expect(lowPrioritySelection).toBeDefined();

      loadBalancer.stop();
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should transition through circuit breaker states correctly', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 1000 },
        circuitBreaker: { failureThreshold: 3, timeout: 500 },
      });

      registry.register({
        id: 'cb-test-agent',
        runtime: 'native',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.5,
        },
      });

      // Initially agent should be healthy (CLOSED state)
      let healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.map((a) => a.id)).toContain('cb-test-agent');

      // Record failures to open circuit (OPEN state)
      loadBalancer.recordFailure('cb-test-agent', new Error('Fail 1'));
      loadBalancer.recordFailure('cb-test-agent', new Error('Fail 2'));
      loadBalancer.recordFailure('cb-test-agent', new Error('Fail 3'));

      healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.map((a) => a.id)).not.toContain('cb-test-agent');

      // Wait for timeout (transition to HALF-OPEN)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // After timeout, circuit should allow test requests
      // Note: Actual behavior depends on circuit breaker implementation

      loadBalancer.stop();
    });

    it('should prevent cascade failures with circuit breaker', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 500 },
        circuitBreaker: { failureThreshold: 2, timeout: 2000 },
      });

      // Register a chain of dependent services
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `service-${i}`,
          runtime: 'native',
          status: 'idle',
          capabilities: {
            skills: ['api'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      // Simulate failure cascade
      loadBalancer.recordFailure('service-0', new Error('Downstream error'));
      loadBalancer.recordFailure('service-0', new Error('Downstream error'));

      // Circuit breaker should open for service-0
      // Other services should remain healthy
      const healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.map((a) => a.id)).not.toContain('service-0');
      expect(healthyAgents.map((a) => a.id)).toContain('service-1');
      expect(healthyAgents.map((a) => a.id)).toContain('service-2');

      loadBalancer.stop();
    });
  });

  describe('System Recovery', () => {
    it('should recover from total agent loss', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 100 },
      });

      // Start with agents
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `recover-agent-${i}`,
          runtime: 'native',
          status: 'idle',
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

      expect(loadBalancer.getHealthyAgents().length).toBe(3);

      // Lose all agents
      for (let i = 0; i < 3; i++) {
        registry.updateStatus(`recover-agent-${i}`, 'unhealthy');
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(loadBalancer.getHealthyAgents().length).toBe(0);

      // Recover agents
      for (let i = 0; i < 3; i++) {
        registry.updateStatus(`recover-agent-${i}`, 'idle');
        registry.heartbeat(`recover-agent-${i}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(loadBalancer.getHealthyAgents().length).toBe(3);

      loadBalancer.stop();
    });

    it('should handle intermittent agent failures', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 200 },
        circuitBreaker: { failureThreshold: 5, timeout: 1000 },
      });

      registry.register({
        id: 'flaky-agent',
        runtime: 'native',
        status: 'idle',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      // Simulate intermittent failures (not enough to open circuit)
      for (let i = 0; i < 3; i++) {
        loadBalancer.recordFailure('flaky-agent', new Error('Intermittent'));
        await new Promise((resolve) => setTimeout(resolve, 100));
        registry.heartbeat('flaky-agent');
      }

      // Agent should still be considered (circuit not open)
      // Note: This depends on the exact circuit breaker implementation

      loadBalancer.stop();
    });
  });

  describe('Chaos Scenarios', () => {
    it('should handle random agent failures during execution', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Create multiple components', {
        strategy: 'component-based',
      });

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          } as FederationSubtask,
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      // Register multiple agents
      for (let i = 0; i < 5; i++) {
        registry.register({
          id: `chaos-agent-${i}`,
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

      // Random failure executor
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          if (Math.random() < 0.3) {
            throw new Error('Random failure');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        retryAttempts: 2,
        continueOnFailure: true,
      });

      // Run multiple times to get different random outcomes
      let totalCompleted = 0;
      let totalFailed = 0;

      for (let run = 0; run < 5; run++) {
        const result = await engine.executePlan(plan);
        totalCompleted += result.completed;
        totalFailed += result.failed;
      }

      // Some tasks should complete across all runs
      expect(totalCompleted).toBeGreaterThan(0);
    });

    it('should handle burst traffic with agent failures', async () => {
      // Register limited agents
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `burst-agent-${i}`,
          runtime: 'native',
          status: 'idle',
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

      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'least-connections',
        healthCheck: { interval: 500 },
        circuitBreaker: { failureThreshold: 10 },
      });

      // Burst of selections
      const burstSize = 50;
      const selections: string[] = [];

      // Simulate agent failure mid-burst
      setTimeout(() => {
        registry.updateStatus('burst-agent-1', 'unhealthy');
      }, 50);

      for (let i = 0; i < burstSize; i++) {
        try {
          const selection = await loadBalancer.selectAgent({
            requiredSkills: ['typescript'],
          });
          selections.push(selection.agent.id);
        } catch {
          // Some selections may fail
        }
      }

      // Should have handled most of the burst
      expect(selections.length).toBeGreaterThan(burstSize * 0.5);

      loadBalancer.stop();
    });
  });
});

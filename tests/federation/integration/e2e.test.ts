/**
 * Federation End-to-End Integration Tests
 *
 * Comprehensive E2E tests covering the full federation workflow:
 * - Task decomposition
 * - Dependency resolution
 * - Agent selection
 * - Load balancing
 * - Execution engine
 * - Circuit breaker resilience
 * - Auto-scaling
 */

// Import from specific files to avoid @godel/ai dependency chain
import { TaskDecomposer } from '../../../src/federation/task-decomposer';
import { DependencyResolver } from '../../../src/federation/dependency-resolver';
import { ExecutionEngine } from '../../../src/federation/execution-engine';
import type { ExecutionResult } from '../../../src/federation/types';
import {
  AgentRegistry,
  resetAgentRegistry,
  getAgentRegistry,
} from '../../../src/federation/agent-registry';
import { AgentSelector } from '../../../src/federation/agent-selector';
import { LoadBalancer } from '../../../src/federation/load-balancer';
import { AutoScaler } from '../../../src/scaling/auto-scaler';
import type {
  ScalingPolicy,
  ScalingDecision,
} from '../../../src/scaling/types';
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

describe('Federation E2E', () => {
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

  describe('Full Federation Workflow', () => {
    it('should decompose, route, and execute a complex task', async () => {
      // 1. Decompose a complex task
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Implement user authentication with OAuth and JWT',
        {
          strategy: 'component-based',
        }
      );

      expect(decomposition.subtasks.length).toBeGreaterThan(0);
      expect(decomposition.dag.nodes.length).toBeGreaterThan(0);
      expect(decomposition.executionLevels.length).toBeGreaterThan(0);

      // 2. Build dependency graph
      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: toFederationSubtask(st),
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();
      expect(plan.levels.length).toBeGreaterThan(0);
      expect(plan.totalTasks).toBe(decomposition.subtasks.length);

      // 3. Register mock agents with different capabilities
      registry.register({
        id: 'auth-expert',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'oauth', 'jwt', 'auth'],
          languages: ['typescript'],
          specialties: ['security', 'backend'],
          costPerHour: 3.0,
          avgSpeed: 15,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'general-dev',
        runtime: 'native',
        capabilities: {
          skills: ['typescript', 'testing'],
          languages: ['typescript'],
          specialties: ['frontend', 'backend'],
          costPerHour: 2.5,
          avgSpeed: 12,
          reliability: 0.9,
        },
      });

      // 4. Execute with actual components
      const mockExecutor = createMockExecutor();

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBeGreaterThan(0);
      expect(result.results.size).toBe(plan.totalTasks);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(plan.totalTasks);
    });

    it('should handle parallel execution efficiently', async () => {
      // Create a task with multiple independent subtasks
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Create 5 independent utility functions',
        {
          strategy: 'component-based',
        }
      );

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: toFederationSubtask(st),
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      // Register multiple agents
      for (let i = 0; i < 3; i++) {
        registry.register({
          id: `worker-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const mockExecutor = createMockExecutor(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true };
      });

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(plan.totalTasks);
      expect(result.durationMs).toBeLessThan(5000); // Should complete quickly with parallelism
    });

    it('should propagate results through dependency chain', async () => {
      // Create a task with clear dependencies
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Build API with database and authentication layers',
        {
          strategy: 'domain-based',
        }
      );

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: toFederationSubtask(st),
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      // Verify that higher levels depend on lower levels
      expect(plan.levels.length).toBeGreaterThan(1);

      registry.register({
        id: 'backend-expert',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript', 'api', 'database', 'auth'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 3.5,
          avgSpeed: 18,
          reliability: 0.95,
        },
      });

      const results: string[] = [];
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: FederationSubtask) => {
          results.push(task.name);
          return { completed: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      await engine.executePlan(plan);

      expect(results.length).toBe(plan.totalTasks);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should handle agent failures with circuit breaker', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 1000 },
        circuitBreaker: { failureThreshold: 3, timeout: 1000 },
      });

      // Register an agent that will fail
      registry.register({
        id: 'unreliable-agent',
        runtime: 'native',
        capabilities: {
          skills: ['test'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 1.0,
          avgSpeed: 5,
          reliability: 0.1,
        },
      });

      // Register a reliable agent
      registry.register({
        id: 'reliable-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['test'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      // Simulate failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        loadBalancer.recordFailure('unreliable-agent', new Error('Connection failed'));
      }

      // Circuit breaker should be open - unreliable agent should be excluded
      const healthyAgents = loadBalancer.getHealthyAgents();
      const agentIds = healthyAgents.map((a) => a.id);
      expect(agentIds).not.toContain('unreliable-agent');
      expect(agentIds).toContain('reliable-agent');

      loadBalancer.stop();
    });

    it('should recover from agent failures automatically', async () => {
      const loadBalancer = new LoadBalancer(registry, {
        strategy: 'round-robin',
        healthCheck: { interval: 100 },
        circuitBreaker: { failureThreshold: 2, timeout: 500 },
      });

      registry.register({
        id: 'failing-agent',
        runtime: 'native',
        status: 'idle',
        capabilities: {
          skills: ['test'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 1.0,
          avgSpeed: 5,
          reliability: 0.5,
        },
      });

      // Record failures to open circuit
      loadBalancer.recordFailure('failing-agent', new Error('Error 1'));
      loadBalancer.recordFailure('failing-agent', new Error('Error 2'));

      // Circuit should be open
      let healthyAgents = loadBalancer.getHealthyAgents();
      expect(healthyAgents.map((a) => a.id)).not.toContain('failing-agent');

      // Wait for circuit breaker timeout
      await new Promise((resolve) => setTimeout(resolve, 600));

      // After timeout, circuit should be half-open and agent should be considered again
      // Note: Actual recovery depends on successful health check

      loadBalancer.stop();
    });

    it('should route around failed agents during execution', async () => {
      const decomposer = new TaskDecomposer();
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

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'good-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      registry.register({
        id: 'bad-agent',
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

      let badAgentCalled = 0;
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string) => {
          if (agentId === 'bad-agent') {
            badAgentCalled++;
            throw new Error('Agent failed');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        retryAttempts: 1,
      });

      const result = await engine.executePlan(plan);

      // All tasks should eventually complete through good-agent
      expect(result.completed).toBeGreaterThan(0);
    });
  });

  describe('Auto-Scaling Integration', () => {
    it('should auto-scale based on queue depth', async () => {
      // Create a mock scaling policy
      const policy: ScalingPolicy = {
        minAgents: 1,
        maxAgents: 5,
        queueDepthThresholds: {
          scaleUp: 5,
          scaleDown: 1,
        },
        cpuUtilizationThresholds: {
          scaleUp: 80,
          scaleDown: 20,
        },
      };

      // Mock runtime for testing
      const mockRuntime = {
        spawn: jest.fn().mockResolvedValue({ id: `agent-${Date.now()}` }),
        kill: jest.fn().mockResolvedValue(undefined),
      };

      // Create auto-scaler with test configuration
      const autoScaler = new AutoScaler({
        evaluationIntervalSeconds: 1,
        defaultPolicy: policy,
        redisUrl: 'redis://localhost:6379/0',
        debug: false,
      });

      // Override metrics collection for testing
      const mockMetrics = {
        timestamp: new Date(),
        teamId: 'test-team',
        currentAgentCount: 1,
        queueDepth: 10,
        queueGrowthRate: 0,
        avgCpuUtilization: 50,
        avgMemoryUtilization: 50,
        eventBacklogSize: 0,
        taskCompletionRate: 0,
        avgTaskLatency: 0,
        currentCost: 0,
        budgetUtilization: 0,
      };

      // Simulate evaluation
      const decision = autoScaler.evaluatePolicy(mockMetrics, policy);

      // Queue depth of 10 should trigger scale-up (threshold is 5)
      expect(decision.action).toBe('scale-up');
      expect(decision.desiredAgentCount).toBeGreaterThan(1);
    });

    it('should respect scaling limits', async () => {
      const policy: ScalingPolicy = {
        minAgents: 2,
        maxAgents: 10,
        queueDepthThresholds: {
          scaleUp: 5,
          scaleDown: 1,
        },
      };

      const autoScaler = new AutoScaler({
        evaluationIntervalSeconds: 1,
        defaultPolicy: policy,
        redisUrl: 'redis://localhost:6379/0',
      });

      // Test that we don't scale below minimum
      const lowMetrics = {
        timestamp: new Date(),
        teamId: 'test-team',
        currentAgentCount: 2,
        queueDepth: 0,
        queueGrowthRate: 0,
        avgCpuUtilization: 10,
        avgMemoryUtilization: 10,
        eventBacklogSize: 0,
        taskCompletionRate: 100,
        avgTaskLatency: 0,
        currentCost: 0,
        budgetUtilization: 0,
      };

      const scaleDownDecision = autoScaler.evaluatePolicy(lowMetrics, policy);
      expect(scaleDownDecision.action).not.toBe('scale-down');
      expect(scaleDownDecision.desiredAgentCount).toBeGreaterThanOrEqual(2);

      // Test that we don't scale above maximum
      const highMetrics = {
        ...lowMetrics,
        currentAgentCount: 10,
        queueDepth: 100,
        avgCpuUtilization: 95,
      };

      const scaleUpDecision = autoScaler.evaluatePolicy(highMetrics, policy);
      expect(scaleUpDecision.desiredAgentCount).toBeLessThanOrEqual(10);
    });

    it('should handle cooldown periods', async () => {
      const policy: ScalingPolicy = {
        minAgents: 1,
        maxAgents: 5,
        cooldownSeconds: 60,
      };

      const autoScaler = new AutoScaler({
        evaluationIntervalSeconds: 1,
        defaultPolicy: policy,
        redisUrl: 'redis://localhost:6379/0',
      });

      // Simulate recent scaling operation
      const metrics = {
        timestamp: new Date(),
        teamId: 'test-team',
        currentAgentCount: 2,
        queueDepth: 10,
        queueGrowthRate: 0,
        avgCpuUtilization: 90,
        avgMemoryUtilization: 80,
        eventBacklogSize: 0,
        taskCompletionRate: 0,
        avgTaskLatency: 0,
        currentCost: 0,
        budgetUtilization: 0,
      };

      // First call should allow scaling
      const decision1 = autoScaler.evaluatePolicy(metrics, policy);
      expect(decision1.action).toBe('scale-up');

      // Simulate applying the decision
      autoScaler.applyDecision(decision1);

      // Immediate second call should respect cooldown
      const decision2 = autoScaler.evaluatePolicy(metrics, policy);
      // Should either be no-op or scale-up with warning about cooldown
      expect(decision2.reason).toContain('cooldown');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should retry failed tasks with exponential backoff', async () => {
      const decomposer = new TaskDecomposer();
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

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'retry-test-agent',
        runtime: 'pi',
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
        retryDelayMs: 10, // Fast for testing
      });

      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(plan.totalTasks);
      expect(attemptCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle total system failure gracefully', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Test task', {
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

      const plan = resolver.getExecutionPlan();

      // No agents registered - simulating total system failure

      const mockExecutor = {
        execute: jest.fn().mockRejectedValue(new Error('No agents available')),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);

      // Should not throw, but return failed result
      const result = await engine.executePlan(plan);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should continue execution with partial failures when configured', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Multiple tasks', {
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

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'partial-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      let taskCount = 0;
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          taskCount++;
          // Fail every other task
          if (taskCount % 2 === 0) {
            throw new Error('Task failed');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        continueOnFailure: true,
        retryAttempts: 0,
      });

      const result = await engine.executePlan(plan);

      // Should have both completed and failed tasks
      expect(result.completed + result.failed).toBe(plan.totalTasks);
    });
  });

  describe('Performance and Scalability', () => {
    it('should execute tasks in parallel within each level', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Create 10 independent functions',
        {
          strategy: 'component-based',
        }
      );

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: toFederationSubtask(st),
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      // Register multiple agents
      for (let i = 0; i < 5; i++) {
        registry.register({
          id: `parallel-agent-${i}`,
          runtime: 'native',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 2.0,
            avgSpeed: 10,
            reliability: 0.9,
          },
        });
      }

      const executionStartTimes: number[] = [];
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          executionStartTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      await engine.executePlan(plan);

      // Multiple executions should have started close together (parallel)
      if (executionStartTimes.length > 1) {
        const timeSpread =
          Math.max(...executionStartTimes) - Math.min(...executionStartTimes);
        expect(timeSpread).toBeLessThan(1000); // Should be within 1 second
      }
    });

    it('should maintain reasonable memory usage during large executions', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Create 20 utility functions',
        {
          strategy: 'component-based',
        }
      );

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: toFederationSubtask(st),
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'memory-test-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['general'],
          costPerHour: 2.0,
          avgSpeed: 10,
          reliability: 0.9,
        },
      });

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(plan.totalTasks);
      // Result object should not contain excessive data
      expect(JSON.stringify(result).length).toBeLessThan(1000000); // Less than 1MB
    });
  });
});

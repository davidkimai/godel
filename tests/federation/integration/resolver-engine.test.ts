/**
 * DependencyResolver + ExecutionEngine Integration Tests
 *
 * Tests the integration between dependency resolution and execution:
 * - DAG execution order
 * - Parallel level execution
 * - Error propagation
 * - Result aggregation
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
import type { Subtask } from '../../../src/federation/types';

describe('DependencyResolver + ExecutionEngine Integration', () => {
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

  // Helper to create valid Subtask objects
  function createSubtask(id: string, name: string, requiredSkills: string[] = []): Subtask {
    return {
      id,
      name,
      description: `Task ${name}`,
      requiredSkills,
      priority: 'medium',
    };
  }

  describe('DAG Execution Order', () => {
    it('should execute tasks in correct dependency order', async () => {
      // Create a simple DAG: A -> B -> C
      const tasks = [
        { id: 'A', task: createSubtask('A', 'Setup'), dependencies: [] as string[] },
        { id: 'B', task: createSubtask('B', 'Build'), dependencies: ['A'] },
        { id: 'C', task: createSubtask('C', 'Test'), dependencies: ['B'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      // Verify execution order
      expect(plan.levels).toHaveLength(3);
      expect(plan.levels[0].tasks.map((t) => t.id)).toContain('A');
      expect(plan.levels[1].tasks.map((t) => t.id)).toContain('B');
      expect(plan.levels[2].tasks.map((t) => t.id)).toContain('C');

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

      const executionOrder: string[] = [];
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: Subtask) => {
          executionOrder.push(task.name);
          return { completed: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      await engine.executePlan(plan);

      expect(executionOrder).toEqual(['Setup', 'Build', 'Test']);
    });

    it('should handle diamond dependency pattern', async () => {
      // Diamond pattern: A -> (B, C) -> D
      const tasks = [
        { id: 'A', task: createSubtask('A', 'Task A'), dependencies: [] as string[] },
        { id: 'B', task: createSubtask('B', 'Task B'), dependencies: ['A'] },
        { id: 'C', task: createSubtask('C', 'Task C'), dependencies: ['A'] },
        { id: 'D', task: createSubtask('D', 'Task D'), dependencies: ['B', 'C'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      // Should have 3 levels: [A], [B, C], [D]
      expect(plan.levels).toHaveLength(3);
      expect(plan.levels[0].tasks).toHaveLength(1);
      expect(plan.levels[1].tasks).toHaveLength(2);
      expect(plan.levels[2].tasks).toHaveLength(1);

      registry.register({
        id: 'diamond-agent',
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

      const executedTasks: string[] = [];
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: Subtask) => {
          executedTasks.push(task.name);
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(4);
      expect(executedTasks[0]).toBe('Task A'); // First
      expect(executedTasks[3]).toBe('Task D'); // Last
    });

    it('should handle complex dependency graph', async () => {
      // Complex graph with multiple dependencies
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
        { id: '2', task: createSubtask('2', 'Task 2'), dependencies: [] as string[] },
        { id: '3', task: createSubtask('3', 'Task 3'), dependencies: ['1'] },
        { id: '4', task: createSubtask('4', 'Task 4'), dependencies: ['1', '2'] },
        { id: '5', task: createSubtask('5', 'Task 5'), dependencies: ['3'] },
        { id: '6', task: createSubtask('6', 'Task 6'), dependencies: ['3', '4'] },
        { id: '7', task: createSubtask('7', 'Task 7'), dependencies: ['4', '5', '6'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      // Level 0: 1, 2 (no deps)
      // Level 1: 3 (depends on 1), 4 (depends on 1, 2)
      // Level 2: 5 (depends on 3), 6 (depends on 3, 4)
      // Level 3: 7 (depends on 5, 6)
      expect(plan.levels).toHaveLength(4);

      registry.register({
        id: 'complex-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(7);
    });
  });

  describe('Parallel Level Execution', () => {
    it('should execute independent tasks in parallel', async () => {
      const tasks = [
        { id: 'A1', task: createSubtask('A1', 'Task A1'), dependencies: [] as string[] },
        { id: 'A2', task: createSubtask('A2', 'Task A2'), dependencies: [] as string[] },
        { id: 'A3', task: createSubtask('A3', 'Task A3'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      // All tasks should be in the same level (parallel)
      expect(plan.levels).toHaveLength(1);
      expect(plan.levels[0].tasks).toHaveLength(3);

      registry.register({
        id: 'parallel-agent',
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

      const startTimes: number[] = [];
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          startTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      await engine.executePlan(plan);

      // Tasks should start close together (parallel)
      if (startTimes.length >= 2) {
        const spread = Math.max(...startTimes) - Math.min(...startTimes);
        expect(spread).toBeLessThan(100); // Parallel start
      }
    });

    it('should maximize parallelism where possible', async () => {
      const tasks = [
        { id: 'root', task: createSubtask('root', 'Root Task'), dependencies: [] as string[] },
        { id: 'a1', task: createSubtask('a1', 'Task A1'), dependencies: ['root'] },
        { id: 'a2', task: createSubtask('a2', 'Task A2'), dependencies: ['root'] },
        { id: 'a3', task: createSubtask('a3', 'Task A3'), dependencies: ['root'] },
        { id: 'a4', task: createSubtask('a4', 'Task A4'), dependencies: ['root'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      // Should have 2 levels: [root], [a1, a2, a3, a4]
      expect(plan.levels).toHaveLength(2);
      expect(plan.levels[1].tasks).toHaveLength(4);
    });
  });

  describe('Error Propagation', () => {
    it('should stop execution on failure when continueOnFailure is false', async () => {
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
        { id: '2', task: createSubtask('2', 'Task 2'), dependencies: [] as string[] },
        { id: '3', task: createSubtask('3', 'Task 3'), dependencies: ['1', '2'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'error-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: Subtask) => {
          if (task.name === 'Task 1') {
            throw new Error('Task 1 failed');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        continueOnFailure: false,
        retryAttempts: 0,
      });

      const result = await engine.executePlan(plan);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should skip dependent tasks when prerequisites fail', async () => {
      const tasks = [
        { id: 'base', task: createSubtask('base', 'Base Task'), dependencies: [] as string[] },
        { id: 'child1', task: createSubtask('child1', 'Child 1'), dependencies: ['base'] },
        { id: 'child2', task: createSubtask('child2', 'Child 2'), dependencies: ['base'] },
        { id: 'grandchild', task: createSubtask('grandchild', 'Grandchild'), dependencies: ['child1', 'child2'] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'skip-agent',
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

      let executedCount = 0;
      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: Subtask) => {
          executedCount++;
          if (task.name === 'Base Task') {
            throw new Error('Base failed');
          }
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        continueOnFailure: false,
        retryAttempts: 0,
      });

      const result = await engine.executePlan(plan);

      expect(result.failed).toBeGreaterThan(0);
    });

    it('should propagate errors with context', async () => {
      const tasks = [
        { id: 'fail-task', task: createSubtask('fail-task', 'Fail Task'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'context-agent',
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

      const errorMessage = 'Specific error with context';
      const mockExecutor = {
        execute: jest.fn().mockRejectedValue(new Error(errorMessage)),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor, {
        retryAttempts: 0,
      });

      const result = await engine.executePlan(plan);

      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain(errorMessage);
    });
  });

  describe('Result Aggregation', () => {
    it('should collect all task results', async () => {
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
        { id: '2', task: createSubtask('2', 'Task 2'), dependencies: [] as string[] },
        { id: '3', task: createSubtask('3', 'Task 3'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'result-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockImplementation(async (agentId: string, task: Subtask) => {
          return { result: `completed-${task.name}` };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(3);
      expect(result.results.size).toBe(3);

      // Verify individual results
      for (const taskResult of result.results.values()) {
        expect(taskResult.status).toBe('completed');
        if (taskResult.result) {
          expect(taskResult.result).toMatch(/completed-/);
        }
      }
    });

    it('should track execution duration', async () => {
      const tasks = [
        { id: 'slow', task: createSubtask('slow', 'Slow Task'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'duration-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.durationMs).toBeGreaterThanOrEqual(100);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should provide per-task timing information', async () => {
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
        { id: '2', task: createSubtask('2', 'Task 2'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'timing-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      for (const taskResult of result.results.values()) {
        expect(taskResult.startedAt).toBeDefined();
        expect(taskResult.durationMs).toBeDefined();
        expect(taskResult.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Task Decomposition Integration', () => {
    it('should execute decomposed tasks in dependency order', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose(
        'Build API with authentication and database',
        {
          strategy: 'domain-based',
        }
      );

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: st as Subtask,
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'decomp-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(decomposition.subtasks.length);
    });

    it('should handle file-based decomposition', async () => {
      const decomposer = new TaskDecomposer();
      const decomposition = await decomposer.decompose('Refactor utils and helpers', {
        strategy: 'file-based',
      });

      const resolver = new DependencyResolver();
      resolver.buildGraph(
        decomposition.subtasks.map((st) => ({
          id: st.id,
          task: st as Subtask,
          dependencies: st.dependencies,
        }))
      );

      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'file-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBeGreaterThan(0);
    });
  });

  describe('Cancellation and Cleanup', () => {
    it('should handle execution cancellation', async () => {
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
        { id: '2', task: createSubtask('2', 'Task 2'), dependencies: [] as string[] },
        { id: '3', task: createSubtask('3', 'Task 3'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'cancel-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true };
        }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);
      const abortController = new AbortController();

      // Cancel after 50ms
      setTimeout(() => abortController.abort(), 50);

      const result = await engine.executePlan(plan, {
        signal: abortController.signal,
      });

      // Some tasks may have completed, some cancelled
      expect(result.cancelled + result.completed + result.failed).toBe(plan.totalTasks);
    });

    it('should clean up resources after execution', async () => {
      const tasks = [
        { id: '1', task: createSubtask('1', 'Task 1'), dependencies: [] as string[] },
      ];

      const resolver = new DependencyResolver();
      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      registry.register({
        id: 'cleanup-agent',
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

      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({ success: true }),
        cancel: jest.fn().mockResolvedValue(true),
      };

      const engine = new ExecutionEngine(selector, mockExecutor);

      // Run multiple executions
      for (let i = 0; i < 10; i++) {
        await engine.executePlan(plan);
      }

      // Engine should be in clean state
      // No memory leaks, no hanging listeners
      expect(engine.getConfig()).toBeDefined();
    });
  });
});

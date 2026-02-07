/**
 * Unit tests for ExecutionEngine
 */

//@ts-nocheck
import {
  ExecutionEngine,
  InMemoryTaskExecutor,
  InMemoryAgentSelector,
} from '../execution-engine';
import { ExecutionPlan, TaskWithDependencies, Subtask } from '../types';

describe('ExecutionEngine', () => {
  let selector: InMemoryAgentSelector;
  let executor: InMemoryTaskExecutor;
  let engine: ExecutionEngine;

  beforeEach(() => {
    selector = new InMemoryAgentSelector([
      { id: 'agent-1', name: 'Agent 1', skills: ['coding', 'testing'], estimatedCost: 10, estimatedLatency: 100 },
      { id: 'agent-2', name: 'Agent 2', skills: ['coding', 'review'], estimatedCost: 15, estimatedLatency: 80 },
    ]);
    executor = new InMemoryTaskExecutor();
    engine = new ExecutionEngine(selector, executor);
  });

  function createSubtask(name: string, skills: string[] = ['coding']): Subtask {
    return {
      id: name,
      name,
      description: `Description for ${name}`,
      requiredSkills: skills,
      priority: 'medium',
    };
  }

  function createTask(id: string, dependencies: string[] = []): TaskWithDependencies {
    return {
      id,
      task: createSubtask(id),
      dependencies,
    };
  }

  function createPlan(tasks: TaskWithDependencies[]): ExecutionPlan {
    return {
      levels: tasks.length > 0 
        ? tasks.map((task, index) => ({
            level: index,
            tasks: [task],
            parallel: true,
          }))
        : [],
      totalTasks: tasks.length,
      estimatedParallelism: 1,
      criticalPath: tasks.map(t => t.id),
    };
  }

  describe('executePlan', () => {
    it('should execute a simple plan', async () => {
      executor.registerHandler('Task-A', async () => 'result-A');

      const plan = createPlan([createTask('Task-A')]);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results.get('Task-A')?.status).toBe('completed');
      expect(result.results.get('Task-A')?.result).toBe('result-A');
    });

    it('should handle task failures', async () => {
      executor.registerHandler('Task-A', async () => {
        throw new Error('Task failed');
      });

      const plan = createPlan([createTask('Task-A')]);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results.get('Task-A')?.status).toBe('failed');
    });

    it('should execute multiple tasks', async () => {
      executor.registerHandler('Task-A', async () => 'result-A');
      executor.registerHandler('Task-B', async () => 'result-B');

      const plan: ExecutionPlan = {
        levels: [
          { level: 0, tasks: [createTask('Task-A'), createTask('Task-B')], parallel: true },
        ],
        totalTasks: 2,
        estimatedParallelism: 2,
        criticalPath: ['Task-A', 'Task-B'],
      };

      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should emit events during execution', async () => {
      executor.registerHandler('Task-A', async () => 'result-A');

      const events: string[] = [];
      engine.on('execution:started', () => events.push('started'));
      engine.on('level:started', () => events.push('level-started'));
      engine.on('task:started', () => events.push('task-started'));
      engine.on('task:completed', () => events.push('task-completed'));
      engine.on('level:completed', () => events.push('level-completed'));
      engine.on('execution:completed', () => events.push('completed'));

      const plan = createPlan([createTask('Task-A')]);
      await engine.executePlan(plan);

      expect(events).toContain('started');
      expect(events).toContain('level-started');
      expect(events).toContain('task-started');
      expect(events).toContain('task-completed');
      expect(events).toContain('level-completed');
      expect(events).toContain('completed');
    });

    it('should track execution time', async () => {
      executor.registerHandler('Task-A', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result-A';
      });

      const plan = createPlan([createTask('Task-A')]);
      const result = await engine.executePlan(plan);

      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should call callbacks', async () => {
      executor.registerHandler('Task-A', async () => 'result-A');

      const callbacks = {
        onTaskStart: [] as string[],
        onTaskComplete: [] as string[],
        onLevelStart: [] as number[],
        onLevelComplete: [] as number[],
        onProgress: [] as number[],
      };

      const plan = createPlan([createTask('Task-A')]);
      await engine.executePlan(plan, {
        onTaskStart: (taskId) => callbacks.onTaskStart.push(taskId),
        onTaskComplete: (taskId) => callbacks.onTaskComplete.push(taskId),
        onLevelStart: (level) => callbacks.onLevelStart.push(level),
        onLevelComplete: (level) => callbacks.onLevelComplete.push(level),
        onProgress: (completed) => callbacks.onProgress.push(completed),
      });

      expect(callbacks.onTaskStart).toContain('Task-A');
      expect(callbacks.onTaskComplete).toContain('Task-A');
      expect(callbacks.onLevelStart).toContain(0);
      expect(callbacks.onLevelComplete).toContain(0);
      expect(callbacks.onProgress.length).toBeGreaterThan(0);
    });
  });

  describe('retry logic', () => {
    it('should retry failed tasks', async () => {
      let attempts = 0;
      executor.registerHandler('Task-A', async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      engine.setConfig({ retryAttempts: 2, retryDelayMs: 10 });

      const plan = createPlan([createTask('Task-A')]);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(1);
      expect(attempts).toBe(2);
    });

    it('should fail after max retries', async () => {
      executor.registerHandler('Task-A', async () => {
        throw new Error('Persistent failure');
      });

      engine.setConfig({ retryAttempts: 2, retryDelayMs: 10 });

      const plan = createPlan([createTask('Task-A')]);
      const result = await engine.executePlan(plan);

      expect(result.completed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should emit retry events', async () => {
      let attempts = 0;
      executor.registerHandler('Task-A', async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      engine.setConfig({ retryAttempts: 2, retryDelayMs: 10 });

      const retryEvents: number[] = [];
      engine.on('task:retry', (event) => retryEvents.push(event.attempt));

      const plan = createPlan([createTask('Task-A')]);
      await engine.executePlan(plan);

      expect(retryEvents).toContain(1);
    });
  });

  describe('configuration', () => {
    it('should allow configuration updates', () => {
      engine.setConfig({ maxConcurrency: 5, continueOnFailure: true });
      
      const config = engine.getConfig();
      expect(config.maxConcurrency).toBe(5);
      expect(config.continueOnFailure).toBe(true);
    });

    it('should merge partial configuration', () => {
      const originalConfig = engine.getConfig();
      engine.setConfig({ maxConcurrency: 20 });
      
      const newConfig = engine.getConfig();
      expect(newConfig.maxConcurrency).toBe(20);
      expect(newConfig.retryAttempts).toBe(originalConfig.retryAttempts);
    });
  });
});

describe('InMemoryTaskExecutor', () => {
  let executor: InMemoryTaskExecutor;

  beforeEach(() => {
    executor = new InMemoryTaskExecutor();
  });

  describe('execute', () => {
    it('should execute registered handlers', async () => {
      executor.registerHandler('test-task', async () => 'result');

      const result = await executor.execute('agent-1', {
        id: 'test',
        name: 'test-task',
        description: 'Test',
        requiredSkills: [],
        priority: 'medium',
      });

      expect(result).toBe('result');
    });

    it('should throw for unregistered handlers', async () => {
      await expect(
        executor.execute('agent-1', {
          id: 'test',
          name: 'unknown-task',
          description: 'Test',
          requiredSkills: [],
          priority: 'medium',
        })
      ).rejects.toThrow('No handler registered');
    });

    it('should pass task to handler', async () => {
      let receivedTask: { name: string; description: string } | null = null;
      executor.registerHandler('test-task', async (task) => {
        receivedTask = task;
        return 'result';
      });

      await executor.execute('agent-1', {
        id: 'test',
        name: 'test-task',
        description: 'Test Description',
        requiredSkills: [],
        priority: 'medium',
      });

      expect(receivedTask).not.toBeNull();
      expect(receivedTask?.name).toBe('test-task');
      expect(receivedTask?.description).toBe('Test Description');
    });
  });

  describe('cancel', () => {
    it('should cancel tasks', async () => {
      executor.registerHandler('test-task', async () => 'result');
      executor.cancel('test-task');

      await expect(
        executor.execute('agent-1', {
          id: 'test',
          name: 'test-task',
          description: 'Test',
          requiredSkills: [],
          priority: 'medium',
        })
      ).rejects.toThrow('Task cancelled');
    });
  });
});

describe('InMemoryAgentSelector', () => {
  let selector: InMemoryAgentSelector;

  beforeEach(() => {
    selector = new InMemoryAgentSelector([
      { id: 'fast', name: 'Fast Agent', skills: ['coding'], estimatedCost: 20, estimatedLatency: 50 },
      { id: 'cheap', name: 'Cheap Agent', skills: ['coding'], estimatedCost: 5, estimatedLatency: 200 },
      { id: 'multi', name: 'Multi Agent', skills: ['coding', 'testing', 'review'], estimatedCost: 15, estimatedLatency: 100 },
    ]);
  });

  describe('selectAgent', () => {
    it('should select fastest agent', async () => {
      const agent = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'fastest',
      });

      expect(agent.id).toBe('fast');
    });

    it('should select cheapest agent', async () => {
      const agent = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'cheapest',
      });

      expect(agent.id).toBe('cheap');
    });

    it('should select agent with best skill match', async () => {
      const agent = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'skill-match',
      });

      expect(agent.id).toBe('multi');
    });

    it('should use round-robin strategy', async () => {
      const agent1 = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'round-robin',
      });

      const agent2 = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'round-robin',
      });

      // Should cycle through matching agents
      expect(agent1.id).not.toBe(agent2.id);
    });

    it('should use balanced strategy by default', async () => {
      const agent = await selector.selectAgent({
        requiredSkills: ['coding'],
        strategy: 'balanced',
      });

      // Balanced considers cost + latency
      // fast: 20 + 50 = 70
      // cheap: 5 + 200 = 205
      // multi: 15 + 100 = 115
      // The best score is 'fast' with 70
      expect(agent.id).toBe('fast');
    });

    it('should throw when no matching agent found', async () => {
      await expect(
        selector.selectAgent({
          requiredSkills: ['non-existent-skill'],
          strategy: 'balanced',
        })
      ).rejects.toThrow('No agent found');
    });
  });

  describe('selectAgents', () => {
    it('should select multiple agents', async () => {
      const agents = await selector.selectAgents(
        { requiredSkills: ['coding'], strategy: 'balanced' },
        3
      );

      expect(agents).toHaveLength(3);
    });
  });

  describe('addAgent', () => {
    it('should add new agents', async () => {
      selector.addAgent({
        id: 'new',
        name: 'New Agent',
        skills: ['new-skill'],
        estimatedCost: 10,
        estimatedLatency: 100,
      });

      const agent = await selector.selectAgent({
        requiredSkills: ['new-skill'],
        strategy: 'balanced',
      });

      expect(agent.id).toBe('new');
    });
  });
});

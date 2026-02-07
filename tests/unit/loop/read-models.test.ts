/**
 * Read Models Tests
 */

import {
  AgentReadModel,
  InMemoryAgentReadModel,
  TaskReadModel,
  TaskDependencyGraph,
  type AgentCapabilities,
  type GodelEvent,
} from '../../../src/loop';

describe('AgentReadModel', () => {
  let readModel: InMemoryAgentReadModel;

  beforeEach(() => {
    readModel = new InMemoryAgentReadModel();
  });

  function createEvent(
    type: string,
    payload: Record<string, unknown>,
    timestamp: number = Date.now()
  ): GodelEvent {
    return {
      id: `evt_${timestamp}`,
      type,
      source: payload.agentId as string,
      timestamp,
      payload,
      metadata: {
        version: 1,
        priority: 'normal',
      },
    };
  }

  function createCapabilities(partial: Partial<AgentCapabilities> = {}): AgentCapabilities {
    return {
      skills: [],
      languages: [],
      specialties: [],
      costPerHour: 0,
      avgSpeed: 0,
      reliability: 0,
      ...partial,
    };
  }

  describe('agent.registered', () => {
    it('should create agent view on registration', async () => {
      const capabilities = createCapabilities({
        skills: ['typescript', 'testing'],
        reliability: 0.9,
      });

      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities,
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view).toBeDefined();
      expect(view?.id).toBe('agent-1');
      expect(view?.currentState).toBe('created');
      expect(view?.capabilities.skills).toContain('typescript');
    });

    it('should create agent on agent.spawned', async () => {
      await readModel.handle(
        createEvent('agent.spawned', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view).toBeDefined();
    });
  });

  describe('agent.state_changed', () => {
    it('should update agent state', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      await readModel.handle(
        createEvent('agent.state_changed', {
          agentId: 'agent-1',
          newState: 'idle',
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.currentState).toBe('idle');
    });

    it('should reset error count on idle', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      // Add some errors
      await readModel.handle(
        createEvent('agent.state_changed', {
          agentId: 'agent-1',
          newState: 'error',
        })
      );

      await readModel.handle(
        createEvent('agent.task_failed', {
          agentId: 'agent-1',
          taskId: 'task-1',
        })
      );

      await readModel.handle(
        createEvent('agent.state_changed', {
          agentId: 'agent-1',
          newState: 'idle',
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.consecutiveErrors).toBe(0);
    });
  });

  describe('task.assigned', () => {
    it('should update agent state to busy', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      await readModel.handle(
        createEvent('task.assigned', {
          agentId: 'agent-1',
          taskId: 'task-1',
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.currentState).toBe('busy');
      expect(view?.currentTaskId).toBe('task-1');
      expect(view?.currentLoad).toBe(0.25);
    });
  });

  describe('task.completed', () => {
    it('should update task statistics', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      await readModel.handle(
        createEvent('agent.task_completed', {
          agentId: 'agent-1',
          taskId: 'task-1',
          duration: 5000,
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.totalTasksCompleted).toBe(1);
      expect(view?.averageTaskDuration).toBe(5000);
    });

    it('should calculate rolling average', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      await readModel.handle(
        createEvent('agent.task_completed', {
          agentId: 'agent-1',
          taskId: 'task-1',
          duration: 1000,
        })
      );

      await readModel.handle(
        createEvent('agent.task_completed', {
          agentId: 'agent-1',
          taskId: 'task-2',
          duration: 3000,
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.totalTasksCompleted).toBe(2);
      expect(view?.averageTaskDuration).toBe(2000);
    });
  });

  describe('task.failed', () => {
    it('should update failure statistics', async () => {
      await readModel.handle(
        createEvent('agent.registered', {
          agentId: 'agent-1',
          capabilities: createCapabilities(),
        })
      );

      await readModel.handle(
        createEvent('agent.task_failed', {
          agentId: 'agent-1',
          taskId: 'task-1',
          error: 'Connection timeout',
        })
      );

      const view = await readModel.getById('agent-1');
      expect(view?.totalTasksFailed).toBe(1);
      expect(view?.consecutiveErrors).toBe(1);
      expect(view?.lastError).toBe('Connection timeout');
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      // Create multiple agents
      for (let i = 1; i <= 3; i++) {
        await readModel.handle(
          createEvent('agent.registered', {
            agentId: `agent-${i}`,
            capabilities: createCapabilities({
              skills: i === 1 ? ['typescript'] : ['javascript'],
              reliability: 0.7 + i * 0.1,
            }),
          })
        );

        await readModel.handle(
          createEvent('agent.state_changed', {
            agentId: `agent-${i}`,
            newState: i === 1 ? 'idle' : 'busy',
          })
        );
      }
    });

    it('should get all agents', async () => {
      const agents = await readModel.getAll();
      expect(agents).toHaveLength(3);
    });

    it('should filter by state', async () => {
      const idleAgents = await readModel.getAll({ state: 'idle' });
      expect(idleAgents).toHaveLength(1);
      expect(idleAgents[0].id).toBe('agent-1');
    });

    it('should filter by skills', async () => {
      const tsAgents = await readModel.getAll({ hasSkills: ['typescript'] });
      expect(tsAgents).toHaveLength(1);
      expect(tsAgents[0].id).toBe('agent-1');
    });

    it('should get available agents', async () => {
      const available = await readModel.getAvailable();
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('agent-1');
    });

    it('should calculate top performers', async () => {
      // Complete some tasks
      await readModel.handle(
        createEvent('agent.task_completed', {
          agentId: 'agent-1',
          duration: 1000,
        })
      );

      await readModel.handle(
        createEvent('agent.task_completed', {
          agentId: 'agent-2',
          duration: 500,
        })
      );

      const top = await readModel.getTopPerformers(2);
      expect(top).toHaveLength(2);
    });

    it('should get statistics', async () => {
      const stats = await readModel.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byState['idle']).toBe(1);
      expect(stats.byState['busy']).toBe(2);
    });
  });
});

describe('TaskReadModel', () => {
  let readModel: TaskReadModel;

  beforeEach(() => {
    readModel = new TaskReadModel();
  });

  function createEvent(
    type: string,
    payload: Record<string, unknown>,
    timestamp: number = Date.now()
  ): GodelEvent {
    return {
      id: `evt_${timestamp}`,
      type,
      source: payload.taskId as string,
      timestamp,
      payload,
      metadata: {
        version: 1,
        priority: 'normal',
      },
    };
  }

  describe('task.created', () => {
    it('should create task view', async () => {
      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-1',
          title: 'Test Task',
          priority: 'high',
        })
      );

      const view = await readModel.getById('task-1');
      expect(view).toBeDefined();
      expect(view?.id).toBe('task-1');
      expect(view?.title).toBe('Test Task');
      expect(view?.priority).toBe('high');
      expect(view?.status).toBe('pending');
    });
  });

  describe('task.assigned', () => {
    it('should update assignment', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.assigned', {
          taskId: 'task-1',
          agentId: 'agent-1',
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.assignedTo).toBe('agent-1');
      expect(view?.status).toBe('assigned');
    });
  });

  describe('task.started', () => {
    it('should track start time and attempts', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.started', { taskId: 'task-1' })
      );

      const view = await readModel.getById('task-1');
      expect(view?.status).toBe('in-progress');
      expect(view?.attempts).toBe(1);
      expect(view?.startedAt).toBeDefined();
    });
  });

  describe('task.completed', () => {
    it('should track completion', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.started', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.completed', {
          taskId: 'task-1',
          duration: 5000,
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.status).toBe('completed');
      expect(view?.duration).toBe(5000);
      expect(view?.progress).toBe(1);
    });
  });

  describe('task.failed', () => {
    it('should track failure', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.failed', {
          taskId: 'task-1',
          error: 'Test error',
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.status).toBe('failed');
      expect(view?.error).toBe('Test error');
    });
  });

  describe('task.progress', () => {
    it('should update progress', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.progress', {
          taskId: 'task-1',
          progress: 0.5,
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.progress).toBe(0.5);
    });

    it('should clamp progress to 0-1', async () => {
      await readModel.handle(
        createEvent('task.created', { taskId: 'task-1' })
      );

      await readModel.handle(
        createEvent('task.progress', {
          taskId: 'task-1',
          progress: 1.5,
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.progress).toBe(1);
    });
  });

  describe('Dependencies', () => {
    it('should track dependencies', async () => {
      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-1',
          dependsOn: ['task-2', 'task-3'],
        })
      );

      const view = await readModel.getById('task-1');
      expect(view?.dependsOn).toContain('task-2');
      expect(view?.dependsOn).toContain('task-3');
    });

    it('should get ready tasks', async () => {
      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-1',
          dependsOn: ['task-2'],
        })
      );

      await readModel.handle(
        createEvent('task.created', { taskId: 'task-2' })
      );

      // Initially task-2 is ready (no dependencies)
      let ready = await readModel.getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('task-2');

      // Complete task-2
      await readModel.handle(
        createEvent('task.started', { taskId: 'task-2' })
      );
      await readModel.handle(
        createEvent('task.completed', { taskId: 'task-2' })
      );

      // Now task-1 is also ready
      ready = await readModel.getReady();
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('task-1');
    });

    it('should get blocked tasks', async () => {
      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-1',
          dependsOn: ['task-2'],
        })
      );

      await readModel.handle(
        createEvent('task.created', { taskId: 'task-2' })
      );

      const blocked = await readModel.getBlocked();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe('task-1');
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-1',
          priority: 'high',
        })
      );

      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-2',
          priority: 'low',
        })
      );

      await readModel.handle(
        createEvent('task.created', {
          taskId: 'task-3',
          priority: 'critical',
        })
      );
    });

    it('should sort by priority', async () => {
      const all = await readModel.getAll();
      expect(all[0].priority).toBe('critical');
      expect(all[1].priority).toBe('high');
      expect(all[2].priority).toBe('low');
    });

    it('should get statistics', async () => {
      // Complete one task
      await readModel.handle(
        createEvent('task.started', { taskId: 'task-1' })
      );
      await readModel.handle(
        createEvent('task.completed', {
          taskId: 'task-1',
          duration: 1000,
        })
      );

      // Fail one task
      await readModel.handle(
        createEvent('task.failed', { taskId: 'task-2' })
      );

      const stats = await readModel.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.averageDuration).toBe(1000);
      expect(stats.successRate).toBe(0.5);
    });
  });
});

describe('TaskDependencyGraph', () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it('should add dependencies', () => {
    graph.addDependency('task-1', 'task-2');
    expect(graph.getDependencies('task-1')).toContain('task-2');
    expect(graph.getDependents('task-2')).toContain('task-1');
  });

  it('should remove dependencies', () => {
    graph.addDependency('task-1', 'task-2');
    graph.removeDependency('task-1', 'task-2');
    expect(graph.getDependencies('task-1')).not.toContain('task-2');
  });

  it('should check if dependencies are met', () => {
    graph.addDependency('task-1', 'task-2');
    graph.addDependency('task-1', 'task-3');

    const completed = new Set(['task-2']);
    expect(graph.areDependenciesMet('task-1', completed)).toBe(false);

    completed.add('task-3');
    expect(graph.areDependenciesMet('task-1', completed)).toBe(true);
  });

  it('should perform topological sort', () => {
    graph.addDependency('task-1', 'task-2');
    graph.addDependency('task-2', 'task-3');

    const sorted = graph.topologicalSort(['task-1', 'task-2', 'task-3']);
    expect(sorted.indexOf('task-3')).toBeLessThan(sorted.indexOf('task-2'));
    expect(sorted.indexOf('task-2')).toBeLessThan(sorted.indexOf('task-1'));
  });

  it('should detect circular dependencies', () => {
    graph.addDependency('task-1', 'task-2');
    graph.addDependency('task-2', 'task-3');
    graph.addDependency('task-3', 'task-1');

    expect(() =>
      graph.topologicalSort(['task-1', 'task-2', 'task-3'])
    ).toThrow('Circular dependency');
  });
});

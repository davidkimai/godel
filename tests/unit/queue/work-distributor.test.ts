/**
 * Work Distribution Algorithm Tests
 * 
 * Tests for round-robin, load-based, skill-based, and sticky routing.
 */

import {
  roundRobinDistribution,
  loadBasedDistribution,
  skillBasedDistribution,
  stickyDistribution,
  distributeTask,
  createDistributionContext,
  selectDistributionStrategy,
} from '../../../src/queue/work-distributor';
import type { QueuedTask, TaskAgent, DistributionContext } from '../../../src/queue/types';

describe('Work Distribution Algorithms', () => {
  // Test fixtures
  const createTask = (overrides: Partial<QueuedTask> = {}): QueuedTask => ({
    id: 'task-1',
    type: 'test-task',
    payload: {},
    priority: 'medium',
    status: 'pending',
    retryCount: 0,
    maxRetries: 3,
    retryDelayMs: 1000,
    progress: 0,
    createdAt: new Date(),
    metadata: {},
    ...overrides,
  });

  const createAgent = (overrides: Partial<TaskAgent> = {}): TaskAgent => ({
    id: `agent-${Math.random().toString(36).substr(2, 5)}`,
    skills: [],
    capacity: 5,
    currentLoad: 0,
    status: 'idle',
    lastHeartbeat: new Date(),
    ...overrides,
  });

  const createContext = (
    task: QueuedTask,
    agents: TaskAgent[],
    state = { lastAssignmentIndex: -1, stickyAssignments: new Map() }
  ): DistributionContext => createDistributionContext(task, agents, state);

  describe('Round-Robin Distribution', () => {
    it('should distribute tasks evenly across agents', () => {
      const agents = [
        createAgent({ id: 'agent-1', currentLoad: 0 }),
        createAgent({ id: 'agent-2', currentLoad: 0 }),
        createAgent({ id: 'agent-3', currentLoad: 0 }),
      ];

      const assignments: string[] = [];
      let lastIndex = -1;

      // Distribute 6 tasks
      for (let i = 0; i < 6; i++) {
        const task = createTask({ id: `task-${i}` });
        const ctx = createContext(task, agents, { 
          lastAssignmentIndex: lastIndex, 
          stickyAssignments: new Map() 
        });
        const result = roundRobinDistribution(ctx);
        
        expect(result).not.toBeNull();
        assignments.push(result!.agentId);
        lastIndex = agents.findIndex(a => a.id === result!.agentId);
      }

      // Each agent should get 2 tasks
      expect(assignments.filter(a => a === 'agent-1')).toHaveLength(2);
      expect(assignments.filter(a => a === 'agent-2')).toHaveLength(2);
      expect(assignments.filter(a => a === 'agent-3')).toHaveLength(2);
    });

    it('should skip offline agents', () => {
      const agents = [
        createAgent({ id: 'agent-1', status: 'offline' }),
        createAgent({ id: 'agent-2', status: 'idle' }),
      ];

      const task = createTask();
      const ctx = createContext(task, agents);
      const result = roundRobinDistribution(ctx);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-2');
    });

    it('should skip agents at capacity', () => {
      const agents = [
        createAgent({ id: 'agent-1', capacity: 2, currentLoad: 2 }),
        createAgent({ id: 'agent-2', capacity: 2, currentLoad: 1 }),
      ];

      const task = createTask();
      const ctx = createContext(task, agents);
      const result = roundRobinDistribution(ctx);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-2');
    });

    it('should return null when no agents available', () => {
      const agents: TaskAgent[] = [];
      const task = createTask();
      const ctx = createContext(task, agents);
      const result = roundRobinDistribution(ctx);

      expect(result).toBeNull();
    });
  });

  describe('Load-Based Distribution', () => {
    it('should assign to agent with lowest load ratio', () => {
      const agents = [
        createAgent({ id: 'agent-1', capacity: 10, currentLoad: 8 }), // 80% load
        createAgent({ id: 'agent-2', capacity: 10, currentLoad: 2 }), // 20% load
        createAgent({ id: 'agent-3', capacity: 10, currentLoad: 5 }), // 50% load
      ];

      const task = createTask();
      const ctx = createContext(task, agents);
      const result = loadBasedDistribution(ctx);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-2'); // Least loaded
      expect(result!.strategy).toBe('load-based');
    });

    it('should prefer idle agents over busy ones', () => {
      const agents = [
        createAgent({ id: 'agent-1', capacity: 5, currentLoad: 5 }), // 100% load
        createAgent({ id: 'agent-2', capacity: 5, currentLoad: 0 }), // 0% load
      ];

      const task = createTask();
      const ctx = createContext(task, agents);
      const result = loadBasedDistribution(ctx);

      expect(result!.agentId).toBe('agent-2');
    });

    it('should include load info in reason', () => {
      const agents = [
        createAgent({ id: 'agent-1', capacity: 10, currentLoad: 3 }),
      ];

      const task = createTask();
      const ctx = createContext(task, agents);
      const result = loadBasedDistribution(ctx);

      expect(result!.reason).toContain('30.0%');
      expect(result!.reason).toContain('7 slots available');
    });
  });

  describe('Skill-Based Distribution', () => {
    it('should assign to agent with matching skills', () => {
      const agents = [
        createAgent({ id: 'agent-1', skills: ['python', 'ml'] }),
        createAgent({ id: 'agent-2', skills: ['typescript', 'react'] }),
      ];

      const task = createTask({ requiredSkills: ['typescript'] });
      const ctx = createContext(task, agents);
      const result = skillBasedDistribution(ctx);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-2');
      expect(result!.strategy).toBe('skill-based');
    });

    it('should prefer agent with most skill matches', () => {
      const agents = [
        createAgent({ id: 'agent-1', skills: ['typescript'] }),
        createAgent({ id: 'agent-2', skills: ['typescript', 'react', 'node'] }),
      ];

      const task = createTask({ requiredSkills: ['typescript', 'react'] });
      const ctx = createContext(task, agents);
      const result = skillBasedDistribution(ctx);

      expect(result!.agentId).toBe('agent-2');
    });

    it('should return null when no skills match', () => {
      const agents = [
        createAgent({ id: 'agent-1', skills: ['python'] }),
      ];

      const task = createTask({ requiredSkills: ['typescript'] });
      const ctx = createContext(task, agents);
      const result = skillBasedDistribution(ctx);

      expect(result).toBeNull();
    });

    it('should accept any agent when no skills required', () => {
      const agents = [
        createAgent({ id: 'agent-1', skills: [] }),
      ];

      const task = createTask({ requiredSkills: [] });
      const ctx = createContext(task, agents);
      const result = skillBasedDistribution(ctx);

      expect(result).not.toBeNull();
    });

    it('should include skill match info in reason', () => {
      const agents = [
        createAgent({ id: 'agent-1', skills: ['typescript', 'react', 'node'] }),
      ];

      const task = createTask({ requiredSkills: ['typescript', 'react'] });
      const ctx = createContext(task, agents);
      const result = skillBasedDistribution(ctx);

      expect(result!.reason).toContain('Matched 2/2 skills');
    });
  });

  describe('Sticky Distribution', () => {
    it('should route related tasks to same agent', () => {
      const agents = [
        createAgent({ id: 'agent-1', currentLoad: 1 }),
        createAgent({ id: 'agent-2', currentLoad: 0 }),
      ];

      const stickyMap = new Map([['user-123', 'agent-1']]);

      // First task for user-123
      const task1 = createTask({ stickyKey: 'user-123' });
      const ctx1 = createContext(task1, agents, { 
        lastAssignmentIndex: -1, 
        stickyAssignments: stickyMap 
      });
      const result1 = stickyDistribution(ctx1);

      expect(result1!.agentId).toBe('agent-1');

      // Second task for same user
      const task2 = createTask({ stickyKey: 'user-123' });
      const ctx2 = createContext(task2, agents, { 
        lastAssignmentIndex: -1, 
        stickyAssignments: stickyMap 
      });
      const result2 = stickyDistribution(ctx2);

      expect(result2!.agentId).toBe('agent-1');
    });

    it('should create new sticky assignment when key is new', () => {
      const agents = [
        createAgent({ id: 'agent-1' }),
        createAgent({ id: 'agent-2' }),
      ];

      const stickyMap = new Map();
      const task = createTask({ stickyKey: 'new-user' });
      const ctx = createContext(task, agents, { 
        lastAssignmentIndex: -1, 
        stickyAssignments: stickyMap 
      });
      
      const result = stickyDistribution(ctx);

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe('sticky');
      expect(stickyMap.has('new-user')).toBe(true);
    });

    it('should return null when task has no sticky key', () => {
      const agents = [createAgent()];
      const task = createTask(); // No sticky key
      const ctx = createContext(task, agents);
      
      const result = stickyDistribution(ctx);

      expect(result).toBeNull();
    });

    it('should pick new agent when sticky agent is offline', () => {
      const agents = [
        createAgent({ id: 'agent-1', status: 'offline' }),
        createAgent({ id: 'agent-2', status: 'idle' }),
      ];

      const stickyMap = new Map([['user-123', 'agent-1']]);
      const task = createTask({ stickyKey: 'user-123' });
      const ctx = createContext(task, agents, { 
        lastAssignmentIndex: -1, 
        stickyAssignments: stickyMap 
      });
      
      const result = stickyDistribution(ctx);

      expect(result!.agentId).toBe('agent-2');
      expect(stickyMap.get('user-123')).toBe('agent-2'); // Updated to new agent
    });
  });

  describe('Distribution Strategy Selection', () => {
    it('should honor routing hint if provided', () => {
      const task = createTask({ routingHint: 'skill-based' });
      const strategy = selectDistributionStrategy(task, 'load-based');

      expect(strategy).toBe('skill-based');
    });

    it('should use sticky when sticky key is present', () => {
      const task = createTask({ stickyKey: 'user-123' });
      const strategy = selectDistributionStrategy(task, 'round-robin');

      expect(strategy).toBe('sticky');
    });

    it('should use skill-based when required skills are specified', () => {
      const task = createTask({ requiredSkills: ['typescript'] });
      const strategy = selectDistributionStrategy(task, 'round-robin');

      expect(strategy).toBe('skill-based');
    });

    it('should use default strategy when no hints', () => {
      const task = createTask();
      const strategy = selectDistributionStrategy(task, 'load-based');

      expect(strategy).toBe('load-based');
    });
  });

  describe('Distribute Task (Main Function)', () => {
    it('should use round-robin when selected', () => {
      const agents = [createAgent({ id: 'agent-1' }), createAgent({ id: 'agent-2' })];
      const task = createTask({ routingHint: 'round-robin' });
      const ctx = createContext(task, agents);
      
      const result = distributeTask(ctx);

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe('round-robin');
    });

    it('should use load-based when selected', () => {
      const agents = [
        createAgent({ id: 'agent-1', currentLoad: 5 }),
        createAgent({ id: 'agent-2', currentLoad: 1 }),
      ];
      const task = createTask({ routingHint: 'load-based' });
      const ctx = createContext(task, agents);
      
      const result = distributeTask(ctx);

      expect(result!.agentId).toBe('agent-2');
    });

    it('should fall back to load-based when skill-based returns null', () => {
      const agents = [createAgent({ id: 'agent-1', skills: [] })];
      const task = createTask({ 
        routingHint: 'skill-based',
        requiredSkills: ['typescript'] 
      });
      const ctx = createContext(task, agents);
      
      const result = distributeTask(ctx);

      // Should fall back to load-based
      expect(result).not.toBeNull();
      expect(result!.strategy).toBe('load-based');
    });

    it('should fall back to load-based when sticky returns null', () => {
      const agents: TaskAgent[] = []; // No agents
      const task = createTask({ stickyKey: 'user-123' });
      const ctx = createContext(task, agents);
      
      const result = distributeTask(ctx);

      expect(result).toBeNull();
    });
  });
});

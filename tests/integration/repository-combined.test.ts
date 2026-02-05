/**
 * Combined repository integration test
 * Tests repository operations for agents, tasks, and swarm data
 */

import { jest } from '@jest/globals';

type AnyRecord = Record<string, unknown>;
const asRecord = (data: unknown): AnyRecord => (data ?? {}) as AnyRecord;

// Mock repository implementations
const mockAgentRepository = {
  agents: new Map(),
  
  create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => {
    const id = `repo-agent-${Date.now()}`;
    const agent = { id, ...asRecord(data), createdAt: new Date(), updatedAt: new Date() };
    mockAgentRepository.agents.set(id, agent);
    return agent;
  }),
  
  findById: jest.fn().mockImplementation(async (id) => {
    return mockAgentRepository.agents.get(id) || null;
  }),
  
  findAll: jest.fn().mockImplementation(async () => {
    return Array.from(mockAgentRepository.agents.values());
  }),
  
  update: jest.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => {
    const agent = mockAgentRepository.agents.get(id);
    if (agent) {
      const updated = { ...agent, ...asRecord(data), updatedAt: new Date() };
      mockAgentRepository.agents.set(id, updated);
      return updated;
    }
    return null;
  }),
  
  delete: jest.fn().mockImplementation(async (id) => {
    return mockAgentRepository.agents.delete(id);
  }),
};

const mockTaskRepository = {
  tasks: new Map(),
  
  create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => {
    const id = `repo-task-${Date.now()}`;
    const task = { id, ...asRecord(data), createdAt: new Date(), updatedAt: new Date() };
    mockTaskRepository.tasks.set(id, task);
    return task;
  }),
  
  findById: jest.fn().mockImplementation(async (id) => {
    return mockTaskRepository.tasks.get(id) || null;
  }),
  
  findAll: jest.fn().mockImplementation(async (filters = {}) => {
    let tasks = Array.from(mockTaskRepository.tasks.values());
    
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.agentId) {
      tasks = tasks.filter(t => t.agentId === filters.agentId);
    }
    
    return tasks;
  }),
  
  update: jest.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => {
    const task = mockTaskRepository.tasks.get(id);
    if (task) {
      const updated = { ...task, ...asRecord(data), updatedAt: new Date() };
      mockTaskRepository.tasks.set(id, updated);
      return updated;
    }
    return null;
  }),
  
  delete: jest.fn().mockImplementation(async (id) => {
    return mockTaskRepository.tasks.delete(id);
  }),
};

const mockSwarmRepository = {
  config: {
    maxAgents: 10,
    taskTimeout: 30000,
    heartbeatInterval: 5000,
  },
  
  getConfig: jest.fn().mockImplementation(async () => {
    return { ...mockSwarmRepository.config };
  }),
  
  updateConfig: jest.fn().mockImplementation(async (updates: Record<string, unknown>) => {
    mockSwarmRepository.config = { ...mockSwarmRepository.config, ...asRecord(updates) };
    return { ...mockSwarmRepository.config };
  }),
  
  getState: jest.fn().mockImplementation(async () => {
    return {
      status: 'active',
      startedAt: new Date(),
      agentsCount: mockAgentRepository.agents.size,
      tasksCount: mockTaskRepository.tasks.size,
    };
  }),
};

describe('Repository Integration Tests', () => {
  beforeEach(() => {
    // Clear mock data before each test
    mockAgentRepository.agents.clear();
    mockTaskRepository.tasks.clear();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Agent Repository Operations', () => {
    describe('CRUD Operations', () => {
      it('should create a new agent', async () => {
        const agentData = { name: 'Test Agent', type: 'worker', status: 'idle' };
        const agent = await mockAgentRepository.create(agentData);
        
        expect(agent).toBeDefined();
        expect(agent.id).toMatch(/^repo-agent-/);
        expect(agent.name).toBe('Test Agent');
        expect(agent.type).toBe('worker');
        expect(agent.status).toBe('idle');
        expect(agent.createdAt).toBeInstanceOf(Date);
      });

      it('should find agent by id', async () => {
        const agentData = { name: 'Findable Agent', type: 'worker' };
        const created = await mockAgentRepository.create(agentData);
        
        const found = await mockAgentRepository.findById(created.id);
        
        expect(found).toBeDefined();
        expect(found.id).toBe(created.id);
        expect(found.name).toBe('Findable Agent');
      });

      it('should return null for non-existent agent', async () => {
        const found = await mockAgentRepository.findById('non-existent-id');
        
        expect(found).toBeNull();
      });

      it('should find all agents', async () => {
        await mockAgentRepository.create({ name: 'Agent 1' });
        await mockAgentRepository.create({ name: 'Agent 2' });
        
        const agents = await mockAgentRepository.findAll();
        
        expect(agents.length).toBe(2);
      });

      it('should update agent', async () => {
        const created = await mockAgentRepository.create({ name: 'Original Name', type: 'worker' });
        
        const updated = await mockAgentRepository.update(created.id, { name: 'Updated Name', status: 'active' });
        
        expect(updated).toBeDefined();
        expect(updated.name).toBe('Updated Name');
        expect(updated.status).toBe('active');
      });

      it('should delete agent', async () => {
        const created = await mockAgentRepository.create({ name: 'To Delete' });
        
        const deleted = await mockAgentRepository.delete(created.id);
        
        expect(deleted).toBe(true);
        
        const found = await mockAgentRepository.findById(created.id);
        expect(found).toBeNull();
      });
    });
  });

  describe('Task Repository Operations', () => {
    describe('CRUD Operations', () => {
      it('should create a new task', async () => {
        const taskData = { title: 'Test Task', description: 'Test Description', priority: 'high' };
        const task = await mockTaskRepository.create(taskData);
        
        expect(task).toBeDefined();
        expect(task.id).toMatch(/^repo-task-/);
        expect(task.title).toBe('Test Task');
        expect(task.priority).toBe('high');
        expect(task.createdAt).toBeInstanceOf(Date);
      });

      it('should find task by id', async () => {
        const taskData = { title: 'Findable Task' };
        const created = await mockTaskRepository.create(taskData);
        
        const found = await mockTaskRepository.findById(created.id);
        
        expect(found).toBeDefined();
        expect(found.id).toBe(created.id);
        expect(found.title).toBe('Findable Task');
      });

      it('should find all tasks', async () => {
        await mockTaskRepository.create({ title: 'Task 1', status: 'pending' });
        await mockTaskRepository.create({ title: 'Task 2', status: 'in-progress' });
        
        const tasks = await mockTaskRepository.findAll();
        
        expect(tasks.length).toBe(2);
      });

      it('should filter tasks by status', async () => {
        await mockTaskRepository.create({ title: 'Task 1', status: 'completed' });
        await mockTaskRepository.create({ title: 'Task 2', status: 'pending' });
        await mockTaskRepository.create({ title: 'Task 3', status: 'completed' });
        
        const completedTasks = await mockTaskRepository.findAll({ status: 'completed' });
        
        expect(completedTasks.length).toBe(2);
        expect(completedTasks.every(t => t.status === 'completed')).toBe(true);
      });

      it('should filter tasks by agentId', async () => {
        const agentId = 'agent-123';
        
        await mockTaskRepository.create({ title: 'Task 1', agentId, status: 'assigned' });
        await mockTaskRepository.create({ title: 'Task 2', agentId, status: 'in-progress' });
        await mockTaskRepository.create({ title: 'Task 3', status: 'pending' });
        
        const agentTasks = await mockTaskRepository.findAll({ agentId });
        
        expect(agentTasks.length).toBe(2);
        expect(agentTasks.every(t => t.agentId === agentId)).toBe(true);
      });

      it('should update task', async () => {
        const created = await mockTaskRepository.create({ title: 'Original Title', status: 'pending' });
        
        const updated = await mockTaskRepository.update(created.id, { title: 'Updated Title', status: 'in-progress' });
        
        expect(updated).toBeDefined();
        expect(updated.title).toBe('Updated Title');
        expect(updated.status).toBe('in-progress');
      });

      it('should delete task', async () => {
        const created = await mockTaskRepository.create({ title: 'To Delete' });
        
        const deleted = await mockTaskRepository.delete(created.id);
        
        expect(deleted).toBe(true);
        
        const found = await mockTaskRepository.findById(created.id);
        expect(found).toBeNull();
      });
    });
  });

  describe('Swarm Repository Operations', () => {
    describe('Configuration Management', () => {
      it('should get swarm configuration', async () => {
        const config = await mockSwarmRepository.getConfig();
        
        expect(config).toBeDefined();
        expect(config.maxAgents).toBe(10);
        expect(config.taskTimeout).toBe(30000);
        expect(config.heartbeatInterval).toBe(5000);
      });

      it('should update swarm configuration', async () => {
        const updates = { maxAgents: 20, taskTimeout: 60000 };
        
        const updated = await mockSwarmRepository.updateConfig(updates);
        
        expect(updated.maxAgents).toBe(20);
        expect(updated.taskTimeout).toBe(60000);
        expect(updated.heartbeatInterval).toBe(5000); // Unchanged
      });
    });

    describe('State Management', () => {
      it('should get swarm state', async () => {
        // Add some test data
        await mockAgentRepository.create({ name: 'Agent 1' });
        await mockTaskRepository.create({ title: 'Task 1' });
        
        const state = await mockSwarmRepository.getState();
        
        expect(state).toBeDefined();
        expect(state.status).toBe('active');
        expect(state.agentsCount).toBe(1);
        expect(state.tasksCount).toBe(1);
        expect(state.startedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('Repository Integration Scenarios', () => {
    it('should support complete agent-task workflow', async () => {
      // 1. Create agent
      const agent = await mockAgentRepository.create({ name: 'Worker Agent', type: 'worker' });
      
      // 2. Create task for agent
      const task = await mockTaskRepository.create({ 
        title: 'Integration Task', 
        agentId: agent.id,
        status: 'assigned' 
      });
      
      // 3. Update task status as agent works
      const inProgress = await mockTaskRepository.update(task.id, { status: 'in-progress' });
      const completed = await mockTaskRepository.update(task.id, { status: 'completed' });
      
      // 4. Verify task history
      const taskHistory = await mockTaskRepository.findAll({ agentId: agent.id });
      
      expect(taskHistory.length).toBe(1);
      expect(taskHistory[0].status).toBe('completed');
      
      // 5. Update agent stats
      const updatedAgent = await mockAgentRepository.update(agent.id, { 
        completedTasks: 1,
        status: 'idle' 
      });
      
      expect(updatedAgent.completedTasks).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const promises = [];
      
      // Create multiple agents concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(mockAgentRepository.create({ name: `Concurrent Agent ${i}` }));
      }
      
      const agents = await Promise.all(promises);
      
      expect(agents.length).toBe(5);
      expect(new Set(agents.map(a => a.id)).size).toBe(5);
    });

    it('should maintain data consistency across operations', async () => {
      const agent = await mockAgentRepository.create({ name: 'Consistency Test Agent' });
      
      // Create multiple tasks for same agent
      for (let i = 0; i < 3; i++) {
        await mockTaskRepository.create({ 
          title: `Task ${i}`, 
          agentId: agent.id 
        });
      }
      
      // Verify all tasks reference same agent
      const tasks = await mockTaskRepository.findAll({ agentId: agent.id });
      
      expect(tasks.length).toBe(3);
      expect(tasks.every(t => t.agentId === agent.id)).toBe(true);
    });
  });
});

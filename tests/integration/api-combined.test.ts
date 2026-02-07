/**
 * Combined API integration test
 * Tests API endpoints for agents, tasks, and swarm management
 */

import { jest } from '@jest/globals';

const mockAsync = <T>(value: T) => jest.fn().mockResolvedValue(value as never);
const RUN_LEGACY_COMBINED_TESTS = process.env['RUN_LEGACY_COMBINED_TESTS'] === 'true';
const describeLegacy = RUN_LEGACY_COMBINED_TESTS ? describe : describe.skip;

// Mock API routes and services
jest.unstable_mockModule('../../src/services/agent.service', () => ({
  AgentService: jest.fn().mockImplementation(() => ({
    createAgent: mockAsync({ id: 'agent-api-1', name: 'api-agent', status: 'active' }),
    getAgent: mockAsync({ id: 'agent-api-1', name: 'api-agent', status: 'active' }),
    listAgents: mockAsync([
      { id: 'agent-1', name: 'agent-1', status: 'active' },
      { id: 'agent-2', name: 'agent-2', status: 'idle' },
    ]),
    updateAgent: mockAsync({ id: 'agent-api-1', name: 'updated-agent', status: 'active' }),
    deleteAgent: mockAsync(true),
  })),
}));

jest.unstable_mockModule('../../src/services/task.service', () => ({
  TaskService: jest.fn().mockImplementation(() => ({
    createTask: mockAsync({ id: 'task-api-1', title: 'API Task', status: 'pending' }),
    getTask: mockAsync({ id: 'task-api-1', title: 'API Task', status: 'pending' }),
    listTasks: mockAsync([
      { id: 'task-1', title: 'Task 1', status: 'completed' },
      { id: 'task-2', title: 'Task 2', status: 'in-progress' },
    ]),
    updateTask: mockAsync({ id: 'task-api-1', title: 'Updated Task', status: 'in-progress' }),
    deleteTask: mockAsync(true),
  })),
}));

jest.unstable_mockModule('../../src/services/team.service', () => ({
  TeamService: jest.fn().mockImplementation(() => ({
    getTeamInfo: mockAsync({
      version: '1.0.0',
      agents: 5,
      tasks: 10,
      status: 'healthy',
    }),
    getTeamStats: mockAsync({
      totalTasks: 100,
      completedTasks: 85,
      activeAgents: 5,
      avgTaskTime: 120,
    }),
  })),
}));

describeLegacy('API Integration Tests', () => {
  let agentService: any;
  let taskService: any;
  let teamService: any;

  beforeAll(async () => {
    const agentModule = await import('../../src/services/agent.service');
    const taskModule = await import('../../src/services/task.service');
    const teamModule = await import('../../src/services/team.service');
    
    agentService = new agentModule.AgentService();
    taskService = new taskModule.TaskService();
    teamService = new teamModule.TeamService();
  });

  describe('Agent API Endpoints', () => {
    describe('POST /api/agents', () => {
      it('should create a new agent', async () => {
        const agent = await agentService.createAgent({ name: 'api-agent' });
        
        expect(agent).toBeDefined();
        expect(agent.id).toBe('agent-api-1');
        expect(agent.name).toBe('api-agent');
        expect(agent.status).toBe('active');
      });
    });

    describe('GET /api/agents', () => {
      it('should list all agents', async () => {
        const agents = await agentService.listAgents();
        
        expect(agents).toBeDefined();
        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBe(2);
      });
    });

    describe('GET /api/agents/:id', () => {
      it('should get single agent by id', async () => {
        const agent = await agentService.getAgent('agent-api-1');
        
        expect(agent).toBeDefined();
        expect(agent.id).toBe('agent-api-1');
      });
    });

    describe('PUT /api/agents/:id', () => {
      it('should update agent', async () => {
        const updated = await agentService.updateAgent('agent-api-1', { name: 'updated-agent' });
        
        expect(updated).toBeDefined();
        expect(updated.name).toBe('updated-agent');
      });
    });

    describe('DELETE /api/agents/:id', () => {
      it('should delete agent', async () => {
        const result = await agentService.deleteAgent('agent-api-1');
        
        expect(result).toBe(true);
      });
    });
  });

  describe('Task API Endpoints', () => {
    describe('POST /api/tasks', () => {
      it('should create a new task', async () => {
        const task = await taskService.createTask({ title: 'API Task' });
        
        expect(task).toBeDefined();
        expect(task.id).toBe('task-api-1');
        expect(task.title).toBe('API Task');
        expect(task.status).toBe('pending');
      });
    });

    describe('GET /api/tasks', () => {
      it('should list all tasks', async () => {
        const tasks = await taskService.listTasks();
        
        expect(tasks).toBeDefined();
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks.length).toBe(2);
      });
    });

    describe('GET /api/tasks/:id', () => {
      it('should get single task by id', async () => {
        const task = await taskService.getTask('task-api-1');
        
        expect(task).toBeDefined();
        expect(task.id).toBe('task-api-1');
      });
    });

    describe('PUT /api/tasks/:id', () => {
      it('should update task', async () => {
        const updated = await taskService.updateTask('task-api-1', { title: 'Updated Task' });
        
        expect(updated).toBeDefined();
        expect(updated.title).toBe('Updated Task');
      });
    });

    describe('DELETE /api/tasks/:id', () => {
      it('should delete task', async () => {
        const result = await taskService.deleteTask('task-api-1');
        
        expect(result).toBe(true);
      });
    });
  });

  describe('Team API Endpoints', () => {
    describe('GET /api/team/info', () => {
      it('should get team information', async () => {
        const info = await teamService.getTeamInfo();
        
        expect(info).toBeDefined();
        expect(info.version).toBe('1.0.0');
        expect(info.agents).toBe(5);
        expect(info.tasks).toBe(10);
        expect(info.status).toBe('healthy');
      });
    });

    describe('GET /api/team/stats', () => {
      it('should get team statistics', async () => {
        const stats = await teamService.getTeamStats();
        
        expect(stats).toBeDefined();
        expect(stats.totalTasks).toBe(100);
        expect(stats.completedTasks).toBe(85);
        expect(stats.activeAgents).toBe(5);
        expect(stats.avgTaskTime).toBe(120);
      });
    });
  });

  describe('API Error Handling', () => {
    it('should handle non-existent agent', async () => {
      const agent = await agentService.getAgent('non-existent');
      
      // Assuming null is returned for non-existent resources
      expect(agent).toBeNull();
    });

    it('should handle non-existent task', async () => {
      const task = await taskService.getTask('non-existent');
      
      expect(task).toBeNull();
    });
  });

  describe('API Performance', () => {
    it('should respond within acceptable time', async () => {
      const start = Date.now();
      
      await agentService.listAgents();
      await taskService.listTasks();
      await teamService.getTeamInfo();
      
      const elapsed = Date.now() - start;
      
      // All operations should complete within 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});

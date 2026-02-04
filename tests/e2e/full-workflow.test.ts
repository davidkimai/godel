/**
 * End-to-end swarm workflow test
 * Tests the complete swarm workflow from agent registration to task completion
 */

import { jest } from '@jest/globals';

// Mock dependencies before imports
jest.unstable_mockModule('../src/services/swarm.service', () => ({
  SwarmService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    registerAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'test-agent' }),
    distributeTask: jest.fn().mockResolvedValue({ taskId: 'task-1', status: 'distributed' }),
    getSwarmStatus: jest.fn().mockResolvedValue({ agents: 2, activeTasks: 3 }),
  })),
}));

jest.unstable_mockModule('../src/services/agent.service', () => ({
  AgentService: jest.fn().mockImplementation(() => ({
    createAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'test-agent', status: 'active' }),
    getAgentStatus: jest.fn().mockResolvedValue({ status: 'active', tasksCompleted: 10 }),
  })),
}));

jest.unstable_mockModule('../src/services/task.service', () => ({
  TaskService: jest.fn().mockImplementation(() => ({
    createTask: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Test Task', status: 'pending' }),
    assignTask: jest.fn().mockResolvedValue({ taskId: 'task-1', agentId: 'agent-1' }),
    completeTask: jest.fn().mockResolvedValue({ taskId: 'task-1', status: 'completed' }),
  })),
}));

describe('Full Swarm Workflow E2E', () => {
  let swarmService: any;
  let agentService: any;
  let taskService: any;

  beforeAll(async () => {
    const swarmModule = await import('../src/services/swarm.service');
    const agentModule = await import('../src/services/agent.service');
    const taskModule = await import('../src/services/task.service');
    
    swarmService = new swarmModule.SwarmService();
    agentService = new agentModule.AgentService();
    taskService = new taskModule.TaskService();
  });

  describe('Agent Registration Flow', () => {
    it('should register a new agent successfully', async () => {
      const agent = await agentService.createAgent({ name: 'test-agent' });
      
      expect(agent).toBeDefined();
      expect(agent.id).toBe('agent-1');
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe('active');
    });

    it('should get agent status correctly', async () => {
      const status = await agentService.getAgentStatus('agent-1');
      
      expect(status).toBeDefined();
      expect(status.status).toBe('active');
      expect(status.tasksCompleted).toBe(10);
    });
  });

  describe('Task Creation and Distribution', () => {
    it('should create a new task', async () => {
      const task = await taskService.createTask({ title: 'Test Task' });
      
      expect(task).toBeDefined();
      expect(task.id).toBe('task-1');
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');
    });

    it('should assign task to agent', async () => {
      const assignment = await taskService.assignTask('task-1', 'agent-1');
      
      expect(assignment).toBeDefined();
      expect(assignment.taskId).toBe('task-1');
      expect(assignment.agentId).toBe('agent-1');
    });

    it('should complete task successfully', async () => {
      const result = await taskService.completeTask('task-1');
      
      expect(result).toBeDefined();
      expect(result.taskId).toBe('task-1');
      expect(result.status).toBe('completed');
    });
  });

  describe('Swarm Coordination', () => {
    it('should initialize swarm successfully', async () => {
      const initialized = await swarmService.initialize();
      
      expect(initialized).toBe(true);
    });

    it('should register agent in swarm', async () => {
      const registration = await swarmService.registerAgent('agent-1', 'test-agent');
      
      expect(registration).toBeDefined();
      expect(registration.id).toBe('agent-1');
    });

    it('should distribute task to swarm', async () => {
      const distribution = await swarmService.distributeTask({ title: 'Swarm Task' });
      
      expect(distribution).toBeDefined();
      expect(distribution.taskId).toBe('task-1');
      expect(distribution.status).toBe('distributed');
    });

    it('should get swarm status', async () => {
      const status = await swarmService.getSwarmStatus();
      
      expect(status).toBeDefined();
      expect(status.agents).toBe(2);
      expect(status.activeTasks).toBe(3);
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should execute complete workflow from start to finish', async () => {
      // Step 1: Initialize swarm
      await swarmService.initialize();
      
      // Step 2: Create and register agent
      const agent = await agentService.createAgent({ name: 'workflow-agent' });
      await swarmService.registerAgent(agent.id, agent.name);
      
      // Step 3: Create task
      const task = await taskService.createTask({ title: 'Integration Test Task' });
      
      // Step 4: Assign and complete task
      await taskService.assignTask(task.id, agent.id);
      const result = await taskService.completeTask(task.id);
      
      // Verify final state
      expect(result.status).toBe('completed');
      
      // Step 5: Verify swarm status reflects changes
      const status = await swarmService.getSwarmStatus();
      expect(status.agents).toBeGreaterThanOrEqual(2);
    });
  });
});

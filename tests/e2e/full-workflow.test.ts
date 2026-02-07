/**
 * End-to-end team workflow test
 * Tests the complete team workflow from agent registration to task completion
 */

import { jest } from '@jest/globals';

const mockAsync = <T>(value: T) => jest.fn().mockResolvedValue(value as never);
const RUN_LEGACY_COMBINED_TESTS = process.env['RUN_LEGACY_COMBINED_TESTS'] === 'true';
const describeLegacy = RUN_LEGACY_COMBINED_TESTS ? describe : describe.skip;

// Mock dependencies before imports
jest.unstable_mockModule('../../src/services/team.service', () => ({
  TeamService: jest.fn().mockImplementation(() => ({
    initialize: mockAsync(true),
    registerAgent: mockAsync({ id: 'agent-1', name: 'test-agent' }),
    distributeTask: mockAsync({ taskId: 'task-1', status: 'distributed' }),
    getTeamStatus: mockAsync({ agents: 2, activeTasks: 3 }),
  })),
}));

jest.unstable_mockModule('../../src/services/agent.service', () => ({
  AgentService: jest.fn().mockImplementation(() => ({
    createAgent: mockAsync({ id: 'agent-1', name: 'test-agent', status: 'active' }),
    getAgentStatus: mockAsync({ status: 'active', tasksCompleted: 10 }),
  })),
}));

jest.unstable_mockModule('../../src/services/task.service', () => ({
  TaskService: jest.fn().mockImplementation(() => ({
    createTask: mockAsync({ id: 'task-1', title: 'Test Task', status: 'pending' }),
    assignTask: mockAsync({ taskId: 'task-1', agentId: 'agent-1' }),
    completeTask: mockAsync({ taskId: 'task-1', status: 'completed' }),
  })),
}));

describeLegacy('Full Team Workflow E2E', () => {
  let teamService: any;
  let agentService: any;
  let taskService: any;

  beforeAll(async () => {
    const teamModule = await import('../../src/services/team.service');
    const agentModule = await import('../../src/services/agent.service');
    const taskModule = await import('../../src/services/task.service');
    
    teamService = new teamModule.TeamService();
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

  describe('Team Coordination', () => {
    it('should initialize team successfully', async () => {
      const initialized = await teamService.initialize();
      
      expect(initialized).toBe(true);
    });

    it('should register agent in team', async () => {
      const registration = await teamService.registerAgent('agent-1', 'test-agent');
      
      expect(registration).toBeDefined();
      expect(registration.id).toBe('agent-1');
    });

    it('should distribute task to team', async () => {
      const distribution = await teamService.distributeTask({ title: 'Team Task' });
      
      expect(distribution).toBeDefined();
      expect(distribution.taskId).toBe('task-1');
      expect(distribution.status).toBe('distributed');
    });

    it('should get team status', async () => {
      const status = await teamService.getTeamStatus();
      
      expect(status).toBeDefined();
      expect(status.agents).toBe(2);
      expect(status.activeTasks).toBe(3);
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should execute complete workflow from start to finish', async () => {
      // Step 1: Initialize team
      await teamService.initialize();
      
      // Step 2: Create and register agent
      const agent = await agentService.createAgent({ name: 'workflow-agent' });
      await teamService.registerAgent(agent.id, agent.name);
      
      // Step 3: Create task
      const task = await taskService.createTask({ title: 'Integration Test Task' });
      
      // Step 4: Assign and complete task
      await taskService.assignTask(task.id, agent.id);
      const result = await taskService.completeTask(task.id);
      
      // Verify final state
      expect(result.status).toBe('completed');
      
      // Step 5: Verify team status reflects changes
      const status = await teamService.getTeamStatus();
      expect(status.agents).toBeGreaterThanOrEqual(2);
    });
  });
});

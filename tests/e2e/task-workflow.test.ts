/**
 * E2E: Task Workflow Tests
 * 
 * End-to-end tests for task management workflows including:
 * - Task creation and lifecycle
 * - Task assignment to agents
 * - Task completion and status transitions
 * - Task dependencies and blocking
 * - Multi-session task coordination
 */

import { jest } from '@jest/globals';
import { IntegrationHarness, createHarness } from '../utils/harness';
import { TaskStatus, TaskPriority, TaskType } from '../../src/tasks/types';

// Test timeout for E2E tests
const E2E_TIMEOUT = 30000; // 30 seconds

describe('E2E: Task Workflow', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    harness = createHarness({ debug: process.env['DEBUG'] === 'true' });
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // ============================================================================
  // Basic Task Lifecycle
  // ============================================================================

  describe('Task Creation', () => {
    it('should create a task with minimal options', async () => {
      const task = await harness.createTask({
        title: 'Simple Task'
      });

      expect(task.id).toBeDefined();
      expect(task.id).toMatch(/^godel-[a-z0-9]+$/);
      expect(task.title).toBe('Simple Task');
      expect(task.status).toBe(TaskStatus.OPEN);
      expect(task.priority).toBe(TaskPriority.MEDIUM);
      expect(task.type).toBe(TaskType.TASK);
      expect(task.dependsOn).toEqual([]);
      expect(task.blocks).toEqual([]);
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('should create a task with all options', async () => {
      const task = await harness.createTask({
        title: 'Full Task',
        description: 'A comprehensive task description',
        type: TaskType.FEATURE,
        priority: TaskPriority.HIGH,
        tags: ['auth', 'api'],
        metadata: { epic: 'oauth', story: 'login' }
      });

      expect(task.title).toBe('Full Task');
      expect(task.description).toBe('A comprehensive task description');
      expect(task.type).toBe(TaskType.FEATURE);
      expect(task.priority).toBe(TaskPriority.HIGH);
      expect(task.tags).toEqual(['auth', 'api']);
      expect(task.metadata).toEqual({ epic: 'oauth', story: 'login' });
    });

    it('should create multiple tasks with unique IDs', async () => {
      const tasks = await Promise.all([
        harness.createTask({ title: 'Task 1' }),
        harness.createTask({ title: 'Task 2' }),
        harness.createTask({ title: 'Task 3' }),
      ]);

      const ids = tasks.map(t => t.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(3);
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[1]).not.toBe(ids[2]);
    });
  });

  // ============================================================================
  // Task Assignment Workflow
  // ============================================================================

  describe('Task Assignment', () => {
    it('should create, assign, and complete task', async () => {
      // 1. Create task
      const task = await harness.createTask({
        title: 'E2E Test Task',
        type: TaskType.TASK,
        priority: TaskPriority.HIGH
      });
      
      expect(task.status).toBe(TaskStatus.OPEN);
      expect(task.assignee).toBeUndefined();

      // 2. Spawn agent
      const agent = await harness.spawnAgent({ name: 'task-worker' });

      // 3. Assign task
      const assignedTask = await harness.assignTask(task.id, agent.id);
      
      expect(assignedTask.assignee).toBe(agent.id);
      expect(assignedTask.status).toBe(TaskStatus.IN_PROGRESS);

      // 4. Verify via getTask
      const updatedTask = await harness.getTask(task.id);
      expect(updatedTask?.assignee).toBe(agent.id);
      expect(updatedTask?.status).toBe(TaskStatus.IN_PROGRESS);

      // 5. Complete task
      const completedTask = await harness.completeTask(task.id);
      
      expect(completedTask.status).toBe(TaskStatus.DONE);
      expect(completedTask.completedAt).toBeDefined();
      expect(completedTask.assignee).toBe(agent.id); // Keeps assignee
    });

    it('should fail to assign task to non-existent agent', async () => {
      const task = await harness.createTask({ title: 'Orphan Task' });

      await expect(
        harness.assignTask(task.id, 'non-existent-agent')
      ).rejects.toThrow('Agent not found');
    });

    it('should allow task reassignment', async () => {
      const task = await harness.createTask({ title: 'Reassignable Task' });
      
      const agent1 = await harness.spawnAgent({ name: 'agent-1' });
      const agent2 = await harness.spawnAgent({ name: 'agent-2' });

      // Assign to agent 1
      await harness.assignTask(task.id, agent1.id);
      let updated = await harness.getTask(task.id);
      expect(updated?.assignee).toBe(agent1.id);

      // Reassign to agent 2
      await harness.assignTask(task.id, agent2.id);
      updated = await harness.getTask(task.id);
      expect(updated?.assignee).toBe(agent2.id);
    });
  });

  // ============================================================================
  // Task Dependencies
  // ============================================================================

  describe('Task Dependencies', () => {
    it('should handle task dependencies', async () => {
      // Create parent task
      const parent = await harness.createTask({ title: 'Parent' });
      
      // Create child task with dependency
      const child = await harness.createTask({ 
        title: 'Child',
        dependsOn: [parent.id]
      });

      // Child should be blocked
      expect(child.status).toBe(TaskStatus.BLOCKED);
      expect(child.dependsOn).toContain(parent.id);

      // Complete parent
      await harness.completeTask(parent.id);

      // Child should be unblocked
      const unblockedChild = await harness.getTask(child.id);
      expect(unblockedChild?.status).toBe(TaskStatus.OPEN);
    });

    it('should handle multiple dependencies', async () => {
      // Create three tasks that must all complete
      const dep1 = await harness.createTask({ title: 'Dependency 1' });
      const dep2 = await harness.createTask({ title: 'Dependency 2' });
      const dep3 = await harness.createTask({ title: 'Dependency 3' });

      // Create task depending on all three
      const task = await harness.createTask({
        title: 'Multi-Dependent Task',
        dependsOn: [dep1.id, dep2.id, dep3.id]
      });

      expect(task.status).toBe(TaskStatus.BLOCKED);

      // Complete first dependency - still blocked
      await harness.completeTask(dep1.id);
      let updated = await harness.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.BLOCKED);

      // Complete second dependency - still blocked
      await harness.completeTask(dep2.id);
      updated = await harness.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.BLOCKED);

      // Complete final dependency - now unblocked
      await harness.completeTask(dep3.id);
      updated = await harness.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.OPEN);
    });

    it('should handle chained dependencies', async () => {
      // A -> B -> C (C depends on B, B depends on A)
      const taskA = await harness.createTask({ title: 'Task A' });
      const taskB = await harness.createTask({ 
        title: 'Task B',
        dependsOn: [taskA.id]
      });
      const taskC = await harness.createTask({ 
        title: 'Task C',
        dependsOn: [taskB.id]
      });

      // Both B and C should be blocked
      expect(taskB.status).toBe(TaskStatus.BLOCKED);
      expect(taskC.status).toBe(TaskStatus.BLOCKED);

      // Complete A
      await harness.completeTask(taskA.id);

      // B should be unblocked, C still blocked
      let updatedB = await harness.getTask(taskB.id);
      let updatedC = await harness.getTask(taskC.id);
      expect(updatedB?.status).toBe(TaskStatus.OPEN);
      expect(updatedC?.status).toBe(TaskStatus.BLOCKED);

      // Complete B
      await harness.completeTask(taskB.id);

      // C should now be unblocked
      updatedC = await harness.getTask(taskC.id);
      expect(updatedC?.status).toBe(TaskStatus.OPEN);
    });

    it('should handle diamond dependency pattern', async () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const taskA = await harness.createTask({ title: 'Task A' });
      const taskB = await harness.createTask({ 
        title: 'Task B',
        dependsOn: [taskA.id]
      });
      const taskC = await harness.createTask({ 
        title: 'Task C',
        dependsOn: [taskA.id]
      });
      const taskD = await harness.createTask({ 
        title: 'Task D',
        dependsOn: [taskB.id, taskC.id]
      });

      // B, C, D all blocked
      expect(taskB.status).toBe(TaskStatus.BLOCKED);
      expect(taskC.status).toBe(TaskStatus.BLOCKED);
      expect(taskD.status).toBe(TaskStatus.BLOCKED);

      // Complete A
      await harness.completeTask(taskA.id);

      // B and C unblocked, D still blocked
      let updatedB = await harness.getTask(taskB.id);
      let updatedC = await harness.getTask(taskC.id);
      let updatedD = await harness.getTask(taskD.id);
      expect(updatedB?.status).toBe(TaskStatus.OPEN);
      expect(updatedC?.status).toBe(TaskStatus.OPEN);
      expect(updatedD?.status).toBe(TaskStatus.BLOCKED);

      // Complete B
      await harness.completeTask(taskB.id);

      // D still blocked by C
      updatedD = await harness.getTask(taskD.id);
      expect(updatedD?.status).toBe(TaskStatus.BLOCKED);

      // Complete C
      await harness.completeTask(taskC.id);

      // D now unblocked
      updatedD = await harness.getTask(taskD.id);
      expect(updatedD?.status).toBe(TaskStatus.OPEN);
    });
  });

  // ============================================================================
  // Task Status Transitions
  // ============================================================================

  describe('Status Transitions', () => {
    it('should track task status transitions correctly', async () => {
      const task = await harness.createTask({ title: 'Status Test' });
      
      expect(task.status).toBe(TaskStatus.OPEN);

      // Assign moves to in-progress
      const agent = await harness.spawnAgent({ name: 'status-agent' });
      await harness.assignTask(task.id, agent.id);
      
      let updated = await harness.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.IN_PROGRESS);

      // Complete moves to done
      await harness.completeTask(task.id);
      
      updated = await harness.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.DONE);
      expect(updated?.completedAt).toBeDefined();
    });

    it('should update timestamps on status changes', async () => {
      const task = await harness.createTask({ title: 'Timestamp Test' });
      
      const createdAt = task.createdAt;
      const initialUpdatedAt = task.updatedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Complete task
      await harness.completeTask(task.id);
      
      const updated = await harness.getTask(task.id);
      expect(updated?.updatedAt).not.toBe(initialUpdatedAt);
      expect(updated?.createdAt).toBe(createdAt); // Created stays same
    });
  });

  // ============================================================================
  // Multi-Agent Task Distribution
  // ============================================================================

  describe('Multi-Agent Task Distribution', () => {
    it('should distribute tasks to multiple agents', async () => {
      // Create multiple agents
      const agents = await Promise.all([
        harness.spawnAgent({ name: 'worker-1' }),
        harness.spawnAgent({ name: 'worker-2' }),
        harness.spawnAgent({ name: 'worker-3' }),
      ]);

      // Create tasks
      const tasks = await Promise.all([
        harness.createTask({ title: 'Task 1', priority: TaskPriority.HIGH }),
        harness.createTask({ title: 'Task 2', priority: TaskPriority.MEDIUM }),
        harness.createTask({ title: 'Task 3', priority: TaskPriority.LOW }),
      ]);

      // Assign each task to a different agent
      for (let i = 0; i < tasks.length; i++) {
        await harness.assignTask(tasks[i].id, agents[i].id);
      }

      // Verify assignments
      for (let i = 0; i < tasks.length; i++) {
        const task = await harness.getTask(tasks[i].id);
        expect(task?.assignee).toBe(agents[i].id);
        expect(task?.status).toBe(TaskStatus.IN_PROGRESS);
      }
    });

    it('should allow one agent to work on multiple tasks', async () => {
      const agent = await harness.spawnAgent({ name: 'multi-tasker' });

      const tasks = await Promise.all([
        harness.createTask({ title: 'Task A' }),
        harness.createTask({ title: 'Task B' }),
        harness.createTask({ title: 'Task C' }),
      ]);

      // Assign all to same agent
      for (const task of tasks) {
        await harness.assignTask(task.id, agent.id);
      }

      // Complete first two
      await harness.completeTask(tasks[0].id);
      await harness.completeTask(tasks[1].id);

      // Verify states
      const taskA = await harness.getTask(tasks[0].id);
      const taskB = await harness.getTask(tasks[1].id);
      const taskC = await harness.getTask(tasks[2].id);

      expect(taskA?.status).toBe(TaskStatus.DONE);
      expect(taskB?.status).toBe(TaskStatus.DONE);
      expect(taskC?.status).toBe(TaskStatus.IN_PROGRESS);
    });
  });

  // ============================================================================
  // Task Listing and Querying
  // ============================================================================

  describe('Task Listing', () => {
    it('should list all tasks', async () => {
      await Promise.all([
        harness.createTask({ title: 'Task 1' }),
        harness.createTask({ title: 'Task 2' }),
        harness.createTask({ title: 'Task 3' }),
      ]);

      const tasks = await harness.listTasks();
      expect(tasks).toHaveLength(3);
    });

    it('should return empty list when no tasks', async () => {
      const tasks = await harness.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should get task by ID', async () => {
      const created = await harness.createTask({ title: 'Findable Task' });
      const found = await harness.getTask(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Findable Task');
    });

    it('should return undefined for non-existent task', async () => {
      const found = await harness.getTask('godel-nonexistent');
      expect(found).toBeUndefined();
    });
  });

  // ============================================================================
  // Complex Workflows
  // ============================================================================

  describe('Complex Workflows', () => {
    it('should handle full workflow: agent + tasks + dependencies', async () => {
      // Create agents
      const agent1 = await harness.spawnAgent({ name: 'backend-dev' });
      const agent2 = await harness.spawnAgent({ name: 'frontend-dev' });

      // Create tasks with dependencies
      const designTask = await harness.createTask({
        title: 'Design API',
        type: TaskType.TASK,
        priority: TaskPriority.HIGH
      });

      const backendTask = await harness.createTask({
        title: 'Implement API',
        type: TaskType.FEATURE,
        dependsOn: [designTask.id]
      });

      const frontendTask = await harness.createTask({
        title: 'Build UI',
        type: TaskType.FEATURE,
        dependsOn: [designTask.id]
      });

      const integrationTask = await harness.createTask({
        title: 'Integrate Frontend & Backend',
        type: TaskType.TASK,
        dependsOn: [backendTask.id, frontendTask.id]
      });

      // Backend and frontend tasks should be blocked
      let backend = await harness.getTask(backendTask.id);
      let frontend = await harness.getTask(frontendTask.id);
      let integration = await harness.getTask(integrationTask.id);
      expect(backend?.status).toBe(TaskStatus.BLOCKED);
      expect(frontend?.status).toBe(TaskStatus.BLOCKED);
      expect(integration?.status).toBe(TaskStatus.BLOCKED);

      // Complete design
      await harness.assignTask(designTask.id, agent1.id);
      await harness.completeTask(designTask.id);

      // Backend and frontend unblocked
      backend = await harness.getTask(backendTask.id);
      frontend = await harness.getTask(frontendTask.id);
      expect(backend?.status).toBe(TaskStatus.OPEN);
      expect(frontend?.status).toBe(TaskStatus.OPEN);

      // Assign and complete backend
      await harness.assignTask(backendTask.id, agent1.id);
      await harness.completeTask(backendTask.id);

      // Integration still blocked by frontend
      integration = await harness.getTask(integrationTask.id);
      expect(integration?.status).toBe(TaskStatus.BLOCKED);

      // Assign and complete frontend
      await harness.assignTask(frontendTask.id, agent2.id);
      await harness.completeTask(frontendTask.id);

      // Integration now unblocked
      integration = await harness.getTask(integrationTask.id);
      expect(integration?.status).toBe(TaskStatus.OPEN);

      // Complete integration
      await harness.assignTask(integrationTask.id, agent1.id);
      await harness.completeTask(integrationTask.id);

      // Verify all done
      const allTasks = await harness.listTasks();
      expect(allTasks.every(t => t.status === TaskStatus.DONE)).toBe(true);
    });
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('E2E: Task Workflow Error Handling', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should throw when updating non-existent task', async () => {
    await expect(
      harness.completeTask('godel-nonexistent')
    ).rejects.toThrow('Task not found');
  });

  it('should handle assigning already completed task', async () => {
    const task = await harness.createTask({ title: 'Already Done' });
    const agent = await harness.spawnAgent({ name: 'late-agent' });

    await harness.completeTask(task.id);
    
    // Can still assign (business logic decision)
    const assigned = await harness.assignTask(task.id, agent.id);
    expect(assigned.assignee).toBe(agent.id);
    expect(assigned.status).toBe(TaskStatus.IN_PROGRESS); // Assignment changes status
  });
});

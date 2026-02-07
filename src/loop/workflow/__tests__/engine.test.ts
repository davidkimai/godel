/**
 * Workflow Engine Tests
 * 
 * Comprehensive test suite for the workflow engine covering:
 * - Basic workflow execution
 * - All node types (task, condition, parallel, merge, delay, sub-workflow)
 * - Variable substitution
 * - Expression evaluation
 * - Error handling and retries
 * - Event publishing
 * - DAG validation
 */

import {
  WorkflowEngine,
  createWorkflowEngine,
  Workflow,
  WorkflowInstanceStatus,
  WorkflowNodeStatus,
  TaskExecutor,
  AgentSelector,
  EventBus,
  DAGValidationResult,
} from '../index';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockTaskExecutor(): TaskExecutor {
  return {
    execute: jest.fn().mockResolvedValue({ success: true, data: 'test-result' }),
  };
}

function createMockAgentSelector(): AgentSelector {
  return {
    selectAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent' }),
    releaseAgent: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBus(): EventBus {
  return {
    publish: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
  };
}

function createTestWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    version: '1.0',
    nodes: [],
    edges: [],
    ...overrides,
  };
}

// ============================================================================
// Workflow Engine Tests
// ============================================================================

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let taskExecutor: TaskExecutor;
  let agentSelector: AgentSelector;
  let eventBus: EventBus;

  beforeEach(() => {
    taskExecutor = createMockTaskExecutor();
    agentSelector = createMockAgentSelector();
    eventBus = createMockEventBus();
    engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus, {
      defaultTaskTimeout: 1000,
      defaultRetries: 0,
    });
  });

  describe('Registration', () => {
    it('should register a workflow', () => {
      const workflow = createTestWorkflow({
        nodes: [{ id: 'n1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } }],
      });

      engine.register(workflow);

      expect(engine.getWorkflow('test-workflow')).toEqual(workflow);
    });

    it('should throw on invalid workflow', () => {
      const workflow = createTestWorkflow({
        id: '', // Invalid - empty ID
        nodes: [], // Invalid - no nodes
      });

      expect(() => engine.register(workflow)).toThrow('Invalid workflow');
    });

    it('should unregister a workflow', () => {
      const workflow = createTestWorkflow({
        nodes: [{ id: 'n1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } }],
      });

      engine.register(workflow);
      const result = engine.unregister('test-workflow');

      expect(result).toBe(true);
      expect(engine.getWorkflow('test-workflow')).toBeUndefined();
    });

    it('should list all workflows', () => {
      const workflow1 = createTestWorkflow({ id: 'wf1', nodes: [{ id: 'n1', type: 'task', name: 'Task', config: { type: 'task', taskType: 'test', parameters: {} } }] });
      const workflow2 = createTestWorkflow({ id: 'wf2', nodes: [{ id: 'n1', type: 'task', name: 'Task', config: { type: 'task', taskType: 'test', parameters: {} } }] });

      engine.register(workflow1);
      engine.register(workflow2);

      const workflows = engine.listWorkflows();
      expect(workflows).toHaveLength(2);
    });
  });

  describe('Basic Execution', () => {
    it('should execute a simple single-node workflow', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: { value: 42 } } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 50));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(taskExecutor.execute).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        type: 'test',
        parameters: { value: 42 },
      }));
    });

    it('should execute sequential nodes', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'task1', to: 'task2' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.size).toBe(2);
    });

    it('should execute parallel branches', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'start', type: 'task', name: 'Start', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'branch1', type: 'task', name: 'Branch 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'branch2', type: 'task', name: 'Branch 2', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'merge', type: 'merge', name: 'Merge', config: { type: 'merge', strategy: 'collect' } },
        ],
        edges: [
          { id: 'e1', from: 'start', to: 'branch1' },
          { id: 'e2', from: 'start', to: 'branch2' },
          { id: 'e3', from: 'branch1', to: 'merge' },
          { id: 'e4', from: 'branch2', to: 'merge' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.size).toBe(4);
    });
  });

  describe('Condition Nodes', () => {
    it('should follow true branch when condition is true', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'check', type: 'condition', name: 'Check', config: { type: 'condition', condition: '${status} == "ok"', trueBranch: 'success', falseBranch: 'failure' } },
          { id: 'success', type: 'task', name: 'Success', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'failure', type: 'task', name: 'Failure', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'check', to: 'success' },
          { id: 'e2', from: 'check', to: 'failure' },
        ],
        variables: [{ name: 'status', type: 'string', default: 'ok' }],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.has('success')).toBe(true);
      expect(instance?.completedNodes.has('failure')).toBe(false);
    });

    it('should follow false branch when condition is false', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'check', type: 'condition', name: 'Check', config: { type: 'condition', condition: '${status} == "ok"', trueBranch: 'success', falseBranch: 'failure' } },
          { id: 'success', type: 'task', name: 'Success', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'failure', type: 'task', name: 'Failure', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'check', to: 'success' },
          { id: 'e2', from: 'check', to: 'failure' },
        ],
        variables: [{ name: 'status', type: 'string', default: 'error' }],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.completedNodes.has('success')).toBe(false);
      expect(instance?.completedNodes.has('failure')).toBe(true);
    });
  });

  describe('Parallel Nodes', () => {
    it('should execute parallel branches', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'parallel', type: 'parallel', name: 'Parallel', config: { type: 'parallel', branches: ['task1', 'task2', 'task3'], waitFor: 'all' } },
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task3', type: 'task', name: 'Task 3', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(taskExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('should wait for any branch completion with waitFor: any', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'parallel', type: 'parallel', name: 'Parallel', config: { type: 'parallel', branches: ['task1', 'task2'], waitFor: 'any' } },
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
    });
  });

  describe('Merge Nodes', () => {
    it('should collect all results with collect strategy', async () => {
      (taskExecutor.execute as jest.Mock)
        .mockResolvedValueOnce({ value: 1 })
        .mockResolvedValueOnce({ value: 2 });

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'merge', type: 'merge', name: 'Merge', config: { type: 'merge', strategy: 'collect' } },
        ],
        edges: [
          { id: 'e1', from: 'task1', to: 'merge' },
          { id: 'e2', from: 'task2', to: 'merge' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      const mergeResult = instance?.results.get('merge');
      expect(Array.isArray(mergeResult)).toBe(true);
      expect(mergeResult).toHaveLength(2);
    });

    it('should return first result with first strategy', async () => {
      (taskExecutor.execute as jest.Mock)
        .mockResolvedValueOnce({ value: 1 })
        .mockResolvedValueOnce({ value: 2 });

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'merge', type: 'merge', name: 'Merge', config: { type: 'merge', strategy: 'first' } },
        ],
        edges: [
          { id: 'e1', from: 'task1', to: 'merge' },
          { id: 'e2', from: 'task2', to: 'merge' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      const mergeResult = instance?.results.get('merge');
      expect(mergeResult).toEqual({ value: 1 });
    });
  });

  describe('Delay Nodes', () => {
    it('should delay execution', async () => {
      const startTime = Date.now();
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'delay', type: 'delay', name: 'Delay', config: { type: 'delay', duration: 100 } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 200));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Variable Substitution', () => {
    it('should substitute variables in task parameters', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { 
            id: 'task1', 
            type: 'task', 
            name: 'Task 1', 
            config: { type: 'task', taskType: 'test', parameters: { message: '${greeting} ${name}!' } } 
          },
        ],
        variables: [
          { name: 'greeting', type: 'string' },
          { name: 'name', type: 'string' },
        ],
      });

      engine.register(workflow);
      await engine.start('test-workflow', { greeting: 'Hello', name: 'World' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(taskExecutor.execute).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        parameters: { message: 'Hello World!' },
      }));
    });

    it('should use default values when not provided', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { 
            id: 'task1', 
            type: 'task', 
            name: 'Task 1', 
            config: { type: 'task', taskType: 'test', parameters: { value: '${count}' } } 
          },
        ],
        variables: [
          { name: 'count', type: 'number', default: 42 },
        ],
      });

      engine.register(workflow);
      await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(taskExecutor.execute).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        parameters: { value: '42' },
      }));
    });

    it('should throw when required variable is missing', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        variables: [
          { name: 'required', type: 'string', required: true },
        ],
      });

      engine.register(workflow);
      await expect(engine.start('test-workflow')).rejects.toThrow('Required variable required not provided');
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed tasks', async () => {
      (taskExecutor.execute as jest.Mock)
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({ success: true });

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {}, retries: 2, retryDelay: 10 } },
        ],
      });

      engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus, {
        defaultRetries: 0,
        defaultRetryDelay: 10,
      });
      engine.register(workflow);

      const instanceId = await engine.start('test-workflow');
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(taskExecutor.execute).toHaveBeenCalledTimes(2);
      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
    });

    it('should fail workflow when retries exhausted', async () => {
      (taskExecutor.execute as jest.Mock).mockRejectedValue(new Error('Always fails'));

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {}, retries: 1, retryDelay: 10 } },
        ],
      });

      engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus, {
        defaultRetries: 0,
        defaultRetryDelay: 10,
      });
      engine.register(workflow);

      const instanceId = await engine.start('test-workflow');
      await new Promise(resolve => setTimeout(resolve, 200));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.FAILED);
    });

    it('should continue on failure when onFailure=continue', async () => {
      (taskExecutor.execute as jest.Mock)
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockResolvedValueOnce({ success: true });

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {}, retries: 0 } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'task1', to: 'task2' },
        ],
        onFailure: 'continue',
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');
      await new Promise(resolve => setTimeout(resolve, 100));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.has('task2')).toBe(true);
    });
  });

  describe('Event Publishing', () => {
    it('should publish workflow events', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.publish).toHaveBeenCalledWith('workflow:started', expect.any(Object));
      expect(eventBus.publish).toHaveBeenCalledWith('node:started', expect.any(Object));
      expect(eventBus.publish).toHaveBeenCalledWith('node:completed', expect.any(Object));
      expect(eventBus.publish).toHaveBeenCalledWith('workflow:completed', expect.any(Object));
    });

    it('should publish node failure events', async () => {
      (taskExecutor.execute as jest.Mock).mockRejectedValue(new Error('Task failed'));

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {}, retries: 0 } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.publish).toHaveBeenCalledWith('node:failed', expect.any(Object));
      expect(eventBus.publish).toHaveBeenCalledWith('workflow:failed', expect.any(Object));
    });
  });

  describe('Status Tracking', () => {
    it('should track progress correctly', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task2', type: 'task', name: 'Task 2', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'task3', type: 'task', name: 'Task 3', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'task1', to: 'task2' },
          { id: 'e2', from: 'task2', to: 'task3' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = engine.getInstanceStatus(instanceId);
      expect(status?.progress).toBe(1);
      expect(status?.completedNodes).toBe(3);
      expect(status?.totalNodes).toBe(3);
    });

    it('should list active executions', async () => {
      // Create a workflow with a delay to keep it running
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'delay', type: 'delay', name: 'Delay', config: { type: 'delay', duration: 500 } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      // Check while still running
      const active = engine.getActiveInstances();
      expect(active).toContain(instanceId);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 600));

      const activeAfter = engine.getActiveInstances();
      expect(activeAfter).not.toContain(instanceId);
    });
  });

  describe('Control Operations', () => {
    it('should pause and resume workflow', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'delay', type: 'delay', name: 'Delay', config: { type: 'delay', duration: 200 } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      // Let it start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Pause
      const paused = engine.pause(instanceId);
      expect(paused).toBe(true);

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.PAUSED);

      // Resume
      const resumed = engine.resume(instanceId);
      expect(resumed).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 300));
      const instanceAfter = engine.getInstance(instanceId);
      expect(instanceAfter?.status).toBe(WorkflowInstanceStatus.COMPLETED);
    });

    it('should cancel workflow', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'delay', type: 'delay', name: 'Delay', config: { type: 'delay', duration: 1000 } },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 20));

      const cancelled = engine.cancel(instanceId);
      expect(cancelled).toBe(true);

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.CANCELLED);
    });
  });

  describe('DAG Validation', () => {
    it('should detect cycles in workflow', () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'a', type: 'task', name: 'A', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'b', type: 'task', name: 'B', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e2', from: 'b', to: 'a' }, // Creates cycle
        ],
      });

      const validation = (engine as unknown as { validateDAG: (w: Workflow) => DAGValidationResult }).validateDAG(workflow);
      expect(validation.hasCycle).toBe(true);
    });

    it('should detect missing node references', () => {
      const workflow = createTestWorkflow({
        nodes: [
          { id: 'a', type: 'task', name: 'A', config: { type: 'task', taskType: 'test', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b' }, // 'b' doesn't exist
        ],
      });

      const validation = (engine as unknown as { validateWorkflow: (w: Workflow) => { errors: string[] } }).validateWorkflow(workflow);
      expect(validation.errors).toContain('Edge references non-existent node: b');
    });
  });

  describe('Complex Workflows', () => {
    it('should execute test-and-deploy workflow pattern', async () => {
      (taskExecutor.execute as jest.Mock)
        .mockResolvedValueOnce({ status: 'passed' }) // test
        .mockResolvedValueOnce({ deployed: true }); // deploy

      const workflow = createTestWorkflow({
        id: 'test-and-deploy',
        name: 'Test and Deploy',
        nodes: [
          { id: 'test', type: 'task', name: 'Run Tests', config: { type: 'task', taskType: 'test', parameters: {} } },
          { id: 'check', type: 'condition', name: 'Tests Passed?', config: { type: 'condition', condition: '${result.status} == "passed"', trueBranch: 'deploy', falseBranch: 'notify-failure' } },
          { id: 'deploy', type: 'task', name: 'Deploy', config: { type: 'task', taskType: 'deploy', parameters: {} } },
          { id: 'notify-failure', type: 'task', name: 'Notify', config: { type: 'task', taskType: 'notify', parameters: { message: 'Tests failed' } } },
        ],
        edges: [
          { id: 'e1', from: 'test', to: 'check' },
          { id: 'e2', from: 'check', to: 'deploy' },
          { id: 'e3', from: 'check', to: 'notify-failure' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-and-deploy');

      await new Promise(resolve => setTimeout(resolve, 150));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.has('deploy')).toBe(true);
      expect(instance?.completedNodes.has('notify-failure')).toBe(false);
    });

    it('should handle fan-out fan-in pattern', async () => {
      (taskExecutor.execute as jest.Mock).mockResolvedValue({ processed: true });

      const workflow = createTestWorkflow({
        nodes: [
          { id: 'source', type: 'task', name: 'Source', config: { type: 'task', taskType: 'fetch', parameters: {} } },
          { id: 'process1', type: 'task', name: 'Process 1', config: { type: 'task', taskType: 'process', parameters: {} } },
          { id: 'process2', type: 'task', name: 'Process 2', config: { type: 'task', taskType: 'process', parameters: {} } },
          { id: 'process3', type: 'task', name: 'Process 3', config: { type: 'task', taskType: 'process', parameters: {} } },
          { id: 'merge', type: 'merge', name: 'Merge', config: { type: 'merge', strategy: 'collect' } },
          { id: 'sink', type: 'task', name: 'Sink', config: { type: 'task', taskType: 'save', parameters: {} } },
        ],
        edges: [
          { id: 'e1', from: 'source', to: 'process1' },
          { id: 'e2', from: 'source', to: 'process2' },
          { id: 'e3', from: 'source', to: 'process3' },
          { id: 'e4', from: 'process1', to: 'merge' },
          { id: 'e5', from: 'process2', to: 'merge' },
          { id: 'e6', from: 'process3', to: 'merge' },
          { id: 'e7', from: 'merge', to: 'sink' },
        ],
      });

      engine.register(workflow);
      const instanceId = await engine.start('test-workflow');

      await new Promise(resolve => setTimeout(resolve, 200));

      const instance = engine.getInstance(instanceId);
      expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(instance?.completedNodes.size).toBe(6);
      
      // Verify merge collected all results
      const mergeResult = instance?.results.get('merge');
      expect(Array.isArray(mergeResult)).toBe(true);
      expect(mergeResult).toHaveLength(3);
    });
  });
});

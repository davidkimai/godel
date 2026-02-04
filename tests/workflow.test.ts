/**
 * Workflow Engine Tests
 */

import {
  Workflow,
  WorkflowStatus,
  StepStatus,
  WorkflowEngine,
  createWorkflowEngine,
  parseWorkflowYaml,
  validateWorkflow,
  topologicalSort,
  WorkflowStateMachine,
  WorkflowDesigner,
} from '../src/workflow';

// ============================================================================
// Test Fixtures
// ============================================================================

const simpleWorkflow: Workflow = {
  name: 'simple-workflow',
  version: '1.0.0',
  onFailure: 'stop',
  steps: [
    {
      id: 'step1',
      name: 'Step 1',
      agent: 'agent1',
      task: 'Task 1',
      dependsOn: [],
      next: ['step2'],
      parallel: false,
    },
    {
      id: 'step2',
      name: 'Step 2',
      agent: 'agent2',
      task: 'Task 2',
      dependsOn: ['step1'],
      next: [],
      parallel: false,
    },
  ],
};

const parallelWorkflow: Workflow = {
  name: 'parallel-workflow',
  version: '1.0.0',
  onFailure: 'stop',
  steps: [
    {
      id: 'extract',
      name: 'Extract',
      agent: 'extractor',
      task: 'Extract data',
      dependsOn: [],
      next: ['transform1', 'transform2'],
      parallel: false,
    },
    {
      id: 'transform1',
      name: 'Transform 1',
      agent: 'transformer',
      task: 'Transform batch 1',
      dependsOn: ['extract'],
      next: ['load'],
      parallel: true,
    },
    {
      id: 'transform2',
      name: 'Transform 2',
      agent: 'transformer',
      task: 'Transform batch 2',
      dependsOn: ['extract'],
      next: ['load'],
      parallel: true,
    },
    {
      id: 'load',
      name: 'Load',
      agent: 'loader',
      task: 'Load data',
      dependsOn: ['transform1', 'transform2'],
      next: [],
      parallel: false,
    },
  ],
};

const conditionalWorkflow: Workflow = {
  name: 'conditional-workflow',
  version: '1.0.0',
  onFailure: 'stop',
  variables: { runAnalytics: true },
  steps: [
    {
      id: 'extract',
      name: 'Extract',
      agent: 'extractor',
      task: 'Extract data',
      dependsOn: [],
      next: ['analyze', 'skip-analyze'],
      parallel: false,
    },
    {
      id: 'analyze',
      name: 'Analyze',
      agent: 'analyzer',
      task: 'Analyze data',
      dependsOn: ['extract'],
      next: [],
      condition: { variable: 'runAnalytics', equals: true },
      parallel: false,
    },
    {
      id: 'skip-analyze',
      name: 'Skip Analysis',
      agent: 'no-op',
      task: 'No analysis',
      dependsOn: ['extract'],
      next: [],
      condition: { variable: 'runAnalytics', equals: false },
      parallel: false,
    },
  ],
};

// ============================================================================
// Parser Tests
// ============================================================================

describe('Workflow Parser', () => {
  test('should parse valid YAML workflow', () => {
    const yaml = `
name: test-workflow
description: A test workflow
version: "1.0.0"
steps:
  - id: step1
    name: Step 1
    agent: agent1
    task: Do something
    dependsOn: []
    next: []
`;
    const workflow = parseWorkflowYaml(yaml);
    expect(workflow.name).toBe('test-workflow');
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0].id).toBe('step1');
  });

  test('should validate workflow with missing step references', () => {
    const workflow: Workflow = {
      name: 'invalid-workflow',
      version: '1.0.0',
      onFailure: 'stop',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          agent: 'agent1',
          task: 'Task 1',
          dependsOn: ['nonexistent'],
          next: [],
          parallel: false,
        },
      ],
    };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Step 'step1' depends on non-existent step: nonexistent");
  });

  test('should detect cycles in workflow', () => {
    const workflow: Workflow = {
      name: 'cyclic-workflow',
      version: '1.0.0',
      onFailure: 'stop',
      steps: [
        {
          id: 'a',
          name: 'Step A',
          agent: 'agent',
          task: 'Task A',
          dependsOn: ['c'],
          next: ['b'],
          parallel: false,
        },
        {
          id: 'b',
          name: 'Step B',
          agent: 'agent',
          task: 'Task B',
          dependsOn: ['a'],
          next: ['c'],
          parallel: false,
        },
        {
          id: 'c',
          name: 'Step C',
          agent: 'agent',
          task: 'Task C',
          dependsOn: ['b'],
          next: ['a'],
          parallel: false,
        },
      ],
    };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cycle'))).toBe(true);
  });
});

// ============================================================================
// DAG Tests
// ============================================================================

describe('DAG Utilities', () => {
  test('should perform topological sort on simple workflow', () => {
    const result = topologicalSort(simpleWorkflow);
    expect(result.hasCycle).toBe(false);
    expect(result.ordered).toHaveLength(2);
    expect(result.ordered[0]).toContain('step1');
    expect(result.ordered[1]).toContain('step2');
  });

  test('should group parallel steps in same layer', () => {
    const result = topologicalSort(parallelWorkflow);
    expect(result.hasCycle).toBe(false);
    expect(result.ordered).toHaveLength(3);
    expect(result.ordered[0]).toContain('extract');
    expect(result.ordered[1]).toContain('transform1');
    expect(result.ordered[1]).toContain('transform2');
    expect(result.ordered[2]).toContain('load');
  });

  test('should detect cycles', () => {
    const cyclicWorkflow: Workflow = {
      name: 'cyclic',
      version: '1.0.0',
      onFailure: 'stop',
      steps: [
        {
          id: 'a',
          name: 'A',
          agent: 'agent',
          task: 'Task A',
          dependsOn: ['b'],
          next: [],
          parallel: false,
        },
        {
          id: 'b',
          name: 'B',
          agent: 'agent',
          task: 'Task B',
          dependsOn: ['a'],
          next: [],
          parallel: false,
        },
      ],
    };

    const result = topologicalSort(cyclicWorkflow);
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toBeDefined();
  });
});

// ============================================================================
// State Machine Tests
// ============================================================================

describe('Workflow State Machine', () => {
  test('should initialize with pending status', () => {
    const machine = new WorkflowStateMachine(simpleWorkflow, 'exec_123');
    const state = machine.getState();
    expect(state.status).toBe(WorkflowStatus.PENDING);
    expect(state.executionId).toBe('exec_123');
  });

  test('should transition from pending to running', () => {
    const machine = new WorkflowStateMachine(simpleWorkflow, 'exec_123');
    machine.start();
    expect(machine.getState().status).toBe(WorkflowStatus.RUNNING);
  });

  test('should transition step through lifecycle', () => {
    const machine = new WorkflowStateMachine(simpleWorkflow, 'exec_123');
    
    machine.startStep('step1');
    expect(machine.getStepState('step1')?.status).toBe(StepStatus.RUNNING);
    
    machine.completeStep('step1', { result: 'success' });
    expect(machine.getStepState('step1')?.status).toBe(StepStatus.COMPLETED);
    expect(machine.getStepState('step1')?.output).toEqual({ result: 'success' });
  });

  test('should handle step retry', () => {
    const workflow: Workflow = {
      ...simpleWorkflow,
      steps: simpleWorkflow.steps.map(s => ({
        ...s,
        retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 100 },
      })),
    };
    
    const machine = new WorkflowStateMachine(workflow, 'exec_123');
    
    machine.startStep('step1');
    machine.failStep('step1', { message: 'Error' });
    expect(machine.getStepState('step1')?.status).toBe(StepStatus.FAILED);
    
    machine.retryStep('step1');
    expect(machine.getStepState('step1')?.status).toBe(StepStatus.RETRYING);
    
    machine.transitionStep('step1', StepStatus.RUNNING);
    expect(machine.getStepState('step1')?.attempts).toBe(2);
  });

  test('should evaluate conditions', () => {
    const machine = new WorkflowStateMachine(conditionalWorkflow, 'exec_123');
    machine.setVariable('runAnalytics', true);
    
    const analyzeStep = conditionalWorkflow.steps.find(s => s.id === 'analyze')!;
    expect(machine.evaluateCondition(analyzeStep)).toBe(true);
    
    machine.setVariable('runAnalytics', false);
    expect(machine.evaluateCondition(analyzeStep)).toBe(false);
  });

  test('should track progress', () => {
    const machine = new WorkflowStateMachine(simpleWorkflow, 'exec_123');
    
    expect(machine.getProgress().percentage).toBe(0);
    
    machine.startStep('step1');
    machine.completeStep('step1');
    expect(machine.getProgress().percentage).toBe(50);
    
    machine.startStep('step2');
    machine.completeStep('step2');
    expect(machine.getProgress().percentage).toBe(100);
  });

  test('should emit events on transitions', () => {
    const machine = new WorkflowStateMachine(simpleWorkflow, 'exec_123');
    const events: string[] = [];
    
    machine.onEvent((event) => {
      events.push(event.type);
    });
    
    machine.start();
    machine.startStep('step1');
    machine.completeStep('step1');
    
    expect(events).toContain('workflow:start');
    expect(events).toContain('step:start');
    expect(events).toContain('step:complete');
  });
});

// ============================================================================
// Engine Tests
// ============================================================================

describe('Workflow Engine', () => {
  // Mock step executor that succeeds
  const mockSuccessExecutor = async () => ({
    success: true,
    output: { result: 'success' },
  });

  // Mock step executor that fails
  const mockFailExecutor = async () => ({
    success: false,
    error: { message: 'Step failed' },
  });

  test('should execute simple workflow successfully', async () => {
    const engine = createWorkflowEngine(mockSuccessExecutor);
    const result = await engine.execute(simpleWorkflow);
    
    expect(result.status).toBe(WorkflowStatus.COMPLETED);
    expect(result.state.completedSteps).toHaveLength(2);
  });

  test('should respect dependencies', async () => {
    const executionOrder: string[] = [];
    
    const trackingExecutor = async (step: any) => {
      executionOrder.push(step.id);
      return { success: true, output: {} };
    };
    
    const engine = createWorkflowEngine(trackingExecutor);
    await engine.execute(simpleWorkflow);
    
    expect(executionOrder[0]).toBe('step1');
    expect(executionOrder[1]).toBe('step2');
  });

  test('should execute parallel steps concurrently', async () => {
    const startTimes: Record<string, number> = {};
    
    const timingExecutor = async (step: any) => {
      startTimes[step.id] = Date.now();
      await new Promise(r => setTimeout(r, 50)); // Small delay
      return { success: true, output: {} };
    };
    
    const engine = createWorkflowEngine(timingExecutor);
    await engine.execute(parallelWorkflow);
    
    // transform1 and transform2 should start at roughly the same time
    const timeDiff = Math.abs(startTimes['transform1'] - startTimes['transform2']);
    expect(timeDiff).toBeLessThan(20); // Should start within 20ms
  });

  test('should handle step failures with stop policy', async () => {
    const workflow: Workflow = {
      ...simpleWorkflow,
      onFailure: 'stop',
    };
    
    let callCount = 0;
    const failingExecutor = async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, error: { message: 'Failed' } };
      }
      return { success: true, output: {} };
    };
    
    const engine = createWorkflowEngine(failingExecutor);
    const result = await engine.execute(workflow);
    
    expect(result.status).toBe(WorkflowStatus.FAILED);
    expect(result.state.failedSteps).toContain('step1');
  });

  test('should skip steps when condition is not met', async () => {
    const executedSteps: string[] = [];
    
    const trackingExecutor = async (step: any) => {
      executedSteps.push(step.id);
      return { success: true, output: {} };
    };
    
    const engine = createWorkflowEngine(trackingExecutor);
    await engine.execute(conditionalWorkflow);
    
    expect(executedSteps).toContain('analyze');
    expect(executedSteps).not.toContain('skip-analyze');
  });

  test('should emit events during execution', async () => {
    const engine = createWorkflowEngine(mockSuccessExecutor);
    const events: string[] = [];
    
    engine.onWorkflowEvent(['workflow:start', 'workflow:complete'], (event) => {
      events.push(event.type);
    });
    
    await engine.execute(simpleWorkflow);
    
    expect(events).toContain('workflow:start');
    expect(events).toContain('workflow:complete');
  });

  test('should validate workflow before execution', async () => {
    const engine = createWorkflowEngine(mockSuccessExecutor);
    
    const cyclicWorkflow: Workflow = {
      name: 'cyclic',
      version: '1.0.0',
      onFailure: 'stop',
      steps: [
        {
          id: 'a',
          name: 'A',
          agent: 'agent',
          task: 'Task',
          dependsOn: ['b'],
          next: [],
          parallel: false,
        },
        {
          id: 'b',
          name: 'B',
          agent: 'agent',
          task: 'Task',
          dependsOn: ['a'],
          next: [],
          parallel: false,
        },
      ],
    };
    
    await expect(engine.execute(cyclicWorkflow)).rejects.toThrow('cycle');
  });

  test('should calculate retry delay correctly', () => {
    const machine = new WorkflowStateMachine({
      ...simpleWorkflow,
      steps: simpleWorkflow.steps.map(s => ({
        ...s,
        retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 1000 },
      })),
    }, 'exec_123');
    
    // First retry (attempt 1 completed, about to start attempt 2)
    machine.transitionStep('step1', StepStatus.RUNNING);
    expect(machine.getRetryDelay('step1')).toBe(1000);
    
    // Complete first attempt and retry
    machine.failStep('step1', { message: 'Error' });
    machine.retryStep('step1');
    machine.transitionStep('step1', StepStatus.RUNNING);
    expect(machine.getRetryDelay('step1')).toBe(2000); // 1000 * 2^1
  });
});

// ============================================================================
// Designer Tests
// ============================================================================

describe('Workflow Designer', () => {
  test('should create designer with initial workflow', () => {
    const designer = new WorkflowDesigner({ name: 'test' });
    expect(designer.toWorkflow().name).toBe('test');
  });

  test('should add steps', () => {
    const designer = new WorkflowDesigner();
    const stepId = designer.addStep({
      name: 'New Step',
      agent: 'agent1',
      task: 'Do something',
    });
    
    expect(designer.toWorkflow().steps).toHaveLength(1);
    expect(designer.getStep(stepId)?.name).toBe('New Step');
  });

  test('should connect steps', () => {
    const designer = new WorkflowDesigner();
    const id1 = designer.addStep({ name: 'Step 1', agent: 'agent1', task: 'Task 1' });
    const id2 = designer.addStep({ name: 'Step 2', agent: 'agent2', task: 'Task 2' });
    
    designer.connectSteps(id1, id2, 'next');
    
    expect(designer.getStep(id1)?.next).toContain(id2);
  });

  test('should validate workflow', () => {
    const designer = new WorkflowDesigner();
    designer.addStep({ name: 'Step 1', agent: 'agent1', task: 'Task 1' });
    
    const validation = designer.validate();
    expect(validation.valid).toBe(true);
  });

  test('should export to YAML', () => {
    const designer = new WorkflowDesigner({ name: 'test-workflow' });
    designer.addStep({ name: 'Step 1', agent: 'agent1', task: 'Task 1' });
    
    const yaml = designer.toYaml();
    expect(yaml).toContain('name: test-workflow');
    expect(yaml).toContain('Step 1');
  });

  test('should get execution order', () => {
    const designer = new WorkflowDesigner();
    const id1 = designer.addStep({ name: 'Step 1', agent: 'agent1', task: 'Task 1' });
    const id2 = designer.addStep({ name: 'Step 2', agent: 'agent2', task: 'Task 2' });
    designer.connectSteps(id1, id2, 'dependency');
    
    const order = designer.getExecutionOrder();
    expect(order[0]).toContain(id1);
    expect(order[1]).toContain(id2);
  });
});

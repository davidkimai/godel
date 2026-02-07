/**
 * Workflow Engine Examples
 * 
 * This file demonstrates various workflow patterns that can be implemented
 * using the Godel Loop Workflow Engine.
 */

import {
  WorkflowEngine,
  createWorkflowEngine,
  Workflow,
  TaskExecutor,
  AgentSelector,
  EventBus,
} from './index';

// ============================================================================
// Example 1: Simple Sequential Workflow
// ============================================================================

export const simpleSequentialWorkflow: Workflow = {
  id: 'simple-sequential',
  name: 'Simple Sequential Workflow',
  version: '1.0',
  nodes: [
    { id: 'step1', type: 'task', name: 'Step 1', config: { type: 'task', taskType: 'process', parameters: { action: 'prepare' } } },
    { id: 'step2', type: 'task', name: 'Step 2', config: { type: 'task', taskType: 'process', parameters: { action: 'execute' } } },
    { id: 'step3', type: 'task', name: 'Step 3', config: { type: 'task', taskType: 'process', parameters: { action: 'cleanup' } } },
  ],
  edges: [
    { id: 'e1', from: 'step1', to: 'step2' },
    { id: 'e2', from: 'step2', to: 'step3' },
  ],
};

// ============================================================================
// Example 2: Test and Deploy Pipeline
// ============================================================================

export const testAndDeployWorkflow: Workflow = {
  id: 'test-and-deploy',
  name: 'Test and Deploy Pipeline',
  version: '1.0',
  nodes: [
    { id: 'test', type: 'task', name: 'Run Tests', config: { type: 'task', taskType: 'test', parameters: {}, retries: 2 } },
    { id: 'check', type: 'condition', name: 'Tests Passed?', config: { type: 'condition', condition: '${result.status} == "passed"', trueBranch: 'deploy', falseBranch: 'notify-failure' } },
    { id: 'deploy', type: 'task', name: 'Deploy to Production', config: { type: 'task', taskType: 'deploy', parameters: {} } },
    { id: 'notify-failure', type: 'task', name: 'Notify Team', config: { type: 'task', taskType: 'notify', parameters: { message: 'Tests failed!', channel: 'alerts' } } },
  ],
  edges: [
    { id: 'e1', from: 'test', to: 'check' },
    { id: 'e2', from: 'check', to: 'deploy' },
    { id: 'e3', from: 'check', to: 'notify-failure' },
  ],
};

// ============================================================================
// Example 3: Parallel Processing with Merge
// ============================================================================

export const parallelProcessingWorkflow: Workflow = {
  id: 'parallel-processing',
  name: 'Parallel Data Processing',
  version: '1.0',
  nodes: [
    { id: 'source', type: 'task', name: 'Fetch Data', config: { type: 'task', taskType: 'fetch', parameters: { source: 'database' } } },
    { id: 'parallel', type: 'parallel', name: 'Process in Parallel', config: { type: 'parallel', branches: ['analyze', 'validate', 'transform'], waitFor: 'all' } },
    { id: 'analyze', type: 'task', name: 'Analyze Data', config: { type: 'task', taskType: 'analyze', parameters: {} } },
    { id: 'validate', type: 'task', name: 'Validate Data', config: { type: 'task', taskType: 'validate', parameters: {} } },
    { id: 'transform', type: 'task', name: 'Transform Data', config: { type: 'task', taskType: 'transform', parameters: {} } },
    { id: 'merge', type: 'merge', name: 'Combine Results', config: { type: 'merge', strategy: 'collect' } },
    { id: 'sink', type: 'task', name: 'Store Results', config: { type: 'task', taskType: 'store', parameters: {} } },
  ],
  edges: [
    { id: 'e1', from: 'source', to: 'parallel' },
    { id: 'e2', from: 'analyze', to: 'merge' },
    { id: 'e3', from: 'validate', to: 'merge' },
    { id: 'e4', from: 'transform', to: 'merge' },
    { id: 'e5', from: 'merge', to: 'sink' },
  ],
};

// ============================================================================
// Example 4: Retry with Exponential Backoff
// ============================================================================

export const retryWorkflow: Workflow = {
  id: 'retry-example',
  name: 'Retry with Exponential Backoff',
  version: '1.0',
  nodes: [
    { 
      id: 'unreliable-task', 
      type: 'task', 
      name: 'Unreliable API Call', 
      config: { 
        type: 'task', 
        taskType: 'api-call', 
        parameters: { endpoint: 'https://api.example.com/data' },
        retries: 5,
        retryDelay: 1000,
        retryBackoff: 'exponential',
        timeout: 30000,
      } 
    },
  ],
  edges: [],
};

// ============================================================================
// Example 5: Sub-Workflow Orchestration
// ============================================================================

export const parentWorkflow: Workflow = {
  id: 'parent-workflow',
  name: 'Parent Orchestration',
  version: '1.0',
  nodes: [
    { id: 'prepare', type: 'task', name: 'Prepare Environment', config: { type: 'task', taskType: 'setup', parameters: {} } },
    { 
      id: 'sub-workflow-1', 
      type: 'sub-workflow', 
      name: 'Run ETL Process', 
      config: { 
        type: 'sub-workflow', 
        workflowId: 'etl-pipeline', 
        inputs: { sourceTable: '${tableName}', destinationBucket: '${bucket}' },
        waitForCompletion: true,
        propagateErrors: true,
      } 
    },
    { 
      id: 'sub-workflow-2', 
      type: 'sub-workflow', 
      name: 'Generate Report', 
      config: { 
        type: 'sub-workflow', 
        workflowId: 'report-generator', 
        inputs: { reportType: '${reportType}', dateRange: '${dateRange}' },
        waitForCompletion: true,
      } 
    },
    { id: 'notify', type: 'task', name: 'Send Notification', config: { type: 'task', taskType: 'notify', parameters: { message: 'All processes completed' } } },
  ],
  edges: [
    { id: 'e1', from: 'prepare', to: 'sub-workflow-1' },
    { id: 'e2', from: 'prepare', to: 'sub-workflow-2' },
    { id: 'e3', from: 'sub-workflow-1', to: 'notify' },
    { id: 'e4', from: 'sub-workflow-2', to: 'notify' },
  ],
  variables: [
    { name: 'tableName', type: 'string', required: true },
    { name: 'bucket', type: 'string', default: 'default-bucket' },
    { name: 'reportType', type: 'string', default: 'summary' },
    { name: 'dateRange', type: 'string', required: true },
  ],
};

// ============================================================================
// Example 6: Scheduled Delay Workflow
// ============================================================================

export const scheduledWorkflow: Workflow = {
  id: 'scheduled-task',
  name: 'Scheduled Delay Example',
  version: '1.0',
  nodes: [
    { id: 'prepare', type: 'task', name: 'Prepare', config: { type: 'task', taskType: 'setup', parameters: {} } },
    { id: 'wait', type: 'delay', name: 'Wait for Scheduled Time', config: { type: 'delay', duration: 3600000 } }, // 1 hour
    { id: 'execute', type: 'task', name: 'Execute at Scheduled Time', config: { type: 'task', taskType: 'execute', parameters: {} } },
  ],
  edges: [
    { id: 'e1', from: 'prepare', to: 'wait' },
    { id: 'e2', from: 'wait', to: 'execute' },
  ],
  triggers: [
    { type: 'schedule', config: { cron: '0 0 * * *' }, enabled: true }, // Daily at midnight
  ],
};

// ============================================================================
// Example 7: A/B Testing Workflow
// ============================================================================

export const abTestingWorkflow: Workflow = {
  id: 'ab-test',
  name: 'A/B Test Deployment',
  version: '1.0',
  nodes: [
    { id: 'split', type: 'condition', name: 'Split Traffic', config: { type: 'condition', condition: '${Math.random()} < 0.5', trueBranch: 'variant-a', falseBranch: 'variant-b' } },
    { id: 'variant-a', type: 'task', name: 'Deploy Variant A', config: { type: 'task', taskType: 'deploy', parameters: { variant: 'A' } } },
    { id: 'variant-b', type: 'task', name: 'Deploy Variant B', config: { type: 'task', taskType: 'deploy', parameters: { variant: 'B' } } },
    { id: 'collect-a', type: 'task', name: 'Collect Metrics A', config: { type: 'task', taskType: 'collect-metrics', parameters: { variant: 'A' } } },
    { id: 'collect-b', type: 'task', name: 'Collect Metrics B', config: { type: 'task', taskType: 'collect-metrics', parameters: { variant: 'B' } } },
    { id: 'analyze', type: 'merge', name: 'Analyze Results', config: { type: 'merge', strategy: 'collect' } },
    { id: 'decision', type: 'task', name: 'Make Decision', config: { type: 'task', taskType: 'analyze', parameters: {} } },
  ],
  edges: [
    { id: 'e1', from: 'split', to: 'variant-a' },
    { id: 'e2', from: 'split', to: 'variant-b' },
    { id: 'e3', from: 'variant-a', to: 'collect-a' },
    { id: 'e4', from: 'variant-b', to: 'collect-b' },
    { id: 'e5', from: 'collect-a', to: 'analyze' },
    { id: 'e6', from: 'collect-b', to: 'analyze' },
    { id: 'e7', from: 'analyze', to: 'decision' },
  ],
};

// ============================================================================
// Usage Example
// ============================================================================

export async function runExample() {
  // Create dependencies
  const taskExecutor: TaskExecutor = {
    execute: async (agentId, task) => {
      console.log(`Executing task: ${task.type} with agent ${agentId}`);
      return { success: true, data: `Result of ${task.type}` };
    },
  };

  const agentSelector: AgentSelector = {
    selectAgent: async () => ({ id: 'agent-1', name: 'Default Agent' }),
    releaseAgent: async () => {},
  };

  const eventBus: EventBus = {
    publish: (event, data) => console.log(`Event: ${event}`, data),
    subscribe: () => () => {},
  };

  // Create engine
  const engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus);

  // Register workflows
  engine.register(testAndDeployWorkflow);
  engine.register(parallelProcessingWorkflow);

  // Start workflow execution
  const instanceId = await engine.start('test-and-deploy', {
    environment: 'staging',
  });

  console.log(`Workflow started with instance ID: ${instanceId}`);

  // Monitor progress
  setInterval(() => {
    const status = engine.getInstanceStatus(instanceId);
    if (status) {
      console.log(`Progress: ${Math.round(status.progress * 100)}%`);
      console.log(`Status: ${status.status}`);
    }
  }, 1000);
}

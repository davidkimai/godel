# Godel Loop Workflow Engine

A powerful DAG-based workflow execution engine with support for complex orchestration patterns including branching, parallel execution, and sub-workflows.

## Features

### Node Types (6 Types)

1. **Task Node** - Execute agent tasks with configurable parameters
   - Variable substitution in parameters
   - Configurable timeout and retries
   - Exponential/linear/fixed backoff strategies
   - Agent selection criteria

2. **Condition Node** - Branch execution based on expressions
   - Expression evaluation with variable substitution
   - True/false branch selection
   - Access to parent node results

3. **Parallel Node** - Execute multiple branches concurrently
   - `waitFor: 'all'` - Wait for all branches
   - `waitFor: 'any'` - Return on first completion
   - `waitFor: N` - Wait for N branches to complete

4. **Merge Node** - Combine results from multiple branches
   - `collect` - Collect all results into array
   - `first` - Return first completed result
   - `last` - Return last completed result
   - `concat` - Concatenate array results
   - `reduce` - Reduce results using custom function

5. **Delay Node** - Pause execution for a duration
   - Fixed duration in milliseconds
   - Scheduled time (ISO timestamp)

6. **Sub-Workflow Node** - Execute nested workflows
   - Input mapping from parent variables
   - Error propagation control
   - Synchronous or asynchronous execution

### Core Capabilities

- **DAG Validation** - Cycle detection and structural validation
- **Variable Substitution** - `${variable}` syntax throughout
- **Expression Evaluation** - Condition expressions with full variable access
- **Error Handling** - Configurable retry with backoff strategies
- **Event Publishing** - Lifecycle events for monitoring and observability
- **Progress Tracking** - Real-time progress calculation
- **Pause/Resume/Cancel** - Execution control operations

## Quick Start

```typescript
import { WorkflowEngine, createWorkflowEngine } from './loop/workflow';

// Create dependencies
const taskExecutor = {
  execute: async (agentId, task) => {
    // Execute the task
    return { result: 'success' };
  },
};

const agentSelector = {
  selectAgent: async () => ({ id: 'agent-1', name: 'Default' }),
  releaseAgent: async () => {},
};

const eventBus = {
  publish: (event, data) => console.log(event, data),
  subscribe: () => () => {},
};

// Create engine
const engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus);

// Define workflow
const workflow = {
  id: 'my-workflow',
  name: 'My Workflow',
  version: '1.0',
  nodes: [
    { id: 'task1', type: 'task', name: 'Task 1', config: { type: 'task', taskType: 'process', parameters: {} } },
    { id: 'check', type: 'condition', name: 'Check', config: { type: 'condition', condition: '${value} > 10', trueBranch: 'success', falseBranch: 'retry' } },
    { id: 'success', type: 'task', name: 'Success', config: { type: 'task', taskType: 'complete', parameters: {} } },
    { id: 'retry', type: 'task', name: 'Retry', config: { type: 'task', taskType: 'retry', parameters: {} } },
  ],
  edges: [
    { id: 'e1', from: 'task1', to: 'check' },
    { id: 'e2', from: 'check', to: 'success' },
    { id: 'e3', from: 'check', to: 'retry' },
  ],
  variables: [
    { name: 'value', type: 'number', default: 5 },
  ],
};

// Register and execute
engine.register(workflow);
const instanceId = await engine.start('my-workflow', { value: 15 });

// Monitor
const status = engine.getInstanceStatus(instanceId);
console.log(`Progress: ${status?.progress * 100}%`);
```

## Workflow Patterns

### Sequential Execution
```typescript
{
  nodes: [
    { id: 'a', type: 'task', ... },
    { id: 'b', type: 'task', ... },
    { id: 'c', type: 'task', ... },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'b', to: 'c' },
  ],
}
```

### Parallel Processing (Fan-out/Fan-in)
```typescript
{
  nodes: [
    { id: 'source', type: 'task', ... },
    { id: 'parallel', type: 'parallel', config: { type: 'parallel', branches: ['p1', 'p2', 'p3'], waitFor: 'all' } },
    { id: 'p1', type: 'task', ... },
    { id: 'p2', type: 'task', ... },
    { id: 'p3', type: 'task', ... },
    { id: 'merge', type: 'merge', config: { type: 'merge', strategy: 'collect' } },
  ],
  edges: [
    { id: 'e1', from: 'source', to: 'parallel' },
    { id: 'e2', from: 'p1', to: 'merge' },
    { id: 'e3', from: 'p2', to: 'merge' },
    { id: 'e4', from: 'p3', to: 'merge' },
  ],
}
```

### Conditional Branching
```typescript
{
  nodes: [
    { id: 'task', type: 'task', ... },
    { id: 'condition', type: 'condition', config: { type: 'condition', condition: '${result.status} == "ok"', trueBranch: 'success', falseBranch: 'failure' } },
    { id: 'success', type: 'task', ... },
    { id: 'failure', type: 'task', ... },
  ],
  edges: [
    { id: 'e1', from: 'task', to: 'condition' },
    { id: 'e2', from: 'condition', to: 'success' },
    { id: 'e3', from: 'condition', to: 'failure' },
  ],
}
```

### Retry with Backoff
```typescript
{
  nodes: [
    { 
      id: 'unreliable', 
      type: 'task', 
      config: { 
        type: 'task', 
        taskType: 'api-call',
        retries: 3,
        retryDelay: 1000,
        retryBackoff: 'exponential', // or 'linear' or 'fixed'
      } 
    },
  ],
}
```

### Sub-Workflow
```typescript
{
  nodes: [
    { id: 'prepare', type: 'task', ... },
    { 
      id: 'sub', 
      type: 'sub-workflow', 
      config: { 
        type: 'sub-workflow', 
        workflowId: 'nested-workflow',
        inputs: { param: '${parentVar}' },
        waitForCompletion: true,
        propagateErrors: true,
      } 
    },
  ],
}
```

## API Reference

### WorkflowEngine

#### Methods

- `register(workflow: Workflow)` - Register a workflow definition
- `unregister(workflowId: string)` - Remove a workflow
- `start(workflowId: string, inputs?: Record<string, unknown>)` - Start workflow execution
- `pause(instanceId: string)` - Pause a running workflow
- `resume(instanceId: string)` - Resume a paused workflow
- `cancel(instanceId: string)` - Cancel a workflow
- `getInstance(instanceId: string)` - Get instance details
- `getInstanceStatus(instanceId: string)` - Get instance status with progress
- `getActiveInstances()` - List all running instances
- `validateWorkflow(workflow: Workflow)` - Validate a workflow definition

### Events

- `workflow:started` - Workflow execution started
- `workflow:completed` - Workflow completed successfully
- `workflow:failed` - Workflow failed
- `workflow:paused` - Workflow paused
- `workflow:resumed` - Workflow resumed
- `workflow:cancelled` - Workflow cancelled
- `node:started` - Node execution started
- `node:completed` - Node completed successfully
- `node:failed` - Node failed
- `node:skipped` - Node skipped (condition not met or onFailure=continue)
- `node:retrying` - Node retry initiated

## File Structure

```
src/loop/workflow/
├── index.ts           # Main exports
├── types.ts           # TypeScript type definitions
├── engine.ts          # Core workflow engine implementation
├── example.ts         # Usage examples
├── __tests__/
│   └── engine.test.ts # Comprehensive test suite
```

## Testing

```bash
# Run workflow engine tests
npx jest src/loop/workflow/__tests__/engine.test.ts

# Run with coverage
npx jest src/loop/workflow/__tests__/engine.test.ts --coverage
```

Test coverage: 30 test cases covering:
- Basic execution
- All 6 node types
- Variable substitution
- Expression evaluation
- Error handling and retries
- Event publishing
- Progress tracking
- Control operations
- DAG validation
- Complex workflow patterns

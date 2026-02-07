# Workflow Engine Documentation

The Godel Workflow Engine is a DAG-based execution system that enables complex multi-step workflows with dependencies, parallel execution, conditional branching, and comprehensive state management.

## Table of Contents

1. [Overview](#overview)
2. [Workflow Definition](#workflow-definition)
3. [DAG Execution](#dag-execution)
4. [State Machine](#state-machine)
5. [API Reference](#api-reference)
6. [Integration](#integration)
7. [Examples](#examples)

## Overview

The workflow engine provides:

- **DAG-based execution**: Define workflows as directed acyclic graphs with explicit dependencies
- **Parallel execution**: Automatically execute independent steps in parallel
- **Conditional branching**: Skip or include steps based on runtime conditions
- **Retry logic**: Automatic retry with configurable backoff strategies
- **State persistence**: Store workflow definitions and execution state in PostgreSQL
- **Event integration**: Emit events to the Godel event bus for monitoring

## Workflow Definition

### YAML Format

```yaml
name: data-pipeline
description: Extract, transform, and load data
version: "1.0.0"

variables:
  sourceUrl: "https://api.example.com/data"
  batchSize: 1000
  enableAnalytics: true

onFailure: stop  # stop | continue | retry_all
timeout: 3600000  # 1 hour in milliseconds

steps:
  - id: extract
    name: Extract Data
    description: Fetch data from source
    agent: data-extractor
    task: Extract data from {{sourceUrl}}
    dependsOn: []
    next: [transform, validate]
    retry:
      maxAttempts: 3
      backoff: exponential  # fixed | linear | exponential
      delayMs: 5000
    timeout: 300000
    outputs: [extractedRecords]

  - id: transform
    name: Transform Data
    agent: data-transformer
    task: Transform records
    dependsOn: [extract]
    next: [load]
    condition:
      variable: enableAnalytics
      equals: true
    parallel: true
```

### Step Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the step |
| `name` | string | Yes | Human-readable name |
| `agent` | string | Yes | Agent type to execute this step |
| `task` | string | Yes | Task description for the agent |
| `dependsOn` | string[] | No | Steps that must complete before this one |
| `next` | string[] | No | Steps to execute after this one |
| `condition` | object | No | Condition for step execution |
| `retry` | object | No | Retry configuration |
| `timeout` | number | No | Step timeout in milliseconds |
| `parallel` | boolean | No | Whether step can run in parallel |

### Conditions

Steps can be conditionally executed:

```yaml
condition:
  variable: enableAnalytics  # Check workflow variable
  equals: true

# Or using an expression
condition:
  expression: "steps.extract.output.recordCount > 100"
```

## DAG Execution

### Topological Sort

The engine performs a topological sort to determine execution order:

```typescript
import { topologicalSort } from './workflow/dag';

const result = topologicalSort(workflow);
// result.ordered = [['extract'], ['transform1', 'transform2'], ['load']]
// Each array represents a layer of steps that can run in parallel
```

### Parallel Execution

Steps in the same layer execute concurrently:

```
Layer 0: [extract]
         ↓
Layer 1: [transform1] ←→ [transform2]  (parallel)
         ↓                ↓
Layer 2: [load]
```

### Dependency Resolution

Dependencies are respected automatically:

```typescript
// transform1 and transform2 both depend on extract
// They won't start until extract completes

// load depends on both transform1 and transform2
// It won't start until both complete
```

## State Machine

### Workflow States

```
Pending → Running → Completed
   ↓         ↓
Cancelled   Failed
   ↑         ↑
   └──── Paused ←──┘
```

### Step States

```
Pending → Running → Completed
   ↓         ↓
Skipped    Failed
            ↓
         Retrying
            ↓
         Running (retry)
```

### State Transitions

```typescript
const machine = new WorkflowStateMachine(workflow, executionId);

machine.start();                    // Pending → Running
machine.startStep('step1');         // Step pending → running
machine.completeStep('step1');      // Step running → completed
machine.failStep('step2', error);   // Step running → failed
machine.retryStep('step2');         // Failed → retrying
machine.pause();                    // Running → Paused
machine.resume();                   // Paused → Running
machine.cancel();                   // Any → Cancelled
```

## API Reference

### Creating a Workflow Engine

```typescript
import { createWorkflowEngine } from './workflow';

const engine = createWorkflowEngine(
  async (step, context) => {
    // Execute the step
    const result = await executeAgentTask(step.agent, step.task);
    
    return {
      success: true,
      output: result,
    };
  },
  {
    maxConcurrentSteps: 10,
    defaultRetryAttempts: 3,
    stepTimeoutMs: 300000,
  }
);
```

### Executing a Workflow

```typescript
const result = await engine.execute(workflow, {
  // Initial variables
  sourceUrl: 'https://api.example.com',
});

console.log(result.status);      // 'completed' | 'failed' | 'cancelled'
console.log(result.durationMs);  // Execution time
console.log(result.state);       // Full execution state
```

### Event Handling

```typescript
engine.onWorkflowEvent(['step:start', 'step:complete'], (event) => {
  console.log(`${event.type}: ${event.stepId}`);
});

engine.on('workflow:complete', (event) => {
  console.log(`Workflow completed in ${event.data?.durationMs}ms`);
});
```

### Control Operations

```typescript
// Get active executions
const executions = engine.getActiveExecutions();

// Pause/resume/cancel
engine.pause(executionId);
engine.resume(executionId);
engine.cancel(executionId);

// Get state
const state = engine.getExecutionState(executionId);
```

### Workflow Designer

```typescript
import { WorkflowDesigner } from './workflow/designer';

const designer = new WorkflowDesigner({ name: 'my-workflow' });

// Add steps
const step1 = designer.addStep({
  name: 'Extract Data',
  agent: 'extractor',
  task: 'Extract from API',
});

const step2 = designer.addStep({
  name: 'Transform Data',
  agent: 'transformer',
  task: 'Transform records',
});

// Connect steps
designer.connectSteps(step1, step2, 'next');

// Validate
const validation = designer.validate();
console.log(validation.valid ? 'Valid' : validation.errors);

// Export
const yaml = designer.toYaml();
const workflow = designer.toWorkflow();
```

## Integration

### Event Bus Integration

```typescript
import { createWorkflowEventBusIntegration } from './workflow';

const integration = createWorkflowEventBusIntegration(engine, eventBus);
integration.start();

// All workflow events will now be published to the event bus
```

### PostgreSQL Storage

```typescript
import { WorkflowRepository } from './storage/repositories';

const repo = new WorkflowRepository(pool);
await repo.createSchema();

// Store workflow
const stored = await repo.createWorkflow(workflow);

// Store execution state
await repo.createExecution(workflowId, state);

// Update execution
await repo.updateExecution(executionId, state);

// Get metrics
const stats = await repo.getWorkflowStats(workflowId);
```

### Metrics Collection

```typescript
import { createWorkflowMetricsCollector } from './workflow';

const metrics = createWorkflowMetricsCollector(engine);

metrics.on('metrics:workflow', (data) => {
  console.log(`Workflow ${data.workflowId}: ${data.durationMs}ms`);
});

// Get collected metrics
const workflowMetrics = metrics.getWorkflowMetrics(workflowId);
const stepMetrics = metrics.getStepMetrics(workflowId, stepId);
```

## Examples

### Simple Sequential Workflow

```yaml
name: simple-sequence
steps:
  - id: step1
    name: First Step
    agent: agent1
    task: Do first thing
    dependsOn: []
    next: [step2]

  - id: step2
    name: Second Step
    agent: agent2
    task: Do second thing
    dependsOn: [step1]
    next: []
```

### Parallel Processing

```yaml
name: parallel-processing
steps:
  - id: split
    name: Split Data
    agent: splitter
    task: Split into batches
    dependsOn: []
    next: [process1, process2, process3]

  - id: process1
    name: Process Batch 1
    agent: processor
    task: Process batch 1
    dependsOn: [split]
    next: [merge]
    parallel: true

  - id: process2
    name: Process Batch 2
    agent: processor
    task: Process batch 2
    dependsOn: [split]
    next: [merge]
    parallel: true

  - id: process3
    name: Process Batch 3
    agent: processor
    task: Process batch 3
    dependsOn: [split]
    next: [merge]
    parallel: true

  - id: merge
    name: Merge Results
    agent: merger
    task: Merge all batches
    dependsOn: [process1, process2, process3]
    next: []
```

### Conditional Branching

```yaml
name: conditional-branch
variables:
  quality: 'high'
  skipValidation: false

steps:
  - id: extract
    name: Extract Data
    agent: extractor
    task: Extract data
    dependsOn: []
    next: [validate, skip-validation]

  - id: validate
    name: Validate Data
    agent: validator
    task: Validate data
    dependsOn: [extract]
    next: [process]
    condition:
      variable: skipValidation
      equals: false

  - id: skip-validation
    name: Skip Validation
    agent: no-op
    task: Skip validation
    dependsOn: [extract]
    next: [process]
    condition:
      variable: skipValidation
      equals: true

  - id: process
    name: Process Data
    agent: processor
    task: Process data
    dependsOn: [validate, skip-validation]
    next: []
```

### Error Handling with Retry

```yaml
name: retry-example
steps:
  - id: unreliable
    name: Unreliable Operation
    agent: api-client
    task: Call external API
    dependsOn: []
    next: [cleanup]
    retry:
      maxAttempts: 5
      backoff: exponential
      delayMs: 1000
    timeout: 30000

  - id: cleanup
    name: Cleanup
    agent: cleaner
    task: Cleanup resources
    dependsOn: [unreliable]
    next: []
```

### TypeScript Example

```typescript
import {
  createWorkflowEngine,
  parseWorkflowYaml,
  WorkflowRepository,
  createWorkflowEventBusIntegration,
  createWorkflowMetricsCollector,
} from './workflow';

async function main() {
  // Parse workflow
  const workflow = parseWorkflowYamlFile('./workflows/data-pipeline.yaml');
  
  // Create engine
  const engine = createWorkflowEngine(async (step, context) => {
    console.log(`Executing ${step.name} with agent ${step.agent}`);
    
    // Access variables
    const batchSize = context.getVariable('batchSize');
    
    // Access previous step outputs
    const previousOutput = context.getStepOutput('extract');
    
    // Execute
    const result = await executeAgent(step.agent, step.task, {
      batchSize,
      previousOutput,
    });
    
    return {
      success: true,
      output: result,
    };
  });
  
  // Set up integrations
  const eventBus = getGlobalEventBus();
  const eventIntegration = createWorkflowEventBusIntegration(engine, eventBus);
  eventIntegration.start();
  
  const metrics = createWorkflowMetricsCollector(engine);
  
  // Execute
  const result = await engine.execute(workflow, {
    sourceUrl: 'https://api.example.com',
  });
  
  console.log(`Workflow ${result.status} in ${result.durationMs}ms`);
  
  // Store results
  const repo = new WorkflowRepository(pool);
  await repo.createExecution(workflow.id!, result.state);
}
```

## Metrics

The workflow engine tracks the following metrics:

### Workflow Metrics
- `totalExecutions` - Total number of executions
- `successfulExecutions` - Number of successful completions
- `failedExecutions` - Number of failures
- `averageDurationMs` - Average execution time
- `minDurationMs` - Minimum execution time
- `maxDurationMs` - Maximum execution time

### Step Metrics
- Per-step execution counts
- Per-step success/failure rates
- Per-step average duration

### Example Metrics Output

```json
{
  "data-pipeline": {
    "totalExecutions": 100,
    "successfulExecutions": 95,
    "failedExecutions": 5,
    "averageDurationMs": 45000,
    "stepMetrics": {
      "extract": {
        "totalExecutions": 100,
        "successfulExecutions": 100,
        "averageDurationMs": 5000
      },
      "transform": {
        "totalExecutions": 100,
        "successfulExecutions": 95,
        "averageDurationMs": 15000
      }
    }
  }
}
```

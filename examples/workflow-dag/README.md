# Workflow DAG Examples

Directed Acyclic Graph (DAG) workflow examples for complex multi-step processes.

## Overview

This example demonstrates how to create and execute DAG-based workflows with Godel. Workflows allow you to define complex processes with dependencies, parallel execution, and conditional branching.

## Files

- `data-pipeline.yaml` - ETL (Extract, Transform, Load) workflow
- `ci-cd-workflow.yaml` - CI/CD pipeline workflow
- `ml-training.yaml` - Machine learning training pipeline
- `conditional-branching.yaml` - Conditional execution example
- `error-handling.yaml` - Retry and error handling patterns

## Quick Start

### 1. Data Pipeline Workflow

```bash
# Run the ETL workflow
godel workflow run data-pipeline.yaml

# Check status
godel workflow status <workflow-id>

# View execution graph
godel workflow visualize <workflow-id>
```

### 2. CI/CD Workflow

```bash
# Run CI/CD pipeline
godel workflow run ci-cd-workflow.yaml --var gitRef=main --var environment=staging
```

### 3. ML Training Pipeline

```bash
# Run ML training with custom variables
godel workflow run ml-training.yaml \
  --var dataset=s3://bucket/dataset.csv \
  --var epochs=100 \
  --var modelType=transformer
```

## Workflow Concepts

### Steps and Dependencies

```yaml
steps:
  - id: step1
    name: First Step
    agent: agent-type
    task: Do something
    dependsOn: []        # No dependencies, runs first
    next: [step2, step3] # Next steps to execute

  - id: step2
    name: Second Step
    agent: agent-type
    task: Do something else
    dependsOn: [step1]   # Waits for step1
    next: [step4]

  - id: step3
    name: Third Step
    agent: agent-type
    task: Do another thing
    dependsOn: [step1]   # Also waits for step1
    next: [step4]

  - id: step4
    name: Fourth Step
    agent: agent-type
    task: Final step
    dependsOn: [step2, step3]  # Waits for both
```

### Execution Flow

```
step1
  ├──▶ step2 ──┐
  │            ├──▶ step4
  └──▶ step3 ──┘
```

### Variables

```yaml
variables:
  environment: production
  batchSize: 1000
  enableAnalytics: true

steps:
  - id: extract
    task: Extract data with batch size {{batchSize}}
    # Variables are interpolated using {{variableName}}
```

### Conditions

```yaml
steps:
  - id: validate
    name: Validate Data
    agent: validator
    task: Validate data integrity
    dependsOn: [extract]
    condition:
      variable: enableAnalytics
      equals: true
    # Only runs if enableAnalytics is true
```

### Retry Logic

```yaml
steps:
  - id: unreliable-step
    name: Unreliable Operation
    agent: api-client
    task: Call external API
    retry:
      maxAttempts: 5
      backoff: exponential  # fixed | linear | exponential
      delayMs: 1000
    timeout: 30000
```

### Parallel Execution

```yaml
steps:
  - id: process1
    name: Process Batch 1
    agent: processor
    task: Process batch 1
    dependsOn: [split]
    parallel: true          # Can run in parallel with other parallel steps
    next: [merge]
```

## Advanced Patterns

### Fan-Out / Fan-In

```yaml
# Fan-out: One step triggers many parallel steps
# Fan-in: One step waits for many parallel steps

steps:
  - id: split
    name: Split Data
    agent: splitter
    task: Split into 10 batches
    next: [process-1, process-2, ..., process-10]

  - id: process-1
    name: Process Batch 1
    agent: processor
    dependsOn: [split]
    parallel: true
    next: [merge]

  # ... more process steps ...

  - id: merge
    name: Merge Results
    agent: merger
    dependsOn: [process-1, process-2, ..., process-10]
    # Waits for all 10 process steps
```

### Conditional Branching

```yaml
variables:
  quality: high
  skipTests: false

steps:
  - id: build
    name: Build
    agent: builder
    next: [test, deploy-staging]

  - id: test
    name: Run Tests
    agent: tester
    dependsOn: [build]
    condition:
      variable: skipTests
      equals: false
    next: [deploy-production]

  - id: deploy-staging
    name: Deploy to Staging
    agent: deployer
    dependsOn: [build]
    next: [integration-tests]

  - id: integration-tests
    name: Integration Tests
    agent: tester
    dependsOn: [deploy-staging]
    next: [deploy-production]

  - id: deploy-production
    name: Deploy to Production
    agent: deployer
    dependsOn: [test, integration-tests]
    condition:
      variable: quality
      equals: high
```

### Error Handling Strategies

```yaml
# Strategy 1: Stop on failure (default)
onFailure: stop

# Strategy 2: Continue on failure
onFailure: continue

# Strategy 3: Retry all failed steps
onFailure: retry_all

steps:
  - id: step1
    name: Step 1
    agent: agent1
    retry:
      maxAttempts: 3
      backoff: exponential
```

## Programmatic Usage

```typescript
import { WorkflowEngine } from '@godel/core/workflow';

// Load workflow
const workflow = await WorkflowEngine.load('data-pipeline.yaml');

// Execute with variables
const result = await workflow.execute({
  sourceUrl: 'https://api.example.com/data',
  batchSize: 500,
});

// Check result
console.log(result.status);      // 'completed' | 'failed'
console.log(result.durationMs);  // Execution time
console.log(result.state);       // Full execution state
```

## Monitoring Workflows

```bash
# Watch workflow in real-time
godel workflow watch <workflow-id>

# Get execution graph
godel workflow graph <workflow-id>

# Export execution data
godel workflow export <workflow-id> --format json > workflow-result.json
```

## Troubleshooting

### Workflow stuck

```bash
# Check which steps are pending
godel workflow status <workflow-id> --verbose

# Cancel stuck workflow
godel workflow cancel <workflow-id>
```

### Circular dependency error

Godel will detect and report circular dependencies:
```
Error: Circular dependency detected: step1 -> step2 -> step3 -> step1
```

Fix by removing one of the dependency edges.

## Next Steps

- Learn about [CI/CD Integration](../ci-cd-integration/)
- Build [Custom Agents](../custom-agent/)
- Explore [API Client](../api-client/)

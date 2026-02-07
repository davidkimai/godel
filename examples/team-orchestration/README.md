# Team Orchestration Example

This example demonstrates how to create and manage agent teams for coordinated multi-agent workflows.

## Overview

Teams allow you to orchestrate multiple agents working together on complex tasks. Godel supports several team strategies:

- **Parallel**: All workers execute simultaneously
- **Map-Reduce**: Split work, process in parallel, combine results
- **Pipeline**: Sequential stages with handoffs
- **Tree**: Hierarchical delegation

## Examples

### 1. Create a Parallel Team

```bash
# Using CLI
godel team create \
  --name "feature-auth" \
  --strategy parallel \
  --coordinator 1 \
  --workers 3 \
  --reviewer 1

# Using interactive mode
godel interactive team
```

### 2. Using the SDK

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({ baseUrl: 'http://localhost:7373' });

// Create a parallel team
const team = await client.teams.create({
  name: 'api-refactoring',
  strategy: 'parallel',
  composition: {
    coordinator: { role: 'coordinator', model: 'claude-opus-4' },
    workers: [{ role: 'worker', count: 4, model: 'claude-sonnet-4-5' }],
    reviewers: [{ role: 'reviewer', count: 1, model: 'claude-sonnet-4-5' }]
  },
  task: {
    description: 'Refactor API endpoints to use new auth middleware',
    worktreeId: 'wt-abc123'
  }
});
```

### 3. Map-Reduce Pattern

```typescript
// Split a large task across multiple agents
const team = await client.teams.create({
  name: 'code-analysis',
  strategy: 'map-reduce',
  composition: {
    coordinator: { role: 'coordinator', model: 'claude-opus-4' },
    workers: [{ role: 'worker', count: 5, model: 'claude-sonnet-4-5' }]
  },
  mapReduce: {
    splitFn: 'splitByFile',      // Split work by file
    mapFn: 'analyzeFile',        // Each worker analyzes files
    reduceFn: 'combineAnalysis'  // Coordinator combines results
  }
});
```

### 4. Pipeline Pattern

```typescript
// Sequential processing stages
const team = await client.teams.create({
  name: 'code-review-pipeline',
  strategy: 'pipeline',
  composition: {
    workers: [
      { role: 'worker', stage: 'analyze', model: 'claude-sonnet-4-5' },
      { role: 'reviewer', stage: 'review', model: 'claude-opus-4' },
      { role: 'refinery', stage: 'refine', model: 'claude-sonnet-4-5' }
    ]
  }
});
```

### 5. Monitor Team Progress

```bash
# Get team status
godel team status team-001

# Watch in real-time
godel events stream --team team-001 --follow
```

### 6. Scale a Team

```bash
# Add more workers
godel team scale team-001 --workers 5

# Or use SDK
await client.teams.scale('team-001', { workers: 5 });
```

## Best Practices

1. **Start Small**: Begin with 2-3 workers, scale up based on performance
2. **Match Roles to Tasks**: Use coordinators for complex orchestration
3. **Monitor Metrics**: Watch queue depth and completion rates
4. **Set Budgets**: Always set cost limits for teams

## See Also

- [intent-refactoring](../intent-refactoring/) - Intent-based team delegation
- [multi-runtime](../multi-runtime/) - Teams across different runtimes

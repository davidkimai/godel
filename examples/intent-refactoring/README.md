# Intent-Based Refactoring Example

This example demonstrates Godel's intent-based interface for describing what you want to achieve rather than how to achieve it.

## The Intent Philosophy

Instead of manually orchestrating agents, you describe your goal in natural language:

```bash
# Traditional approach
godel agent spawn --role worker
godel task create --agent agent-001 --prompt "Refactor auth..."
# ...wait...check...delegate...

# Intent-based approach
godel do "Refactor authentication to use OAuth2 with PKCE"
```

## Examples

### 1. Simple Intent Execution

```bash
godel do "Add input validation to all API endpoints"
```

### 2. Intent with Constraints

```bash
godel do "Refactor database layer" \
  --strategy careful \
  --agents 5 \
  --timeout 30 \
  --budget 10.00
```

### 3. Intent with Worktree

```bash
godel do "Implement feature X" \
  --worktree /path/to/repo \
  --branch feature/x
```

### 4. Using the SDK

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({ baseUrl: 'http://localhost:7373' });

// Execute an intent
const result = await client.intent.execute({
  description: 'Refactor authentication to use JWT tokens',
  constraints: {
    strategy: 'careful',      // careful | parallel | sequential
    maxAgents: 5,
    timeout: 30,              // minutes
    budget: { maxCost: 10.00 }
  },
  context: {
    worktreeId: 'wt-abc123',
    relevantFiles: ['src/auth.ts', 'src/middleware.ts']
  }
});

console.log(`Execution ID: ${result.id}`);
console.log(`Status: ${result.status}`);

// Monitor progress
for await (const update of result.updates()) {
  console.log(`[${update.status}] ${update.message}`);
}
```

### 5. Complex Multi-Step Intent

```typescript
const result = await client.intent.execute({
  description: `
    Implement a complete user authentication system:
    1. Add JWT token generation and validation
    2. Create login/logout endpoints
    3. Add password reset flow
    4. Implement rate limiting
    5. Add comprehensive tests
  `,
  constraints: {
    strategy: 'careful',
    maxAgents: 8,
    stages: [
      { name: 'design', agents: 1 },
      { name: 'implement', agents: 4 },
      { name: 'review', agents: 2 },
      { name: 'test', agents: 1 }
    ]
  }
});
```

### 6. Intent with Auto-Recovery

```typescript
const result = await client.intent.execute({
  description: 'Migrate from REST to GraphQL',
  constraints: {
    strategy: 'careful',
    autoRetry: true,
    maxRetries: 3,
    rollbackOnFailure: true
  }
});
```

## Intent Resolution

Godel's intent resolver breaks down your description into:

1. **Task Decomposition**: What subtasks are needed?
2. **Agent Selection**: Which agents have the right capabilities?
3. **Dependency Ordering**: What order must tasks execute?
4. **Parallelization**: What can be done simultaneously?
5. **Quality Gates**: What checks should be applied?

## Best Practices

1. **Be Specific**: "Add input validation" → "Validate email format using zod"
2. **Include Context**: Mention relevant files, patterns, constraints
3. **Set Boundaries**: Use budget and timeout limits
4. **Start Small**: Test intents on isolated features first

## Troubleshooting

If an intent fails to execute correctly:

```bash
# Check execution details
godel intent get <execution-id>

# View detailed logs
godel logs --intent <execution-id>

# Retry with more specific description
godel do "<more specific intent>" --retry <execution-id>
```

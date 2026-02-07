# Multi-Runtime Example

This example demonstrates using different agent runtimes (Pi, OpenClaw, Local) within the same orchestration.

## Supported Runtimes

| Runtime | Description | Best For |
|---------|-------------|----------|
| **Pi** | Multi-provider CLI with tree sessions | Complex coding tasks, exploration |
| **OpenClaw** | OpenClaw runtime | Integration with OpenClaw ecosystem |
| **Local** | Direct execution | Simple tasks, testing, CI/CD |

## Examples

### 1. Spawn Agents with Different Runtimes

```bash
# Pi runtime
godel agent spawn --runtime pi --model claude-sonnet-4-5

# OpenClaw runtime
godel agent spawn --runtime openclaw --model gpt-4o

# Local runtime
godel agent spawn --runtime local
```

### 2. Mixed Runtime Team

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({ baseUrl: 'http://localhost:7373' });

// Create a team with mixed runtimes
const team = await client.teams.create({
  name: 'mixed-runtime-team',
  composition: {
    coordinator: { 
      role: 'coordinator', 
      runtime: 'pi',
      model: 'claude-opus-4' 
    },
    workers: [
      { 
        role: 'worker', 
        runtime: 'pi',
        model: 'claude-sonnet-4-5',
        count: 2 
      },
      { 
        role: 'worker', 
        runtime: 'openclaw',
        model: 'gpt-4o',
        count: 2 
      },
      { 
        role: 'worker', 
        runtime: 'local',
        count: 1 
      }
    ]
  }
});
```

### 3. Runtime-Specific Configuration

```typescript
// Pi with tree-structured sessions
const piAgent = await client.agents.spawn({
  role: 'worker',
  runtime: 'pi',
  config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    treeMode: true,          // Enable tree-structured sessions
    enableCycling: true,      // Allow Ctrl+P model cycling
    maxBranchDepth: 10
  }
});

// OpenClaw with specific tools
const openclawAgent = await client.agents.spawn({
  role: 'worker',
  runtime: 'openclaw',
  config: {
    model: 'gpt-4o',
    tools: ['read', 'write', 'edit', 'bash'],
    maxIterations: 50
  }
});

// Local with direct execution
const localAgent = await client.agents.spawn({
  role: 'worker',
  runtime: 'local',
  config: {
    executor: 'direct',       // or 'docker', 'sandbox'
    timeout: 300
  }
});
```

### 4. Runtime Failover

```typescript
// Configure automatic runtime failover
const agent = await client.agents.spawn({
  role: 'worker',
  runtime: 'pi',
  fallback: {
    runtimes: ['openclaw', 'local'],
    onError: ['rate_limit', 'timeout', 'connection_error'],
    retryOriginal: true       // Retry original runtime after cooldown
  }
});
```

### 5. Runtime-Aware Task Routing

```typescript
const result = await client.intent.execute({
  description: 'Implement feature X',
  routing: {
    // Route complex tasks to Pi
    complexTasks: { runtime: 'pi', model: 'claude-opus-4' },
    // Route simple tasks to Local
    simpleTasks: { runtime: 'local' },
    // Route API-heavy tasks to OpenClaw
    apiTasks: { runtime: 'openclaw', model: 'gpt-4o' }
  }
});
```

## Runtime Capabilities

```typescript
// Query runtime capabilities
const capabilities = await client.runtimes.capabilities();

console.log(capabilities);
// {
//   pi: {
//     models: ['claude-opus-4', 'claude-sonnet-4-5', 'gpt-4o', ...],
//     features: ['tree_sessions', 'model_cycling', 'multi_provider'],
//     maxTokens: 200000
//   },
//   openclaw: {
//     models: ['gpt-4o', 'gpt-4-turbo', ...],
//     features: ['tool_use', 'streaming'],
//     maxTokens: 128000
//   },
//   local: {
//     models: ['local-model'],
//     features: ['fast_execution', 'no_api_cost'],
//     maxTokens: null
//   }
// }
```

## Best Practices

1. **Use Pi for**: Complex reasoning, exploration, multi-step tasks
2. **Use OpenClaw for**: Tool-heavy workflows, ecosystem integration
3. **Use Local for**: Quick tasks, CI/CD, cost-sensitive operations
4. **Always set fallbacks** for production workloads

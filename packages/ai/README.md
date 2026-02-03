# @dash/ai

Unified LLM API for Dash with swarm-specific features and provider failover.

## Overview

This package wraps [pi-mono's](https://github.com/badlogic/pi-mono) unified LLM API (`@mariozechner/pi-ai`) with Dash-specific features:

- **Cost-optimized model selection** for swarm tasks
- **Automatic provider failover** for high availability
- **Budget-aware model resolution** integrated with Dash's budget system
- **Multi-provider swarm support** for redundancy and load balancing

## Installation

```bash
npm install @dash/ai
```

## Quick Start

```typescript
import { 
  getSwarmModel, 
  completeWithFailover,
  streamWithFailover 
} from '@dash/ai';

// Get the best model for a coding task
const model = getSwarmModel('coding', {
  preferredProviders: ['anthropic', 'openai'],
  budgetLimit: 0.01  // $0.01 per request
});

// Complete with automatic failover and cost tracking
const result = await completeWithFailover(model, context, {
  enableFailover: true,
  enableCostTracking: true,
  agentId: 'agent-1',
  swarmId: 'swarm-1',
});

console.log(`Success with provider: ${result.successfulProvider}`);
console.log(`Cost: $${result.costStatus?.totalCost.toFixed(4)}`);
```

## API Reference

### Model Selection

#### `getSwarmModel(taskType, options)`

Get the best model for a specific task type.

```typescript
import { getSwarmModel } from '@dash/ai';

const model = getSwarmModel('coding', {
  preferredProviders: ['anthropic', 'openai'],
  budgetLimit: 0.01,
  requiredCapabilities: ['thinking'],
});
```

**Task Types:**
- `coding` - Code generation and refactoring
- `reasoning` - Complex reasoning tasks
- `summarization` - Text summarization
- `chat` - General conversation
- `analysis` - Data analysis
- `creative` - Creative writing
- `classification` - Classification tasks
- `extraction` - Information extraction
- `planning` - Task planning
- `review` - Code review

### Streaming with Failover

#### `streamWithFailover(model, context, options)`

Stream responses with automatic provider failover.

```typescript
const { stream, result } = await streamWithFailover(model, context, {
  enableFailover: true,
  failoverConfig: {
    primaryProvider: 'anthropic',
    backupProviders: ['openai', 'google'],
    strategy: FailoverStrategy.SEQUENTIAL,
    maxRetriesPerProvider: 2,
  },
});

// Process stream events
for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

// Get final result
const final = await result;
console.log(`Used provider: ${final.successfulProvider}`);
console.log(`Attempts: ${final.attempts.length}`);
```

### Completion with Failover

#### `completeWithFailover(model, context, options)`

Complete a request with automatic failover.

```typescript
const result = await completeWithFailover(model, context, {
  enableFailover: true,
  enableCostTracking: true,
});

console.log(result.message.content);
```

### Multi-Provider Swarm

#### `createMultiProviderSwarm(config)`

Create a swarm distributed across multiple providers.

```typescript
import { createMultiProviderSwarm } from '@dash/ai';

const swarm = createMultiProviderSwarm({
  agentCount: 6,
  taskType: 'coding',
  distributionStrategy: 'round_robin',
  preferredProviders: ['anthropic', 'openai', 'google'],
  budgetPerAgent: 5.0,
  enableFailover: true,
});

// swarm.agents = [
//   { agentId: 'swarm_xxx_agent_1', provider: 'anthropic', ... },
//   { agentId: 'swarm_xxx_agent_2', provider: 'openai', ... },
//   { agentId: 'swarm_xxx_agent_3', provider: 'google', ... },
//   ...
// ]
```

**Distribution Strategies:**
- `round_robin` - Distribute evenly across providers
- `weighted` - Distribute based on provider weights
- `performance_based` - Use best performing provider

### Cost Tracking

```typescript
import { CostTracker } from '@dash/ai';

const tracker = new CostTracker({
  budgetLimit: 100.0,
  warningThreshold: 0.75,  // Alert at 75%
  stopThreshold: 0.95,     // Stop at 95%
  onWarning: (status) => console.log('Warning:', status),
  onStop: (status) => console.log('Budget exceeded!'),
});

// Record cost after completion
await tracker.recordCost(model, message.usage, {
  agentId: 'agent-1',
  swarmId: 'swarm-1',
});

// Get cost report
const report = tracker.exportReport();
console.log(`Total cost: $${report.summary.totalCost.toFixed(2)}`);
```

### Provider Failover Configuration

```typescript
import { ProviderFailover, FailoverStrategy } from '@dash/ai';

const failover = new ProviderFailover({
  primaryProvider: 'anthropic',
  backupProviders: ['openai', 'google'],
  strategy: FailoverStrategy.BEST_PERFORMANCE,
  maxRetriesPerProvider: 2,
  retryDelayMs: 1000,
  providerTimeoutMs: 30000,
  trackHealth: true,
  healthThreshold: 0.8,  // Mark unhealthy below 80% success
});

// Check provider health
const health = failover.getProviderHealth();
console.log(health.map(h => `${h.provider}: ${h.successRate}%`));
```

## Re-exports from pi-mono

This package re-exports all functionality from `@mariozechner/pi-ai`:

```typescript
// Core functions
export { stream, complete, streamSimple, completeSimple } from '@dash/ai';

// Model management
export { getModel, getProviders, getModels, calculateCost } from '@dash/ai';

// Types
export type { Model, Api, Context, Usage, AssistantMessage } from '@dash/ai';
```

## Environment Variables

```bash
# Required for provider access
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here

# Optional - for other providers
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

## Advanced Usage

### Custom Model Resolver

```typescript
import { SwarmModelResolver } from '@dash/ai';

const resolver = new SwarmModelResolver();

// Get multiple model options
const models = resolver.resolveModels({
  taskType: 'coding',
  budgetLimit: 0.01,
}, 3);  // Top 3 models

// Try models in order until one succeeds
for (const model of models) {
  try {
    const result = await complete(model, context);
    return result;
  } catch (e) {
    continue;
  }
}
```

### Per-Agent Cost Tracking

```typescript
const swarm = createMultiProviderSwarm({
  agentCount: 5,
  taskType: 'coding',
  distributionStrategy: 'round_robin',
});

const trackers = new Map();

for (const agent of swarm.agents) {
  const tracker = new CostTracker({
    budgetLimit: agent.budgetLimit,
  });
  trackers.set(agent.agentId, tracker);
}

// Track per-agent costs
async function runAgent(agent, context) {
  const tracker = trackers.get(agent.agentId);
  const result = await completeWithFailover(agent.model, context, {
    enableCostTracking: true,
    costTrackingOptions: tracker.options,
  });
  
  return result;
}
```

### Health-Aware Routing

```typescript
import { ProviderFailover, FailoverStrategy } from '@dash/ai';

const failover = new ProviderFailover({
  strategy: FailoverStrategy.BEST_PERFORMANCE,
});

// Periodically check and report health
setInterval(() => {
  const health = failover.getProviderHealth();
  const unhealthy = health.filter(h => !h.isHealthy);
  
  if (unhealthy.length > 0) {
    console.warn('Unhealthy providers:', unhealthy.map(h => h.provider));
  }
}, 60000);
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm test -- provider-failover.test.ts
```

## License

MIT

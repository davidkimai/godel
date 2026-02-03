# Migration Guide: Unified LLM API

This guide helps you migrate from the legacy Dash LLM integration to the new `@dash/ai` unified API.

## Overview

The new `@dash/ai` package provides:
- **Unified provider interface** - Use any LLM provider with the same API
- **Automatic failover** - Switch providers on failure
- **Cost tracking** - Integrated with Dash's budget system
- **Model optimization** - Select best model for task type

## Migration Steps

### 1. Update Imports

**Before:**
```typescript
// Direct OpenClaw integration
import { OpenClawCore, getOpenClawCore } from '../core/openclaw';
import { MessageBus } from '../bus/index';
```

**After:**
```typescript
// Unified LLM API
import { 
  getSwarmModel, 
  completeWithFailover,
  streamWithFailover,
  createMultiProviderSwarm,
} from '@dash/ai';
```

### 2. Model Selection

**Before:**
```typescript
// Hardcoded model strings
const model = 'claude-sonnet-4-5';
const provider = 'anthropic';
```

**After:**
```typescript
// Task-based model selection
const model = getSwarmModel('coding', {
  preferredProviders: ['anthropic', 'openai'],
  budgetLimit: 0.01,
});
// model.provider, model.id automatically set
```

### 3. Making Requests

**Before:**
```typescript
// Through OpenClaw session
const sessionId = await openclaw.spawnSession({
  agentId: 'agent-1',
  model: 'claude-sonnet-4-5',
  task: 'Generate code',
});

await openclaw.sessionsSend(sessionId, 'Hello');
```

**After:**
```typescript
// Direct LLM API with failover
const result = await completeWithFailover(model, {
  messages: [
    { role: 'user', content: 'Generate code', timestamp: Date.now() }
  ],
}, {
  enableFailover: true,
  enableCostTracking: true,
  agentId: 'agent-1',
});

console.log(result.message.content);
```

### 4. Streaming Responses

**Before:**
```typescript
// Through OpenClaw events
openclaw.onAgentEvent((payload) => {
  if (payload.status === 'streaming') {
    console.log(payload.delta);
  }
});
```

**After:**
```typescript
// Native streaming with failover
const { stream, result } = await streamWithFailover(model, context, {
  enableFailover: true,
});

for await (const event of stream) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'toolcall_start':
      console.log('Tool called:', event.partial.content);
      break;
  }
}

const final = await result;
```

### 5. Multi-Provider Swarms

**Before:**
```typescript
// Manual provider assignment
const agents = [
  { id: 'agent-1', model: 'claude-sonnet', provider: 'anthropic' },
  { id: 'agent-2', model: 'gpt-4', provider: 'openai' },
  // Manual config for each...
];
```

**After:**
```typescript
// Automatic distribution
const swarm = createMultiProviderSwarm({
  agentCount: 6,
  taskType: 'coding',
  distributionStrategy: 'round_robin',
  preferredProviders: ['anthropic', 'openai', 'google'],
  enableFailover: true,
});

// swarm.agents automatically configured
```

### 6. Cost Tracking

**Before:**
```typescript
// Manual through budget controller
budgetController.recordSpend(estimatedCost);
```

**After:**
```typescript
// Automatic with per-request tracking
const result = await completeWithFailover(model, context, {
  enableCostTracking: true,
  agentId: 'agent-1',
  swarmId: swarm.swarmId,
});

// Cost automatically recorded
console.log(`Cost: $${result.costStatus?.totalCost.toFixed(4)}`);
```

### 7. Error Handling

**Before:**
```typescript
try {
  await openclaw.sessionsSend(sessionId, message);
} catch (error) {
  // Handle OpenClaw error
  if (error.code === 'TIMEOUT') {
    // Retry manually
  }
}
```

**After:**
```typescript
import { ProviderFailoverError } from '@dash/ai';

try {
  const result = await completeWithFailover(model, context, {
    enableFailover: true,
  });
} catch (error) {
  if (error instanceof ProviderFailoverError) {
    // All providers failed
    console.log('Attempts:', error.attempts);
    
    // Check which providers were tried
    for (const attempt of error.attempts) {
      console.log(`${attempt.provider}: ${attempt.success ? 'success' : 'failed'}`);
    }
  }
}
```

## Backward Compatibility

The legacy OpenClaw integration remains available. You can gradually migrate:

```typescript
// Mix old and new during migration
import { getOpenClawCore } from '../core/openclaw';
import { getSwarmModel, completeWithFailover } from '@dash/ai';

// Old way still works
const openclaw = getOpenClawCore(messageBus);

// New way for specific use cases
const model = getSwarmModel('coding');
const result = await completeWithFailover(model, context);
```

## Environment Variables

The new package uses the same environment variables as before:

```bash
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
GOOGLE_API_KEY=your_key
```

No changes needed to your `.env` file.

## Testing Migration

1. **Start with new code paths:**
   ```typescript
   const useNewAPI = process.env.USE_NEW_LLM_API === 'true';
   
   if (useNewAPI) {
     result = await completeWithFailover(model, context);
   } else {
     result = await legacyOpenClawMethod();
   }
   ```

2. **Gradually increase new API usage:**
   - Start with non-critical agents
   - Monitor cost and performance
   - Roll out to all agents

3. **Remove legacy code:**
   - Once fully migrated, remove feature flags
   - Clean up legacy OpenClaw usage

## Performance Considerations

### Caching

The new API includes model caching:

```typescript
import { SwarmModelResolver } from '@dash/ai';

const resolver = new SwarmModelResolver();

// First call - resolves and caches
const model1 = resolver.resolveModel({ taskType: 'coding' });

// Second call - returns cached result
const model2 = resolver.resolveModel({ taskType: 'coding' });

// Clear cache if needed
resolver.clearCache();
```

### Health Tracking

Failover health data persists for the lifetime of the `ProviderFailover` instance:

```typescript
const failover = new ProviderFailover();

// Health improves over time as successful requests are recorded
const health = failover.getProviderHealth();
```

## Troubleshooting

### Provider Not Available

```typescript
// Check available providers
import { getProviders } from '@dash/ai';

const providers = getProviders();
console.log('Available:', providers);
```

### Model Not Found

```typescript
// List available models for a provider
import { getModels } from '@dash/ai';

const models = getModels('anthropic');
console.log('Available models:', models.map(m => m.id));
```

### Budget Alerts

```typescript
const tracker = new CostTracker({
  budgetLimit: 10.0,
  onWarning: (status) => {
    console.warn(`Budget at ${status.percentUsed * 100}%`);
  },
  onStop: (status) => {
    console.error('Budget exceeded! Stopping...');
    process.exit(1);
  },
});
```

## Full Example

```typescript
import { 
  getSwarmModel, 
  completeWithFailover,
  createMultiProviderSwarm,
  CostTracker,
} from '@dash/ai';

async function main() {
  // Create a multi-provider swarm
  const swarm = createMultiProviderSwarm({
    agentCount: 3,
    taskType: 'coding',
    distributionStrategy: 'round_robin',
    preferredProviders: ['anthropic', 'openai'],
    budgetPerAgent: 5.0,
    enableFailover: true,
  });

  // Track costs for the entire swarm
  const tracker = new CostTracker({
    budgetLimit: 15.0,
    onWarning: (s) => console.warn(`Budget: ${s.percentUsed * 100}%`),
  });

  // Run agents
  for (const agent of swarm.agents) {
    const result = await completeWithFailover(agent.model, {
      messages: [{
        role: 'user',
        content: 'Write a function to calculate factorial',
        timestamp: Date.now(),
      }],
    }, {
      enableFailover: true,
      enableCostTracking: true,
      costTrackingOptions: tracker.options,
      agentId: agent.agentId,
      swarmId: swarm.swarmId,
    });

    console.log(`${agent.agentId} (${result.successfulProvider}):`);
    console.log(result.message.content);
  }

  // Final cost report
  const report = tracker.exportReport();
  console.log(`\nTotal cost: $${report.summary.totalCost.toFixed(2)}`);
  console.log(`By provider:`, report.byProvider.map(p => 
    `${p.provider}: $${p.totalCost.toFixed(2)}`
  ).join(', '));
}

main().catch(console.error);
```

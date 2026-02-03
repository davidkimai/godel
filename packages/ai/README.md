# @dash/ai

Unified LLM API for Dash with provider failover and swarm-aware model selection.

## Installation

```bash
npm install @dash/ai
```

## Usage

```typescript
import { getModel, stream, complete, SwarmModelResolver } from '@dash/ai';

// Get a model
const model = getModel('anthropic', 'claude-sonnet-4-5');

// Stream with automatic failover
const response = await stream(model, {
  messages: [{ role: 'user', content: 'Hello!' }]
}, {
  failoverProviders: ['openai', 'google'],
  onUsage: (usage) => console.log(`Cost: $${usage.cost.total}`)
});

// Swarm-aware model selection
const resolver = new SwarmModelResolver(50, ['anthropic', 'openai']);
const bestModel = resolver.resolveForTask('reasoning', 10000);
```

## Features

- **Multi-provider support**: Anthropic, OpenAI, Google, Moonshot, Ollama
- **Automatic failover**: Try backup providers if primary fails
- **Cost optimization**: Budget-aware model selection
- **Swarm integration**: Model resolution optimized for swarm workloads

## API

### `getModel(provider, modelId)`
Get a model by provider and ID.

### `stream(model, context, options)`
Stream a response with automatic failover.

### `complete(model, context, options)`
Non-streaming completion with failover.

### `SwarmModelResolver`
Intelligent model selection for swarm workloads.

## License

MIT

# @dash/client

Official JavaScript/TypeScript SDK for the Dash platform - manage swarms, agents, and events with a simple, type-safe API.

## Installation

```bash
npm install @dash/client
# or
yarn add @dash/client
# or
pnpm add @dash/client
```

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0+ (for TypeScript projects)

## Quick Start

```typescript
import { DashClient } from '@dash/client';

// Initialize the client
const client = new DashClient({
  apiUrl: 'https://api.dash.io',
  apiKey: process.env.DASH_API_KEY!,
});

// List all swarms
const swarms = await client.swarms.list();
console.log(`You have ${swarms.total} swarms`);

// Create a new swarm
const swarm = await client.swarms.create({
  name: 'my-processing-swarm',
  config: {
    agentImage: 'dash/agent:latest',
    scalingPolicy: {
      minAgents: 2,
      maxAgents: 10,
    },
  },
});

// Scale the swarm
await client.swarms.scale(swarm.id, { targetAgentCount: 5 });

// Clean up
await client.swarms.delete(swarm.id);
```

## Configuration

### Client Options

```typescript
const client = new DashClient({
  apiUrl: 'https://api.dash.io',     // Required: API base URL
  apiKey: 'your-api-key',            // Required: Authentication key
  apiVersion: 'v1',                  // Optional: API version (default: v1)
  timeout: 30000,                    // Optional: Request timeout in ms (default: 30000)
  maxRetries: 3,                     // Optional: Max retry attempts (default: 3)
  retryDelay: 1000,                  // Optional: Base retry delay in ms (default: 1000)
  retryOnNetworkError: true,         // Optional: Retry on network errors (default: true)
  headers: {                         // Optional: Custom headers
    'X-Custom-Header': 'value',
  },
});
```

### Environment Variables

```bash
export DASH_API_URL=https://api.dash.io
export DASH_API_KEY=your-api-key
```

```typescript
const client = new DashClient({
  apiUrl: process.env.DASH_API_URL!,
  apiKey: process.env.DASH_API_KEY!,
});
```

## API Documentation

### Swarms

Swarms are groups of agents that work together. They can auto-scale based on load.

#### Create a Swarm

```typescript
const swarm = await client.swarms.create({
  name: 'processing-swarm',
  description: 'Handles data processing tasks',
  config: {
    agentImage: 'dash/agent:v1.0.0',
    agentVersion: 'v1.0.0',
    env: {
      LOG_LEVEL: 'info',
    },
    resources: {
      cpu: '1',
      memory: '2Gi',
    },
    scalingPolicy: {
      minAgents: 2,
      maxAgents: 20,
      targetCpuUtilization: 70,
      scaleUpCooldown: 60,
      scaleDownCooldown: 300,
    },
  },
  initialAgentCount: 3,
  tags: ['production', 'processing'],
});
```

#### List Swarms

```typescript
// All swarms (paginated)
const swarms = await client.swarms.list();

// With pagination
const page2 = await client.swarms.list({ page: 2, limit: 20 });

// Sorted
const sorted = await client.swarms.list({
  sortBy: 'createdAt',
  sortOrder: 'desc',
});
```

#### Get a Swarm

```typescript
const swarm = await client.swarms.get('swarm-123');
console.log(`Status: ${swarm.status}`);
console.log(`Running agents: ${swarm.metrics.runningAgents}`);
```

#### Update a Swarm

```typescript
const updated = await client.swarms.update('swarm-123', {
  name: 'new-name',
  description: 'Updated description',
  config: {
    scalingPolicy: {
      minAgents: 5,
      maxAgents: 50,
    },
  },
});
```

#### Scale a Swarm

```typescript
// Scale to specific count
await client.swarms.scale('swarm-123', {
  targetAgentCount: 10,
});

// Scale and wait for completion
await client.swarms.scale('swarm-123', {
  targetAgentCount: 20,
  wait: true,
  timeout: 120,
});
```

#### Delete a Swarm

```typescript
// Normal delete
await client.swarms.delete('swarm-123');

// Force delete (kills all agents)
await client.swarms.delete('swarm-123', { force: true });
```

### Agents

Agents are individual worker instances that execute tasks.

#### Spawn an Agent

```typescript
// Standalone agent
const agent = await client.agents.spawn({
  name: 'my-agent',
  config: {
    image: 'dash/agent:v1.0.0',
    resources: {
      cpu: '1',
      memory: '2Gi',
    },
    capabilities: {
      canExecute: true,
      canAccessFilesystem: true,
    },
  },
});

// Agent in a swarm
const agent = await client.agents.spawn({
  swarmId: 'swarm-123',
  config: {
    image: 'dash/agent:v1.0.0',
  },
  wait: true,
  timeout: 60,
});
```

#### List Agents

```typescript
// All agents
const agents = await client.agents.list();

// Filter by swarm
const swarmAgents = await client.agents.list({ swarmId: 'swarm-123' });

// Filter by status
const running = await client.agents.list({ status: 'running' });
```

#### Get Agent Logs

```typescript
// Get last 100 lines
const logs = await client.agents.getLogs('agent-123', { tail: 100 });

// Get logs from time range
const logs = await client.agents.getLogs('agent-123', {
  since: new Date(Date.now() - 3600000).toISOString(),
});

// Print logs
logs.forEach(log => {
  console.log(`[${log.level}] ${log.message}`);
});
```

#### Assign Tasks

```typescript
// Assign to specific agent
const task = await client.agents.assignTask('agent-123', {
  config: {
    type: 'process-data',
    payload: { url: 'https://example.com/data.csv' },
    timeout: 300,
    priority: 5,
  },
});

// Auto-assign to any available agent in swarm
const task = await client.agents.assignTask(undefined, {
  swarmId: 'swarm-123',
  config: { type: 'distributed-task', payload: data },
});

// Wait for task completion
const completedTask = await client.agents.assignTask('agent-123', {
  config: { type: 'quick-task', payload: {} },
  wait: true,
  timeout: 60,
});
console.log('Result:', completedTask.result);
```

#### Kill an Agent

```typescript
// Graceful shutdown
await client.agents.kill('agent-123');

// Force kill
await client.agents.kill('agent-123', { force: true });

// Custom grace period
await client.agents.kill('agent-123', { gracePeriod: 30 });
```

### Events

Events track system activity, errors, and state changes.

#### List Events

```typescript
// All events (paginated)
const events = await client.events.list();

// Filter by severity
const errors = await client.events.list({
  severities: ['error', 'critical'],
});

// Filter by type and time
const recent = await client.events.list({
  types: ['agent.crashed', 'task.failed'],
  startTime: new Date(Date.now() - 3600000).toISOString(),
});

// Filter by source
const swarmEvents = await client.events.list({
  sourceType: 'swarm',
  sourceId: 'swarm-123',
});
```

#### Subscribe to Real-time Events

```typescript
// Subscribe to agent events
const sub = await client.events.subscribe(
  { sourceType: 'agent' },
  (event) => {
    console.log(`Event: ${event.title}`);
  }
);

// Subscribe to critical errors
const errorSub = await client.events.subscribe(
  { severities: ['error', 'critical'] },
  (event) => {
    console.error('CRITICAL:', event);
    // Send alert, etc.
  }
);

// Unsubscribe when done
await client.events.unsubscribe(sub.id);
```

#### Webhook Subscriptions

```typescript
// Create webhook
const webhook = await client.events.createWebhook(
  { types: ['task.completed', 'task.failed'] },
  'https://my-app.com/webhooks/dash',
  { name: 'Task Webhook' }
);

// List webhooks
const webhooks = await client.events.listWebhooks();

// Delete webhook
await client.events.deleteWebhook(webhook.id);
```

## Error Handling

The SDK throws typed errors for different failure scenarios:

```typescript
import {
  DashClient,
  NotFoundError,
  ValidationError,
  RateLimitError,
  AuthenticationError,
} from '@dash/client';

try {
  const swarm = await client.swarms.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Swarm not found');
  } else if (error instanceof ValidationError) {
    console.log('Invalid request:', error.validationErrors);
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${error.retryAfter}s`);
    await sleep(error.retryAfter * 1000);
  } else if (error instanceof AuthenticationError) {
    console.log('Check your API key');
  } else {
    console.log('Unknown error:', error);
  }
}
```

### Error Types

| Error | Status Code | Description |
|-------|-------------|-------------|
| `DashError` | - | Base error class |
| `AuthenticationError` | 401 | Invalid or expired API key |
| `PermissionError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `ValidationError` | 400 | Invalid request data |
| `ConflictError` | 409 | Resource conflict |
| `RateLimitError` | 429 | Rate limit exceeded |
| `ServerError` | 5xx | Server-side error |
| `NetworkError` | - | Network connectivity issue |
| `TimeoutError` | - | Request timeout |

## Event Listeners

The client emits events for debugging and monitoring:

```typescript
client.on('request', (req) => {
  console.log('Request:', req.method, req.url);
});

client.on('response', (res) => {
  console.log('Response:', res.status);
});

client.on('retry', ({ attempt, delay, error }) => {
  console.log(`Retry ${attempt} after ${delay}ms due to ${error.message}`);
});

client.on('error', (error) => {
  console.error('Client error:', error);
});
```

## License

MIT

## Support

For issues and feature requests, please use the GitHub issue tracker.

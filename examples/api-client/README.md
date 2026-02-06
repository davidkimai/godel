# API Client Examples

Programmatic access to Godel using the JavaScript/TypeScript client library.

## Overview

This example demonstrates how to use the `@godel/client` library to interact with Godel programmatically from your applications.

## Files

- `src/` - Example code
  - `basic-usage.ts` - Basic API client usage
  - `swarm-management.ts` - Swarm lifecycle management
  - `workflow-execution.ts` - Running workflows
  - `event-streaming.ts` - Real-time event handling
  - `batch-operations.ts` - Bulk operations
- `test/` - Integration tests
- `README.md` - This file

## Quick Start

### 1. Install Client

```bash
npm install @godel/client
# or
yarn add @godel/client
```

### 2. Basic Client Setup

```typescript
import { GodelClient } from '@godel/client';

const client = new GodelClient({
  baseUrl: process.env.GODEL_API_URL || 'http://localhost:3000',
  apiKey: process.env.GODEL_API_KEY,
});

// Check health
const health = await client.health.check();
console.log('Godel is healthy:', health.status);
```

## Examples

### Agent Management

```typescript
import { GodelClient } from '@godel/client';

const client = new GodelClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
});

// List agents
const agents = await client.agents.list();
console.log('Active agents:', agents);

// Spawn an agent
const agent = await client.agents.spawn({
  task: 'Implement user authentication',
  model: 'kimi-k2.5',
  timeout: 600000,
});

console.log('Agent spawned:', agent.id);

// Get agent status
const status = await client.agents.getStatus(agent.id);
console.log('Agent status:', status);

// Kill an agent
await client.agents.kill(agent.id);
```

### Swarm Management

```typescript
// Create a swarm
const swarm = await client.swarms.create({
  name: 'code-review-swarm',
  task: 'Review codebase for security issues',
  initialAgents: 5,
  maxAgents: 20,
  strategy: 'parallel',
  budget: {
    amount: 50.00,
    currency: 'USD',
  },
});

console.log('Swarm created:', swarm.id);

// List swarms
const swarms = await client.swarms.list();
console.log('Active swarms:', swarms.length);

// Get swarm status
const status = await client.swarms.getStatus(swarm.id);
console.log('Swarm status:', status);

// Wait for swarm completion
const result = await client.swarms.waitForCompletion(swarm.id, {
  timeout: 300000,
  pollInterval: 5000,
});

console.log('Swarm completed:', result.status);

// Destroy swarm
await client.swarms.destroy(swarm.id);
```

### Workflow Execution

```typescript
import { GodelClient, Workflow } from '@godel/client';

const client = new GodelClient({
  baseUrl: 'http://localhost:3000',
});

// Load and run workflow
const workflow = await Workflow.loadFromFile('./workflows/data-pipeline.yaml');

const execution = await client.workflows.execute(workflow, {
  variables: {
    sourceUrl: 'https://api.example.com/data',
    batchSize: 1000,
    enableAnalytics: true,
  },
});

console.log('Workflow started:', execution.id);

// Monitor execution
const result = await client.workflows.waitForCompletion(execution.id);
console.log('Workflow result:', result.status);

// Get execution details
const details = await client.workflows.get(execution.id);
console.log('Execution details:', details);

// Cancel workflow
await client.workflows.cancel(execution.id);
```

### Event Streaming

```typescript
import { GodelClient, EventType } from '@godel/client';

const client = new GodelClient({
  baseUrl: 'http://localhost:3000',
});

// Connect to event stream
const stream = await client.events.connect({
  types: [EventType.AgentComplete, EventType.SwarmComplete],
});

console.log('Connected to event stream');

// Handle events
stream.on('event', (event) => {
  console.log('Event received:', event.type, event.data);
});

// Specific event handlers
stream.on('agent:complete', (event) => {
  console.log('Agent completed:', event.data.agentId);
  console.log('Duration:', event.data.durationMs);
  console.log('Cost:', event.data.cost);
});

stream.on('swarm:complete', (event) => {
  console.log('Swarm completed:', event.data.swarmId);
  console.log('Results:', event.data.results);
});

// Subscribe to custom topics
await stream.subscribe('my-custom-topic');

// Disconnect when done
setTimeout(() => {
  stream.disconnect();
}, 60000);
```

### Batch Operations

```typescript
import { GodelClient, BatchOperation } from '@godel/client';

const client = new GodelClient({
  baseUrl: 'http://localhost:3000',
});

// Create batch operation
const batch = new BatchOperation(client, {
  concurrency: 5,  // Max concurrent operations
  retryAttempts: 3,
  retryDelay: 1000,
});

// Queue multiple tasks
const tasks = [
  'Analyze code for security issues',
  'Review documentation',
  'Update tests',
  'Optimize performance',
  'Write API documentation',
];

const results = await batch.execute(
  tasks.map((task) => ({
    type: 'agent',
    config: { task },
  }))
);

console.log('Completed:', results.success.length);
console.log('Failed:', results.failed.length);
```

### Complete Example: CI/CD Integration

```typescript
import { GodelClient } from '@godel/client';

interface CICDConfig {
  apiUrl: string;
  apiKey: string;
  repository: string;
  commitSha: string;
  prNumber?: number;
}

export class GodelCICD {
  private client: GodelClient;

  constructor(config: CICDConfig) {
    this.client = new GodelClient({
      baseUrl: config.apiUrl,
      apiKey: config.apiKey,
    });
  }

  async runCodeReview(): Promise<ReviewResult> {
    const swarm = await this.client.swarms.create({
      name: `review-${Date.now()}`,
      task: `Review code changes in ${this.repository} at ${this.commitSha}`,
      initialAgents: 3,
      strategy: 'parallel',
      budget: { amount: 25, currency: 'USD' },
    });

    const result = await this.client.swarms.waitForCompletion(swarm.id, {
      timeout: 600000,
    });

    return {
      swarmId: swarm.id,
      status: result.status,
      duration: result.durationMs,
      cost: result.cost,
    };
  }

  async runSecurityAudit(): Promise<AuditResult> {
    const workflow = await this.client.workflows.executeFromFile(
      './workflows/security-audit.yaml',
      {
        variables: {
          repo: this.repository,
          ref: this.commitSha,
        },
      }
    );

    const result = await this.client.workflows.waitForCompletion(workflow.id);

    return {
      workflowId: workflow.id,
      status: result.status,
      findings: await this.getFindings(result.id),
    };
  }

  async getFindings(executionId: string) {
    return this.client.workflows.getArtifacts(executionId, 'findings.json');
  }

  async cleanup() {
    // Clean up old swarms/workflows
    const swarms = await this.client.swarms.list({
      status: 'completed',
      olderThan: 7 * 24 * 60 * 60 * 1000,  // 7 days
    });

    for (const swarm of swarms) {
      await this.client.swarms.destroy(swarm.id);
    }
  }
}
```

### Error Handling

```typescript
import { GodelClient, GodelError, ApiError } from '@godel/client';

const client = new GodelClient({
  baseUrl: 'http://localhost:3000',
});

try {
  const agent = await client.agents.spawn({
    task: 'Complex analysis',
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', error.status, error.message);
    console.error('Details:', error.body);
  } else if (error instanceof GodelError) {
    console.error('Godel Error:', error.code, error.message);
  } else {
    console.error('Unknown error:', error);
  }
}

// Using error codes
switch ((error as ApiError).status) {
  case 401:
    // Unauthorized - refresh token
    break;
  case 429:
    // Rate limited - wait and retry
    await sleep(60000);
    break;
  case 503:
    // Service unavailable - retry later
    break;
}
```

### Configuration Reference

```typescript
interface GodelClientConfig {
  /** API base URL */
  baseUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Request timeout in ms */
  timeout?: number;
  
  /** Enable retries */
  retries?: number;
  
  /** Custom fetch implementation */
  fetch?: typeof fetch;
  
  /** Logger instance */
  logger?: Logger;
}

interface ClientOptions {
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  
  /** Request timeout */
  timeout?: number;
  
  /** Enable caching */
  cache?: boolean;
  
  /** Cache TTL in seconds */
  cacheTtl?: number;
}
```

### Complete API Reference

| Method | Description |
|--------|-------------|
| `client.health.check()` | Health check |
| `client.agents.list()` | List all agents |
| `client.agents.spawn(config)` | Spawn new agent |
| `client.agents.getStatus(id)` | Get agent status |
| `client.agents.kill(id)` | Kill agent |
| `client.swarms.list()` | List all swarms |
| `client.swarms.create(config)` | Create swarm |
| `client.swarms.getStatus(id)` | Get swarm status |
| `client.swarms.waitForCompletion(id)` | Wait for completion |
| `client.swarms.destroy(id)` | Destroy swarm |
| `client.workflows.execute(wf, vars)` | Execute workflow |
| `client.workflows.cancel(id)` | Cancel workflow |
| `client.events.connect(opts)` | Connect to event stream |
| `client.budget.getStatus()` | Get budget status |
| `client.quality.run()` | Run quality checks |

## Testing

```typescript
// test/api-client.test.ts
import { GodelClient } from '../src';
import { MockServer } from './utils/mock-server';

describe('GodelClient', () => {
  let server: MockServer;
  let client: GodelClient;

  beforeAll(async () => {
    server = new MockServer(3001);
    server.start();
    client = new GodelClient({
      baseUrl: 'http://localhost:3001',
    });
  });

  afterAll(() => {
    server.stop();
  });

  describe('agents', () => {
    it('should list agents', async () => {
      const agents = await client.agents.list();
      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should spawn agent', async () => {
      const agent = await client.agents.spawn({
        task: 'Test task',
      });
      expect(agent.id).toBeDefined();
    });
  });
});
```

## Next Steps

- See [Webhook Integration](../webhook-integration/)
- Learn about [Custom Agents](../custom-agent/)
- Review [CI/CD Integration](../ci-cd-integration/)

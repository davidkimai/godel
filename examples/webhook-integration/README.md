# Webhook Integration

Receive real-time notifications and events via webhooks from Dash.

## Overview

This example demonstrates how to set up webhooks to receive real-time events from Dash, including configuration, security, and common use cases.

## Files

- `server/` - Example webhook server implementations
  - `express-server.ts` - Express.js webhook receiver
  - `fastify-server.ts` - Fastify webhook receiver
  - `lambda-handler.ts` - AWS Lambda handler
- `scripts/` - Testing and verification scripts
- `README.md` - This file

## Quick Start

### 1. Configure Webhook in Dash

```bash
# Set webhook URL
dash config set WEBHOOK_URL https://your-server.com/webhooks/dash

# Set webhook secret (for signature verification)
dash config set WEBHOOK_SECRET your-webhook-secret

# Enable specific events
dash config set WEBHOOK_EVENTS "agent:complete,swarm:complete,workflow:complete"
```

### 2. Start Webhook Server

```bash
# Using the example server
npx ts-node server/express-server.ts
```

## Webhook Events

### Available Events

| Event | Description | Payload |
|-------|-------------|---------|
| `agent:start` | Agent started working | `{ agentId, task, model }` |
| `agent:complete` | Agent completed task | `{ agentId, result, durationMs, cost }` |
| `agent:error` | Agent encountered error | `{ agentId, error, stack }` |
| `swarm:start` | Swarm started | `{ swarmId, name, agentCount }` |
| `swarm:complete` | Swarm completed | `{ swarmId, results, totalCost }` |
| `swarm:progress` | Swarm progress update | `{ swarmId, progress }` |
| `workflow:start` | Workflow started | `{ workflowId, name }` |
| `workflow:complete` | Workflow completed | `{ workflowId, status, durationMs }` |
| `workflow:step:complete` | Workflow step completed | `{ workflowId, stepId, output }` |
| `budget:warning` | Budget threshold warning | `{ current, limit, percentage }` |
| `budget:exceeded` | Budget exceeded | `{ current, limit }` |
| `safety:block` | Safety action blocked | `{ action, reason, agentId }` |

### Event Payload Structure

```typescript
interface WebhookEvent {
  /** Unique event ID */
  id: string;
  
  /** Event type */
  type: string;
  
  /** Timestamp of event */
  timestamp: string;
  
  /** Event payload data */
  data: Record<string, unknown>;
  
  /** Webhook that triggered this event */
  webhookId: string;
  
  /** Dash instance ID */
  instanceId: string;
}
```

## Express.js Implementation

```typescript
// server/express-server.ts
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

// Verify webhook signature
function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

// Webhook endpoint
app.post('/webhooks/dash', (req: Request, res: Response) => {
  const signature = req.headers['x-dash-signature'] as string;
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  
  console.log(`Received event: ${event.type}`);
  
  // Handle different event types
  switch (event.type) {
    case 'agent:complete':
      handleAgentComplete(event.data);
      break;
    case 'swarm:complete':
      handleSwarmComplete(event.data);
      break;
    case 'workflow:complete':
      handleWorkflowComplete(event.data);
      break;
    case 'budget:warning':
      handleBudgetWarning(event.data);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
  
  // Respond quickly (acknowledge receipt)
  res.status(200).json({ received: true });
});

function handleAgentComplete(data: any) {
  console.log(`Agent ${data.agentId} completed in ${data.durationMs}ms`);
  console.log(`Cost: $${data.cost}`);
  console.log(`Result: ${data.result}`);
}

function handleSwarmComplete(data: any) {
  console.log(`Swarm ${data.swarmId} completed`);
  console.log(`Total agents: ${data.agentCount}`);
  console.log(`Total cost: $${data.totalCost}`);
}

function handleWorkflowComplete(data: any) {
  console.log(`Workflow ${data.workflowId} completed with status: ${data.status}`);
}

function handleBudgetWarning(data: any) {
  console.log(`Budget warning: ${data.percentage}% used ($${data.current}/$${data.limit})`);
  
  // Send alert
  sendAlert(`Budget usage at ${data.percentage}%`);
}

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Webhook error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});

function sendAlert(message: string) {
  // Implement your alerting logic here
  console.log('ALERT:', message);
}
```

## Fastify Implementation

```typescript
// server/fastify-server.ts
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';

const fastify = Fastify({ logger: true });

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

// Webhook schema for validation
const webhookSchema = {
  body: {
    type: 'object',
    required: ['id', 'type', 'timestamp', 'data'],
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      data: { type: 'object' },
    },
  },
};

// Register webhook route
fastify.post<{ Body: any }>('/webhooks/dash', {
  schema: webhookSchema,
  preHandler: async (request, reply) => {
    const signature = request.headers['x-dash-signature'] as string;
    
    if (!signature) {
      reply.status(401).send({ error: 'Missing signature' });
      return;
    }
    
    const payload = JSON.stringify(request.body);
    
    if (!verifySignature(payload, signature)) {
      reply.status(401).send({ error: 'Invalid signature' });
      return;
    }
  },
}, async (request, reply) => {
  const event = request.body;
  
  request.log.info(`Received event: ${event.type}`);
  
  // Process event asynchronously
  processEvent(event).catch((err) => {
    request.log.error(err, 'Error processing event');
  });
  
  return { received: true };
});

function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

async function processEvent(event: any) {
  switch (event.type) {
    case 'agent:complete':
      // Handle agent completion
      break;
    case 'swarm:complete':
      // Handle swarm completion
      break;
    // ... other events
  }
}

start();

async function start() {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
```

## AWS Lambda Handler

```typescript
// server/lambda-handler.ts
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  try {
    // Verify signature
    const signature = event.headers['X-Dash-Signature'] || 
                     event.headers['x-dash-signature'];
    
    if (!signature) {
      return { statusCode: 401, body: 'Missing signature' };
    }
    
    const payload = event.body || '';
    
    if (!verifySignature(payload, signature)) {
      return { statusCode: 401, body: 'Invalid signature' };
    }
    
    const webhookEvent = JSON.parse(payload);
    
    // Process event
    await processEvent(webhookEvent);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      body: 'Internal server error',
    };
  }
};

function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${expected}`;
}

async function processEvent(event: any) {
  // Process based on event type
  console.log(`Processing event: ${event.type}`);
  
  // Use AWS SDK for notifications
  if (event.type === 'budget:warning') {
    await sendSNSNotification(event.data);
  }
}

async function sendSNSNotification(data: any) {
  const SNS = require('aws-sdk/clients/sns');
  const sns = new SNS();
  
  await sns.publish({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Message: `Budget warning: ${data.percentage}% used`,
  }).promise();
}
```

## Common Use Cases

### Slack Notifications

```typescript
// server/slack-notifier.ts
import { WebhookEvent } from './types';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

export async function sendSlackNotification(event: WebhookEvent): Promise<void> {
  const message = formatSlackMessage(event);
  
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

function formatSlackMessage(event: WebhookEvent) {
  switch (event.type) {
    case 'agent:complete':
      return {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Agent completed*\nTask: ${event.data.task}\nDuration: ${event.data.durationMs}ms`,
            },
          },
        ],
      };
    case 'budget:warning':
      return {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⚠️ *Budget Warning*\nUsage: ${event.data.percentage}%\nCurrent: $${event.data.current}`,
            },
          },
        ],
      };
    default:
      return {
        text: `Event: ${event.type}`,
      };
  }
}
```

### Database Logging

```typescript
// server/db-logger.ts
import { WebhookEvent } from './types';

interface EventLog {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  processedAt: Date;
}

export class EventLogger {
  private db: any;  // Your database client
  
  async logEvent(event: WebhookEvent): Promise<void> {
    const log: EventLog = {
      id: event.id,
      type: event.type,
      timestamp: new Date(event.timestamp),
      data: event.data,
      processedAt: new Date(),
    };
    
    await this.db.events.insert(log);
  }
  
  async getRecentEvents(limit: number = 100) {
    return this.db.events.find().limit(limit).sort({ timestamp: -1 });
  }
  
  async getEventsByType(type: string, since: Date) {
    return this.db.events
      .find({ type, timestamp: { $gte: since } })
      .sort({ timestamp: -1 });
  }
}
```

### Metrics Collection

```typescript
// server/metrics.ts
import { WebhookEvent } from './types';

interface Metrics {
  eventCounts: Record<string, number>;
  totalCost: number;
  agentDurations: number[];
}

const metrics: Metrics = {
  eventCounts: {},
  totalCost: 0,
  agentDurations: [],
};

export function recordMetrics(event: WebhookEvent): void {
  // Count events
  metrics.eventCounts[event.type] = (metrics.eventCounts[event.type] || 0) + 1;
  
  // Track costs
  if (event.data.cost) {
    metrics.totalCost += event.data.cost;
  }
  
  // Track durations
  if (event.data.durationMs) {
    metrics.agentDurations.push(event.data.durationMs);
  }
}

export function getMetrics(): Metrics {
  return {
    ...metrics,
    avgDuration: metrics.agentDurations.length > 0
      ? metrics.agentDurations.reduce((a, b) => a + b, 0) / metrics.agentDurations.length
      : 0,
  };
}

export function resetMetrics(): void {
  metrics.eventCounts = {};
  metrics.totalCost = 0;
  metrics.agentDurations = [];
}
```

## Security Best Practices

### 1. Verify Signatures

Always verify the webhook signature to ensure authenticity:

```typescript
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}
```

### 2. Use HTTPS

Ensure your webhook endpoint uses HTTPS in production.

### 3. Validate Payloads

```typescript
import { z } from 'zod';

const webhookEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.unknown()),
});

export function validateWebhookPayload(payload: unknown) {
  const result = webhookEventSchema.safeParse(payload);
  
  if (!result.success) {
    throw new Error('Invalid payload: ' + result.error.message);
  }
  
  return result.data;
}
```

### 4. Implement Idempotency

Store processed event IDs to prevent duplicate processing:

```typescript
const processedEvents = new Set<string>();

export async function processEvent(event: WebhookEvent): Promise<void> {
  if (processedEvents.has(event.id)) {
    console.log(`Event ${event.id} already processed, skipping`);
    return;
  }
  
  // Process event
  await doProcessing(event);
  
  // Mark as processed
  processedEvents.add(event.id);
  
  // Persist to database for restart recovery
  await db.processedEvents.insert({ id: event.id });
}
```

## Testing Webhooks

### Local Testing with ngrok

```bash
# Install ngrok
brew install ngrok

# Start your webhook server
npm run dev

# Expose localhost to internet
ngrok http 3000

# Copy the ngrok URL and configure it in Dash
# Dash config set WEBHOOK_URL https://your-ngrok-id.ngrok.io/webhooks/dash
```

### Send Test Events

```typescript
// scripts/send-test-event.ts
import fetch from 'node-fetch';
import crypto from 'crypto';

const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

const testEvent = {
  id: 'test-event-' + Date.now(),
  type: 'agent:complete',
  timestamp: new Date().toISOString(),
  data: {
    agentId: 'test-agent-123',
    task: 'Test task',
    durationMs: 5000,
    cost: 0.05,
  },
};

const payload = JSON.stringify(testEvent);
const signature = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Dash-Signature': signature,
  },
  body: payload,
});

console.log('Response status:', response.status);
console.log('Response body:', await response.json());
```

## Configuration

### Dash Webhook Configuration

```bash
# Enable webhooks
export DASH_WEBHOOKS_ENABLED=true

# Set webhook URL
export DASH_WEBHOOK_URL=https://your-server.com/webhooks/dash

# Set webhook secret
export DASH_WEBHOOK_SECRET=your-secret-key

# Enable specific events (comma-separated)
export DASH_WEBHOOK_EVENTS=agent:complete,agent:error,swarm:complete,budget:warning

# Retry failed deliveries
export DASH_WEBHOOK_RETRY_ENABLED=true
export DASH_WEBHOOK_RETRY_MAX_ATTEMPTS=3
export DASH_WEBHOOK_RETRY_DELAY=5000
```

## Next Steps

- Learn about [API Client](../api-client/)
- See [CI/CD Integration](../ci-cd-integration/)
- Review [Architecture Overview](../../docs/ARCHITECTURE.md)

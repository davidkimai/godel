# Task Queue System

Redis-backed task queue with work distribution for Godel.

## Features

- **Priority Queue**: Critical > High > Medium > Low priority levels
- **Delayed Execution**: Schedule tasks for future execution
- **Exponential Backoff**: Automatic retry with configurable delays
- **Dead Letter Queue**: Failed tasks after max retries are preserved for inspection
- **Work Distribution**: Multiple strategies for fair task assignment
- **Progress Tracking**: Real-time task progress updates
- **Prometheus Metrics**: Queue depth, processing times, throughput
- **Redis Streams**: Persistent event stream for external consumers

## Quick Start

```typescript
import { TaskQueue } from '@jtan15010/godel/queue';

const queue = new TaskQueue({
  redis: {
    host: 'localhost',
    port: 6379,
  },
  defaultStrategy: 'load-based',
});

await queue.start();

// Register an agent
await queue.registerAgent({
  id: 'agent-1',
  skills: ['typescript', 'testing'],
  capacity: 5,
});

// Enqueue a task
const task = await queue.enqueue({
  type: 'code-review',
  payload: { file: 'src/index.ts' },
  priority: 'high',
  requiredSkills: ['typescript'],
});

// Agent claims work
const work = await queue.claimTask('agent-1');

// Process task
await queue.startTask(work!.id);
await queue.updateProgress(work!.id, 50, { step: 'analyzing' });
await queue.completeTask(work!.id, { result: 'LGTM' });
```

## Work Distribution Strategies

### Round-Robin
Evenly distributes tasks in circular order across agents.

```typescript
const task = await queue.enqueue({
  type: 'task',
  payload: {},
  routingHint: 'round-robin',
});
```

### Load-Based (Default)
Assigns tasks to the agent with the lowest current load.

```typescript
const task = await queue.enqueue({
  type: 'task',
  payload: {},
  routingHint: 'load-based',
});
```

### Skill-Based
Matches tasks to agents based on required skills.

```typescript
await queue.registerAgent({
  id: 'ts-agent',
  skills: ['typescript', 'react'],
  capacity: 3,
});

const task = await queue.enqueue({
  type: 'frontend-task',
  payload: {},
  requiredSkills: ['typescript', 'react'],
  routingHint: 'skill-based',
});
```

### Sticky Routing
Routes related tasks to the same agent (e.g., same user session).

```typescript
const task = await queue.enqueue({
  type: 'user-task',
  payload: {},
  stickyKey: 'user-123', // All tasks with this key go to same agent
});
```

## Task Lifecycle

```
Pending → Assigned → Processing → Completed
   ↓          ↓           ↓           
Scheduled   Cancelled   Failed → Retried → Dead Letter
```

## Retry Configuration

```typescript
const task = await queue.enqueue({
  type: 'unreliable-task',
  payload: {},
  maxRetries: 5,
  retryDelayMs: 1000, // Base delay, doubles each retry (exponential backoff)
});
```

## Delayed Execution

```typescript
// Execute after delay
const task = await queue.enqueue({
  type: 'delayed-task',
  payload: {},
  delayMs: 60000, // 1 minute
});

// Execute at specific time
const task2 = await queue.enqueue({
  type: 'scheduled-task',
  payload: {},
  scheduledFor: new Date('2026-02-10T09:00:00Z'),
});
```

## Progress Tracking

```typescript
await queue.startTask(taskId);

// Update progress
await queue.updateProgress(taskId, 25, { step: 'downloading' });
await queue.updateProgress(taskId, 50, { step: 'processing' });
await queue.updateProgress(taskId, 75, { step: 'uploading' });

await queue.completeTask(taskId);
```

## Dead Letter Queue

Tasks that exhaust all retries are moved to the dead letter queue:

```typescript
// Get dead letter entries
const deadLetters = await queue.getDeadLetterEntries(100);

// Replay a dead letter task
await queue.replayDeadLetter(taskId);
```

## Metrics

The queue exposes Prometheus-compatible metrics:

```typescript
const metrics = await queue.getMetrics();

console.log(metrics);
// {
//   pendingCount: 10,
//   processingCount: 5,
//   deadLetterCount: 2,
//   tasksCompleted: 100,
//   avgProcessingTimeMs: 1500,
//   p95ProcessingTimeMs: 5000,
//   activeAgents: 10,
// }
```

### Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `dash_queue_depth` | Gauge | Tasks per queue state |
| `dash_queue_tasks_total` | Counter | Tasks processed by status |
| `dash_queue_processing_duration_seconds` | Histogram | Task processing time |
| `dash_queue_retries_total` | Counter | Total retries |
| `dash_queue_dead_letter_total` | Counter | Dead lettered tasks |
| `dash_queue_agent_load` | Gauge | Load per agent |

## Integration with Event Bus

```typescript
import { TaskQueueIntegration } from '@jtan15010/godel/queue';

const integration = new TaskQueueIntegration({
  taskQueue: queue,
  eventBus: messageBus,
  eventRepository: eventRepo,
  enableAutoScaling: true,
  scaleUpThreshold: 10,
});

await integration.initialize();
```

## Configuration

```typescript
const queue = new TaskQueue({
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0,
    keyPrefix: 'godel:queue:',
  },
  
  // Retry settings
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 300000, // 5 minutes
  
  // Timeouts
  defaultTimeoutMs: 300000,
  heartbeatTimeoutMs: 30000,
  
  // Dead letter
  deadLetterEnabled: true,
  deadLetterMaxAgeDays: 7,
  
  // Processing
  pollIntervalMs: 100,
  batchSize: 10,
  
  // Distribution
  defaultStrategy: 'load-based',
});
```

## Events

The queue emits the following events:

| Event | Description |
|-------|-------------|
| `task.enqueued` | Task added to queue |
| `task.assigned` | Task assigned to agent |
| `task.started` | Agent started processing |
| `task.completed` | Task finished successfully |
| `task.failed` | Task failed |
| `task.retried` | Task scheduled for retry |
| `task.cancelled` | Task was cancelled |
| `task.dead_lettered` | Task moved to dead letter |
| `task.progress` | Progress update |
| `agent.registered` | New agent registered |
| `agent.unregistered` | Agent removed |
| `agent.heartbeat` | Agent heartbeat received |
| `queue.scaling_needed` | Queue depth high |

```typescript
queue.onEvent((event) => {
  console.log(`[${event.type}] Task: ${event.taskId}`);
});
```

## API Reference

### TaskQueue

- `enqueue(options)` - Add task to queue
- `dequeue(agentId)` - Get next task for specific agent
- `claimTask(agentId?)` - Claim task using distribution algorithm
- `startTask(taskId)` - Mark task as processing
- `completeTask(taskId, output?)` - Mark task completed
- `failTask(taskId, error)` - Mark task failed (triggers retry)
- `cancelTask(taskId, reason?)` - Cancel task
- `updateProgress(taskId, progress, data?)` - Update progress
- `registerAgent(options)` - Register an agent
- `unregisterAgent(agentId)` - Remove agent
- `agentHeartbeat(agentId)` - Update agent heartbeat
- `getTask(taskId)` - Get task by ID
- `getMetrics()` - Get queue metrics
- `getDeadLetterEntries(limit?)` - Get dead letter queue
- `replayDeadLetter(taskId)` - Retry dead letter task

## Testing

```bash
# Unit tests
npm run test -- --testPathPattern='queue'

# Integration tests (requires Redis)
REDIS_URL=redis://localhost:6379 npm run test -- --testPathPattern='queue'
```

# Event Architecture

The Event Architecture provides granular event streaming for agent execution, enabling real-time monitoring, debugging, and dashboard integration.

## Overview

The event system captures fine-grained events during agent execution:
- **agent_start** / **agent_complete**: Agent lifecycle
- **turn_start** / **turn_end**: LLM interaction turns
- **thinking_start** / **thinking_delta** / **thinking_end**: Thinking/reasoning blocks
- **tool_call_start** / **tool_call_end**: Tool execution
- **text_delta**: Streaming text output
- **error**: Error conditions

## Event Types

### Agent Lifecycle

```typescript
// Agent started
{
  id: 'evt_abc123',
  type: 'agent_start',
  timestamp: 1704067200000,
  agentId: 'agent-123',
  swarmId: 'swarm-456',
  sessionId: 'sess-789',
  task: 'Optimize database queries',
  model: 'kimi-k2.5',
  provider: 'moonshot'
}

// Agent completed
{
  id: 'evt_def456',
  type: 'agent_complete',
  timestamp: 1704067260000,
  agentId: 'agent-123',
  swarmId: 'swarm-456',
  result: 'Optimization complete. Added indexes...',
  totalCost: 0.0234,
  totalTokens: 2340,
  duration: 60000
}
```

### Turn Events

```typescript
// Turn started
{
  id: 'evt_ghi789',
  type: 'turn_start',
  timestamp: 1704067205000,
  agentId: 'agent-123',
  turnId: 'turn-1',
  message: 'How do I optimize this query?'
}

// Turn ended
{
  id: 'evt_jkl012',
  type: 'turn_end',
  timestamp: 1704067210000,
  agentId: 'agent-123',
  turnId: 'turn-1',
  usage: {
    promptTokens: 150,
    completionTokens: 200,
    totalTokens: 350
  },
  cost: 0.0035
}
```

### Thinking Events

```typescript
// Thinking started
{
  id: 'evt_mno345',
  type: 'thinking_start',
  timestamp: 1704067206000,
  agentId: 'agent-123'
}

// Thinking delta (streaming)
{
  id: 'evt_pqr678',
  type: 'thinking_delta',
  timestamp: 1704067206100,
  agentId: 'agent-123',
  delta: 'Let me analyze the query structure...'
}

// Thinking ended
{
  id: 'evt_stu901',
  type: 'thinking_end',
  timestamp: 1704067208000,
  agentId: 'agent-123'
}
```

### Tool Call Events

```typescript
// Tool call started
{
  id: 'evt_vwx234',
  type: 'tool_call_start',
  timestamp: 1704067212000,
  agentId: 'agent-123',
  tool: 'read_file',
  args: { path: '/project/src/db.ts' }
}

// Tool call ended
{
  id: 'evt_yz4567',
  type: 'tool_call_end',
  timestamp: 1704067213000,
  agentId: 'agent-123',
  tool: 'read_file',
  result: { content: '...file contents...' },
  duration: 100,
  success: true
}
```

### Text Delta

```typescript
{
  id: 'evt_890abc',
  type: 'text_delta',
  timestamp: 1704067215000,
  agentId: 'agent-123',
  delta: 'Based on my analysis...'
}
```

### Error Events

```typescript
{
  id: 'evt_def123',
  type: 'error',
  timestamp: 1704067220000,
  agentId: 'agent-123',
  error: {
    message: 'Failed to connect to database',
    code: 'DB_CONNECTION_ERROR',
    stack: 'Error: Failed to connect...'
  }
}
```

## Usage

### Basic Event Bus

```typescript
import { AgentEventBus, getGlobalEventBus } from './core/event-bus';

// Create event bus with persistence
const eventBus = new AgentEventBus({
  persistEvents: true,
  eventsDir: './events'
});

// Or get global instance
const globalBus = getGlobalEventBus();
```

### Subscribing to Events

```typescript
// Subscribe to specific event type
const subscription = eventBus.subscribe('tool_call_start', (event) => {
  console.log(`Tool called: ${event.tool}`);
  console.log(`Args: ${JSON.stringify(event.args)}`);
});

// Subscribe to multiple event types
const sub = eventBus.subscribe(
  ['agent_start', 'agent_complete'],
  (event) => {
    console.log(`Agent event: ${event.type}`);
  }
);

// Subscribe to all events
const allEvents = eventBus.subscribeAll((event) => {
  console.log(`[${event.type}] ${event.agentId}`);
});

// Unsubscribe
eventBus.unsubscribe(subscription);
```

### Filtering Events

```typescript
// Filter by agent
const handler = eventBus.subscribe('text_delta', (event) => {
  console.log(event.delta);
}, (event) => event.agentId === 'agent-123');  // Only agent-123

// Filter by swarm
const swarmHandler = eventBus.subscribeAll((event) => {
  updateDashboard(event);
}, (event) => event.swarmId === 'swarm-456');
```

### Emitting Events

```typescript
// Emit event
eventBus.emit({
  id: createEventId(),
  type: 'agent_start',
  timestamp: Date.now(),
  agentId: 'agent-123',
  task: 'Test task',
  model: 'kimi-k2.5',
  provider: 'moonshot'
});
```

### Scoped Event Bus

The ScopedEventBus pre-fills agentId, swarmId, and sessionId:

```typescript
// Create scoped bus
const scopedBus = eventBus.createScopedBus(
  'agent-123',      // agentId
  'swarm-456',      // swarmId (optional)
  'sess-789'        // sessionId (optional)
);

// Emit events - context is pre-filled
scopedBus.emitAgentStart('Test task', 'kimi-k2.5', 'moonshot');
scopedBus.emitToolCallStart('read_file', { path: '/test' });
scopedBus.emitToolCallEnd('read_file', { content: 'data' }, 100, true);
scopedBus.emitAgentComplete('Done', 0.01, 100, 5000);
```

## Event Persistence

Events are persisted to JSONL files when `persistEvents: true`:

```
events/
  events-2024-01-01T00-00-00-000Z.jsonl
```

File format:
```jsonl
{"id":"evt_abc123","type":"agent_start","timestamp":1704067200000,"agentId":"agent-123",...}
{"id":"evt_def456","type":"tool_call_start","timestamp":1704067201000,"agentId":"agent-123",...}
```

### Retrieving Events

```typescript
// Get recent events
const recent = eventBus.getRecentEvents(100);

// Get events with filters
const events = eventBus.getEvents({
  types: ['tool_call_start', 'tool_call_end'],
  agentId: 'agent-123',
  swarmId: 'swarm-456',
  since: Date.now() - 3600000,  // Last hour
  until: Date.now()
});
```

## Integration with SwarmOrchestrator

```typescript
import { SwarmOrchestrator } from './core/swarm-orchestrator';

// Create swarm with event streaming
const swarm = await orchestrator.create({
  name: 'my-swarm',
  task: 'Build feature',
  initialAgents: 3,
  maxAgents: 5,
  strategy: 'parallel',
  enableEventStreaming: true  // Enable events
});

// Subscribe to swarm events
const { unsubscribe } = orchestrator.subscribeToSwarmEvents(
  swarm.id,
  (event) => {
    console.log(`[${event.type}] ${event.agentId}`);
  }
);

// Get recent events
const events = orchestrator.getSwarmEvents(swarm.id, 50);
```

## Dashboard Integration

### WebSocket Streaming

The dashboard server provides WebSocket streaming:

```javascript
// Client-side
const ws = new WebSocket('ws://localhost:7373/ws');

ws.onopen = () => {
  // Subscribe to swarm events
  ws.send(JSON.stringify({
    type: 'subscribe',
    swarmId: 'swarm-123'
  }));
};

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  
  if (data.type === 'event') {
    updateDashboard(data.event);
  }
};
```

### REST API

```
GET /api/swarms/:id/events?limit=100
GET /api/swarms/:id/events?types=tool_call_start,tool_call_end
```

Response:
```json
{
  "events": [
    {
      "id": "evt_abc123",
      "type": "agent_start",
      "timestamp": 1704067200000,
      "agentId": "agent-123",
      ...
    }
  ]
}
```

## Event Flow

```
Agent Execution
    ↓
ScopedEventBus.emitXXX()
    ↓
AgentEventBus.emit()
    ↓
┌─────────────────────────────────────────┐
│  1. Persist to JSONL (if enabled)       │
│  2. Store in memory log                 │
│  3. Deliver to subscribers              │
│  4. Broadcast via WebSocket             │
└─────────────────────────────────────────┘
    ↓
Dashboard / Loggers / Monitors
```

## Performance

- Event emission: O(subscribers) - typically small
- Persistence: O(1) append
- Memory: Circular buffer (configurable size)
- Filtering: O(1) per subscriber

## Configuration

```typescript
interface EventBusConfig {
  persistEvents?: boolean;      // Default: false
  eventsDir?: string;           // Default: ./events
  maxListeners?: number;        // Default: 1000
  syncDelivery?: boolean;       // Default: false (async)
}
```

## Metrics

```typescript
const metrics = eventBus.getMetrics();
console.log(metrics);
// {
//   eventsEmitted: 1500,
//   eventsDelivered: 4500,  // ×3 subscribers
//   subscriptionsCreated: 10,
//   subscriptionsRemoved: 2
// }
```

## Best Practices

1. **Use ScopedEventBus** within agents for automatic context
2. **Filter at subscription** rather than in handler
3. **Unsubscribe** when components unmount
4. **Persist events** for debugging/audit trails
5. **Use correlation IDs** for tracing across services
6. **Batch rapid events** in dashboard for performance

## Future Enhancements

- Event aggregation/analytics
- Query language for event filtering
- Event replay for debugging
- Distributed event streaming (Redis)
# Pattern: Producer-Consumer Event Stream

**Source:** `packages/agent/src/utils/event-stream.ts`, `packages/agent/src/agent-loop.ts`  
**Category:** Async Processing  
**Complexity:** High

## Pattern Description

The EventStream class implements a producer-consumer pattern using a queue and waiting list of resolvers. Events are pushed by producers and consumed by async iterators. This handles backpressure - if consumers are slow, events queue up instead of being lost.

## Code Example

```typescript
// EventStream: Producer-Consumer with backpressure handling
class EventStream<T> {
  private _queue: T[] = [];
  private _waiting: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  
  // Producer: Push event to stream
  push(event: T): void {
    if (this._waiting.length > 0) {
      // Consumer waiting - resolve immediately
      const waiter = this._waiting.shift()!;
      waiter.resolve({ value: event, done: false });
    } else {
      // No consumer - queue the event
      this._queue.push(event);
    }
  }
  
  // Consumer: Async iterator
  async next(): Promise<IteratorResult<T>> {
    if (this._queue.length > 0) {
      // Event available - return it
      const event = this._queue.shift()!;
      return { value: event, done: false };
    }
    
    // No event - wait for producer
    return new Promise((resolve, reject) => {
      this._waiting.push({ resolve, reject });
    });
  }
  
  // Standard async iterator protocol
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    };
  }
}

// Usage in agent loop
const stream = new EventStream<AgentEvent>();
const loop = agentLoop(state, config, stream.push.bind(stream));

for await (const event of stream) {
  // Process event
}
```

## Key Components

| Component | Purpose |
|-----------|---------|
| **Queue** | Buffer for events when no consumer is waiting |
| **Waiting List** | Pending consumer promises waiting for events |
| **Push Method** | Producer adds events (resolves waiters or queues) |
| **Next Method** | Consumer gets next event (returns promise) |

## Backpressure Handling

```
Timeline:
┌─────────────────────────────────────────────────────────────┐
│ Producer: push(event1) → Queue: [event1]                   │
│ Producer: push(event2) → Queue: [event1, event2]           │
│ Consumer: next() → Returns event1, Queue: [event2]         │
│ Consumer: next() → Returns event2, Queue: []               │
│ Consumer: next() → WAITS (no events)                       │
│ Producer: push(event3) → Resolves waiting consumer         │
└─────────────────────────────────────────────────────────────┘
```

## Benefits for Dash

1. **No Lost Events** - Events queue when consumers are slow
2. **Async by Default** - Natural fit for streaming LLM responses
3. **Simple API** - Standard async iterator protocol
4. **Cancelable** - Reject waiting promises on abort

## How to Apply to Dash

```typescript
// Current: Simple callbacks or polling
// Target: EventStream for swarm communications

class SwarmEventStream<T> {
  private _queue: SwarmEvent[] = [];
  private _waiting: PromiseResolver[] = [];
  
  push(event: SwarmEvent): void {
    if (this._waiting.length > 0) {
      const waiter = this._waiting.shift()!;
      waiter.resolve({ value: event, done: false });
    } else {
      this._queue.push(event);
    }
  }
  
  async *events(): AsyncGenerator<SwarmEvent> {
    while (true) {
      const event = await this.next();
      if (event.done) break;
      yield event.value;
    }
  }
}

// Usage for swarm orchestration
const stream = new SwarmEventStream<SwarmEvent>();
orchestrator.on('swarm_update', (update) => stream.push(update));

for await (const update of stream.events()) {
  dashboard.render(update);
}
```

## Related Patterns

- [Observable State Machine](#observable-state-machine)
- [Two-Tier Event Processing](#two-tier-event-processing)

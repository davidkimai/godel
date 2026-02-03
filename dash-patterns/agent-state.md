# Pattern: Observable State Machine with Event-Driven Updates

**Source:** `packages/agent/src/agent.ts`, `packages/agent/src/agent-loop.ts`  
**Category:** Agent Architecture  
**Complexity:** High

## Pattern Description

The Agent class centralizes all state (model, tools, messages) and exposes it through an observable event stream. State transitions are atomic and trigger events that subscribers can react to.

## Code Example

```typescript
// Agent class as state machine with observable events
class Agent {
  private _state: AgentState;
  
  // Public state access
  get state() { return this._state; }
  
  // Atomic state updates
  setTools(tools: AgentTool[]): void {
    this._state.tools = tools;
  }
  
  appendMessage(message: AgentMessage): void {
    this._state.messages.push(message);
  }
  
  // Event subscription
  subscribe(callback: (event: AgentEvent) => void): () => void {
    return this._eventEmitter.on(callback);
  }
}

// State updates trigger event emissions
private async _runLoop(context: AgentContext): Promise<void> {
  const stream = agentLoop(this._state, context, this._config);
  
  for await (const event of stream) {
    // Handle event and update state
    this._handleEvent(event);
    
    // Re-emit to subscribers
    this._eventEmitter.emit(event);
  }
}
```

## Key Components

| Component | Purpose |
|-----------|---------|
| **Centralized State** | Single source of truth for model, tools, messages |
| **Atomic Updates** | State changes are immediate and consistent |
| **Event Stream** | Async iterator over agent events |
| **Subscriber Pattern** | External observers can subscribe to state changes |

## Event Types

```typescript
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start' }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_update'; partial: Partial<AgentMessage> }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string }
  | { type: 'tool_execution_end'; toolCallId: string; result: ToolResult }
  | { type: 'turn_end'; message: AgentMessage; toolResults: ToolResult[] }
  | { type: 'agent_end'; messages: AgentMessage[] };
```

## Benefits for Dash

1. **Debuggability** - Every state change is an event
2. **UI Integration** - React to state changes in real-time
3. **Testing** - Events make assertions easier
4. **Extensibility** - Add subscribers without modifying agent

## How to Apply to Dash

```typescript
// Current: Implicit state in scripts
// Target: Observable state with events

class DashAgent {
  private _state: DashAgentState;
  private _subscribers: Set<(event: DashEvent) => void>;
  
  subscribe(callback: (event: DashEvent) => void): () => void {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }
  
  private _emit(event: DashEvent): void {
    for (const callback of this._subscribers) {
      callback(event);
    }
  }
  
  async prompt(input: string): Promise<void> {
    this._emit({ type: 'prompt_start', input });
    
    // ... process ...
    
    this._emit({ type: 'prompt_end', result });
  }
}
```

## Related Patterns

- [Producer-Consumer Event Stream](#producer-consumer-event-stream)
- [Two-Tier Event Processing](#two-tier-event-processing)
- [Dynamic Steering/Follow-up](#dynamic-steeringfollow-up)

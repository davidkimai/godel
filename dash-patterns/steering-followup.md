# Pattern: Dynamic Steering and Follow-up

**Source:** `packages/agent/src/agent-loop.ts`, `packages/agent/src/agent.ts`  
**Category:** Agent Control Flow  
**Complexity:** Medium

## Pattern Description

Bi-directional control flow where the consumer of agent output can influence the next agent step. Steering messages interrupt current execution, while follow-up messages queue work for after current work completes.

## Code Example

```typescript
// Steering: Interrupt current work
agent.steer({
  role: 'user',
  content: 'Stop! Do this instead.',
  timestamp: Date.now(),
});

// Follow-up: Queue work for later
agent.followUp({
  role: 'user',
  content: 'Also summarize the result.',
  timestamp: Date.now(),
});

// In agent loop - check for steering/follow-up
async function agentLoop(state: AgentState, config: Config): AsyncGenerator<AgentEvent> {
  while (true) {
    // Check for steering messages (immediate injection)
    const steering = state.popSteeringMessages();
    if (steering.length > 0) {
      // Skip remaining tools, inject steering
      state.skipRemainingTools();
      for (const msg of steering) {
        state.appendMessage(msg);
      }
      yield { type: 'steering_injected', count: steering.length };
    }
    
    // Normal turn processing
    const response = await callLLM(state);
    yield { type: 'message', message: response };
    
    // Execute tools if needed
    for (const toolCall of response.toolCalls) {
      const result = await executeTool(toolCall);
      yield { type: 'tool_result', result };
    }
    
    // Check for follow-up messages (after tools complete)
    const followUp = state.popFollowUpMessages();
    if (followUp.length > 0) {
      for (const msg of followUp) {
        state.appendMessage(msg);
        yield { type: 'follow_up_injected', message: msg };
      }
      // Continue loop for follow-up processing
      continue;
    }
    
    // No more work
    break;
  }
}
```

## Key Components

| Component | Purpose |
|-----------|---------|
| **Steering Queue** | Immediate interruption of current work |
| **Follow-up Queue** | Work to process after current turn ends |
| **Injection Points** | Steering before tools, follow-up after tools |
| **Queue Management** | Clear, clearAll, isEmpty methods |

## Control Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LOOP                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check Steering Queue                                   │
│     └─> Steering messages inject immediately               │
│     └─> Remaining tools skip with error                    │
│                                                             │
│  2. Process Turn                                           │
│     └─> Call LLM                                           │
│     └─> Execute tools (if any)                             │
│                                                             │
│  3. Check Follow-up Queue                                  │
│     └─> Follow-up messages append to context               │
│     └─> Continue loop for follow-up processing             │
│                                                             │
│  4. No more work → End                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Benefits for Dash

1. **Real-time Intervention** - Interrupt swarms if they're going wrong
2. **Task Chaining** - Queue follow-up tasks naturally
3. **Error Recovery** - Steering can redirect from errors
4. **Human-in-the-Loop** - Inject guidance during execution

## How to Apply to Dash

```typescript
// Current: Manual swarm management
// Target: Steering/follow-up for autonomous control

class DashOrchestrator {
  private _steeringQueue: SteeringMessage[] = [];
  private _followUpQueue: FollowUpMessage[] = [];
  
  // Interrupt current swarm
  steer(swarmId: string, instruction: string): void {
    this._steeringQueue.push({ swarmId, instruction, timestamp: Date.now() });
  }
  
  // Queue follow-up task
  followUp(swarmId: string, task: string): void {
    this._followUpQueue.push({ swarmId, task, timestamp: Date.now() });
  }
  
  // In swarm loop - check steering before each step
  async runSwarm(swarm: Swarm): Promise<void> {
    const steering = this._steeringQueue.filter(s => s.swarmId === swarm.id);
    this._steeringQueue = this._steeringQueue.filter(s => s.swarmId !== swarm.id);
    
    if (steering.length > 0) {
      console.log(`⚠️  Steering ${swarm.id}: ${steering[0].instruction}`);
      swarm.interrupt(steering[0].instruction);
    }
    
    await swarm.execute();
    
    const followUp = this._followUpQueue.filter(f => f.swarmId === swarm.id);
    this._followUpQueue = this._followUpQueue.filter(f => f.swarmId !== swarm.id);
    
    if (followUp.length > 0) {
      for (const task of followUp) {
        console.log(`📋 Follow-up for ${swarm.id}: ${task.task}`);
        // Queue the follow-up task
      }
    }
  }
}

// Usage
orchestrator.steer('coverage-123', 'Focus on src/core/ tests');
orchestrator.followUp('quality-456', 'Check for console.logs');
```

## Related Patterns

- [Observable State Machine](#observable-state-machine)
- [Producer-Consumer Event Stream](#producer-consumer-event-stream)

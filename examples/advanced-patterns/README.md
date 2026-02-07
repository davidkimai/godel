# Advanced Patterns Example

This example demonstrates advanced Godel patterns for complex scenarios.

## Patterns

### 1. Convoy Pattern

Multiple agents working in coordination on different aspects:

```typescript
// Create a convoy - coordinated multi-agent workflow
const convoy = await client.convoys.create({
  name: 'feature-implementation',
  pattern: 'convoy',
  agents: [
    { role: 'architect', task: 'Design system architecture' },
    { role: 'backend', task: 'Implement API endpoints', dependsOn: ['architect'] },
    { role: 'frontend', task: 'Build UI components', dependsOn: ['architect'] },
    { role: 'tester', task: 'Write tests', dependsOn: ['backend', 'frontend'] },
    { role: 'reviewer', task: 'Final review', dependsOn: ['tester'] }
  ]
});

await convoy.start();
```

### 2. Reflex Pattern

Self-improving agents that learn from feedback:

```typescript
// Create reflex agent that improves over time
const reflex = await client.agents.spawn({
  role: 'worker',
  reflex: {
    enabled: true,
    memory: 'persistent',     // Remember across sessions
    feedbackLoop: true,       // Learn from feedback
    adaptationRate: 0.1       // How quickly to adapt
  }
});

// Provide feedback
await client.agents.feedback(reflex.id, {
  taskId: 'task-001',
  rating: 4.5,
  comments: 'Good but missed edge case with null input'
});
```

### 3. Swarm Pattern

Dynamic agent allocation based on workload:

```typescript
// Create an elastic swarm
const swarm = await client.swarms.create({
  name: 'processing-swarm',
  minAgents: 2,
  maxAgents: 20,
  scalePolicy: {
    metric: 'queue_depth',
    target: 10,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.3
  }
});

// Submit work to swarm
for (const task of tasks) {
  await swarm.submit(task);
}

// Swarm auto-scales based on queue depth
```

### 4. Circuit Breaker Pattern

Fail-fast for unreliable services:

```typescript
// Configure circuit breaker for external API
const agent = await client.agents.spawn({
  role: 'worker',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,      // Open after 5 failures
    timeout: 30,              // Try again after 30s
    halfOpenRequests: 3       // Test with 3 requests when half-open
  }
});
```

### 5. Saga Pattern

Distributed transactions with compensation:

```typescript
// Create saga for multi-step workflow
const saga = await client.sagas.create({
  name: 'user-onboarding',
  steps: [
    {
      name: 'create-user',
      action: async () => createUser(),
      compensate: async () => deleteUser()
    },
    {
      name: 'send-welcome-email',
      action: async () => sendEmail(),
      compensate: async () => markEmailFailed()
    },
    {
      name: 'create-trial',
      action: async () => createTrial(),
      compensate: async () => cancelTrial()
    }
  ]
});

try {
  await saga.execute();
} catch (error) {
  await saga.compensate();  // Rollback all steps
}
```

### 6. Event Sourcing

Reconstruct state from events:

```typescript
// Enable event sourcing for an agent
const agent = await client.agents.spawn({
  role: 'worker',
  eventSourcing: {
    enabled: true,
    snapshotInterval: 100     // Snapshot every 100 events
  }
});

// Replay events to reconstruct state
const events = await client.events.getForAgent(agent.id);
const state = await client.agents.replay(events, upToEventId);
```

### 7. CQRS (Command Query Responsibility Segregation)

Separate read and write models:

```typescript
// Command side - modify state
const commandAgent = await client.agents.spawn({
  role: 'worker',
  purpose: 'command',
  models: {
    write: true,
    read: false
  }
});

// Query side - read state
const queryAgent = await client.agents.spawn({
  role: 'worker',
  purpose: 'query',
  models: {
    write: false,
    read: true
  }
});
```

### 8. Backpressure Pattern

Handle overload gracefully:

```typescript
// Configure backpressure
const queue = await client.queues.create({
  name: 'high-volume-queue',
  backpressure: {
    strategy: 'shed-load',    // Drop low-priority when full
    maxSize: 10000,
    highWatermark: 0.8,
    lowWatermark: 0.3
  }
});
```

### 9. Bulkhead Pattern

Isolate failures to prevent cascading:

```typescript
// Create bulkhead-isolated teams
const bulkheads = await client.bulkheads.create({
  name: 'service-isolation',
  partitions: [
    { name: 'auth', maxAgents: 5, maxTasks: 20 },
    { name: 'billing', maxAgents: 5, maxTasks: 20 },
    { name: 'analytics', maxAgents: 3, maxTasks: 10 }
  ]
});

// Failure in one partition doesn't affect others
```

### 10. Sidecar Pattern

Auxiliary services alongside main agents:

```typescript
// Create agent with sidecars
const agent = await client.agents.spawn({
  role: 'worker',
  sidecars: [
    {
      name: 'logger',
      image: 'godel/sidecar-logger:latest',
      config: { level: 'debug' }
    },
    {
      name: 'monitor',
      image: 'godel/sidecar-monitor:latest',
      config: { metrics: ['cpu', 'memory'] }
    }
  ]
});
```

## Combining Patterns

```typescript
// Complex workflow combining multiple patterns
const workflow = await client.workflows.create({
  name: 'enterprise-feature',
  patterns: {
    // Use convoy for coordination
    coordination: 'convoy',
    // Use saga for transaction safety
    transaction: 'saga',
    // Use circuit breaker for resilience
    resilience: 'circuit-breaker',
    // Use bulkheads for isolation
    isolation: 'bulkhead'
  },
  stages: [
    { name: 'design', pattern: 'convoy', agents: 2 },
    { name: 'implement', pattern: 'swarm', minAgents: 3, maxAgents: 10 },
    { name: 'verify', pattern: 'saga', agents: 2 }
  ]
});
```

## Best Practices

1. **Start simple** - Add patterns only when needed
2. **Monitor overhead** - Patterns add complexity
3. **Test failure modes** - Verify pattern behavior
4. **Document patterns** - Make architecture visible
5. **Measure impact** - Track if patterns help

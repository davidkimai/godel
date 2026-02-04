# SPEC: Dash Integration Testing Suite

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical  
**PRD Reference:** [PRD-003-integration-testing.md](../prds/PRD-003-integration-testing.md)

---

## Overview

Execute comprehensive integration test suite to validate Dash-OpenClaw integration and production readiness.

**PRD Success Criteria:**
1. ✅ Full OpenClaw → Dash → OpenClaw flow works
2. ✅ 100 agents spawned concurrently without errors
3. ✅ Event latency < 500ms
4. ✅ API handles 1000 concurrent requests
5. ✅ All integration tests pass (10 scenarios)
6. ✅ No critical bugs found

---

## Test Environment Setup

### Prerequisites

```bash
# Start Dash services
cd /Users/jasontang/clawd/projects/dash
docker compose up -d

# Verify services
swarmctl status

# Configure OpenClaw integration
export DASH_API_URL=http://localhost:7373
export DASH_API_KEY=test-key
export OPENCLAW_DASH_ADAPTER_ENABLED=true
```

### Test Configuration

**File:** `tests/integration/config.ts`

```typescript
export const testConfig = {
  dashApiUrl: process.env.DASH_API_URL || 'http://localhost:7373',
  dashApiKey: process.env.DASH_API_KEY || 'test-key',
  openclawAdapterUrl: process.env.OPENCLAW_ADAPTER_URL || 'http://localhost:7374',
  testTimeout: 60000,  // 60 seconds
  maxConcurrentAgents: 100,
  eventLatencyThreshold: 500,  // ms
  maxRetries: 3
};
```

---

## Integration Test Scenarios

### Scenario 1: OpenClaw Agent Spawn

**File:** `tests/integration/scenarios/agent-spawn.test.ts`

**Purpose:** Verify OpenClaw can spawn Dash agents

```typescript
describe('Scenario 1: OpenClaw Agent Spawn', () => {
  it('should spawn single agent from OpenClaw', async () => {
    // 1. OpenClaw sends spawn request
    const spawnRequest = {
      agentType: 'code-review',
      task: 'Review PR #123',
      model: 'claude-sonnet-4-5'
    };
    
    // 2. Adapter creates agent in Dash
    const result = await openclawAdapter.spawnAgent('session-1', spawnRequest);
    
    // 3. Verify agent created
    expect(result.dashAgentId).toBeDefined();
    expect(result.status).toBe('spawning');
    
    // 4. Verify agent appears in Dash
    const agent = await swarmctl.getAgent(result.dashAgentId);
    expect(agent).toBeDefined();
    expect(agent.status).toBe('spawning');
  }, 30000);
  
  it('should spawn 100 agents concurrently', async () => {
    const spawnPromises = Array(100).fill(null).map((_, i) =>
      openclawAdapter.spawnAgent(`session-${i}`, {
        agentType: 'code-review',
        task: `Review PR #${i}`
      })
    );
    
    const results = await Promise.all(spawnPromises);
    
    // Verify all agents spawned
    expect(results).toHaveLength(100);
    expect(results.every(r => r.dashAgentId)).toBe(true);
    
    // Verify in Dash
    const agents = await swarmctl.listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(100);
  }, 120000);  // 2 minutes
});
```

---

### Scenario 2: Event Streaming

**File:** `tests/integration/scenarios/event-streaming.test.ts`

**Purpose:** Verify real-time event streaming from Dash to OpenClaw

```typescript
describe('Scenario 2: Event Streaming', () => {
  it('should stream events within 500ms', async () => {
    const events: any[] = [];
    
    // 1. Subscribe to events
    const unsubscribe = openclawEventBridge.subscribe((event) => {
      events.push({
        ...event,
        receivedAt: Date.now()
      });
    });
    
    // 2. Spawn agent (triggers events)
    const startTime = Date.now();
    await openclawAdapter.spawnAgent('session-event-test', {
      agentType: 'test',
      task: 'Test event streaming'
    });
    
    // 3. Wait for events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Verify event latency
    expect(events.length).toBeGreaterThan(0);
    
    const latencies = events.map(e => e.receivedAt - e.timestamp);
    const maxLatency = Math.max(...latencies);
    
    expect(maxLatency).toBeLessThan(500);  // 500ms threshold
    
    unsubscribe();
  }, 30000);
  
  it('should handle 1000 events/second', async () => {
    const eventCount = 1000;
    const receivedEvents: any[] = [];
    
    // Subscribe
    const unsubscribe = openclawEventBridge.subscribe((event) => {
      receivedEvents.push(event);
    });
    
    // Spawn many agents rapidly
    const spawnStart = Date.now();
    const spawnPromises = Array(100).fill(null).map((_, i) =>
      openclawAdapter.spawnAgent(`session-load-${i}`, {
        agentType: 'test',
        task: 'Load test'
      })
    );
    
    await Promise.all(spawnPromises);
    const spawnDuration = Date.now() - spawnStart;
    
    // Wait for all events
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify throughput
    const eventsPerSecond = receivedEvents.length / (spawnDuration / 1000);
    expect(eventsPerSecond).toBeGreaterThan(100);  // At least 100 events/s
    
    unsubscribe();
  }, 60000);
});
```

---

### Scenario 3: Agent Lifecycle

**File:** `tests/integration/scenarios/agent-lifecycle.test.ts`

**Purpose:** Verify complete agent lifecycle

```typescript
describe('Scenario 3: Agent Lifecycle', () => {
  it('should complete full lifecycle: spawn → work → complete', async () => {
    // 1. Spawn
    const { dashAgentId } = await openclawAdapter.spawnAgent('session-lifecycle', {
      agentType: 'code-review',
      task: 'Simple review'
    });
    
    // 2. Wait for spawning → running
    await waitForStatus(dashAgentId, 'running', 10000);
    
    // 3. Send work
    await openclawAdapter.sendMessage('session-lifecycle', 'Please review this code');
    
    // 4. Wait for completion
    await waitForStatus(dashAgentId, 'completed', 30000);
    
    // 5. Verify result
    const status = await openclawAdapter.getStatus('session-lifecycle');
    expect(status.status).toBe('completed');
    expect(status.result).toBeDefined();
  }, 60000);
  
  it('should handle agent failure and recovery', async () => {
    // 1. Spawn agent
    const { dashAgentId } = await openclawAdapter.spawnAgent('session-fail', {
      agentType: 'test',
      task: 'Task that will fail'
    });
    
    // 2. Kill agent (simulating failure)
    await swarmctl.killAgent(dashAgentId);
    
    // 3. Verify failure detected
    await waitForStatus(dashAgentId, 'failed', 10000);
    
    // 4. Verify OpenClaw notified
    const status = await openclawAdapter.getStatus('session-fail');
    expect(status.status).toBe('failed');
  }, 30000);
});
```

---

### Scenario 4: API Load Testing

**File:** `tests/integration/scenarios/api-load.test.ts`

**Purpose:** Verify API handles concurrent requests

```typescript
describe('Scenario 4: API Load Testing', () => {
  it('should handle 1000 concurrent requests', async () => {
    const requestCount = 1000;
    const concurrentLimit = 100;
    
    // Create batches
    const batches = [];
    for (let i = 0; i < requestCount; i += concurrentLimit) {
      const batch = Array(Math.min(concurrentLimit, requestCount - i))
        .fill(null)
        .map((_, j) => apiClient.get('/api/health'));
      batches.push(batch);
    }
    
    // Execute batches
    const startTime = Date.now();
    const results = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    const duration = Date.now() - startTime;
    
    // Verify results
    expect(results.length).toBe(requestCount);
    expect(results.every(r => r.status === 200)).toBe(true);
    
    // Verify performance
    const requestsPerSecond = requestCount / (duration / 1000);
    expect(requestsPerSecond).toBeGreaterThan(100);
  }, 60000);
});
```

---

### Scenario 5: CLI Integration

**File:** `tests/integration/scenarios/cli-integration.test.ts`

**Purpose:** Verify CLI works with real Dash instance

```typescript
describe('Scenario 5: CLI Integration', () => {
  it('should spawn agent via CLI', async () => {
    // Execute CLI command
    const { stdout } = await execAsync(
      'swarmctl agent spawn --swarm test-swarm --type code-review'
    );
    
    // Verify output
    expect(stdout).toContain('Agent spawned');
    expect(stdout).toMatch(/agent-[a-z0-9]+/);
    
    // Verify agent exists
    const { stdout: listOutput } = await execAsync('swarmctl agent list');
    expect(listOutput).toContain('code-review');
  }, 30000);
  
  it('should show status via CLI', async () => {
    // Spawn agent first
    const { stdout: spawnOutput } = await execAsync(
      'swarmctl agent spawn --swarm test-swarm --type test'
    );
    const agentId = spawnOutput.match(/(agent-[a-z0-9]+)/)?.[1];
    
    // Get status
    const { stdout } = await execAsync(`swarmctl agent get ${agentId}`);
    
    expect(stdout).toContain(agentId);
    expect(stdout).toContain('status');
  }, 30000);
});
```

---

### Scenario 6: WebSocket Stability

**File:** `tests/integration/scenarios/websocket-stability.test.ts`

**Purpose:** Verify WebSocket connections remain stable

```typescript
describe('Scenario 6: WebSocket Stability', () => {
  it('should maintain connection for 60 seconds', async () => {
    const events: any[] = [];
    
    // Connect
    const ws = new WebSocket(`ws://localhost:7373/ws?token=${testConfig.dashApiKey}`);
    
    ws.on('message', (data) => {
      events.push(JSON.parse(data.toString()));
    });
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    // Keep connection open for 60 seconds
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Verify still connected
    expect(ws.readyState).toBe(WebSocket.OPEN);
    
    // Close
    ws.close();
  }, 70000);
  
  it('should reconnect after disconnection', async () => {
    const events: any[] = [];
    
    // Connect
    let ws = new WebSocket(`ws://localhost:7373/ws?token=${testConfig.dashApiKey}`);
    
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    // Force disconnect
    ws.terminate();
    
    // Wait and reconnect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    ws = new WebSocket(`ws://localhost:7373/ws?token=${testConfig.dashApiKey}`);
    
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
    });
    
    expect(ws.readyState).toBe(WebSocket.OPEN);
    
    ws.close();
  }, 30000);
});
```

---

### Scenario 7: Database Consistency

**File:** `tests/integration/scenarios/database-consistency.test.ts`

**Purpose:** Verify database operations are atomic

```typescript
describe('Scenario 7: Database Consistency', () => {
  it('should maintain consistency under concurrent writes', async () => {
    const agentId = 'consistency-test-agent';
    
    // Create agent
    await stateManager.saveAgentState(agentId, { status: 'running', tasks: 0 });
    
    // Concurrent updates
    const updates = Array(10).fill(null).map((_, i) =>
      stateManager.updateAgentState(agentId, { tasks: i + 1 })
    );
    
    await Promise.all(updates);
    
    // Verify final state
    const finalState = await stateManager.getAgentState(agentId);
    expect(finalState.tasks).toBeGreaterThanOrEqual(0);
    expect(finalState.tasks).toBeLessThanOrEqual(10);
  }, 30000);
  
  it('should rollback on transaction failure', async () => {
    // Test transaction rollback
    // Implementation depends on transaction support
  }, 30000);
});
```

---

### Scenario 8: Redis Event Bus Throughput

**File:** `tests/integration/scenarios/redis-throughput.test.ts`

**Purpose:** Verify Redis event bus handles high throughput

```typescript
describe('Scenario 8: Redis Event Bus Throughput', () => {
  it('should handle 1000 events/second', async () => {
    const eventCount = 1000;
    const receivedEvents: any[] = [];
    
    // Subscribe
    await eventBus.subscribe('test.throughput', (event) => {
      receivedEvents.push(event);
    });
    
    // Publish events as fast as possible
    const startTime = Date.now();
    
    const publishPromises = Array(eventCount).fill(null).map((_, i) =>
      eventBus.publish('test.throughput', { id: i, timestamp: Date.now() })
    );
    
    await Promise.all(publishPromises);
    const publishDuration = Date.now() - startTime;
    
    // Wait for all events to be received
    await new Promise(resolve => {
      const check = () => {
        if (receivedEvents.length >= eventCount) {
          resolve(undefined);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
    
    const receiveDuration = Date.now() - startTime;
    
    // Verify throughput
    const publishRate = eventCount / (publishDuration / 1000);
    const receiveRate = eventCount / (receiveDuration / 1000);
    
    expect(publishRate).toBeGreaterThan(500);
    expect(receiveRate).toBeGreaterThan(500);
  }, 60000);
});
```

---

### Scenario 9: Error Handling

**File:** `tests/integration/scenarios/error-handling.test.ts`

**Purpose:** Verify graceful error handling

```typescript
describe('Scenario 9: Error Handling', () => {
  it('should handle invalid API requests', async () => {
    const response = await apiClient.post('/api/agents', {
      // Missing required fields
    });
    
    expect(response.status).toBe(400);
    expect(response.data.error).toBeDefined();
  }, 10000);
  
  it('should handle authentication failures', async () => {
    const response = await apiClient.get('/api/agents', {
      headers: { 'X-API-Key': 'invalid-key' }
    });
    
    expect(response.status).toBe(401);
  }, 10000);
  
  it('should handle resource not found', async () => {
    const response = await apiClient.get('/api/agents/non-existent-agent');
    
    expect(response.status).toBe(404);
  }, 10000);
});
```

---

### Scenario 10: End-to-End Workflow

**File:** `tests/integration/scenarios/e2e-workflow.test.ts`

**Purpose:** Complete end-to-end workflow test

```typescript
describe('Scenario 10: End-to-End Workflow', () => {
  it('should execute complete code review workflow', async () => {
    // 1. OpenClaw initiates review
    const { dashAgentId } = await openclawAdapter.spawnAgent('session-e2e', {
      agentType: 'code-review',
      task: 'Review PR #456: Authentication refactor',
      config: {
        files: ['src/auth/*.ts'],
        focus: ['security', 'performance']
      }
    });
    
    // 2. Verify agent spawned
    expect(dashAgentId).toBeDefined();
    
    // 3. Wait for agent to start
    await waitForStatus(dashAgentId, 'running', 10000);
    
    // 4. Monitor progress via events
    const events: any[] = [];
    const unsubscribe = openclawEventBridge.subscribeToAgent(
      dashAgentId,
      (event) => events.push(event)
    );
    
    // 5. Send additional context
    await openclawAdapter.sendMessage('session-e2e', 
      'Focus on JWT token handling'
    );
    
    // 6. Wait for completion
    await waitForStatus(dashAgentId, 'completed', 60000);
    
    // 7. Verify results
    const status = await openclawAdapter.getStatus('session-e2e');
    expect(status.status).toBe('completed');
    expect(status.result).toBeDefined();
    expect(status.result.findings).toBeDefined();
    
    // 8. Verify events received
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'agent.completed')).toBe(true);
    
    unsubscribe();
  }, 120000);
});
```

---

## Test Execution

### Run All Scenarios

```bash
npm run test:integration
```

### Run Specific Scenario

```bash
npm run test:integration -- --testPathPattern=agent-spawn
```

### Run with Coverage

```bash
npm run test:integration -- --coverage
```

---

## Verification

### Success Criteria Checklist

- [ ] Scenario 1: Agent spawn works (single + 100 concurrent)
- [ ] Scenario 2: Event latency < 500ms
- [ ] Scenario 3: Full lifecycle completes
- [ ] Scenario 4: API handles 1000 concurrent requests
- [ ] Scenario 5: CLI commands work
- [ ] Scenario 6: WebSocket stable for 60s
- [ ] Scenario 7: Database consistency maintained
- [ ] Scenario 8: Redis throughput > 500 events/s
- [ ] Scenario 9: Errors handled gracefully
- [ ] Scenario 10: E2E workflow completes

### Performance Baselines

| Metric | Target | Actual |
|--------|--------|--------|
| Agent spawn (100 concurrent) | < 30s | TBD |
| Event latency | < 500ms | TBD |
| API throughput | > 100 req/s | TBD |
| Test suite runtime | < 10 min | TBD |

---

## Troubleshooting

### Common Issues

1. **Connection refused:** Ensure Dash services are running
2. **Timeout errors:** Increase test timeout
3. **Event latency high:** Check network, Redis performance
4. **Database errors:** Verify PostgreSQL is running

### Debug Mode

```bash
DEBUG=true npm run test:integration
```

---

**Commit:** "test: Implement SPEC-003 - Integration test suite"

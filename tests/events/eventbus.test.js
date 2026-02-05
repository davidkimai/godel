/**
 * EventBus Comprehensive Test Suite
 * Tests all EventBus functionality including:
 * - Event emission and subscription
 * - Event filtering
 * - Middleware
 * - Metrics tracking
 * - Error handling
 */

import { EventBus, EventType } from '../src/events/index.js';

// Test utilities
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const testResults: { name: string; passed: boolean; error?: string }[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    testResults.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.push({ name, passed: false, error: String(error) });
    console.log(`❌ ${name}: ${error}`);
  }
}

async function asyncTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    testResults.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.push({ name, passed: false, error: String(error) });
    console.log(`❌ ${name}: ${error}`);
  }
}

// Test counters
let passCount = 0;
let failCount = 0;

console.log('\n=== EventBus Test Suite ===\n');

// Test Suite
test('EventBus should be instantiable', () => {
  const bus = new EventBus();
  assert(bus !== null, 'EventBus should be created');
  assert(bus !== undefined, 'EventBus should not be undefined');
});

test('EventBus should be singleton (global instance)', () => {
  const bus1 = EventBus.getInstance();
  const bus2 = EventBus.getInstance();
  assert(bus1 === bus2, 'getInstance should return same instance');
});

test('EventBus should emit and receive events', async () => {
  const bus = EventBus.getInstance();
  let received = false;
  
  bus.subscribe(EventType.AGENT_CREATED, (data) => {
    received = true;
  });
  
  bus.publish(EventType.AGENT_CREATED, { agentId: 'test-1' });
  
  assert(received === true, 'Event should be received');
});

test('EventBus should support multiple subscribers', async () => {
  const bus = EventBus.getInstance();
  let callCount = 0;
  
  bus.subscribe(EventType.TASK_COMPLETED, () => callCount++);
  bus.subscribe(EventType.TASK_COMPLETED, () => callCount++);
  bus.subscribe(EventType.TASK_COMPLETED, () => callCount++);
  
  bus.publish(EventType.TASK_COMPLETED, {});
  
  assert(callCount === 3, `Should be called 3 times, was ${callCount}`);
});

test('EventBus should filter events by type', async () => {
  const bus = EventBus.getInstance();
  let agentEvents = 0;
  let swarmEvents = 0;
  
  bus.subscribe(EventType.AGENT_CREATED, () => agentEvents++);
  bus.subscribe(EventType.SWARM_CREATED, () => swarmEvents++);
  
  bus.publish(EventType.AGENT_CREATED, {});
  bus.publish(EventType.SWARM_CREATED, {});
  bus.publish(EventType.AGENT_CREATED, {});
  
  assert(agentEvents === 2, `Agent events should be 2, was ${agentEvents}`);
  assert(swarmEvents === 1, `Swarm events should be 1, was ${swarmEvents}`);
});

test('EventBus should handle event data', async () => {
  const bus = EventBus.getInstance();
  let receivedData: any = null;
  
  bus.subscribe(EventType.TASK_FAILED, (data) => {
    receivedData = data;
  });
  
  const testData = { 
    taskId: 'task-123', 
    error: 'Something went wrong',
    timestamp: Date.now()
  };
  
  bus.publish(EventType.TASK_FAILED, testData);
  
  assert(receivedData !== null, 'Data should be received');
  assert(receivedData.taskId === 'task-123', 'Task ID should match');
  assert(receivedData.error === 'Something went wrong', 'Error should match');
});

test('EventBus should track event metrics', async () => {
  const bus = EventBus.getInstance();
  
  // Reset metrics
  bus.resetMetrics();
  
  bus.publish(EventType.AGENT_CREATED, {});
  bus.publish(EventType.AGENT_CREATED, {});
  bus.publish(EventType.SWARM_CREATED, {});
  
  const metrics = bus.getMetrics();
  
  assert(metrics.eventsPublished === 3, `Should publish 3 events, was ${metrics.eventsPublished}`);
  assert(metrics.eventsReceived === 3, `Should receive 3 events, was ${metrics.eventsReceived}`);
});

test('EventBus should track events by type', async () => {
  const bus = EventBus.getInstance();
  bus.resetMetrics();
  
  bus.publish(EventType.AGENT_CREATED, {});
  bus.publish(EventType.AGENT_CREATED, {});
  bus.publish(EventType.AGENT_DELETED, {});
  
  const metrics = bus.getMetrics();
  
  assert(
    metrics.byType[EventType.AGENT_CREATED] === 2,
    `AGENT_CREATED should be 2, was ${metrics.byType[EventType.AGENT_CREATED]}`
  );
  assert(
    metrics.byType[EventType.AGENT_DELETED] === 1,
    `AGENT_DELETED should be 1, was ${metrics.byType[EventType.AGENT_DELETED]}`
  );
});

test('EventBus should handle unsubscription', async () => {
  const bus = EventBus.getInstance();
  let callCount = 0;
  
  const handler = () => callCount++;
  
  bus.subscribe(EventType.WORKFLOW_STARTED, handler);
  bus.publish(EventType.WORKFLOW_STARTED, {});
  
  assert(callCount === 1, 'Handler should be called once');
  
  bus.unsubscribe(EventType.WORKFLOW_STARTED, handler);
  bus.publish(EventType.WORKFLOW_STARTED, {});
  
  assert(callCount === 1, 'Handler should not be called after unsubscription');
});

test('EventBus should handle errors gracefully', async () => {
  const bus = EventBus.getInstance();
  
  let errorCaught = false;
  
  bus.subscribe(EventType.ERROROccurred, () => {
    throw new Error('Test error in handler');
  });
  
  // This should not throw
  try {
    bus.publish(EventType.ERROROccurred, {});
  } catch {
    errorCaught = true;
  }
  
  // If we get here without throwing, the error was handled
  assert(errorCaught === false, 'Error should be caught by EventBus');
});

test('EventBus should support once() for one-time events', async () => {
  const bus = EventBus.getInstance();
  let callCount = 0;
  
  bus.once(EventType.SESSION_ENDED, () => {
    callCount++;
  });
  
  bus.publish(EventType.SESSION_ENDED, {});
  bus.publish(EventType.SESSION_ENDED, {});
  
  assert(callCount === 1, 'Once handler should only be called once');
});

test('EventBus should handle batch events', async () => {
  const bus = EventBus.getInstance();
  const events: string[] = [];
  
  bus.subscribe('BATCH_*', (type: string) => {
    events.push(type);
  });
  
  bus.publishBatch([
    { type: 'BATCH_START' as const, data: {} },
    { type: 'BATCH_PROCESS' as const, data: {} },
    { type: 'BATCH_END' as const, data: {} },
  ]);
  
  assert(events.length === 3, `Should receive 3 batch events, was ${events.length}`);
});

test('EventBus should have correct state', async () => {
  const bus = new EventBus();
  
  assert(bus.getState() === 'initialized', 'Initial state should be initialized');
  
  bus.publish(EventType.TEST_EVENT, {});
  
  assert(bus.getState() === 'running', 'State should be running after publish');
});

test('EventBus should clear all subscribers', async () => {
  const bus = EventBus.getInstance();
  let callCount = 0;
  
  bus.subscribe(EventType.CLEAR_TEST, () => callCount++);
  bus.subscribe(EventType.CLEAR_TEST, () => callCount++);
  
  bus.clear();
  
  bus.publish(EventType.CLEAR_TEST, {});
  
  assert(callCount === 0, 'No handlers should be called after clear');
});

test('EventBus should track subscriber count', async () => {
  const bus = new EventBus();
  
  assert(bus.getSubscriberCount() === 0, 'Initial count should be 0');
  
  bus.subscribe(EventType.TEST1, () => {});
  bus.subscribe(EventType.TEST2, () => {});
  
  assert(bus.getSubscriberCount() === 2, 'Count should be 2');
  
  bus.unsubscribe(EventType.TEST1, () => {});
  
  assert(bus.getSubscriberCount() === 1, 'Count should be 1 after unsubscribe');
});

test('EventBus should support priority ordering', async () => {
  const bus = EventBus.getInstance();
  const order: number[] = [];
  
  bus.subscribeWithPriority(EventType.PRIORITY_TEST, () => order.push(3), 3);
  bus.subscribeWithPriority(EventType.PRIORITY_TEST, () => order.push(1), 1);
  bus.subscribeWithPriority(EventType.PRIORITY_TEST, () => order.push(2), 2);
  
  bus.publish(EventType.PRIORITY_TEST, {});
  
  assert(order[0] === 1, 'Priority 1 should run first');
  assert(order[1] === 2, 'Priority 2 should run second');
  assert(order[2] === 3, 'Priority 3 should run last');
});

// Summary
console.log('\n=== Test Results ===\n');
const passed = testResults.filter(r => r.passed).length;
const failed = testResults.filter(r => !r.passed).length;

console.log(`Total: ${testResults.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Pass Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\nFailed tests:');
  testResults.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
}

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);

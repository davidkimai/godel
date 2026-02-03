/**
 * Event Bus Tests
 * 
 * Tests for the AgentEventBus and event streaming functionality.
 */

import { AgentEventBus, ScopedEventBus, createEventId, createCorrelationId } from '../src/core/event-bus';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('AgentEventBus', () => {
  let eventBus: AgentEventBus;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eventbus-test-'));
    eventBus = new AgentEventBus({
      persistEvents: true,
      eventsDir: tempDir,
    });
  });

  afterEach(() => {
    eventBus.clearLog();
  });

  describe('Event Emission', () => {
    it('should emit events to subscribers', () => {
      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('agent_start');
      expect(handler.mock.calls[0][0].agentId).toBe('agent_1');
    });

    it('should emit events to multiple subscribers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      eventBus.subscribe('agent_start', handler1);
      eventBus.subscribe('agent_start', handler2);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should only deliver to matching event type subscribers', () => {
      const agentStartHandler = jest.fn();
      const toolCallHandler = jest.fn();
      
      eventBus.subscribe('agent_start', agentStartHandler);
      eventBus.subscribe('tool_call_start', toolCallHandler);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      expect(agentStartHandler).toHaveBeenCalledTimes(1);
      expect(toolCallHandler).not.toHaveBeenCalled();
    });

    it('should support subscribeAll for all event types', () => {
      const handler = jest.fn();
      eventBus.subscribeAll(handler);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      eventBus.emitEvent({
        id: 'evt_2',
        type: 'tool_call_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        tool: 'read_file',
        args: { path: '/test' },
      } as any);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Filtering', () => {
    it('should filter events based on custom filter', () => {
      const handler = jest.fn();
      const filter = (event: any) => event.agentId === 'agent_1';
      
      eventBus.subscribe('agent_start', handler, filter);

      // This should pass
      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      // This should be filtered out
      eventBus.emitEvent({
        id: 'evt_2',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_2',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].agentId).toBe('agent_1');
    });
  });

  describe('Event Persistence', () => {
    it('should persist events to JSONL file', () => {
      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      const eventsFile = eventBus.getEventsFilePath();
      expect(existsSync(eventsFile!)).toBe(true);

      const content = readFileSync(eventsFile!, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);

      const event = JSON.parse(lines[0]);
      expect(event.type).toBe('agent_start');
      expect(event.agentId).toBe('agent_1');
    });

    it('should persist multiple events in order', () => {
      const timestamps = [1000, 2000, 3000];
      
      for (let i = 0; i < timestamps.length; i++) {
        eventBus.emitEvent({
          id: `evt_${i}`,
          type: 'text_delta',
          timestamp: timestamps[i],
          agentId: 'agent_1',
          delta: `chunk ${i}`,
        } as any);
      }

      const eventsFile = eventBus.getEventsFilePath();
      const content = readFileSync(eventsFile!, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(3);
      
      const events = lines.map(l => JSON.parse(l));
      expect(events[0].timestamp).toBe(1000);
      expect(events[1].timestamp).toBe(2000);
      expect(events[2].timestamp).toBe(3000);
    });
  });

  describe('Event Retrieval', () => {
    it('should retrieve recent events', () => {
      for (let i = 0; i < 10; i++) {
        eventBus.emitEvent({
          id: `evt_${i}`,
          type: 'text_delta',
          timestamp: Date.now() + i,
          agentId: 'agent_1',
          delta: `chunk ${i}`,
        } as any);
      }

      const recent = eventBus.getRecentEvents(5);
      expect(recent.length).toBe(5);
      expect(recent[0].id).toBe('evt_5');
      expect(recent[4].id).toBe('evt_9');
    });

    it('should filter events by criteria', () => {
      // Agent 1 events
      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: 1000,
        agentId: 'agent_1',
        task: 'task 1',
        model: 'model-1',
        provider: 'test',
      } as any);

      // Agent 2 events
      eventBus.emitEvent({
        id: 'evt_2',
        type: 'agent_start',
        timestamp: 2000,
        agentId: 'agent_2',
        task: 'task 2',
        model: 'model-2',
        provider: 'test',
      } as any);

      // Filter by agentId
      const agent1Events = eventBus.getEvents({ agentId: 'agent_1' });
      expect(agent1Events.length).toBe(1);
      expect(agent1Events[0].agentId).toBe('agent_1');

      // Filter by time range
      const timeRangeEvents = eventBus.getEvents({ since: 1500 });
      expect(timeRangeEvents.length).toBe(1);
      expect(timeRangeEvents[0].agentId).toBe('agent_2');
    });
  });

  describe('Subscription Management', () => {
    it('should allow unsubscribing', () => {
      const handler = jest.fn();
      const subscription = eventBus.subscribe('agent_start', handler);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      eventBus.unsubscribe(subscription);

      eventBus.emitEvent({
        id: 'evt_2',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_2',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      // Should not receive second event
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Metrics', () => {
    it('should track event metrics', () => {
      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any);

      const metrics = eventBus.getMetrics();
      expect(metrics.eventsEmitted).toBe(1);
      expect(metrics.eventsDelivered).toBe(1);
      expect(metrics.subscriptionsCreated).toBe(1);
    });
  });
});

describe('ScopedEventBus', () => {
  let eventBus: AgentEventBus;
  let scopedBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new AgentEventBus();
    scopedBus = eventBus.createScopedBus('agent_123', 'swarm_456', 'session_789');
  });

  it('should emit events with scoped context', () => {
    const handler = jest.fn();
    eventBus.subscribe('agent_start', handler);

    scopedBus.emitAgentStart('test task', 'test-model', 'test-provider');

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.agentId).toBe('agent_123');
    expect(event.swarmId).toBe('swarm_456');
    expect(event.sessionId).toBe('session_789');
    expect(event.task).toBe('test task');
    expect(event.model).toBe('test-model');
  });

  it('should emit all event types correctly', () => {
    const events: any[] = [];
    eventBus.subscribeAll((e) => { events.push(e); });

    scopedBus.emitAgentStart('task', 'model', 'provider');
    scopedBus.emitThinkingStart();
    scopedBus.emitThinkingDelta('thinking...');
    scopedBus.emitThinkingEnd();
    scopedBus.emitToolCallStart('read_file', { path: '/test' });
    scopedBus.emitToolCallEnd('read_file', { content: 'data' }, 100, true);
    scopedBus.emitTurnStart('turn_1', 'hello');
    scopedBus.emitTurnEnd('turn_1', { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, 0.001);
    scopedBus.emitTextDelta('Hello');
    scopedBus.emitAgentComplete('done', 0.01, 100, 5000);
    scopedBus.emitError({ message: 'test error', code: 'TEST_ERROR' });

    expect(events.length).toBe(11);
    expect(events[0].type).toBe('agent_start');
    expect(events[1].type).toBe('thinking_start');
    expect(events[2].type).toBe('thinking_delta');
    expect(events[3].type).toBe('thinking_end');
    expect(events[4].type).toBe('tool_call_start');
    expect(events[5].type).toBe('tool_call_end');
    expect(events[6].type).toBe('turn_start');
    expect(events[7].type).toBe('turn_end');
    expect(events[8].type).toBe('text_delta');
    expect(events[9].type).toBe('agent_complete');
    expect(events[10].type).toBe('error');
  });
});

describe('Utility Functions', () => {
  it('should create unique event IDs', () => {
    const id1 = createEventId();
    const id2 = createEventId();
    
    expect(id1).toMatch(/^evt_/);
    expect(id2).toMatch(/^evt_/);
    expect(id1).not.toBe(id2);
  });

  it('should create unique correlation IDs', () => {
    const id1 = createCorrelationId();
    const id2 = createCorrelationId();
    
    expect(id1).toMatch(/^corr_/);
    expect(id2).toMatch(/^corr_/);
    expect(id1).not.toBe(id2);
  });
});
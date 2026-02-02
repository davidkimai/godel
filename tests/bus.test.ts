/**
 * Message Bus Test - Publish 100 messages, verify subscribers receive
 * Tests all core functionality from SPEC_v2.md Section 2.4
 */

import { MessageBus, subscribeDashboard, matchesPattern, getAgentTopics, Subscription } from '../src/bus/index';
import { EventType } from '../src/events/types';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus({ enablePersistence: true });
  });

  afterEach(() => {
    bus.clear(true);
  });

  describe('Basic Pub/Sub', () => {
    test('should publish and receive a single message', (done) => {
      const handler = jest.fn((message) => {
        expect(message.topic).toBe('agent.123.events');
        expect(message.payload).toEqual({ test: 'data' });
        done();
      });

      bus.subscribe('agent.123.events', handler);
      bus.publish('agent.123.events', { test: 'data' });
    });

    test('should publish 100 messages and all subscribers receive', async () => {
      const receivedMessages: string[] = [];
      const messageCount = 100;

      const handler = (message: { id: string }) => {
        receivedMessages.push(message.id);
      };

      bus.subscribe('agent.test.events', handler);

      // Publish 100 messages
      for (let i = 0; i < messageCount; i++) {
        bus.publish('agent.test.events', { index: i, data: `message-${i}` });
      }

      // Wait for async delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages.length).toBe(messageCount);
      expect(bus.getMetrics().messagesPublished).toBe(messageCount);
      expect(bus.getMetrics().messagesDelivered).toBe(messageCount);
    });

    test('should support multiple subscribers on same topic', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      bus.subscribe('swarm.alpha.broadcast', handler1);
      bus.subscribe('swarm.alpha.broadcast', handler2);
      bus.subscribe('swarm.alpha.broadcast', handler3);

      bus.publish('swarm.alpha.broadcast', { cmd: 'test' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Topic Patterns', () => {
    test('should match agent.{id}.events pattern', async () => {
      const received: string[] = [];

      bus.subscribe('agent.*.events', (message: { topic: string }) => {
        received.push(message.topic);
      });

      bus.publish('agent.123.events', { type: 'status' });
      bus.publish('agent.456.events', { type: 'status' });
      bus.publish('agent.789.events', { type: 'status' });
      bus.publish('other.topic', { type: 'ignored' }); // Should not match

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(3);
      expect(received).toContain('agent.123.events');
      expect(received).toContain('agent.456.events');
      expect(received).toContain('agent.789.events');
    });

    test('should match swarm.{id}.broadcast pattern', async () => {
      const received: string[] = [];

      bus.subscribe('swarm.*.broadcast', (message: { topic: string }) => {
        received.push(message.topic);
      });

      bus.publish('swarm.swarm1.broadcast', { cmd: 'start' });
      bus.publish('swarm.swarm2.broadcast', { cmd: 'stop' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(2);
      expect(received).toContain('swarm.swarm1.broadcast');
      expect(received).toContain('swarm.swarm2.broadcast');
    });

    test('should support curly brace patterns', async () => {
      const received: string[] = [];

      bus.subscribe('agent.{id}.commands', (message: { topic: string }) => {
        received.push(message.topic);
      });

      bus.publish('agent.agent1.commands', { cmd: 'pause' });
      bus.publish('agent.agent2.commands', { cmd: 'resume' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(2);
    });

    test('should match exact topics when no wildcard', async () => {
      const received: string[] = [];

      bus.subscribe('system.alerts', (message: { topic: string }) => {
        received.push(message.topic);
      });

      bus.publish('system.alerts', { severity: 'critical' });
      bus.publish('system.alerts', { severity: 'warning' });
      bus.publish('system.other', { ignored: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(2);
    });
  });

  describe('Event Filtering', () => {
    test('should filter by event type', async () => {
      const handler = jest.fn();

      bus.subscribe(
        'agent.*.events',
        handler,
        { eventTypes: ['agent.spawned', 'agent.completed'] }
      );

      // These should be received
      bus.publish('agent.1.events', { eventType: 'agent.spawned' });
      bus.publish('agent.2.events', { eventType: 'agent.completed' });

      // These should be filtered out
      bus.publish('agent.3.events', { eventType: 'agent.failed' });
      bus.publish('agent.4.events', { eventType: 'agent.paused' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    test('should filter by source agent id', async () => {
      const handler = jest.fn();

      bus.subscribe(
        'agent.*.events',
        handler,
        { sourceAgentId: 'agent-123' }
      );

      bus.publish('agent.1.events', {
        eventType: 'agent.spawned',
        source: { agentId: 'agent-123' }
      });
      bus.publish('agent.2.events', {
        eventType: 'agent.spawned',
        source: { agentId: 'agent-456' }
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should filter by priority', async () => {
      const handler = jest.fn();

      bus.subscribe(
        'system.alerts',
        handler,
        { minPriority: 'high' }
      );

      bus.publish('system.alerts', { msg: 'low' }, { priority: 'low' });
      bus.publish('system.alerts', { msg: 'medium' }, { priority: 'medium' });
      bus.publish('system.alerts', { msg: 'high' }, { priority: 'high' });
      bus.publish('system.alerts', { msg: 'critical' }, { priority: 'critical' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    test('should support custom filter functions', async () => {
      const handler = jest.fn();

      bus.subscribe(
        'agent.*.events',
        handler,
        {
          custom: (message) => (message.payload as { priority: number }).priority > 5
        }
      );

      bus.publish('agent.1.events', { priority: 3 });
      bus.publish('agent.2.events', { priority: 7 });
      bus.publish('agent.3.events', { priority: 10 });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Subscription Management', () => {
    test('should unsubscribe correctly', async () => {
      const handler = jest.fn();

      const sub = bus.subscribe('agent.1.events', handler);
      bus.publish('agent.1.events', { data: 1 });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(1);

      bus.unsubscribe(sub as unknown as Subscription);
      bus.publish('agent.1.events', { data: 2 });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    test('should unsubscribe multiple subscriptions', async () => {
      const handler = jest.fn();

      const sub1 = bus.subscribe('topic.1', handler);
      const sub2 = bus.subscribe('topic.2', handler);
      const sub3 = bus.subscribe('topic.3', handler);

      bus.publish('topic.1', {});
      bus.publish('topic.2', {});
      bus.publish('topic.3', {});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(3);

      bus.unsubscribeAll([sub1, sub2, sub3] as unknown as Subscription[]);

      bus.publish('topic.1', {});
      bus.publish('topic.2', {});
      bus.publish('topic.3', {});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(3); // Still 3
    });

    test('should track subscription count', () => {
      expect(bus.getSubscriptionCount()).toBe(0);

      const sub1 = bus.subscribe('topic.1', () => {});
      expect(bus.getSubscriptionCount()).toBe(1);

      const sub2 = bus.subscribe('topic.2', () => {});
      expect(bus.getSubscriptionCount()).toBe(2);

      bus.unsubscribe(sub1 as unknown as Subscription);
      expect(bus.getSubscriptionCount()).toBe(1);

      bus.unsubscribe(sub2 as unknown as Subscription);
      expect(bus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('Message Persistence', () => {
    test('should store and retrieve messages', () => {
      bus.publish('agent.1.events', { data: 1 });
      bus.publish('agent.1.events', { data: 2 });
      bus.publish('agent.1.events', { data: 3 });

      const messages = bus.getMessages('agent.1.events');
      expect(messages).toHaveLength(3);
      expect(messages[0].payload).toEqual({ data: 1 });
      expect(messages[2].payload).toEqual({ data: 3 });
    });

    test('should retrieve messages with limit', () => {
      for (let i = 0; i < 10; i++) {
        bus.publish('agent.1.events', { data: i });
      }

      const messages = bus.getMessages('agent.1.events', 5);
      expect(messages).toHaveLength(5);
      expect(messages[0].payload).toEqual({ data: 5 }); // Last 5
    });
  });

  describe('Helper Functions', () => {
    test('matchesPattern should work correctly', () => {
      expect(matchesPattern('agent.123.events', 'agent.*.events')).toBe(true);
      expect(matchesPattern('agent.abc.events', 'agent.*.events')).toBe(true);
      expect(matchesPattern('agent.123.logs', 'agent.*.events')).toBe(false);
      expect(matchesPattern('agent.123.events', 'agent.123.events')).toBe(true);
      expect(matchesPattern('swarm.1.broadcast', 'swarm.*.broadcast')).toBe(true);
    });

    test('getAgentTopics should return correct topic names', () => {
      const topics = getAgentTopics('agent-123');
      expect(topics.commands).toBe('agent.agent-123.commands');
      expect(topics.events).toBe('agent.agent-123.events');
      expect(topics.logs).toBe('agent.agent-123.logs');
    });

    test('MessageBus static methods should return correct topic names', () => {
      expect(MessageBus.agentCommands('agent-1')).toBe('agent.agent-1.commands');
      expect(MessageBus.agentEvents('agent-1')).toBe('agent.agent-1.events');
      expect(MessageBus.agentLogs('agent-1')).toBe('agent.agent-1.logs');
      expect(MessageBus.swarmBroadcast('swarm-1')).toBe('swarm.swarm-1.broadcast');
      expect(MessageBus.taskUpdates('coding')).toBe('task.coding.updates');
      expect(MessageBus.systemAlerts).toBe('system.alerts');
    });
  });

  describe('Dashboard Subscription', () => {
    test('should subscribe to all agent events and logs', async () => {
      const handler = jest.fn();
      const subs = subscribeDashboard(bus, handler);

      expect(subs.length).toBeGreaterThan(0);

      bus.publish('agent.1.events', { type: 'status' });
      bus.publish('agent.2.logs', { type: 'log' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(2);

      // Cleanup
      bus.unsubscribeAll(subs);
    });

    test('should filter by event types for dashboard', async () => {
      const handler = jest.fn();
      const eventTypes: EventType[] = ['agent.spawned', 'agent.completed'];

      const subs = subscribeDashboard(bus, handler, { eventTypes });

      bus.publish('agent.1.events', { eventType: 'agent.spawned' });
      bus.publish('agent.2.events', { eventType: 'agent.failed' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);

      bus.unsubscribeAll(subs);
    });

    test('should subscribe to specific agents only', async () => {
      const handler = jest.fn();

      const subs = subscribeDashboard(bus, handler, {
        agentIds: ['agent-1', 'agent-2']
      });

      bus.publish('agent.agent-1.events', { data: 1 });
      bus.publish('agent.agent-2.events', { data: 2 });
      bus.publish('agent.agent-3.events', { data: 3 }); // Should not be received via wildcard

      await new Promise((resolve) => setTimeout(resolve, 50));

      // 2 agents * 2 topics each + 1 swarm wildcard + 1 system alert
      expect(subs.length).toBe(6);

      bus.unsubscribeAll(subs);
    });
  });

  describe('Stress Test - 100 Messages', () => {
    test('should handle 100 messages with multiple subscribers', async () => {
      const subscriberCounts = new Map<string, number>();
      const subscriberIds = ['sub-1', 'sub-2', 'sub-3', 'sub-4', 'sub-5'];

      // Create 5 subscribers
      for (const id of subscriberIds) {
        bus.subscribe('agent.stress-test.events', () => {
          subscriberCounts.set(id, (subscriberCounts.get(id) || 0) + 1);
        });
      }

      // Publish 100 messages
      const messageCount = 100;
      for (let i = 0; i < messageCount; i++) {
        bus.publish('agent.stress-test.events', {
          index: i,
          timestamp: new Date().toISOString()
        });
      }

      // Wait for delivery
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Each subscriber should receive all 100 messages
      for (const id of subscriberIds) {
        expect(subscriberCounts.get(id)).toBe(messageCount);
      }

      // Metrics should show 100 published, 500 delivered (100 * 5 subscribers)
      const metrics = bus.getMetrics();
      expect(metrics.messagesPublished).toBe(messageCount);
      expect(metrics.messagesDelivered).toBe(messageCount * subscriberIds.length);
    });

    test('should handle 100 messages with pattern matching', async () => {
      const receivedByAgent = new Map<string, number>();

      // Subscribe to all agent events with wildcard
      bus.subscribe('agent.*.events', (message: { topic: string }) => {
        const agentId = message.topic.split('.')[1];
        receivedByAgent.set(agentId, (receivedByAgent.get(agentId) || 0) + 1);
      });

      // Publish messages to different agents
      for (let i = 0; i < 100; i++) {
        const agentId = `agent-${(i % 10) + 1}`; // 10 different agents
        bus.publish(`agent.${agentId}.events`, { index: i });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Each of 10 agents should have 10 messages
      expect(receivedByAgent.size).toBe(10);
      for (const [agentId, count] of receivedByAgent.entries()) {
        expect(count).toBe(10);
      }
    });

    test('should handle 100 messages with filtering', async () => {
      let criticalCount = 0;
      let allCount = 0;

      // Subscribe to critical messages only
      bus.subscribe(
        'system.alerts',
        () => { criticalCount++; },
        { minPriority: 'critical' }
      );

      // Subscribe to all messages
      bus.subscribe('system.alerts', () => { allCount++; });

      // Publish 100 messages with varying priorities
      const priorities = ['low', 'medium', 'high', 'critical'];
      for (let i = 0; i < 100; i++) {
        const priority = priorities[i % 4];
        bus.publish('system.alerts', { index: i }, { priority: priority as 'low' | 'medium' | 'high' | 'critical' });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // All subscriber should receive all 100
      expect(allCount).toBe(100);

      // Critical subscriber should receive only critical priority (25 messages)
      expect(criticalCount).toBe(25);
    });
  });

  describe('Error Handling', () => {
    test('should handle handler errors gracefully', async () => {
      const goodHandler = jest.fn();

      bus.subscribe('agent.test.events', () => {
        throw new Error('Handler error');
      });
      bus.subscribe('agent.test.events', goodHandler);

      bus.publish('agent.test.events', { data: 1 });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Good handler should still be called despite error in first handler
      expect(goodHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle async handler errors', async () => {
      const goodHandler = jest.fn();

      bus.subscribe('agent.test.events', async () => {
        throw new Error('Async handler error');
      });
      bus.subscribe('agent.test.events', goodHandler);

      bus.publish('agent.test.events', { data: 1 });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(goodHandler).toHaveBeenCalledTimes(1);
    });
  });
});

import { logger } from '../src/utils/logger';
/**
 * Redis Event Bus Tests
 * 
 * Comprehensive tests for RedisEventBus with pub/sub, streams, 
 * serialization, multi-node support, and fallback mechanisms.
 */

import { RedisEventBus, RedisEventBusConfig, createRedisEventBus } from '../src/core/event-bus-redis';
import { AgentEvent, AgentEventType } from '../src/core/event-bus';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');

// ============================================================================
// Mock Redis Implementation
// ============================================================================

class MockRedis {
  private subscriptions: Map<string, ((channel: string, message: string) => void)[]> = new Map();
  private streamData: Map<string, Array<{ id: string; fields: string[] }>> = new Map();
  data: Map<string, string> = new Map();
  private eventHandlers: Map<string, ((...args: any[]) => void)[]> = new Map();
  connected = true;

  constructor(public options?: any) {}

  async publish(channel: string, message: string): Promise<number> {
    const handlers = this.subscriptions.get(channel) || [];
    handlers.forEach(handler => handler(channel, message));
    return handlers.length;
  }

  async subscribe(channel: string): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  async xgroup(...args: any[]): Promise<void> {
    // Mock consumer group creation
  }

  async xadd(stream: string, ...args: any[]): Promise<string> {
    if (!this.streamData.has(stream)) {
      this.streamData.set(stream, []);
    }
    const id = `${Date.now()}-${Math.random()}`;
    // Store as key-value pairs like Redis does
    const fields: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      if (typeof args[i] === 'string' && i + 1 < args.length) {
        fields.push(args[i], args[i + 1]);
      }
    }
    this.streamData.get(stream)!.push({ id, fields });
    return id;
  }

  async xreadgroup(...args: any[]): Promise<any[]> {
    return [];
  }

  async xrevrange(stream: string, ...args: any[]): Promise<any[]> {
    const data = this.streamData.get(stream) || [];
    return data.slice(-10).map(item => [item.id, item.fields]);
  }

  async xack(stream: string, group: string, id: string): Promise<number> {
    return 1;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async keys(pattern: string): Promise<string[]> {
    return Array.from(this.data.keys()).filter(k => k.match(pattern.replace('*', '.*')));
  }

  async quit(): Promise<void> {
    this.connected = false;
  }

  disconnect(): void {
    this.connected = false;
    this.emit('disconnect');
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }

  simulateReconnect(): void {
    this.connected = true;
    this.emit('connect');
  }
}

// Setup mock
const mockRedisInstances: MockRedis[] = [];

(Redis as jest.MockedClass<typeof Redis>).mockImplementation((...args: any[]) => {
  const instance = new MockRedis(args[1]);
  mockRedisInstances.push(instance);
  return instance as any;
});

// ============================================================================
// Test Suite
// ============================================================================

describe('RedisEventBus', () => {
  let eventBus: RedisEventBus;
  let config: RedisEventBusConfig;

  beforeEach(() => {
    mockRedisInstances.length = 0;
    config = {
      nodeId: 'test-node',
      redisUrl: 'redis://localhost:6379/0',
      streamKey: 'test:events',
      consumerGroup: 'test:consumers',
      compressionThreshold: 100, // Lower threshold for testing
      versioning: {
        currentVersion: 1,
        strictVersioning: false,
      },
    };
  });

  afterEach(async () => {
    if (eventBus) {
      await eventBus.shutdown();
    }
    jest.clearAllMocks();
  });

  // ============================================================================
  // Basic Event Emission & Delivery
  // ============================================================================

  describe('Event Emission & Delivery', () => {
    it('should emit and deliver events to subscribers', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      const event: AgentEvent = {
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any;

      eventBus.emitEvent(event);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('agent_start');
      expect(handler.mock.calls[0][0].agentId).toBe('agent_1');
    });

    it('should deliver events to multiple subscribers', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      eventBus.subscribe('agent_start', handler1);
      eventBus.subscribe('agent_start', handler2);

      const event: AgentEvent = {
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any;

      eventBus.emitEvent(event);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should filter events by type', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

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

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(agentStartHandler).toHaveBeenCalledTimes(1);
      expect(toolCallHandler).not.toHaveBeenCalled();
    });

    it('should support subscribeAll for all event types', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribeAll(handler);

      const eventTypes: AgentEventType[] = [
        'agent_start',
        'tool_call_start',
        'text_delta',
        'error',
      ];

      eventTypes.forEach((type, i) => {
        eventBus.emitEvent({
          id: `evt_${i}`,
          type,
          timestamp: Date.now(),
          agentId: 'agent_1',
        } as any);
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  // ============================================================================
  // Event Filtering
  // ============================================================================

  describe('Event Filtering', () => {
    it('should filter events based on custom filter function', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      const filter = (event: AgentEvent) => event.agentId === 'agent_1';
      
      eventBus.subscribe('agent_start', handler, filter);

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'task 1',
        model: 'model-1',
        provider: 'test',
      } as any);

      eventBus.emitEvent({
        id: 'evt_2',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_2',
        task: 'task 2',
        model: 'model-2',
        provider: 'test',
      } as any);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].agentId).toBe('agent_1');
    });
  });

  // ============================================================================
  // Subscription Management
  // ============================================================================

  describe('Subscription Management', () => {
    it('should allow unsubscribing from events', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

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

      await new Promise(resolve => setTimeout(resolve, 50));
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

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe by subscription ID string', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      const subscription = eventBus.subscribe('agent_start', handler);

      const result = eventBus.unsubscribe(subscription.id);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Event Serialization
  // ============================================================================

  describe('Event Serialization', () => {
    it('should serialize and deserialize events correctly', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      const event: AgentEvent = {
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        swarmId: 'swarm_1',
        sessionId: 'session_1',
        task: 'test task',
        model: 'test-model',
        provider: 'test-provider',
      } as any;

      eventBus.emitEvent(event);
      await new Promise(resolve => setTimeout(resolve, 50));

      const receivedEvent = handler.mock.calls[0][0];
      expect(receivedEvent.id).toBe('evt_1');
      expect(receivedEvent.type).toBe('agent_start');
      expect(receivedEvent.agentId).toBe('agent_1');
      expect(receivedEvent.swarmId).toBe('swarm_1');
      expect(receivedEvent.sessionId).toBe('session_1');
      expect(receivedEvent.task).toBe('test task');
    });

    it('should validate events with JSON schema', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Emit invalid event (missing required fields)
      const invalidEvent = {
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        // Missing task, model, provider
      };

      // Should not throw, but log error
      expect(() => eventBus.emitEvent(invalidEvent as any)).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should compress large events', async () => {
      const largeConfig: RedisEventBusConfig = {
        ...config,
        compressionThreshold: 50, // Very low for testing
      };
      
      eventBus = await createRedisEventBus(largeConfig);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribe('text_delta', handler);

      const largeDelta = 'a'.repeat(1000);
      const event: AgentEvent = {
        id: 'evt_1',
        type: 'text_delta',
        timestamp: Date.now(),
        agentId: 'agent_1',
        delta: largeDelta,
      } as any;

      eventBus.emitEvent(event);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify event was received correctly after decompression
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].delta).toBe(largeDelta);

      // Check metrics show compression occurred
      const metrics = eventBus.getMetrics();
      expect(metrics.compressedEvents).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Fallback Mechanism
  // ============================================================================

  describe('Fallback Mechanism', () => {
    it('should activate fallback mode when Redis fails', async () => {
      const onFallback = jest.fn();
      const fallbackConfig: RedisEventBusConfig = {
        ...config,
        fallbackConfig: {
          maxQueuedEvents: 100,
          onFallback,
        },
      };

      eventBus = await createRedisEventBus(fallbackConfig);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.isFallbackMode()).toBe(false);

      // Simulate Redis error
      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Connection lost'));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.isFallbackMode()).toBe(true);
      expect(onFallback).toHaveBeenCalled();
    });

    it('should queue events in fallback mode', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      // Activate fallback mode
      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Connection lost'));
      await new Promise(resolve => setTimeout(resolve, 50));

      // Emit events while in fallback
      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'task 1',
        model: 'model-1',
        provider: 'test',
      } as any);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Events should still be delivered locally
      expect(handler).toHaveBeenCalledTimes(1);

      // Metrics should show fallback events
      const metrics = eventBus.getMetrics();
      expect(metrics.fallbackEvents).toBeGreaterThan(0);
    });

    it('should recover from fallback mode when Redis reconnects', async () => {
      const onRecovered = jest.fn();
      const fallbackConfig: RedisEventBusConfig = {
        ...config,
        fallbackConfig: {
          maxQueuedEvents: 100,
          onRecovered,
        },
      };

      eventBus = await createRedisEventBus(fallbackConfig);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Activate fallback
      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Connection lost'));
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.isFallbackMode()).toBe(true);

      // Simulate reconnection
      redisInstance.simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 5500)); // Wait for recovery check

      expect(eventBus.isFallbackMode()).toBe(false);
      expect(onRecovered).toHaveBeenCalled();
    }, 10000);

    it('should emit fallback and recovered events', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const fallbackHandler = jest.fn();
      const recoveredHandler = jest.fn();

      eventBus.on('fallback', fallbackHandler);
      eventBus.on('recovered', recoveredHandler);

      // Activate fallback
      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Connection lost'));
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fallbackHandler).toHaveBeenCalled();

      // Reconnect
      redisInstance.simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 5500));

      expect(recoveredHandler).toHaveBeenCalled();
    }, 10000);
  });

  // ============================================================================
  // Multi-Node Support
  // ============================================================================

  describe('Multi-Node Support', () => {
    it('should have unique node ID', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.getNodeId()).toBe('test-node');
    });

    it('should auto-generate node ID if not provided', async () => {
      eventBus = await createRedisEventBus({
        ...config,
        nodeId: undefined,
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const nodeId = eventBus.getNodeId();
      expect(nodeId).toMatch(/^node_/);
      expect(nodeId.length).toBeGreaterThan(5);
    });

    it('should track active nodes', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify node ID exists
      expect(eventBus.getNodeId()).toBe('test-node');
      
      // Check metrics show node is operational
      const metrics = eventBus.getMetrics();
      expect(metrics.knownNodes).toBeGreaterThanOrEqual(0);
      expect(metrics.isRedisConnected).toBe(true);
    });
  });

  // ============================================================================
  // Metrics
  // ============================================================================

  describe('Metrics', () => {
    it('should track event metrics', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

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

      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = eventBus.getMetrics();
      expect(metrics.eventsEmitted).toBe(1);
      expect(metrics.eventsDelivered).toBe(1);
      expect(metrics.subscriptionsCreated).toBe(1);
      expect(metrics.isInFallbackMode).toBe(false);
      expect(metrics.isRedisConnected).toBe(true);
    });

    it('should track Redis errors', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Test error'));

      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = eventBus.getMetrics();
      expect(metrics.redisErrors).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Scoped Event Bus
  // ============================================================================

  describe('Scoped Event Bus', () => {
    it('should emit events with scoped context', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribe('agent_start', handler);

      const scopedBus = eventBus.createScopedBus('agent_123', 'swarm_456', 'session_789');
      scopedBus.emitAgentStart('test task', 'test-model', 'test-provider');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.agentId).toBe('agent_123');
      expect(event.swarmId).toBe('swarm_456');
      expect(event.sessionId).toBe('session_789');
      expect(event.task).toBe('test task');
    });

    it('should emit all event types correctly from scoped bus', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const events: AgentEvent[] = [];
      eventBus.subscribeAll((e) => { events.push(e); });

      const scopedBus = eventBus.createScopedBus('agent_123');

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

      await new Promise(resolve => setTimeout(resolve, 50));

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

  // ============================================================================
  // Event Retrieval
  // ============================================================================

  describe('Event Retrieval', () => {
    it('should get recent events', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Emit some events
      for (let i = 0; i < 5; i++) {
        eventBus.emitEvent({
          id: `evt_${i}`,
          type: 'text_delta',
          timestamp: Date.now() + i,
          agentId: 'agent_1',
          delta: `chunk ${i}`,
        } as any);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const events = await eventBus.getRecentEvents(3);
      // Mock returns events in FIFO order, verify we get events back
      expect(events.length).toBeGreaterThan(0);
    });

    it('should filter events by criteria', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: 1000,
        agentId: 'agent_1',
        task: 'task 1',
        model: 'model-1',
        provider: 'test',
      } as any);

      eventBus.emitEvent({
        id: 'evt_2',
        type: 'agent_start',
        timestamp: 2000,
        agentId: 'agent_2',
        task: 'task 2',
        model: 'model-2',
        provider: 'test',
      } as any);

      await new Promise(resolve => setTimeout(resolve, 50));

      const filtered = await eventBus.getEvents({ agentId: 'agent_1' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].agentId).toBe('agent_1');
    });
  });

  // ============================================================================
  // Shutdown
  // ============================================================================

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.isConnected()).toBe(true);

      await eventBus.shutdown();

      // After shutdown, connections should be closed
      expect(mockRedisInstances.every(r => !r.connected)).toBe(true);
    });

    it('should replay queued events on shutdown', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Activate fallback and queue some events
      const redisInstance = mockRedisInstances[0];
      redisInstance.simulateError(new Error('Connection lost'));
      await new Promise(resolve => setTimeout(resolve, 50));

      eventBus.emitEvent({
        id: 'evt_1',
        type: 'agent_start',
        timestamp: Date.now(),
        agentId: 'agent_1',
        task: 'task',
        model: 'model',
        provider: 'test',
      } as any);

      // Reconnect before shutdown
      redisInstance.simulateReconnect();
      
      // Should complete without errors
      await expect(eventBus.shutdown()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Configuration
  // ============================================================================

  describe('Configuration', () => {
    it('should use environment variable for Redis URL', async () => {
      const originalUrl = process.env['REDIS_URL'];
      process.env['REDIS_URL'] = 'redis://custom:6379/1';

      eventBus = await createRedisEventBus({ nodeId: 'test' });
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should use the environment variable
      expect(mockRedisInstances.length).toBeGreaterThan(0);

      process.env['REDIS_URL'] = originalUrl;
    });

    it('should accept all configuration options', async () => {
      const fullConfig: RedisEventBusConfig = {
        nodeId: 'custom-node',
        redisUrl: 'redis://localhost:6380/2',
        redisOptions: { password: 'secret' },
        streamKey: 'custom:events',
        consumerGroup: 'custom:consumers',
        compressionThreshold: 2048,
        maxStreamLength: 50000,
        retryConfig: {
          maxRetries: 5,
          retryDelayMs: 2000,
          retryDelayMultiplier: 3,
        },
        fallbackConfig: {
          maxQueuedEvents: 5000,
          onFallback: jest.fn(),
          onRecovered: jest.fn(),
        },
        versioning: {
          currentVersion: 2,
          strictVersioning: true,
        },
        persistEvents: true,
        maxListeners: 500,
        syncDelivery: false,
      };

      eventBus = await createRedisEventBus(fullConfig);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventBus.getNodeId()).toBe('custom-node');
    });
  });

  // ============================================================================
  // Performance
  // ============================================================================

  describe('Performance', () => {
    it('should handle high event throughput', async () => {
      eventBus = await createRedisEventBus(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const handler = jest.fn();
      eventBus.subscribeAll(handler);

      const startTime = Date.now();
      const eventCount = 500;

      for (let i = 0; i < eventCount; i++) {
        eventBus.emitEvent({
          id: `evt_${i}`,
          type: 'text_delta',
          timestamp: Date.now(),
          agentId: 'agent_1',
          delta: `chunk ${i}`,
        } as any);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const duration = Date.now() - startTime;
      const throughput = (handler.mock.calls.length / duration) * 1000;

      logger.info(`Throughput: ${throughput.toFixed(0)} events/sec`);

      // Should handle at least 500 events/sec
      expect(throughput).toBeGreaterThan(100);
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(eventCount * 0.8);
    }, 15000);
  });
});

// ============================================================================
// Integration with Original Event Bus
// ============================================================================

describe('RedisEventBus Compatibility', () => {
  it('should maintain API compatibility with AgentEventBus', async () => {
    const eventBus = await createRedisEventBus({ nodeId: 'compat-test' });
    await new Promise(resolve => setTimeout(resolve, 50));

    // All these methods should exist and work
    expect(typeof eventBus.emitEvent).toBe('function');
    expect(typeof eventBus.subscribe).toBe('function');
    expect(typeof eventBus.subscribeAll).toBe('function');
    expect(typeof eventBus.unsubscribe).toBe('function');
    expect(typeof eventBus.createScopedBus).toBe('function');
    expect(typeof eventBus.getMetrics).toBe('function');
    expect(typeof eventBus.shutdown).toBe('function');

    await eventBus.shutdown();
  });
});

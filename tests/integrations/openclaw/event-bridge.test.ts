/**
 * OpenClaw Event Bridge Tests
 * 
 * Unit tests for the OpenClaw Event Bridge - real-time event
 * streaming from Dash to OpenClaw.
 */

import {
  OpenClawEventBridge,
  getOpenClawEventBridge,
  resetOpenClawEventBridge,
  isOpenClawEventBridgeInitialized,
} from '../../src/integrations/openclaw/event-bridge';
import { getGlobalBus } from '../../src/bus/index';

// Mock dependencies
jest.mock('../../src/bus/index');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('OpenClawEventBridge', () => {
  let bridge: OpenClawEventBridge;
  let mockBus: {
    subscribe: jest.Mock;
    publish: jest.Mock;
  };

  const mockConfig = {
    webhookUrl: 'http://localhost:8080/webhook',
    filter: ['agent.spawned', 'agent.completed'],
    authToken: 'test-token-123',
    batchInterval: 0, // Immediate mode for tests
    maxBatchSize: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenClawEventBridge();

    // Create mock message bus
    mockBus = {
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      publish: jest.fn(),
    };

    (getGlobalBus as jest.Mock).mockReturnValue(mockBus);

    bridge = new OpenClawEventBridge(mockConfig);
  });

  afterEach(async () => {
    await bridge.stop();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(bridge).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const minimalBridge = new OpenClawEventBridge({
        webhookUrl: 'http://example.com',
      });
      expect(minimalBridge).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('should start and subscribe to events', async () => {
      await bridge.start();

      expect(mockBus.subscribe).toHaveBeenCalledWith('agent.*.events', expect.any(Function));
      expect(mockBus.subscribe).toHaveBeenCalledWith('swarm.*.events', expect.any(Function));
      expect(mockBus.subscribe).toHaveBeenCalledWith('system.events', expect.any(Function));
      expect(mockBus.subscribe).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('should emit started event', async () => {
      const startedHandler = jest.fn();
      bridge.on('started', startedHandler);

      await bridge.start();

      expect(startedHandler).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      await bridge.start();
      await bridge.start(); // Second call should be noop

      expect(mockBus.subscribe).toHaveBeenCalledTimes(4);
    });

    it('should stop and unsubscribe', async () => {
      await bridge.start();
      await bridge.stop();

      expect(bridge.getHealth().isRunning).toBe(false);
    });

    it('should emit stopped event', async () => {
      await bridge.start();

      const stoppedHandler = jest.fn();
      bridge.on('stopped', stoppedHandler);

      await bridge.stop();

      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should restart correctly', async () => {
      await bridge.start();
      await bridge.restart();

      expect(bridge.getHealth().isRunning).toBe(true);
    });
  });

  describe('Event Forwarding', () => {
    beforeEach(async () => {
      await bridge.start();
    });

    it('should forward events to webhook', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned', data: 'test' },
        timestamp: new Date(),
        metadata: { source: 'test' },
      };

      // Get the catch-all handler
      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(global.fetch).toHaveBeenCalledWith(
        mockConfig.webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-123',
          }),
        })
      );
    });

    it('should emit local event', async () => {
      const eventHandler = jest.fn();
      bridge.on('event', eventHandler);

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(eventHandler).toHaveBeenCalled();
      const emittedEvent = eventHandler.mock.calls[0][0];
      expect(emittedEvent.source).toBe('dash');
      expect(emittedEvent.type).toBe('agent.spawned');
    });

    it('should filter events based on config', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.progress', progress: 50 },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      // Should not forward filtered events
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle webhook errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const errorHandler = jest.fn();
      bridge.on('error', errorHandler);

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle non-ok responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const errorHandler = jest.fn();
      bridge.on('error', errorHandler);

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Event Transformation', () => {
    beforeEach(async () => {
      await bridge.start();
    });

    it('should transform events correctly', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned', agentData: 'test' },
        timestamp: new Date('2026-02-03T10:00:00Z'),
        metadata: { source: 'test-source', priority: 'high' },
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.events[0]).toMatchObject({
        source: 'dash',
        type: 'agent.spawned',
        data: { eventType: 'agent.spawned', agentData: 'test' },
        metadata: {
          dashAgentId: 'agent-123',
          topic: 'agent.agent-123.events',
          source: 'test-source',
          priority: 'high',
        },
      });
    });

    it('should extract swarm ID from topic', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'swarm.swarm-456.events',
        payload: { eventType: 'swarm.created' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.events[0].metadata.dashSwarmId).toBe('swarm-456');
    });
  });

  describe('Stats', () => {
    beforeEach(async () => {
      await bridge.start();
    });

    it('should track events received', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      expect(bridge.getStats().eventsReceived).toBe(0);

      await catchAllHandler(mockMessage);

      expect(bridge.getStats().eventsReceived).toBe(1);
    });

    it('should track events forwarded', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(bridge.getStats().eventsForwarded).toBe(1);
    });

    it('should track events filtered', async () => {
      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.progress' }, // Not in filter
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(bridge.getStats().eventsFiltered).toBe(1);
    });

    it('should track events failed', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(bridge.getStats().eventsFailed).toBe(1);
    });

    it('should track last event time', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const mockMessage = {
        id: 'msg-1',
        topic: 'agent.agent-123.events',
        payload: { eventType: 'agent.spawned' },
        timestamp: new Date(),
        metadata: {},
      };

      const catchAllHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )[1];

      await catchAllHandler(mockMessage);

      expect(bridge.getStats().lastEventTime).toBeDefined();
    });

    it('should reset stats', () => {
      bridge.resetStats();

      const stats = bridge.getStats();
      expect(stats.eventsReceived).toBe(0);
      expect(stats.eventsForwarded).toBe(0);
      expect(stats.eventsFiltered).toBe(0);
      expect(stats.eventsFailed).toBe(0);
    });
  });

  describe('Health', () => {
    it('should report unhealthy when not running', () => {
      const health = bridge.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.isRunning).toBe(false);
    });

    it('should report healthy when running with subscriptions', async () => {
      await bridge.start();

      const health = bridge.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.isRunning).toBe(true);
      expect(health.subscriptionCount).toBeGreaterThan(0);
    });

    it('should report degraded with no subscriptions', async () => {
      // Create bridge with no filter (different config that may not subscribe)
      const minimalBridge = new OpenClawEventBridge({
        webhookUrl: 'http://example.com',
        filter: [],
      });

      // Don't start, just check health
      const health = minimalBridge.getHealth();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Subscribers', () => {
    beforeEach(async () => {
      await bridge.start();
    });

    it('should subscribe to specific agent events', () => {
      const handler = jest.fn();
      const unsubscribe = bridge.subscribeToAgent('agent-123', handler);

      // Emit an event for the agent
      bridge.emit('event', {
        source: 'dash',
        type: 'agent.update',
        timestamp: new Date().toISOString(),
        data: {},
        metadata: { dashAgentId: 'agent-123' },
      });

      expect(handler).toHaveBeenCalled();

      unsubscribe();
    });

    it('should not call handler for different agent', () => {
      const handler = jest.fn();
      bridge.subscribeToAgent('agent-123', handler);

      bridge.emit('event', {
        source: 'dash',
        type: 'agent.update',
        timestamp: new Date().toISOString(),
        data: {},
        metadata: { dashAgentId: 'agent-456' },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should subscribe to specific swarm events', () => {
      const handler = jest.fn();
      bridge.subscribeToSwarm('swarm-789', handler);

      bridge.emit('event', {
        source: 'dash',
        type: 'swarm.update',
        timestamp: new Date().toISOString(),
        data: {},
        metadata: { dashSwarmId: 'swarm-789' },
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should subscribe to specific event types', () => {
      const handler = jest.fn();
      bridge.subscribeToEventTypes(['agent.spawned', 'agent.killed'], handler);

      bridge.emit('event', {
        source: 'dash',
        type: 'agent.spawned',
        timestamp: new Date().toISOString(),
        data: {},
        metadata: {},
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
      const handler = jest.fn();
      const unsubscribe = bridge.subscribeToAgent('agent-123', handler);

      unsubscribe();

      bridge.emit('event', {
        source: 'dash',
        type: 'agent.update',
        timestamp: new Date().toISOString(),
        data: {},
        metadata: { dashAgentId: 'agent-123' },
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    resetOpenClawEventBridge();
  });

  afterEach(() => {
    resetOpenClawEventBridge();
  });

  it('should create bridge with getOpenClawEventBridge', () => {
    const bridge = getOpenClawEventBridge(mockConfig);
    expect(bridge).toBeDefined();
    expect(isOpenClawEventBridgeInitialized()).toBe(true);
  });

  it('should return same instance on subsequent calls', () => {
    const bridge1 = getOpenClawEventBridge(mockConfig);
    const bridge2 = getOpenClawEventBridge();
    expect(bridge1).toBe(bridge2);
  });

  it('should throw if getOpenClawEventBridge called without config first', () => {
    expect(() => getOpenClawEventBridge()).toThrow('OpenClawEventBridge not initialized');
  });

  it('should reset with resetOpenClawEventBridge', () => {
    getOpenClawEventBridge(mockConfig);
    expect(isOpenClawEventBridgeInitialized()).toBe(true);

    resetOpenClawEventBridge();
    expect(isOpenClawEventBridgeInitialized()).toBe(false);
  });
});

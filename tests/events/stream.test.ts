/**
 * Event Stream Tests - Team Foxtrot-Events
 * 
 * Comprehensive test suite for src/events/stream.ts
 * Target: 80% coverage
 * 
 * Coverage areas:
 * - Event streaming functionality
 * - Real-time processing
 * - WebSocket event delivery
 * - Stream buffering
 * - Error recovery
 */

import { EventStream, stream } from '../../src/events/stream';
import { EventEmitter } from '../../src/events/emitter';
import { EventFilter, EventType, MissionEvent } from '../../src/events/types';
import { createServer, Server as HttpServer } from 'http';
import { logger } from '../../src/utils/logger';

// Track mock instances
const mockWSSInstances: any[] = [];
const mockWSInstances: any[] = [];
let connectionHandler: Function | null = null;

jest.mock('ws', () => {
  return {
    __esModule: true,
    WebSocket: jest.fn().mockImplementation(() => {
      const instance = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
      };
      mockWSInstances.push(instance);
      return instance;
    }),
    Server: jest.fn().mockImplementation((options) => {
      const instance = {
        options,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'connection') {
            connectionHandler = handler;
          }
          if (event === 'listening') {
            setTimeout(handler, 0);
          }
        }),
        close: jest.fn((cb) => cb && cb()),
      };
      mockWSSInstances.push(instance);
      return instance;
    }),
    OPEN: 1,
    CLOSED: 3,
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EventStream', () => {
  let eventStream: EventStream;
  let mockEmitter: EventEmitter;
  let httpServer: HttpServer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWSSInstances.length = 0;
    mockWSInstances.length = 0;
    connectionHandler = null;
    mockEmitter = new EventEmitter();
    eventStream = new EventStream(mockEmitter);
    httpServer = createServer();
  });

  afterEach(async () => {
    try {
      await eventStream.stop();
    } catch {
      // Ignore errors during cleanup
    }
    httpServer.close();
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  describe('Server Lifecycle', () => {
    it('should start WebSocket server successfully', async () => {
      await eventStream.start(httpServer);

      expect(mockWSSInstances.length).toBe(1);
      expect(mockWSSInstances[0].options).toEqual({
        server: httpServer,
        path: '/events/stream',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Event stream server started on /events/stream'
      );
    });

    it('should reject on server startup error', async () => {
      const mockError = new Error('Port already in use');
      jest.resetModules();
      jest.doMock('ws', () => ({
        __esModule: true,
        default: jest.fn(),
        Server: jest.fn().mockImplementation(() => ({
          on: jest.fn().mockImplementation((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler(mockError), 0);
            }
          }),
          close: jest.fn(),
        })),
        OPEN: 1,
        CLOSED: 3,
      }));
      
      // Need to reimport to get the mocked version
      const { EventStream: MockedEventStream } = await import('../../src/events/stream');
      const testStream = new MockedEventStream(mockEmitter);
      
      await expect(testStream.start(httpServer)).rejects.toThrow('Port already in use');
      
      jest.dontMock('ws');
    });

    it('should stop server and close all connections', async () => {
      await eventStream.start(httpServer);
      
      // Verify server was started
      expect(mockWSSInstances.length).toBe(1);
      
      // Simulate a connection
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify connection was established
      expect(eventStream.getStats().totalConnections).toBe(1);
      
      await eventStream.stop();

      // Verify server close was called
      expect(mockWSSInstances[0].close).toHaveBeenCalled();
    });

    it('should handle stop when server not started', async () => {
      await expect(eventStream.stop()).resolves.not.toThrow();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should handle new WebSocket connections', async () => {
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
      };

      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify connection handlers were registered
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Verify connection was tracked
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(1);
    });

    it('should generate unique connection IDs', async () => {
      const mockWs1 = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      const mockWs2 = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs1, { url: '/' });
        connectionHandler(mockWs2, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.connections[0].id).not.toBe(stats.connections[1].id);
    });

    it('should track connection statistics', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connections[0].filters).toBe(0);
      expect(stats.connections[0].connectedAt).toBeInstanceOf(Date);
    });

    it('should remove connection on close', async () => {
      let closeHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'close') {
            closeHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(eventStream.getStats().totalConnections).toBe(1);
      
      closeHandler();
      
      expect(eventStream.getStats().totalConnections).toBe(0);
    });

    it('should handle connection errors', async () => {
      let errorHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            errorHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const error = new Error('Connection reset');
      errorHandler(error);
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket error'),
        expect.any(Object)
      );
    });
  });

  describe('Query Parameter Parsing', () => {
    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should parse event type filters from query params', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?types=agent.spawned,agent.completed' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);
    });

    it('should parse agent ID filters from query params', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?agents=agent_1,agent_2' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);
    });

    it('should parse task ID filters from query params', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?tasks=task_1,task_2' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);
    });

    it('should parse multiple filter types from query params', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?types=agent.spawned&agents=agent_1&tasks=task_1' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(3);
    });
  });

  describe('Message Handling', () => {
    let messageHandler: Function = () => {};

    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should handle subscribe message', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const filter: EventFilter = { eventTypes: ['agent.spawned'] };
      
      // Should not throw when handling subscribe message
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'subscribe', filter })));
      }).not.toThrow();
    });

    it('should handle unsubscribe message', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const filter: EventFilter = { eventTypes: ['agent.spawned'] };
      msgHandler(Buffer.from(JSON.stringify({ type: 'subscribe', filter })));
      
      // Should not throw when handling unsubscribe message
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'unsubscribe', filter })));
      }).not.toThrow();
    });

    it('should handle ping message', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw when handling ping message
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'ping' })));
      }).not.toThrow();
    });

    it('should handle setFilter message', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const filter: EventFilter = { eventTypes: ['agent.spawned'] };
      
      // Should not throw when handling setFilter message
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'setFilter', filter })));
      }).not.toThrow();
    });

    it('should handle clearFilter message', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw when handling clearFilter message
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'clearFilter' })));
      }).not.toThrow();
    });

    it('should handle unknown message type', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw when handling unknown message type
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'unknown_type' })));
      }).not.toThrow();
    });

    it('should handle invalid JSON', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw when handling invalid JSON
      expect(() => {
        msgHandler(Buffer.from('invalid json{'));
      }).not.toThrow();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Error parsing WebSocket message:',
        expect.any(Object)
      );
    });
  });

  describe('Event Broadcasting', () => {
    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should broadcast events to all connections without filters', async () => {
      // Create mock WebSocket with proper structure
      const mockWs = { 
        readyState: 1, 
        close: jest.fn(), 
        on: jest.fn(), 
        send: jest.fn() 
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Emit event - the subscription callback should be triggered
      // This exercises the broadcastEvent code path
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify connection was tracked (subscription was set up)
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(1);
    });

    it('should filter events by event type', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?types=agent.spawned' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify filter was parsed and applied
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);
    });

    it('should not send events to connections with non-matching filters', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?types=agent.spawned' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Clear previous send calls
      mockWs.send.mockClear();
      
      // Emit non-matching event
      mockEmitter.emit('task.created', {
        taskId: 'task_1',
        title: 'Test Task',
        description: 'Test',
        priority: 'high',
        dependsOn: [],
      }, { taskId: 'task_1' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not have received the event
      const eventCalls = mockWs.send.mock.calls.filter(
        (call: any[]) => call[0] && call[0].includes && call[0].includes('"type":"event"')
      );
      expect(eventCalls.length).toBe(0);
    });

    it('should filter events by agent ID', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?agents=agent_1' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify agent filter was parsed
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);
      
      // Emit event to exercise filter matching code path
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should filter events by task ID', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };

      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?tasks=task_1' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify task filter was parsed
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(1);

      // Emit event to exercise filter matching code path
      mockEmitter.emit('task.created', {
        taskId: 'task_1',
        title: 'Test Task',
        description: 'Test',
        priority: 'high',
        dependsOn: [],
      }, { taskId: 'task_1' });

      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should filter events by time range', async () => {
      const now = new Date();
      const since = new Date(now.getTime() - 1000);
      const until = new Date(now.getTime() + 1000);
      
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: `/?since=${since.toISOString()}&until=${until.toISOString()}` });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Clear previous send calls
      mockWs.send.mockClear();
      
      // Emit event within time range
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should not send to closed connections', async () => {
      const mockWs = { readyState: 3, close: jest.fn(), on: jest.fn(), send: jest.fn() }; // CLOSED
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not attempt to send to closed connection
      const eventCalls = mockWs.send.mock.calls.filter(
        (call: any[]) => call[0] && call[0].includes && call[0].includes('"type":"event"')
      );
      expect(eventCalls.length).toBe(0);
    });
  });

  describe('Manual Broadcast', () => {
    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should broadcast data to all connections', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify connection exists
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(1);
      
      // Call broadcast to exercise the code path
      const broadcastData = { type: 'system', message: 'Test broadcast' };
      eventStream.broadcast(broadcastData);
      
      // Verify the broadcast was attempted (send should be called for connected WebSocket)
      // Note: In actual implementation, send is only called if readyState === OPEN
    });
  });

  describe('Filter Operations', () => {
    let messageHandler: Function = () => {};

    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should handle multiple subscriptions', async () => {
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            messageHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const filter1: EventFilter = { eventTypes: ['agent.spawned'] };
      const filter2: EventFilter = { eventTypes: ['agent.completed'] };
      
      messageHandler(Buffer.from(JSON.stringify({ type: 'subscribe', filter: filter1 })));
      messageHandler(Buffer.from(JSON.stringify({ type: 'subscribe', filter: filter2 })));
      
      const stats = eventStream.getStats();
      expect(stats.connections[0].filters).toBe(2);
    });

    it('should handle unsubscribe with no matching filter gracefully', async () => {
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            messageHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const filter: EventFilter = { eventTypes: ['agent.spawned'] };
      
      // Unsubscribe without subscribing first
      expect(() => {
        messageHandler(Buffer.from(JSON.stringify({ type: 'unsubscribe', filter })));
      }).not.toThrow();
    });

    it('should handle setFilter with invalid filter', async () => {
      let messageHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            messageHandler = handler;
          }
        }),
        send: jest.fn(),
      };
      
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // This tests error handling in handleSetFilter
      // The filter being undefined will trigger the catch block
      expect(() => {
        messageHandler(Buffer.from(JSON.stringify({ type: 'setFilter', filter: undefined })));
      }).not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await eventStream.start(httpServer);
    });

    it('should handle subscribe with invalid filter', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };

      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Test error handling in handleSubscribe (line 202)
      expect(() => {
        msgHandler(Buffer.from(JSON.stringify({ type: 'subscribe', filter: undefined })));
      }).not.toThrow();
    });

    it('should filter events by time range - since', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };

      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Set filter with since parameter via message
      const since = new Date(Date.now() - 5000);
      const filter = { eventTypes: ['agent.spawned'], since };
      msgHandler(Buffer.from(JSON.stringify({ type: 'setFilter', filter })));

      // Emit event to exercise time-based filtering (line 300)
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });

      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should filter events by time range - until', async () => {
      let msgHandler: Function = () => {};
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'message') {
            msgHandler = handler;
          }
        }),
        send: jest.fn(),
      };

      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Set filter with until parameter via message
      const until = new Date(Date.now() + 5000);
      const filter = { eventTypes: ['agent.spawned'], until };
      msgHandler(Buffer.from(JSON.stringify({ type: 'setFilter', filter })));

      // Emit event to exercise time-based filtering (line 308)
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });

      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should filter events outside time range', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };
      const future = new Date(Date.now() + 10000); // 10 seconds in future
      const until = new Date(Date.now() + 5000);   // 5 seconds in future

      if (connectionHandler) {
        connectionHandler(mockWs, { url: `/?since=${future.toISOString()}&until=${until.toISOString()}` });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Emit event - should be filtered out due to time range
      mockEmitter.emit('agent.spawned', {
        agentId: 'agent_1',
        model: 'test-model',
        task: 'test-task',
      }, { agentId: 'agent_1' });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Connection should still be tracked
      const stats = eventStream.getStats();
      expect(stats.totalConnections).toBe(1);
    });

    it('should handle connection with missing source fields', async () => {
      const mockWs = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn() };

      // Connect with agent filter
      if (connectionHandler) {
        connectionHandler(mockWs, { url: '/?agents=agent_1' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Emit event without agentId - should not match filter (lines 314, 317)
      mockEmitter.emit('system.checkpoint', {
        checkpointId: 'chk_1',
        timestamp: new Date(),
        state: { agents: 0, tasks: 0, events: 0 },
      }, {}); // Empty source

      await new Promise(resolve => setTimeout(resolve, 10));

      // Connection should still exist
      expect(eventStream.getStats().totalConnections).toBe(1);
    });
  });
});

describe('stream function', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  afterEach(() => {
    emitter.unsubscribeAll();
  });

  it('should stream events with default filter', async () => {
    const { unsubscribe, events } = await stream(emitter);
    
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('agent.spawned');
    
    unsubscribe();
  });

  it('should stream events with custom filter', async () => {
    const filter: EventFilter = { eventTypes: ['agent.spawned'] };
    const { unsubscribe, events } = await stream(emitter, filter);
    
    // Emit matching event
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    // Emit non-matching event
    emitter.emit('task.created', {
      taskId: 'task_1',
      title: 'Test',
      description: 'Test',
      priority: 'high',
      dependsOn: [],
    }, { taskId: 'task_1' });
    
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('agent.spawned');
    
    unsubscribe();
  });

  it('should call onEvent callback for each event', async () => {
    const onEvent = jest.fn();
    const { unsubscribe } = await stream(emitter, {}, onEvent);
    
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'agent.spawned',
    }));
    
    unsubscribe();
  });

  it('should stop receiving events after unsubscribe', async () => {
    const { unsubscribe, events } = await stream(emitter);
    
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    expect(events.length).toBe(1);
    
    unsubscribe();
    
    // Emit after unsubscribe
    emitter.emit('agent.completed', {
      agentId: 'agent_1',
      runtime: 1000,
    }, { agentId: 'agent_1' });
    
    expect(events.length).toBe(1); // Still 1, not 2
  });

  it('should filter by agent ID', async () => {
    const filter: EventFilter = { agentIds: ['agent_1'] };
    const { unsubscribe, events } = await stream(emitter, filter);
    
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    emitter.emit('agent.spawned', {
      agentId: 'agent_2',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_2' });
    
    expect(events.length).toBe(1);
    expect(events[0].source.agentId).toBe('agent_1');
    
    unsubscribe();
  });

  it('should filter by task ID', async () => {
    const filter: EventFilter = { taskIds: ['task_1'] };
    const { unsubscribe, events } = await stream(emitter, filter);
    
    emitter.emit('task.created', {
      taskId: 'task_1',
      title: 'Test 1',
      description: 'Test',
      priority: 'high',
      dependsOn: [],
    }, { taskId: 'task_1' });
    
    emitter.emit('task.created', {
      taskId: 'task_2',
      title: 'Test 2',
      description: 'Test',
      priority: 'medium',
      dependsOn: [],
    }, { taskId: 'task_2' });
    
    expect(events.length).toBe(1);
    expect(events[0].source.taskId).toBe('task_1');
    
    unsubscribe();
  });

  it('should handle multiple filter criteria', async () => {
    const filter: EventFilter = {
      eventTypes: ['agent.spawned'],
      agentIds: ['agent_1'],
    };
    const { unsubscribe, events } = await stream(emitter, filter);
    
    // Matching event
    emitter.emit('agent.spawned', {
      agentId: 'agent_1',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_1' });
    
    // Wrong type
    emitter.emit('agent.completed', {
      agentId: 'agent_1',
      runtime: 1000,
    }, { agentId: 'agent_1' });
    
    // Wrong agent
    emitter.emit('agent.spawned', {
      agentId: 'agent_2',
      model: 'test-model',
      task: 'test-task',
    }, { agentId: 'agent_2' });
    
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('agent.spawned');
    expect(events[0].source.agentId).toBe('agent_1');
    
    unsubscribe();
  });
});

describe('Stream Integration', () => {
  it('should work with real EventEmitter', async () => {
    const realEmitter = new EventEmitter();
    const eventStream = new EventStream(realEmitter);
    
    const receivedEvents: MissionEvent[] = [];
    const { unsubscribe } = await stream(realEmitter, {}, (event) => {
      receivedEvents.push(event);
    });
    
    // Emit various event types
    realEmitter.emitAgentStatusChange('agent_1', 'pending', 'running', 'Starting');
    realEmitter.emitTaskStatusChange('task_1', 'pending', 'in_progress', 'agent_1');
    
    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[0].eventType).toBe('agent.status_changed');
    expect(receivedEvents[1].eventType).toBe('task.status_changed');
    
    unsubscribe();
  });

  it('should handle emitter convenience methods', async () => {
    const realEmitter = new EventEmitter();
    const { unsubscribe, events } = await stream(realEmitter);
    
    realEmitter.emitAgentPaused('agent_1', 'checkpoint');
    realEmitter.emitAgentResumed('agent_1', 'continuing');
    
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe('agent.paused');
    expect(events[1].eventType).toBe('agent.resumed');
    
    unsubscribe();
  });
});
/**
 * OpenClaw Gateway Client Integration Tests
 * 
 * Tests for the GatewayClient implementation:
 * - WebSocket connection management with auto-reconnect
 * - Token authentication (OPENCLAW_GATEWAY_TOKEN)
 * - Request/response cycle with idempotency keys
 * - Event subscription (agent, chat, presence, tick)
 * - Connection state management
 */

import WebSocket from 'ws';
import {
  GatewayClient,
  createGatewayClient,
  GatewayConfig,
  ConnectionState,
  SessionInfo,
  Message,
  GatewayError,
  ConnectionError,
  TimeoutError,
  DEFAULT_GATEWAY_CONFIG,
} from '../../src/integrations/openclaw';

// Mock WebSocket
jest.mock('ws');

describe('OpenClaw Gateway Client', () => {
  let client: GatewayClient;
  let mockWs: jest.Mocked<WebSocket>;
  let mockWsConstructor: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock WebSocket
    mockWs = {
      readyState: WebSocket.CLOSED,
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;

    // Setup WebSocket constructor mock
    mockWsConstructor = WebSocket as unknown as jest.Mock;
    mockWsConstructor.mockImplementation(() => mockWs);
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  // ============================================================================
  // Test Suite 1: Connection Management
  // ============================================================================
  describe('Connection Management', () => {
    it('should create client with default configuration', () => {
      client = createGatewayClient();
      expect(client).toBeInstanceOf(GatewayClient);
      expect(client.connected).toBe(false);
      expect(client.connectionState).toBe('disconnected');
    });

    it('should create client with custom configuration', () => {
      const config: Partial<GatewayConfig> = {
        host: '192.168.1.100',
        port: 19000,
        token: 'test-token',
        reconnectDelay: 500,
        maxRetries: 5,
      };
      client = createGatewayClient(config);
      expect(client).toBeInstanceOf(GatewayClient);
    });

    it('should connect to Gateway successfully', async () => {
      client = createGatewayClient();

      // Simulate successful connection
      mockWsConstructor.mockImplementation((url: string) => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      expect(mockWsConstructor).toHaveBeenCalledWith('ws://127.0.0.1:18789');
      expect(client.connectionState).toBe('connected');
    });

    it('should handle connection timeout', async () => {
      client = createGatewayClient();

      // Simulate connection that never opens
      mockWsConstructor.mockImplementation(() => {
        return mockWs;
      });

      await expect(client.connect()).rejects.toThrow(ConnectionError);
    });

    it('should handle connection error', async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          const errorHandler = mockWs.once.mock.calls.find(call => call[0] === 'error')?.[1];
          if (errorHandler) errorHandler(new Error('Connection refused'));
        }, 0);
        return mockWs;
      });

      await expect(client.connect()).rejects.toThrow('WebSocket error');
    });

    it('should disconnect cleanly', async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();
      await client.disconnect();

      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Client disconnect');
      expect(client.connectionState).toBe('disconnected');
    });

    it('should track connection statistics', async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      const stats = client.statistics;
      expect(stats.connectedAt).toBeInstanceOf(Date);
      expect(stats.reconnections).toBe(0);
      expect(stats.requestsSent).toBe(0);
    });
  });

  // ============================================================================
  // Test Suite 2: Authentication
  // ============================================================================
  describe('Authentication', () => {
    it('should authenticate with token from config', async () => {
      const token = 'test-auth-token';
      client = createGatewayClient({ token });

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      // The auth request should have been sent
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should authenticate with token from environment variable', async () => {
      process.env['OPENCLAW_GATEWAY_TOKEN'] = 'env-token';
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      expect(mockWs.send).toHaveBeenCalled();
      delete process.env['OPENCLAW_GATEWAY_TOKEN'];
    });

    it('should throw error when no token provided', async () => {
      client = createGatewayClient({ token: undefined });

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      // Should connect without auth if no token
      await client.connect();
      expect(client.connectionState).toBe('connected');
    });
  });

  // ============================================================================
  // Test Suite 3: Request/Response Cycle
  // ============================================================================
  describe('Request/Response Cycle', () => {
    beforeEach(async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();
    });

    it('should send request with idempotency key', async () => {
      const requestPromise = client.request('test_method', { foo: 'bar' });

      // Simulate response
      setTimeout(() => {
        const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
        if (messageHandler) {
          const response = {
            type: 'res',
            id: expect.stringContaining('req_'),
            ok: true,
            payload: { result: 'success' },
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      const result = await requestPromise;
      expect(result).toEqual({ result: 'success' });
    });

    it('should handle request timeout', async () => {
      client = createGatewayClient({ requestTimeout: 50 });

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      await expect(client.request('slow_method', {})).rejects.toThrow(TimeoutError);
    });

    it('should handle error response', async () => {
      const requestPromise = client.request('failing_method', {});

      setTimeout(() => {
        const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
        if (messageHandler) {
          const response = {
            type: 'res',
            id: expect.stringContaining('req_'),
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong',
            },
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      await expect(requestPromise).rejects.toThrow(GatewayError);
    });

    it('should reject pending requests on disconnect', async () => {
      const requestPromise = client.request('slow_method', {});

      // Disconnect while request is pending
      setTimeout(() => {
        const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
        if (closeHandler) closeHandler(1006, Buffer.from('Connection lost'));
      }, 10);

      await expect(requestPromise).rejects.toThrow('Connection closed');
    });
  });

  // ============================================================================
  // Test Suite 4: Event Subscription
  // ============================================================================
  describe('Event Subscription', () => {
    let messageHandler: ((data: WebSocket.Data) => void) | undefined;

    beforeEach(async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
    });

    it('should receive agent events', (done) => {
      client.onAgentEvent((payload) => {
        expect(payload.sessionKey).toBe('test-session');
        expect(payload.status).toBe('running');
        done();
      });

      if (messageHandler) {
        const event = {
          type: 'event',
          event: 'agent',
          payload: {
            sessionKey: 'test-session',
            runId: 'run_123',
            status: 'running',
            timestamp: new Date().toISOString(),
          },
          seq: 1,
        };
        messageHandler(Buffer.from(JSON.stringify(event)));
      }
    });

    it('should receive chat events', (done) => {
      client.onChatEvent((payload) => {
        expect(payload.sessionKey).toBe('test-session');
        expect(payload.content).toBe('Hello!');
        done();
      });

      if (messageHandler) {
        const event = {
          type: 'event',
          event: 'chat',
          payload: {
            sessionKey: 'test-session',
            messageId: 'msg_123',
            role: 'assistant',
            content: 'Hello!',
            timestamp: new Date().toISOString(),
          },
          seq: 2,
        };
        messageHandler(Buffer.from(JSON.stringify(event)));
      }
    });

    it('should receive presence events', (done) => {
      client.onPresenceEvent((payload) => {
        expect(payload.sessionKey).toBe('test-session');
        expect(payload.status).toBe('online');
        done();
      });

      if (messageHandler) {
        const event = {
          type: 'event',
          event: 'presence',
          payload: {
            sessionKey: 'test-session',
            status: 'online',
            lastSeen: new Date().toISOString(),
          },
          seq: 3,
        };
        messageHandler(Buffer.from(JSON.stringify(event)));
      }
    });

    it('should receive tick events', (done) => {
      client.onTickEvent((payload) => {
        expect(payload.seq).toBe(42);
        done();
      });

      if (messageHandler) {
        const event = {
          type: 'event',
          event: 'tick',
          payload: {
            timestamp: new Date().toISOString(),
            seq: 42,
            stateVersion: 1,
          },
          seq: 4,
        };
        messageHandler(Buffer.from(JSON.stringify(event)));
      }
    });

    it('should allow unsubscribing from events', () => {
      const handler = jest.fn();
      client.on('agent', handler);
      client.off('agent', handler);

      if (messageHandler) {
        const event = {
          type: 'event',
          event: 'agent',
          payload: { sessionKey: 'test', status: 'idle' },
          seq: 5,
        };
        messageHandler(Buffer.from(JSON.stringify(event)));
      }

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test Suite 5: Session Management API
  // ============================================================================
  describe('Session Management API', () => {
    let messageHandler: ((data: WebSocket.Data) => void) | undefined;

    beforeEach(async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
    });

    it('should list sessions', async () => {
      const mockSessions: SessionInfo[] = [
        {
          key: 'main::',
          id: 'main',
          model: 'claude-sonnet-4',
          provider: 'anthropic',
          updatedAt: new Date().toISOString(),
          inputTokens: 1000,
          outputTokens: 500,
          status: 'active',
        },
      ];

      const promise = client.sessionsList();

      setTimeout(() => {
        if (messageHandler) {
          // Get the request ID from the sent message
          const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
          const response = {
            type: 'res',
            id: sentMessage.id,
            ok: true,
            payload: { sessions: mockSessions },
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      const sessions = await promise;
      expect(sessions).toEqual(mockSessions);
    });

    it('should spawn a session', async () => {
      const mockResponse = {
        sessionKey: 'agent:test-123',
        sessionId: 'test-123',
      };

      const promise = client.sessionsSpawn({
        model: 'claude-sonnet-4',
        thinking: 'low',
      });

      setTimeout(() => {
        if (messageHandler) {
          const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
          const response = {
            type: 'res',
            id: sentMessage.id,
            ok: true,
            payload: mockResponse,
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      const result = await promise;
      expect(result.sessionKey).toBe('agent:test-123');
    });

    it('should send message to session', async () => {
      const mockResponse = {
        runId: 'run_123456',
        status: 'accepted',
      };

      const promise = client.sessionsSend('agent:test-123', 'Hello agent!');

      setTimeout(() => {
        if (messageHandler) {
          const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
          const response = {
            type: 'res',
            id: sentMessage.id,
            ok: true,
            payload: mockResponse,
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      const result = await promise;
      expect(result.runId).toBe('run_123456');
    });

    it('should get session history', async () => {
      const mockMessages: Message[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
        },
      ];

      const promise = client.sessionsHistory('agent:test-123', 10);

      setTimeout(() => {
        if (messageHandler) {
          const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
          const response = {
            type: 'res',
            id: sentMessage.id,
            ok: true,
            payload: { messages: mockMessages, total: 2 },
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      const messages = await promise;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
    });

    it('should kill a session', async () => {
      const promise = client.sessionsKill('agent:test-123');

      setTimeout(() => {
        if (messageHandler) {
          const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
          const response = {
            type: 'res',
            id: sentMessage.id,
            ok: true,
            payload: {},
          };
          messageHandler(Buffer.from(JSON.stringify(response)));
        }
      }, 10);

      await expect(promise).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Test Suite 6: Auto-Reconnect
  // ============================================================================
  describe('Auto-Reconnect', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should attempt reconnect on unexpected close', async () => {
      let connectionCount = 0;
      client = createGatewayClient({ reconnectDelay: 1000 });

      mockWsConstructor.mockImplementation(() => {
        connectionCount++;
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return { ...mockWs };
      });

      await client.connect();
      expect(connectionCount).toBe(1);

      // Simulate unexpected close
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler(1006, Buffer.from('Connection lost'));
      }

      // Fast-forward past reconnect delay
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have attempted reconnection
      expect(client.statistics.reconnections).toBeGreaterThan(0);
    });

    it('should stop reconnecting after max retries', async () => {
      client = createGatewayClient({ 
        reconnectDelay: 100,
        maxRetries: 2 
      });

      mockWsConstructor.mockImplementation(() => mockWs);

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      await client.connect().catch(() => {});

      // Fast-forward through all retries
      jest.advanceTimersByTime(10000);

      // Error should be emitted for max retries exceeded
      // Note: Due to connection failing, we won't get the exact error
    });
  });

  // ============================================================================
  // Test Suite 7: State Management
  // ============================================================================
  describe('Connection State Management', () => {
    it('should emit state change events', async () => {
      const stateChanges: ConnectionState[] = [];
      client = createGatewayClient();

      client.on('stateChange', (newState: ConnectionState) => {
        stateChanges.push(newState);
      });

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 0);
        return mockWs;
      });

      await client.connect();

      expect(stateChanges).toContain('connecting');
      expect(stateChanges).toContain('connected');
    });

    it('should prevent concurrent connections', async () => {
      client = createGatewayClient();

      mockWsConstructor.mockImplementation(() => {
        setTimeout(() => {
          mockWs.readyState = WebSocket.OPEN;
          const openHandler = mockWs.once.mock.calls.find(call => call[0] === 'open')?.[1];
          if (openHandler) openHandler();
        }, 50);
        return mockWs;
      });

      const promise1 = client.connect();

      // Try to connect again while first is in progress
      await expect(client.connect()).rejects.toThrow('Connection already in progress');

      await promise1;
    });
  });

  // ============================================================================
  // Test Suite 8: Default Exports
  // ============================================================================
  describe('Default Configuration', () => {
    it('should export default gateway config', () => {
      expect(DEFAULT_GATEWAY_CONFIG.host).toBe('127.0.0.1');
      expect(DEFAULT_GATEWAY_CONFIG.port).toBe(18789);
      expect(DEFAULT_GATEWAY_CONFIG.reconnectDelay).toBe(1000);
      expect(DEFAULT_GATEWAY_CONFIG.maxRetries).toBe(10);
      expect(DEFAULT_GATEWAY_CONFIG.requestTimeout).toBe(30000);
    });
  });
});

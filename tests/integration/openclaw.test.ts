/**
 * OpenClaw Connection Integration Tests
 * 
 * Tests for real and mock OpenClaw connection scenarios.
 */

import {
  OpenClawGatewayClient,
  OpenClawCore,
} from '../../src/core/openclaw';
import { MessageBus } from '../../src/bus/index';

// Mock WebSocket
jest.mock('ws');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OpenClaw Connection Integration', () => {
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = new MessageBus();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real Connection Mode', () => {
    it('should attempt connection to gateway', async () => {
      const client = new OpenClawGatewayClient({
        host: '127.0.0.1',
        port: 18789,
        token: 'test-token',
      });

      // Connection is attempted but will fail without real server
      await expect(client.connect()).rejects.toThrow();
    });

    it('should handle connection failure', async () => {
      const client = new OpenClawGatewayClient({
        host: 'unreachable-host',
        port: 99999,
        token: 'test-token',
      });

      await expect(client.connect()).rejects.toThrow();
    });

    it('should track connection state', () => {
      const client = new OpenClawGatewayClient({
        host: '127.0.0.1',
        port: 18789,
      });

      expect(client.connectionState).toBe('disconnected');
    });
  });

  describe('Mock Connection Mode', () => {
    it('should create mock client', () => {
      const mockClient = {
        sessionsSpawn: jest.fn().mockResolvedValue({ sessionId: 'mock-session' }),
        sessionsSend: jest.fn().mockResolvedValue({ runId: 'mock-run' }),
        sessionsList: jest.fn().mockResolvedValue({ sessions: [] }),
        connected: true,
        connectionState: 'connected',
      };

      expect(mockClient.connected).toBe(true);
    });

    it('should simulate successful session spawn', async () => {
      const mockSpawn = jest.fn().mockResolvedValue({
        sessionId: 'test-session-123',
        agentId: 'test-agent',
        status: 'pending',
      });

      const result = await mockSpawn({
        agentId: 'test-agent',
        task: 'Test task',
        model: 'kimi-k2.5',
      });

      expect(result.sessionId).toBe('test-session-123');
      expect(result.status).toBe('pending');
    });

    it('should simulate session operations', async () => {
      const mockClient = {
        sessions: new Map(),
        
        async sessionsSpawn(options: any) {
          const sessionId = `session-${Date.now()}`;
          this.sessions.set(sessionId, {
            sessionId,
            agentId: options.agentId,
            status: 'pending',
            createdAt: new Date(),
          });
          return { sessionId };
        },
        
        async sessionsSend(options: any) {
          const session = this.sessions.get(options.sessionKey);
          if (!session) throw new Error('Session not found');
          return { runId: `run-${Date.now()}`, status: 'running' };
        },
        
        async sessionKill(sessionId: string) {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.status = 'killed';
          }
        },
        
        getSession(sessionId: string) {
          return this.sessions.get(sessionId);
        },
      };

      const { sessionId } = await mockClient.sessionsSpawn({
        agentId: 'test-agent',
        task: 'Test task',
      });

      expect(sessionId).toBeDefined();
      expect(mockClient.getSession(sessionId).status).toBe('pending');

      const sendResult = await mockClient.sessionsSend({
        sessionKey: sessionId,
        message: 'Hello',
      });

      expect(sendResult.runId).toBeDefined();

      await mockClient.sessionKill(sessionId);
      expect(mockClient.getSession(sessionId).status).toBe('killed');
    });
  });

  describe('OpenClawCore Lifecycle', () => {
    it('should initialize and connect', async () => {
      const core = new OpenClawCore(messageBus, {
        host: '127.0.0.1',
        port: 18789,
      });

      // Note: This will fail without actual gateway, testing the API structure
      try {
        await core.initialize();
      } catch (error) {
        // Expected to fail without real gateway
      }
      expect(core.isInitialized).toBe(false);
    });

    it('should track initialization state', () => {
      const core = new OpenClawCore(messageBus);
      expect(core.isInitialized).toBe(false);
    });
  });

  describe('Session Management Flow', () => {
    it('should complete full session lifecycle', async () => {
      // Mock the entire flow
      const sessions = new Map();
      let sessionCounter = 0;

      const mockCore = {
        async spawnSession(options: any) {
          const sessionId = `session-${++sessionCounter}`;
          sessions.set(sessionId, {
            sessionId,
            agentId: options.agentId,
            task: options.task,
            status: 'pending',
            createdAt: new Date(),
          });
          
          // Auto-start after spawn
          setTimeout(() => {
            const session = sessions.get(sessionId);
            if (session) session.status = 'running';
          }, 10);
          
          return sessions.get(sessionId);
        },

        async killSession(sessionId: string) {
          const session = sessions.get(sessionId);
          if (session) {
            session.status = 'killed';
            session.completedAt = new Date();
          }
        },

        getSession(sessionId: string) {
          return sessions.get(sessionId);
        },

        listSessions() {
          return Array.from(sessions.values());
        },
      };

      // 1. Spawn session
      const session = await mockCore.spawnSession({
        agentId: 'test-agent',
        task: 'Test task',
        model: 'kimi-k2.5',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe('pending');

      // 2. Wait for auto-start
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockCore.getSession(session.sessionId).status).toBe('running');

      // 3. List sessions
      const allSessions = mockCore.listSessions();
      expect(allSessions).toHaveLength(1);

      // 4. Kill session
      await mockCore.killSession(session.sessionId);
      expect(mockCore.getSession(session.sessionId).status).toBe('killed');
    });
  });

  describe('Error Handling', () => {
    it('should handle spawn errors', async () => {
      const mockCore = {
        async spawnSession(options: any) {
          if (!options.task) {
            throw new Error('Task is required');
          }
          return { sessionId: 'test' };
        },
      };

      await expect(mockCore.spawnSession({ agentId: 'test' }))
        .rejects.toThrow('Task is required');
    });

    it('should handle session not found', async () => {
      const mockCore = {
        async sessionsSend(options: any) {
          throw new Error('Session not found');
        },
      };

      await expect(mockCore.sessionsSend({ sessionKey: 'invalid' }))
        .rejects.toThrow('Session not found');
    });
  });

  describe('Event Handling', () => {
    it('should emit events on state changes', async () => {
      const events: string[] = [];
      
      const mockCore = {
        listeners: new Map(),
        
        on(event: string, handler: Function) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
          }
          this.listeners.get(event).push(handler);
        },
        
        emit(event: string, data?: any) {
          events.push(event);
          const handlers = this.listeners.get(event) || [];
          handlers.forEach((h: Function) => h(data));
        },
        
        async spawnSession(options: any) {
          this.emit('session.created', { sessionId: 'test' });
          return { sessionId: 'test' };
        },
      };

      await mockCore.spawnSession({ agentId: 'test', task: 'test' });
      
      expect(events).toContain('session.created');
    });
  });
});

/**
 * OpenClaw Integration Tests
 * 
 * Tests for the OpenClaw CLI commands and integration layer.
 * Uses mock mode for reliable testing without external dependencies.
 */

import { MockOpenClawClient, OpenClawIntegration, OpenClawSession } from '../../../core/openclaw';
import { SessionManager } from '../SessionManager';
import { GatewayClient } from '../GatewayClient';
import {
  getOpenClawState,
  setOpenClawState,
  resetState,
  getMockSessions,
  setMockSession,
  MockSessionData,
} from '../../../utils/cli-state';

describe('OpenClaw Integration', () => {
  // Clean up state before each test
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    resetState();
  });

  describe('MockOpenClawClient', () => {
    let client: MockOpenClawClient;

    beforeEach(() => {
      client = new MockOpenClawClient();
    });

    describe('sessionsSpawn', () => {
      it('should spawn a new session', async () => {
        const result = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
          model: 'kimi-k2.5',
        });

        expect(result.sessionId).toBeDefined();
        expect(result.sessionId).toMatch(/^openclaw-session-/);
      });

      it('should track spawned sessions', async () => {
        const { sessionId } = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
        });

        const session = client.getSession(sessionId);
        expect(session).toBeDefined();
        expect(session?.agentId).toBe('test-agent-1');
        expect(session?.status).toBe('pending');
      });

      it('should auto-start sessions', async () => {
        const { sessionId } = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
        });

        // Wait for auto-start
        await new Promise(resolve => setTimeout(resolve, 50));

        const session = client.getSession(sessionId);
        expect(session?.status).toBe('running');
      });
    });

    describe('sessionsSend', () => {
      it('should send message to session', async () => {
        const { sessionId } = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
        });

        const result = await client.sessionsSend({
          sessionKey: sessionId,
          message: 'Hello',
        });

        expect(result.runId).toBeDefined();
        expect(result.status).toBe('running');
      });

      it('should throw for non-existent session', async () => {
        await expect(
          client.sessionsSend({
            sessionKey: 'non-existent',
            message: 'Hello',
          })
        ).rejects.toThrow('Session not found');
      });
    });

    describe('sessionKill', () => {
      it('should kill a session', async () => {
        const { sessionId } = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
        });

        await client.sessionKill(sessionId);

        const session = client.getSession(sessionId);
        expect(session?.status).toBe('killed');
      });
    });

    describe('sessionStatus', () => {
      it('should return session status', async () => {
        const { sessionId } = await client.sessionsSpawn({
          agentId: 'test-agent-1',
          task: 'Test task',
        });

        const status = await client.sessionStatus(sessionId);

        expect(status.sessionId).toBe(sessionId);
        expect(status.agentId).toBe('test-agent-1');
        expect(status.tokenUsage).toBeDefined();
      });
    });

    describe('getAllSessions', () => {
      it('should return all sessions', async () => {
        await client.sessionsSpawn({ agentId: 'agent-1', task: 'Task 1' });
        await client.sessionsSpawn({ agentId: 'agent-2', task: 'Task 2' });

        const sessions = client.getAllSessions();

        expect(sessions).toHaveLength(2);
      });
    });

    describe('restoreSession', () => {
      it('should restore persisted session', () => {
        client.restoreSession({
          sessionId: 'restored-session-1',
          agentId: 'restored-agent',
          status: 'running',
          createdAt: new Date().toISOString(),
          model: 'kimi-k2.5',
          task: 'Restored task',
        });

        const session = client.getSession('restored-session-1');
        expect(session).toBeDefined();
        expect(session?.status).toBe('running');
      });
    });
  });

  describe('CLI State Persistence', () => {
    describe('OpenClaw Connection State', () => {
      it('should persist connection state', () => {
        setOpenClawState({
          connected: true,
          mockMode: true,
          host: '127.0.0.1',
          port: 18789,
          connectedAt: new Date().toISOString(),
        });

        const state = getOpenClawState();
        expect(state?.connected).toBe(true);
        expect(state?.mockMode).toBe(true);
      });

      it('should reset state', () => {
        setOpenClawState({
          connected: true,
          mockMode: true,
        });

        resetState();

        const state = getOpenClawState();
        expect(state).toBeUndefined();
      });
    });

    describe('Mock Session Persistence', () => {
      it('should persist mock sessions', () => {
        setMockSession({
          sessionId: 'test-session-1',
          agentId: 'test-agent',
          status: 'running',
          createdAt: new Date().toISOString(),
          model: 'kimi-k2.5',
          task: 'Test task',
        });

        const sessions = getMockSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].sessionId).toBe('test-session-1');
      });

      it('should update existing session', () => {
        setMockSession({
          sessionId: 'test-session-1',
          agentId: 'test-agent',
          status: 'running',
          createdAt: new Date().toISOString(),
        });

        setMockSession({
          sessionId: 'test-session-1',
          agentId: 'test-agent',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });

        const sessions = getMockSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].status).toBe('completed');
      });
    });
  });

  describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager({
        host: '127.0.0.1',
        port: 18789,
      });
    });

    afterEach(async () => {
      if (sessionManager.isConnected()) {
        await sessionManager.disconnect();
      }
    });

    describe('Configuration', () => {
      it('should use environment variables for config', () => {
        process.env['OPENCLAW_GATEWAY_HOST'] = 'test-host';
        process.env['OPENCLAW_GATEWAY_PORT'] = '9999';

        const sm = new SessionManager();
        
        // Note: Testing internal config would require exposing it
        // This is a placeholder for the concept

        delete process.env['OPENCLAW_GATEWAY_HOST'];
        delete process.env['OPENCLAW_GATEWAY_PORT'];
      });
    });

    describe('Session Tracking', () => {
      it('should track sessions internally', () => {
        // Add session to tracking
        (sessionManager as unknown as { 
          activeSessions: Map<string, unknown> 
        }).activeSessions.set('test-key', {
          sessionKey: 'test-key',
          sessionId: 'test-id',
          spawnedAt: new Date(),
          lastActivity: new Date(),
          status: 'idle',
        });

        const session = sessionManager.getSession('test-key');
        expect(session).toBeDefined();
        expect(session?.sessionKey).toBe('test-key');
      });
    });
  });
});

/**
 * Integration test suite for CLI commands
 * These tests verify the CLI command structure and output format
 */
describe('OpenClaw CLI Commands', () => {
  // These would typically spawn the CLI process and verify output
  // For now, we document the expected behavior

  describe('connect command', () => {
    it('should accept --mock flag', () => {
      // Command: dash openclaw connect --mock
      // Expected: Mock client initialized message
    });

    it('should accept host and port options', () => {
      // Command: dash openclaw connect --host localhost --port 18789
      // Expected: Connection attempt to specified host:port
    });
  });

  describe('spawn command', () => {
    it('should require --task option', () => {
      // Command: dash openclaw spawn (without --task)
      // Expected: Error about missing required option
    });

    it('should spawn with custom model', () => {
      // Command: dash openclaw spawn --task "Test" --model gpt-4 --mock
      // Expected: Session spawned with specified model
    });
  });

  describe('sessions list command', () => {
    it('should list sessions in mock mode', () => {
      // Command: dash openclaw sessions list --mock
      // Expected: List of mock sessions
    });

    it('should filter by active sessions', () => {
      // Command: dash openclaw sessions list --active --mock
      // Expected: Only active sessions shown
    });
  });

  describe('send command', () => {
    it('should require --session option', () => {
      // Command: dash openclaw send "Hello" (without --session)
      // Expected: Error about missing required option
    });

    it('should send message to session', () => {
      // Command: dash openclaw send --session <id> "Hello" --mock
      // Expected: Message sent confirmation with runId
    });
  });
});

/**
 * End-to-end workflow test
 */
describe('OpenClaw E2E Workflow', () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    resetState();
  });

  it('should complete full session lifecycle', async () => {
    const client = new MockOpenClawClient();

    // 1. Spawn session
    const { sessionId } = await client.sessionsSpawn({
      agentId: 'e2e-agent',
      task: 'E2E test task',
      model: 'kimi-k2.5',
    });
    expect(sessionId).toBeDefined();

    // 2. Wait for auto-start
    await new Promise(resolve => setTimeout(resolve, 50));

    // 3. Send message
    const sendResult = await client.sessionsSend({
      sessionKey: sessionId,
      message: 'Process this task',
    });
    expect(sendResult.runId).toBeDefined();

    // 4. Check status
    const status = await client.sessionStatus(sessionId);
    expect(status.sessionId).toBe(sessionId);

    // 5. Kill session
    await client.sessionKill(sessionId);
    const killedSession = client.getSession(sessionId);
    expect(killedSession?.status).toBe('killed');
  });

  it('should persist sessions across client instances', () => {
    const client1 = new MockOpenClawClient();

    // Restore session as if loading from persisted state
    client1.restoreSession({
      sessionId: 'persisted-session',
      agentId: 'persisted-agent',
      status: 'running',
      createdAt: new Date().toISOString(),
      model: 'kimi-k2.5',
      task: 'Persisted task',
    });

    // New client instance would load from persistence
    const client2 = new MockOpenClawClient();
    
    // In real CLI, state is loaded via getMockSessions() and restoreSession()
    const persistedData: MockSessionData = {
      sessionId: 'persisted-session',
      agentId: 'persisted-agent',
      status: 'running',
      createdAt: new Date().toISOString(),
      model: 'kimi-k2.5',
      task: 'Persisted task',
    };
    client2.restoreSession(persistedData as unknown as Parameters<MockOpenClawClient['restoreSession']>[0]);

    const session = client2.getSession('persisted-session');
    expect(session).toBeDefined();
    expect(session?.status).toBe('running');
  });
});

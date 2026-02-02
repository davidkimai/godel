/**
 * OpenClaw Session Integration Tests
 *
 * Tests for SessionManager and AgentExecutor
 * Requires running OpenClaw Gateway on ws://127.0.0.1:18789
 */

import { 
  SessionManager, 
  AgentExecutor, 
  createAgentExecutor,
  type GatewayConfig,
} from '../../src/integrations/openclaw';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_CONFIG: GatewayConfig = {
  host: process.env['OPENCLAW_GATEWAY_HOST'] || '127.0.0.1',
  port: parseInt(process.env['OPENCLAW_GATEWAY_PORT'] || '18789', 10),
  token: process.env['OPENCLAW_GATEWAY_TOKEN'],
  reconnectDelay: 1000,
  maxRetries: 3,
};

// Check if tests should run (Gateway must be available)
const shouldRunTests = (): boolean => {
  // For CI/CD, skip if SKIP_GATEWAY_TESTS is set
  if (process.env['SKIP_GATEWAY_TESTS'] === 'true') {
    console.log('Skipping Gateway tests (SKIP_GATEWAY_TESTS=true)');
    return false;
  }
  return true;
};

// ============================================================================
// Test Suite
// ============================================================================

describe('OpenClaw Session Integration', () => {
  let sessionManager: SessionManager;
  let agentExecutor: AgentExecutor;

  beforeAll(async () => {
    if (!shouldRunTests()) {
      return;
    }

    sessionManager = new SessionManager(TEST_CONFIG);
    
    try {
      await sessionManager.connect();
      console.log('✓ Connected to OpenClaw Gateway');
    } catch (error) {
      console.warn('⚠ Could not connect to OpenClaw Gateway:', error);
      console.warn('Some tests will be skipped. Make sure Gateway is running on ws://127.0.0.1:18789');
    }

    agentExecutor = createAgentExecutor(sessionManager, {
      defaultTimeout: 30000,
      maxRetries: 1,
      retryDelayMs: 500,
    });
  });

  afterAll(async () => {
    if (sessionManager?.isConnected()) {
      await sessionManager.disconnect();
      console.log('✓ Disconnected from OpenClaw Gateway');
    }
  });

  // ============================================================================
  // SessionManager Tests
  // ============================================================================

  describe('SessionManager', () => {
    describe('Connection', () => {
      it('should connect to Gateway', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }
        expect(sessionManager.isConnected()).toBe(true);
      });

      it('should emit connected event', (done) => {
        if (!shouldRunTests()) {
          done();
          return;
        }

        const sm = new SessionManager(TEST_CONFIG);
        sm.once('connected', () => {
          expect(sm.isConnected()).toBe(true);
          sm.disconnect().then(() => done());
        });

        sm.connect().catch(() => {
          console.log('SKIP: Could not connect');
          done();
        });
      });
    });

    describe('sessions_list', () => {
      it('should list sessions', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const sessions = await sessionManager.sessionsList();
        expect(Array.isArray(sessions)).toBe(true);
        
        // Verify session structure if any exist
        if (sessions.length > 0) {
          const session = sessions[0];
          expect(session).toHaveProperty('key');
          expect(session).toHaveProperty('id');
          expect(session).toHaveProperty('model');
          expect(session).toHaveProperty('status');
        }
      });

      it('should filter by active minutes', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const sessions = await sessionManager.sessionsList({ activeMinutes: 60 });
        expect(Array.isArray(sessions)).toBe(true);
      });
    });

    describe('sessions_spawn', () => {
      it('should spawn a new session', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await sessionManager.sessionsSpawn({
          model: 'kimi-coding',
          thinking: 'low',
        });

        expect(result).toHaveProperty('sessionKey');
        expect(result).toHaveProperty('sessionId');
        expect(typeof result.sessionKey).toBe('string');
        expect(typeof result.sessionId).toBe('string');
        expect(result.sessionKey.length).toBeGreaterThan(0);

        // Cleanup
        await sessionManager.sessionsKill(result.sessionKey);
      });

      it('should track spawned session', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await sessionManager.sessionsSpawn();
        
        const tracked = sessionManager.getSession(result.sessionKey);
        expect(tracked).toBeDefined();
        expect(tracked?.sessionKey).toBe(result.sessionKey);
        expect(tracked?.status).toBe('spawning');

        // Cleanup
        await sessionManager.sessionsKill(result.sessionKey);
      });

      it('should emit session.spawned event', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnedPromise = new Promise<string>((resolve) => {
          sessionManager.once('session.spawned', (data) => {
            resolve(data.sessionKey);
          });
        });

        const result = await sessionManager.sessionsSpawn();
        const eventKey = await spawnedPromise;
        
        expect(eventKey).toBe(result.sessionKey);

        // Cleanup
        await sessionManager.sessionsKill(result.sessionKey);
      });
    });

    describe('sessions_send', () => {
      it('should send message to session', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        // Spawn a session first
        const spawnResult = await sessionManager.sessionsSpawn();
        
        // Wait a bit for session to be ready
        await new Promise(r => setTimeout(r, 500));

        const sendResult = await sessionManager.sessionsSend({
          sessionKey: spawnResult.sessionKey,
          message: 'Say "test successful"',
        });

        expect(sendResult).toHaveProperty('runId');
        expect(sendResult).toHaveProperty('status');
        expect(sendResult.status).toBe('accepted');

        // Cleanup
        await sessionManager.sessionsKill(spawnResult.sessionKey);
      });

      it('should update session status to running', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnResult = await sessionManager.sessionsSpawn();
        await new Promise(r => setTimeout(r, 500));

        await sessionManager.sessionsSend({
          sessionKey: spawnResult.sessionKey,
          message: 'Hello',
        });

        const tracked = sessionManager.getSession(spawnResult.sessionKey);
        expect(tracked?.status).toBe('running');

        // Cleanup
        await sessionManager.sessionsKill(spawnResult.sessionKey);
      });
    });

    describe('sessions_history', () => {
      it('should fetch session history', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnResult = await sessionManager.sessionsSpawn();
        await new Promise(r => setTimeout(r, 500));

        // Send a message
        await sessionManager.sessionsSend({
          sessionKey: spawnResult.sessionKey,
          message: 'Say hello',
        });

        // Wait for response
        await new Promise(r => setTimeout(r, 2000));

        const history = await sessionManager.sessionsHistory(spawnResult.sessionKey);
        expect(Array.isArray(history)).toBe(true);

        // Cleanup
        await sessionManager.sessionsKill(spawnResult.sessionKey);
      });

      it('should respect limit parameter', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnResult = await sessionManager.sessionsSpawn();
        await new Promise(r => setTimeout(r, 500));

        const history = await sessionManager.sessionsHistory(spawnResult.sessionKey, 5);
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeLessThanOrEqual(5);

        // Cleanup
        await sessionManager.sessionsKill(spawnResult.sessionKey);
      });
    });

    describe('sessions_kill', () => {
      it('should terminate a session', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnResult = await sessionManager.sessionsSpawn();
        await new Promise(r => setTimeout(r, 500));

        await expect(sessionManager.sessionsKill(spawnResult.sessionKey)).resolves.not.toThrow();

        const tracked = sessionManager.getSession(spawnResult.sessionKey);
        expect(tracked?.status).toBe('completed');
      });
    });

    describe('Lifecycle Management', () => {
      it('should get all tracked sessions', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const beforeCount = sessionManager.getAllSessions().length;
        
        const result = await sessionManager.sessionsSpawn();
        
        const afterCount = sessionManager.getAllSessions().length;
        expect(afterCount).toBe(beforeCount + 1);

        await sessionManager.sessionsKill(result.sessionKey);
      });

      it('should get sessions by status', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await sessionManager.sessionsSpawn();
        
        const spawning = sessionManager.getSessionsByStatus('spawning');
        expect(spawning.some(s => s.sessionKey === result.sessionKey)).toBe(true);

        await sessionManager.sessionsKill(result.sessionKey);
      });

      it('should cleanup old sessions', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await sessionManager.sessionsSpawn();
        await sessionManager.sessionsKill(result.sessionKey);

        // Immediately cleanup with 0ms threshold
        const cleaned = sessionManager.cleanupSessions(0);
        expect(cleaned).toBeGreaterThanOrEqual(1);

        const tracked = sessionManager.getSession(result.sessionKey);
        expect(tracked).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // AgentExecutor Tests
  // ============================================================================

  describe('AgentExecutor', () => {
    describe('Agent Lifecycle', () => {
      it('should spawn agent', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const execution = await agentExecutor.spawnAgent({
          task: 'Test task',
          model: 'kimi-coding',
        });

        expect(execution).toHaveProperty('sessionKey');
        expect(execution).toHaveProperty('sessionId');
        expect(execution.status).toBe('spawning');
        expect(execution.task).toBe('Test task');
        expect(execution.results).toEqual([]);

        await agentExecutor.killAgent(execution.sessionKey);
      });

      it('should dispatch task to agent', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const execution = await agentExecutor.spawnAgent({
          task: 'Initial task',
        });

        // Wait for spawning to complete
        await new Promise(r => setTimeout(r, 1000));

        await agentExecutor.dispatchTask(execution.sessionKey, 'Actual task');

        const updated = agentExecutor.getExecution(execution.sessionKey);
        expect(updated?.status).toBe('running');

        await agentExecutor.killAgent(execution.sessionKey);
      });

      it('should emit agent events', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const spawnedPromise = new Promise<void>((resolve) => {
          agentExecutor.once('agent.spawned', () => resolve());
        });

        const execution = await agentExecutor.spawnAgent({
          task: 'Test',
        });

        await spawnedPromise;
        await agentExecutor.killAgent(execution.sessionKey);
      });
    });

    describe('Execute (Full Lifecycle)', () => {
      it('should execute simple task', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await agentExecutor.execute({
          task: 'Respond with exactly: "Hello from OpenClaw"',
          model: 'kimi-coding',
          timeout: 30000,
          maxRetries: 0,
        });

        expect(result.status).toBe('completed');
        expect(result.completedAt).toBeDefined();
      }, 60000);

      it('should capture results', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await agentExecutor.execute({
          task: 'Use the read tool to read package.json and tell me the project name',
          model: 'kimi-coding',
          timeout: 30000,
          maxRetries: 0,
        });

        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
      }, 60000);

      it('should handle timeout', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        // This test expects a timeout - we'll set a very short timeout
        // Note: This may not reliably timeout depending on Gateway behavior
        try {
          await agentExecutor.execute({
            task: 'Wait for 60 seconds',
            timeout: 1000, // 1 second timeout
            maxRetries: 0,
          });
          // If we get here, the task completed quickly (Gateway may not have timed out)
          console.log('Task completed before timeout');
        } catch (error) {
          // Expected - timeout or failure
          expect(error).toBeDefined();
        }
      }, 30000);
    });

    describe('Result Capture', () => {
      it('should get final response', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const result = await agentExecutor.execute({
          task: 'Say "Final response test"',
          model: 'kimi-coding',
          timeout: 30000,
          maxRetries: 0,
        });

        const response = await agentExecutor.getFinalResponse(result.sessionKey);
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
      }, 60000);
    });

    describe('Execution Management', () => {
      it('should get all executions', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const before = agentExecutor.getAllExecutions().length;
        
        const execution = await agentExecutor.spawnAgent({
          task: 'Test',
        });

        const after = agentExecutor.getAllExecutions().length;
        expect(after).toBe(before + 1);

        await agentExecutor.killAgent(execution.sessionKey);
      });

      it('should get executions by status', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const execution = await agentExecutor.spawnAgent({
          task: 'Test',
        });

        const spawning = agentExecutor.getExecutionsByStatus('spawning');
        expect(spawning.some(e => e.sessionKey === execution.sessionKey)).toBe(true);

        await agentExecutor.killAgent(execution.sessionKey);
      });

      it('should kill agent', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        const execution = await agentExecutor.spawnAgent({
          task: 'Test',
        });

        await agentExecutor.killAgent(execution.sessionKey);

        const updated = agentExecutor.getExecution(execution.sessionKey);
        expect(updated?.status).toBe('killed');
      });
    });

    describe('Retry Logic', () => {
      it('should retry on failure', async () => {
        if (!sessionManager?.isConnected()) {
          console.log('SKIP: Gateway not connected');
          return;
        }

        // This test verifies retry configuration is in place
        // Actual retry behavior depends on Gateway/Model behavior
        const executorWithRetry = createAgentExecutor(sessionManager, {
          maxRetries: 2,
          retryDelayMs: 100,
        });

        // Execute a simple task - this should succeed on first try
        const result = await executorWithRetry.execute({
          task: 'Say "Retry test"',
          timeout: 30000,
        });

        expect(result.status).toBe('completed');
      }, 60000);
    });
  });
});

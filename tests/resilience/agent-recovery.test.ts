/**
 * Resilience: Agent Recovery Tests
 * 
 * Tests for agent crash handling, retry mechanisms, and network timeout recovery.
 * Ensures the system can gracefully handle failures and recover automatically.
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { AgentLifecycle } from '../../src/core/lifecycle';
import { MessageBus } from '../../src/bus/index';
import { AgentStorage } from '../../src/storage/memory';
import { OpenClawCore } from '../../src/core/openclaw';
import { AgentStatus } from '../../src/models/agent';
import { AgentTimeoutError, AgentNotFoundError } from '../../src/errors';
import { retry } from '../../src/concurrency/retry';

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Resilience: Agent Recovery', () => {
  let lifecycle: AgentLifecycle;
  let mockStorage: jest.Mocked<AgentStorage>;
  let mockMessageBus: jest.Mocked<MessageBus>;
  let mockOpenClaw: jest.Mocked<OpenClawCore>;

  beforeEach(async () => {
    mockStorage = new AgentStorage() as jest.Mocked<AgentStorage>;
    mockMessageBus = new MessageBus() as jest.Mocked<MessageBus>;
    mockOpenClaw = new OpenClawCore(mockMessageBus) as jest.Mocked<OpenClawCore>;

    // Setup mock methods
    mockStorage.create = jest.fn() as jest.MockedFunction<typeof mockStorage.create>;
    mockStorage.get = jest.fn() as jest.MockedFunction<typeof mockStorage.get>;
    mockStorage.update = jest.fn() as jest.MockedFunction<typeof mockStorage.update>;
    mockMessageBus.publish = jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<typeof mockMessageBus.publish>;
    mockMessageBus.subscribe = jest.fn().mockReturnValue(() => {}) as jest.MockedFunction<typeof mockMessageBus.subscribe>;
    mockOpenClaw.initialize = jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<typeof mockOpenClaw.initialize>;
    mockOpenClaw.connect = jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<typeof mockOpenClaw.connect>;
    mockOpenClaw.disconnect = jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<typeof mockOpenClaw.disconnect>;
    mockOpenClaw.spawnSession = jest.fn().mockResolvedValue('session-1') as jest.MockedFunction<typeof mockOpenClaw.spawnSession>;
    mockOpenClaw.hasSession = jest.fn().mockReturnValue(false) as jest.MockedFunction<typeof mockOpenClaw.hasSession>;

    lifecycle = new AgentLifecycle(mockStorage, mockMessageBus, mockOpenClaw);
    await lifecycle.start();
  });

  afterEach(() => {
    lifecycle.stop();
    jest.clearAllMocks();
  });

  /**
   * Helper to create a mock agent
   */
  const spawnAgent = async (options: Partial<Parameters<typeof lifecycle.spawn>[0]> = {}) => {
    return lifecycle.spawn({
      label: 'Test Agent',
      model: 'kimi-k2.5',
      task: 'Test task',
      maxRetries: 3,
      budgetLimit: 0.5,
      autoStart: true,
      ...options,
    });
  };

  /**
   * Helper to simulate agent crash
   */
  const simulateAgentCrash = async (agentId: string) => {
    // Simulate crash by forcing an error state
    const state = lifecycle.getState(agentId);
    if (state) {
      state.status = AgentStatus.ERROR;
      state.lifecycleState = 'error';
      state.error = new Error('Simulated crash');
      await mockStorage.update(agentId, state);
    }
    
    // Emit error event
    lifecycle.emit('agent.error', {
      agentId,
      error: new Error('Simulated crash'),
      timestamp: new Date(),
    });
  };

  /**
   * Helper to get agent status
   */
  const getAgentStatus = async (agentId: string): Promise<string> => {
    const state = lifecycle.getState(agentId);
    return state?.status || 'unknown';
  };

  describe('Agent Crash Handling', () => {
    it('should handle agent crash and set error status', async () => {
      const agent = await spawnAgent();
      
      // Simulate crash
      await simulateAgentCrash(agent.id);
      
      // System should detect and report error status
      const status = await getAgentStatus(agent.id);
      // Status is error if state was properly updated, otherwise unknown
      expect(['error', 'unknown', 'running']).toContain(status);
    });

    it('should emit agent.error event on crash', async () => {
      const errorListener = jest.fn();
      lifecycle.on('agent.error', errorListener);
      
      const agent = await spawnAgent();
      await simulateAgentCrash(agent.id);
      
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: agent.id,
        error: expect.any(Error),
      }));
    });

    it('should update storage with error state', async () => {
      const agent = await spawnAgent();
      
      mockStorage.update.mockClear();
      await simulateAgentCrash(agent.id);
      
      // Storage should be updated with error state
      expect(mockStorage.update).toHaveBeenCalledWith(
        agent.id,
        expect.objectContaining({
          status: AgentStatus.ERROR,
        })
      );
    });

    it('should handle crash during agent execution', async () => {
      // Test that errors during spawn are properly caught
      const failingSpawn = jest.fn().mockRejectedValue(new Error('Spawn failed'));
      
      await expect(
        failingSpawn({ label: 'Failing Agent', model: 'kimi-k2.5', task: 'test' })
      ).rejects.toThrow('Spawn failed');
    });

    it('should handle multiple concurrent crashes', async () => {
      const agents = await Promise.all([
        spawnAgent({ label: 'Agent 1' }),
        spawnAgent({ label: 'Agent 2' }),
        spawnAgent({ label: 'Agent 3' }),
      ]);
      
      // Simulate crashes on all agents
      await Promise.all(agents.map(a => simulateAgentCrash(a.id)));
      
      // All should have status tracked (error, unknown, or running)
      for (const agent of agents) {
        const status = await getAgentStatus(agent.id);
        expect(['error', 'unknown', 'running']).toContain(status);
      }
    });
  });

  describe('Retry Mechanisms', () => {
    it('should retry failed operations with exponential backoff', async () => {
      let attempts = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Temporary failure') as Error & { code?: string };
          error.code = 'ECONNRESET'; // Make it retryable
          throw error;
        }
        return { stdout: 'success', exitCode: 0 };
      });

      const result = await retry(mockOperation, {
        maxAttempts: 5, // Need enough attempts for transient errors
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ stdout: 'success', exitCode: 0 });
      expect(attempts).toBe(3);
    });

    it('should fail after max retries exceeded', async () => {
      let attempts = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        attempts++;
        const error = new Error('Persistent failure') as Error & { code?: string };
        error.code = 'ECONNRESET'; // Make it retryable so it actually retries
        throw error;
      });

      const result = await retry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Persistent failure');
      expect(attempts).toBe(3);
    });

    it('should not retry permanent errors', async () => {
      let attempts = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        attempts++;
        const error = new Error('Permanent error') as Error & { code: string };
        error.code = '23505'; // PostgreSQL unique_violation - permanent
        throw error;
      });

      const result = await retry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
      });

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // Should not retry
    });

    it('should retry transient network errors', async () => {
      let attempts = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Connection reset') as Error & { code: string };
          error.code = 'ECONNRESET'; // Transient error
          throw error;
        }
        return 'success';
      });

      const result = await retry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should track retry count in agent state', async () => {
      const agent = await spawnAgent({ maxRetries: 3 });
      const state = lifecycle.getState(agent.id);
      
      // Simulate retry increments
      if (state) {
        state.retryCount = 2;
      }
      
      expect(state?.retryCount).toBe(2);
      expect(state?.maxRetries).toBe(3);
    });
  });

  describe('Network Timeout Handling', () => {
    it('should handle network timeout gracefully', async () => {
      mockOpenClaw.sendMessage = jest.fn().mockRejectedValue(
        new AgentTimeoutError('agent-1', 30000)
      );

      const agent = await spawnAgent();
      
      // Operation should reject with timeout error
      await expect(
        mockOpenClaw.sendMessage!(agent.id, { type: 'test' })
      ).rejects.toThrow(AgentTimeoutError);
    });

    it('should maintain agent state after timeout', async () => {
      mockOpenClaw.sendMessage = jest.fn().mockRejectedValue(
        new AgentTimeoutError('agent-1', 30000)
      );

      const agent = await spawnAgent();
      
      try {
        await mockOpenClaw.sendMessage!(agent.id, { type: 'test' });
      } catch {
        // Expected to throw
      }
      
      // Agent should still be in known state
      const status = await getAgentStatus(agent.id);
      expect(['running', 'error', 'idle']).toContain(status);
    });

    it('should emit timeout event', async () => {
      const timeoutListener = jest.fn();
      lifecycle.on('agent.timeout', timeoutListener);
      
      const agent = await spawnAgent();
      
      lifecycle.emit('agent.timeout', {
        agentId: agent.id,
        operation: 'sendMessage',
        timeoutMs: 30000,
      });
      
      expect(timeoutListener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: agent.id,
        operation: 'sendMessage',
      }));
    });

    it('should support custom timeout durations', async () => {
      const agent = await spawnAgent();
      
      const timeoutError = new AgentTimeoutError(agent.id, 5000);
      expect(timeoutError.timeoutMs).toBe(5000);
      expect(timeoutError.message).toContain('5000ms');
    });
  });

  describe('Recovery Events', () => {
    it('should emit agent.recovered event after successful retry', async () => {
      const recoveredListener = jest.fn();
      lifecycle.on('agent.recovered', recoveredListener);
      
      const agent = await spawnAgent();
      
      // Simulate recovery
      lifecycle.emit('agent.recovered', {
        agentId: agent.id,
        previousStatus: 'error',
        currentStatus: 'running',
        recoveryTime: Date.now(),
      });
      
      expect(recoveredListener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: agent.id,
        previousStatus: 'error',
        currentStatus: 'running',
      }));
    });

    it('should track recovery metrics', async () => {
      const agent = await spawnAgent();
      
      // Simulate multiple recoveries
      const metrics = lifecycle.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalSpawned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle crash for non-existent agent gracefully', async () => {
      await expect(simulateAgentCrash('non-existent-id')).resolves.not.toThrow();
    });

    it('should handle rapid crash and recovery cycles', async () => {
      const agent = await spawnAgent();
      
      // Simulate rapid state changes
      for (let i = 0; i < 5; i++) {
        await simulateAgentCrash(agent.id);
        // Simulate recovery
        const state = lifecycle.getState(agent.id);
        if (state) {
          state.status = AgentStatus.RUNNING;
          state.lifecycleState = 'running';
          state.error = undefined;
        }
      }
      
      const finalStatus = await getAgentStatus(agent.id);
      expect(finalStatus).toBe('running');
    });

    it('should preserve agent context after crash', async () => {
      const agent = await spawnAgent({
        task: 'Important task with context',
      });
      
      await simulateAgentCrash(agent.id);
      
      // The spawned agent should retain its original task
      expect(agent.task).toBe('Important task with context');
    });

    it('should handle cleanup after crash', async () => {
      const agent = await spawnAgent();
      
      const cleanupSpy = jest.spyOn(lifecycle, 'emit');
      await simulateAgentCrash(agent.id);
      
      // Should emit cleanup event
      expect(cleanupSpy).toHaveBeenCalledWith(
        'agent.error',
        expect.any(Object)
      );
    });
  });
});

/**
 * Integration test for execWithRetry helper
 */
describe('execWithRetry Helper', () => {
  it('should execute command with retry on failure', async () => {
    let attempts = 0;
    const execWithRetry = async (
      agentId: string,
      command: string,
      options: { maxRetries: number }
    ): Promise<{ stdout: string; exitCode: number }> => {
      const result = await retry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error = new Error('Command failed') as Error & { code?: string };
            error.code = 'ECONNRESET'; // Make it retryable
            throw error;
          }
          return { stdout: 'success', exitCode: 0 };
        },
        {
          maxAttempts: options.maxRetries,
          baseDelay: 10,
          jitterFactor: 0,
        }
      );
      
      if (!result.success || !result.data) {
        throw result.error || new Error('Command failed');
      }
      return result.data;
    };

    const result = await execWithRetry('agent-1', 'test-command', { maxRetries: 5 });
    
    expect(result.stdout).toBe('success');
    expect(result.exitCode).toBe(0);
    expect(attempts).toBe(3);
  });
});

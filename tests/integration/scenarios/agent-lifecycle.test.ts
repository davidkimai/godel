/**
 * Scenario 3: Agent Lifecycle Integration Tests
 * 
 * Tests for complete agent lifecycle management.
 * - spawn → running → complete flow
 * - Agent failure and recovery
 * - Lifecycle state transitions
 */

import { OpenClawAdapter } from '../../../src/integrations/openclaw/adapter';
import { getGlobalClient } from '../../../src/cli/lib/client';
import { getGlobalLifecycle, AgentLifecycle } from '../../../src/core/lifecycle';
import { getGlobalBus, MessageBus } from '../../../src/bus/index';
import { testConfig, waitForStatus, waitForCondition } from '../config';
import { AgentStatus } from '../../../src/models/agent';

describe('Scenario 3: Agent Lifecycle', () => {
  let adapter: OpenClawAdapter;
  let lifecycle: AgentLifecycle;
  let messageBus: MessageBus;
  let createdSessionKeys: string[] = [];

  beforeAll(async () => {
    messageBus = getGlobalBus();
    lifecycle = getGlobalLifecycle();
    
    adapter = new OpenClawAdapter({
      dashApiUrl: testConfig.dashApiUrl,
      dashApiKey: testConfig.dashApiKey,
      openclawSessionKey: testConfig.openclawSessionKey,
    });
  });

  afterAll(async () => {
    // Clean up all agents
    for (const sessionKey of createdSessionKeys) {
      try {
        await adapter.killAgent(sessionKey, true);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    createdSessionKeys = [];
  });

  describe('Full Lifecycle Flow', () => {
    it('should complete full lifecycle: spawn → pending → running → complete', async () => {
      const sessionKey = `lifecycle-session-${Date.now()}`;
      
      // 1. Spawn agent
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'code-review',
        task: 'Simple review task',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      expect(spawnResult.status).toBe('pending');
      
      // 2. Wait for transition to running
      await waitForStatus(
        async () => {
          const status = await adapter.getStatus(sessionKey);
          return status;
        },
        'running',
        15000
      );
      
      const runningStatus = await adapter.getStatus(sessionKey);
      expect(runningStatus.status).toBe('running');
      
      // 3. Send a message to the agent (simulates work)
      await adapter.sendMessage(sessionKey, 'Please complete your review');
      
      // 4. Manually trigger completion (since we're testing the flow)
      const client = getGlobalClient();
      
      // Update agent status to completed through lifecycle
      await lifecycle.complete(agentId, { 
        success: true, 
        result: { findings: ['No issues found'] } 
      });
      
      // 5. Wait for completion
      await waitForStatus(
        async () => {
          const status = await adapter.getStatus(sessionKey);
          return status;
        },
        'completed',
        10000
      );
      
      // 6. Verify final status
      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.result).toBeDefined();
    }, testConfig.testTimeout);

    it('should track progress through lifecycle', async () => {
      const sessionKey = `progress-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'code-review',
        task: 'Progress tracking test',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      // Track state transitions
      const states: string[] = [];
      
      // Subscribe to agent events
      const subscription = messageBus.subscribe(
        `agent.${agentId}.events`,
        (message) => {
          const payload = message.payload as { eventType?: string };
          if (payload?.eventType) {
            states.push(payload.eventType);
          }
        }
      );
      
      // Wait for spawning → running
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // Complete the agent
      await lifecycle.complete(agentId, { success: true });
      
      // Wait for completion
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );
      
      // Clean up subscription
      if (!Array.isArray(subscription)) {
        messageBus.unsubscribe(subscription);
      }
      
      // Verify we captured state transitions
      expect(states.length).toBeGreaterThan(0);
    }, testConfig.testTimeout);
  });

  describe('Failure and Recovery', () => {
    it('should handle agent failure gracefully', async () => {
      const sessionKey = `failure-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'test',
        task: 'Task that will fail',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      // Wait for agent to start
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // Fail the agent
      await lifecycle.fail(agentId, 'Simulated failure');
      
      // Wait for failure status
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'failed',
        10000
      );
      
      // Verify failure status
      const status = await adapter.getStatus(sessionKey);
      expect(status.status).toBe('failed');
      expect(status.error).toBeDefined();
    }, testConfig.testTimeout);

    it('should support agent retry after failure', async () => {
      const sessionKey = `retry-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'test',
        task: 'Retry test task',
        config: { maxRetries: 3 },
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      // Wait for running
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // Fail the agent
      await lifecycle.fail(agentId, 'First failure');
      
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'failed',
        10000
      );
      
      // Retry the agent
      await lifecycle.retry(agentId);
      
      // Wait for agent to be running again
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // Complete successfully
      await lifecycle.complete(agentId, { success: true });
      
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );
      
      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
    }, testConfig.testTimeout);

    it('should handle agent kill during execution', async () => {
      const sessionKey = `kill-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'long-running',
        task: 'Long running task',
      });
      
      createdSessionKeys.push(sessionKey);
      
      // Wait for running
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // Kill the agent
      await adapter.killAgent(sessionKey, false);
      
      // Verify agent is no longer active
      const status = await adapter.getStatus(sessionKey);
      expect(['killed', 'not_found']).toContain(status.status);
    }, testConfig.testTimeout);

    it('should handle force kill for stuck agents', async () => {
      const sessionKey = `force-kill-session-${Date.now()}`;
      
      await adapter.spawnAgent(sessionKey, {
        agentType: 'stuck-agent',
        task: 'Stuck task',
      });
      
      createdSessionKeys.push(sessionKey);
      
      // Force kill immediately
      await adapter.killAgent(sessionKey, true);
      
      // Verify agent is terminated
      const status = await adapter.getStatus(sessionKey);
      expect(['killed', 'not_found']).toContain(status.status);
    }, testConfig.testTimeout);
  });

  describe('State Transitions', () => {
    it('should transition through all valid states', async () => {
      const sessionKey = `states-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'state-machine',
        task: 'State transition test',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      const validTransitions = [
        { from: 'pending', to: 'running' },
        { from: 'running', to: 'paused' },
        { from: 'paused', to: 'running' },
        { from: 'running', to: 'completed' },
      ];
      
      // 1. pending → running
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      // 2. running → paused
      await lifecycle.pause(agentId);
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'paused',
        10000
      );
      
      // 3. paused → running
      await lifecycle.resume(agentId);
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        10000
      );
      
      // 4. running → completed
      await lifecycle.complete(agentId, { success: true });
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );
      
      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
    }, testConfig.testTimeout);

    it('should handle invalid state transitions gracefully', async () => {
      const sessionKey = `invalid-transition-session-${Date.now()}`;
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'test',
        task: 'Invalid transition test',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      // Try to complete a pending agent (should fail or wait)
      // This should be handled gracefully
      try {
        await lifecycle.complete(agentId, { success: true });
      } catch (error) {
        // Expected - can't complete from pending
        expect(error).toBeDefined();
      }
      
      // Agent should still be pending or running, not completed
      const status = await adapter.getStatus(sessionKey);
      expect(status.status).not.toBe('completed');
    }, testConfig.testTimeout);
  });

  describe('Lifecycle Events', () => {
    it('should emit lifecycle events', async () => {
      const sessionKey = `events-session-${Date.now()}`;
      const lifecycleEvents: string[] = [];
      
      // Set up event listener
      const subscription = messageBus.subscribe(
        'agent.*.events',
        (message) => {
          const payload = message.payload as { eventType?: string };
          if (payload?.eventType) {
            lifecycleEvents.push(payload.eventType);
          }
        }
      );
      
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'event-emitter',
        task: 'Event emission test',
      });
      
      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;
      
      // Wait for lifecycle to progress
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );
      
      await lifecycle.complete(agentId, { success: true });
      
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );
      
      // Clean up subscription
      if (!Array.isArray(subscription)) {
        messageBus.unsubscribe(subscription);
      }
      
      // Verify events were emitted
      expect(lifecycleEvents.length).toBeGreaterThan(0);
    }, testConfig.testTimeout);

    it('should maintain correct agent count throughout lifecycle', async () => {
      const sessionKeys: string[] = [];
      
      // Spawn multiple agents
      for (let i = 0; i < 5; i++) {
        const sessionKey = `count-session-${Date.now()}-${i}`;
        await adapter.spawnAgent(sessionKey, {
          agentType: 'counter',
          task: `Count task ${i}`,
        });
        sessionKeys.push(sessionKey);
      }
      
      createdSessionKeys.push(...sessionKeys);
      
      // Verify all are listed
      const activeAgents = await adapter.listAgents();
      const ourAgents = activeAgents.filter(a => 
        sessionKeys.includes(a.openclawSessionKey)
      );
      expect(ourAgents.length).toBe(5);
      
      // Kill one agent
      await adapter.killAgent(sessionKeys[0], true);
      
      // Verify count decreased
      const remainingAgents = await adapter.listAgents();
      const remainingOurAgents = remainingAgents.filter(a => 
        sessionKeys.includes(a.openclawSessionKey)
      );
      expect(remainingOurAgents.length).toBeLessThan(5);
    }, testConfig.testTimeout);
  });

  describe('Multiple Concurrent Lifecycles', () => {
    it('should handle multiple agents with different lifecycles', async () => {
      const sessions = [
        { key: `multi-1-${Date.now()}`, type: 'quick', shouldFail: false },
        { key: `multi-2-${Date.now()}`, type: 'slow', shouldFail: false },
        { key: `multi-3-${Date.now()}`, type: 'failing', shouldFail: true },
      ];
      
      // Spawn all agents
      for (const session of sessions) {
        await adapter.spawnAgent(session.key, {
          agentType: session.type,
          task: `${session.type} task`,
        });
        createdSessionKeys.push(session.key);
      }
      
      // Wait for all to be running
      for (const session of sessions) {
        await waitForStatus(
          async () => adapter.getStatus(session.key),
          'running',
          15000
        );
      }
      
      // Handle each according to its plan
      for (const session of sessions) {
        const agentId = adapter.getDashAgentId(session.key);
        if (!agentId) continue;
        
        if (session.shouldFail) {
          await lifecycle.fail(agentId, 'Planned failure');
        } else {
          await lifecycle.complete(agentId, { success: true });
        }
      }
      
      // Verify final states
      for (const session of sessions) {
        const expectedStatus = session.shouldFail ? 'failed' : 'completed';
        
        await waitForCondition(
          async () => {
            const status = await adapter.getStatus(session.key);
            return status.status === expectedStatus;
          },
          10000,
          100
        );
        
        const status = await adapter.getStatus(session.key);
        expect(status.status).toBe(expectedStatus);
      }
    }, testConfig.testTimeout);
  });
});

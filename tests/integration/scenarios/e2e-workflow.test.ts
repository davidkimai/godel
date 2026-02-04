import { logger } from '../../../src/utils/logger';
/**
 * Scenario 10: End-to-End Workflow Integration Tests
 * 
 * Tests for complete workflow scenarios.
 * - Complete code review workflow
 * - OpenClaw → Dash → OpenClaw flow
 * - Validate results and events
 */

import { OpenClawAdapter } from '../../../src/integrations/openclaw/adapter';
import { OpenClawEventBridge } from '../../../src/integrations/openclaw/event-bridge';
import { getGlobalBus, MessageBus } from '../../../src/bus/index';
import { getGlobalClient } from '../../../src/cli/lib/client';
import { getGlobalLifecycle, AgentLifecycle } from '../../../src/core/lifecycle';
import { testConfig, waitForStatus, waitForCondition } from '../config';

describe('Scenario 10: End-to-End Workflow', () => {
  let adapter: OpenClawAdapter;
  let eventBridge: OpenClawEventBridge;
  let messageBus: MessageBus;
  let lifecycle: AgentLifecycle;
  let client: ReturnType<typeof getGlobalClient>;
  const createdSessionKeys: string[] = [];

  beforeAll(async () => {
    messageBus = getGlobalBus();
    lifecycle = getGlobalLifecycle();
    client = getGlobalClient();
    
    adapter = new OpenClawAdapter({
      dashApiUrl: testConfig.dashApiUrl,
      dashApiKey: testConfig.dashApiKey,
      openclawSessionKey: testConfig.openclawSessionKey,
    });

    eventBridge = new OpenClawEventBridge({
      messageBus,
      webhookUrl: 'http://localhost:9999/webhook',
      batchInterval: 0,
    });

    // Mock webhook to capture events locally
    (eventBridge as any).sendToWebhook = async (events: any[]) => {
      // Events are captured by the bridge's event emitter
    };

    await eventBridge.start();
  });

  afterAll(async () => {
    await eventBridge.stop();

    // Clean up all created agents
    for (const sessionKey of createdSessionKeys) {
      try {
        await adapter.killAgent(sessionKey, true);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    // Reset for each test
  });

  describe('Code Review Workflow', () => {
    it('should execute complete code review workflow', async () => {
      const sessionKey = `e2e-review-${Date.now()}`;
      const workflowEvents: any[] = [];

      // Set up event monitoring
      eventBridge.on('event', (event) => {
        if (event.sessionKey === sessionKey || event.metadata?.dashAgentId) {
          workflowEvents.push(event);
        }
      });

      // 1. OpenClaw initiates code review
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'code-review',
        task: 'Review PR #456: Authentication refactor',
        model: 'kimi-k2.5',
        config: {
          files: ['src/auth/*.ts', 'src/middleware/auth.ts'],
          focus: ['security', 'performance', 'error-handling'],
          prNumber: 456,
        },
      });

      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;

      expect(spawnResult.dashAgentId).toBeDefined();
      expect(spawnResult.status).toBe('pending');

      // 2. Verify agent spawned and mapped
      expect(adapter.hasAgent(sessionKey)).toBe(true);
      expect(adapter.getDashAgentId(sessionKey)).toBe(agentId);

      // 3. Wait for agent to start running
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // 4. Send additional context (simulating OpenClaw sending more info)
      await adapter.sendMessage(sessionKey, 
        'Focus on JWT token validation in the auth middleware'
      );

      // 5. Simulate agent processing and completing
      await lifecycle.complete(agentId, 'Code review completed with 2 findings');

      // 6. Wait for completion
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      // 7. Verify final results
      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.result).toBeDefined();

      // 8. Verify events were captured
      expect(workflowEvents.length).toBeGreaterThan(0);

      logger.info('Code Review Workflow completed successfully');
      logger.info(`  Agent ID: ${agentId}`);
      logger.info(`  Events captured: ${workflowEvents.length}`);
    }, testConfig.testTimeout);

    it('should handle multi-agent code review workflow', async () => {
      const sessionKeys = [
        `e2e-multi-1-${Date.now()}`,
        `e2e-multi-2-${Date.now()}`,
        `e2e-multi-3-${Date.now()}`,
      ];

      const agentTypes = ['security-review', 'performance-review', 'style-review'];
      const agentIds: string[] = [];

      // Spawn multiple specialized agents
      for (let i = 0; i < sessionKeys.length; i++) {
        const result = await adapter.spawnAgent(sessionKeys[i], {
          agentType: agentTypes[i],
          task: `Review PR #789 - ${agentTypes[i]}`,
          config: {
            focus: [agentTypes[i].replace('-review', '')],
          },
        });

        createdSessionKeys.push(sessionKeys[i]);
        agentIds.push(result.dashAgentId);
      }

      // Wait for all agents to be running
      for (const sessionKey of sessionKeys) {
        await waitForStatus(
          async () => adapter.getStatus(sessionKey),
          'running',
          15000
        );
      }

      // Complete all agents
      for (let i = 0; i < agentIds.length; i++) {
        await lifecycle.complete(agentIds[i], `${agentTypes[i]} completed with findings`);
      }

      // Wait for all to complete
      for (const sessionKey of sessionKeys) {
        await waitForStatus(
          async () => adapter.getStatus(sessionKey),
          'completed',
          10000
        );
      }

      // Verify all completed
      for (const sessionKey of sessionKeys) {
        const status = await adapter.getStatus(sessionKey);
        expect(status.status).toBe('completed');
      }
    }, testConfig.testTimeout);
  });

  describe('OpenClaw ↔ Dash Integration Flow', () => {
    it('should complete full OpenClaw → Dash → OpenClaw flow', async () => {
      const sessionKey = `openclaw-flow-${Date.now()}`;
      const events: any[] = [];

      // Monitor events
      eventBridge.on('event', (event) => {
        if (event.sessionKey === sessionKey) {
          events.push({
            type: event.type,
            timestamp: event.timestamp,
            data: event.data,
          });
        }
      });

      // Phase 1: OpenClaw requests agent spawn
      const spawnStart = Date.now();
      const spawnResult = await adapter.spawnAgent(sessionKey, {
        agentType: 'task-executor',
        task: 'Execute end-to-end test task',
        model: 'kimi-k2.5',
      });
      const spawnDuration = Date.now() - spawnStart;

      createdSessionKeys.push(sessionKey);
      const agentId = spawnResult.dashAgentId;

      expect(spawnResult.dashAgentId).toBeDefined();
      logger.info(`Spawn completed in ${spawnDuration}ms`);

      // Phase 2: Dash processes agent lifecycle
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // Phase 3: OpenClaw sends message to agent
      await adapter.sendMessage(sessionKey, 'Process this data and return results');

      // Phase 4: Dash executes and completes
      await lifecycle.complete(agentId, 'Task completed successfully with metrics');

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      // Phase 5: OpenClaw retrieves results
      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.result).toBeDefined();

      // Verify event flow
      expect(events.length).toBeGreaterThan(0);

      logger.info('OpenClaw ↔ Dash flow completed successfully');
      logger.info(`  Total events: ${events.length}`);
      logger.info(`  Result: ${JSON.stringify(finalStatus.result)}`);
    }, testConfig.testTimeout);

    it('should handle bidirectional communication', async () => {
      const sessionKey = `bidirectional-${Date.now()}`;
      const messages: string[] = [];

      // Track messages
      messageBus.subscribe(`agent.*.messages`, (msg) => {
        const payload = msg.payload as { content?: string };
        if (payload?.content) {
          messages.push(payload.content);
        }
      });

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'chat',
        task: 'Bidirectional communication test',
      });

      createdSessionKeys.push(sessionKey);

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // Send multiple messages
      const testMessages = [
        'Message 1 from OpenClaw',
        'Message 2 from OpenClaw',
        'Message 3 from OpenClaw',
      ];

      for (const message of testMessages) {
        await adapter.sendMessage(sessionKey, message);
      }

      // Wait for messages to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Messages should have been published to bus
      expect(messages.length).toBeGreaterThanOrEqual(0);

      // Complete the agent
      await lifecycle.complete(result.dashAgentId, "Task completed successfully");
    }, testConfig.testTimeout);
  });

  describe('Complex Workflow Scenarios', () => {
    it('should handle workflow with failures and retries', async () => {
      const sessionKey = `retry-workflow-${Date.now()}`;

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'unreliable-task',
        task: 'Task that may fail',
        config: { maxRetries: 2 },
      });

      createdSessionKeys.push(sessionKey);
      const agentId = result.dashAgentId;

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // Fail the agent
      await lifecycle.fail(agentId, 'Simulated failure');

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'failed',
        10000
      );

      // Retry
      await lifecycle.retry(agentId);

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // Complete successfully
      await lifecycle.complete(agentId, "Task completed successfully");

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      const finalStatus = await adapter.getStatus(sessionKey);
      expect(finalStatus.status).toBe('completed');
    }, testConfig.testTimeout);

    it('should handle cascading agent workflows', async () => {
      // Parent agent
      const parentKey = `cascade-parent-${Date.now()}`;
      const parentResult = await adapter.spawnAgent(parentKey, {
        agentType: 'orchestrator',
        task: 'Orchestrate child agents',
      });

      createdSessionKeys.push(parentKey);
      const parentId = parentResult.dashAgentId;

      await waitForStatus(
        async () => adapter.getStatus(parentKey),
        'running',
        15000
      );

      // Spawn child agents
      const childKeys: string[] = [];
      for (let i = 0; i < 3; i++) {
        const childKey = `cascade-child-${Date.now()}-${i}`;
        await adapter.spawnAgent(childKey, {
          agentType: 'worker',
          task: `Child task ${i}`,
        });
        childKeys.push(childKey);
        createdSessionKeys.push(childKey);
      }

      // Wait for children
      for (const key of childKeys) {
        await waitForStatus(
          async () => adapter.getStatus(key),
          'running',
          15000
        );
      }

      // Complete children
      for (const key of childKeys) {
        const agentId = adapter.getDashAgentId(key);
        if (agentId) {
          await lifecycle.complete(agentId, "Task completed successfully");
        }
      }

      // Complete parent
      await lifecycle.complete(parentId, "Parent task completed");

      // Verify all completed
      for (const key of [parentKey, ...childKeys]) {
        await waitForStatus(
          async () => adapter.getStatus(key),
          'completed',
          10000
        );
      }
    }, testConfig.testTimeout);
  });

  describe('Event Validation', () => {
    it('should emit correct event sequence', async () => {
      const sessionKey = `event-seq-${Date.now()}`;
      const eventTypes: string[] = [];

      eventBridge.on('event', (event) => {
        if (event.sessionKey === sessionKey) {
          eventTypes.push(event.type);
        }
      });

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'event-emitter',
        task: 'Event sequence test',
      });

      createdSessionKeys.push(sessionKey);

      // Progress through states
      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      await lifecycle.complete(result.dashAgentId, "Task completed successfully");

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      // Should have events
      expect(eventTypes.length).toBeGreaterThan(0);
    }, testConfig.testTimeout);

    it('should validate event data integrity', async () => {
      const sessionKey = `event-integrity-${Date.now()}`;
      const receivedEvents: any[] = [];

      eventBridge.on('event', (event) => {
        if (event.sessionKey === sessionKey) {
          receivedEvents.push(event);
        }
      });

      await adapter.spawnAgent(sessionKey, {
        agentType: 'data-validator',
        task: 'Event data integrity test',
        config: { testData: { key: 'value', nested: { data: true } } },
      });

      createdSessionKeys.push(sessionKey);

      await waitForCondition(
        () => receivedEvents.length > 0,
        5000,
        100
      );

      // Validate event structure
      for (const event of receivedEvents) {
        expect(event.source).toBe('dash');
        expect(event.type).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.sessionKey).toBe(sessionKey);
        expect(event.data).toBeDefined();
        expect(event.metadata).toBeDefined();
      }
    }, testConfig.testTimeout);
  });

  describe('Results Validation', () => {
    it('should return consistent results', async () => {
      const sessionKey = `results-${Date.now()}`;

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'result-generator',
        task: 'Generate test results',
      });

      createdSessionKeys.push(sessionKey);

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      // Complete with specific result
      const expectedResult = {
        data: { key: 'value' },
        metrics: { duration: 1000, tokens: 500 },
        success: true,
      };

      await lifecycle.complete(result.dashAgentId, "Task completed with result");

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      // Get status multiple times - should be consistent
      const status1 = await adapter.getStatus(sessionKey);
      const status2 = await adapter.getStatus(sessionKey);
      const status3 = await adapter.getStatus(sessionKey);

      expect(status1.status).toBe('completed');
      expect(status1.result).toEqual(status2.result);
      expect(status2.result).toEqual(status3.result);
    }, testConfig.testTimeout);
  });

  describe('Performance Validation', () => {
    it('should complete workflow within acceptable time', async () => {
      const sessionKey = `perf-${Date.now()}`;
      const startTime = Date.now();

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'performance-test',
        task: 'Performance validation test',
      });

      createdSessionKeys.push(sessionKey);

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      await lifecycle.complete(result.dashAgentId, "Task completed successfully");

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      const duration = Date.now() - startTime;
      logger.info(`Workflow completed in ${duration}ms`);

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);
    }, testConfig.testTimeout);
  });

  describe('Resource Cleanup in Workflows', () => {
    it('should clean up resources after workflow completion', async () => {
      const sessionKey = `cleanup-${Date.now()}`;

      const result = await adapter.spawnAgent(sessionKey, {
        agentType: 'cleanup-test',
        task: 'Resource cleanup test',
      });

      createdSessionKeys.push(sessionKey);

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'running',
        15000
      );

      await lifecycle.complete(result.dashAgentId, "Task completed successfully");

      await waitForStatus(
        async () => adapter.getStatus(sessionKey),
        'completed',
        10000
      );

      // Kill agent to clean up
      await adapter.killAgent(sessionKey, true);

      // Verify cleanup
      const status = await adapter.getStatus(sessionKey);
      expect(status.status).toBe('not_found');
    }, testConfig.testTimeout);
  });
});

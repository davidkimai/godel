/**
 * OpenClaw Integration Tests
 * 
 * Full end-to-end integration tests for the OpenClaw-Godel integration.
 * Tests the complete flow from spawning to event streaming.
 * 
 * @group integration
 */

import {
  OpenClawAdapter,
  getOpenClawAdapter,
  resetOpenClawAdapter,
} from '../../../src/integrations/openclaw/adapter';

import {
  OpenClawEventBridge,
  getOpenClawEventBridge,
  resetOpenClawEventBridge,
} from '../../../src/integrations/openclaw/event-bridge';

import { GodelOrchestrationSkill } from '../../../skills/godel-orchestration/index';
import { getGlobalClient } from '../../../src/cli/lib/client';
import { getGlobalBus, type MessageBus } from '../../../src/bus/index';

// Mock dependencies
jest.mock('../../../src/cli/lib/client');
jest.mock('../../../src/bus/index');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch for webhook testing
global.fetch = jest.fn();

describe('OpenClaw-Godel Integration', () => {
  let adapter: OpenClawAdapter;
  let eventBridge: OpenClawEventBridge;
  let skill: GodelOrchestrationSkill;
  let mockClient: any; // Use any to bypass strict typing in tests
  let mockBus: {
    subscribe: jest.Mock;
    publish: jest.Mock;
    getMessages: jest.Mock;
  };

  const testConfig = {
    godelApiUrl: 'http://localhost:7373',
    godelApiKey: 'godel_test_key_1234567890123456789012345678901234567890123456789012345678901234',
    openclawSessionKey: 'test-session-123',
    eventWebhookUrl: 'http://localhost:8080/webhook',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    resetOpenClawAdapter();
    resetOpenClawEventBridge();

    // Create mock client
    mockClient = {
      createTeam: jest.fn(),
      destroyTeam: jest.fn(),
      spawnAgent: jest.fn(),
      killAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
      getAgentLogs: jest.fn(),
    } as unknown as any;

    // Create mock message bus
    mockBus = {
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      publish: jest.fn(),
      getMessages: jest.fn().mockReturnValue([]),
    };

    (getGlobalClient as jest.Mock).mockReturnValue(mockClient);
    (getGlobalBus as jest.Mock).mockReturnValue(mockBus);

    // Initialize components
    adapter = getOpenClawAdapter(testConfig);
    eventBridge = getOpenClawEventBridge({
      webhookUrl: testConfig.eventWebhookUrl,
      messageBus: mockBus as unknown as MessageBus,
    });
    skill = new GodelOrchestrationSkill({
      godelApiUrl: testConfig.godelApiUrl,
      godelApiKey: testConfig.godelApiKey,
      eventWebhookUrl: testConfig.eventWebhookUrl,
    });

    // Start event bridge
    await eventBridge.start();
  });

  afterEach(async () => {
    await eventBridge.stop();
    await adapter.dispose();
    await skill.dispose();
  });

  describe('Full Flow', () => {
    it('should complete full agent lifecycle', async () => {
      // Setup mock responses
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: {
          id: 'team-test-123',
          name: 'test-swarm',
          status: 'active' as const,
          config: {
            name: 'test',
            task: 'test',
            initialAgents: 1,
            maxAgents: 5,
            strategy: 'parallel' as const,
          },
          agents: [],
          createdAt: new Date(),
          budget: { allocated: 0, consumed: 0, remaining: 0 },
          metrics: { totalAgents: 0, completedAgents: 0, failedAgents: 0 },
        },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-test-456',
          label: 'test-agent',
          status: 'running' as const,
          model: 'claude-3',
          task: 'test',
          teamId: 'team-test-123';
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          maxRetries: 3,
          retryCount: 0,
        },
      });

      mockClient.getAgent
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'agent-test-456',
            label: 'test-agent',
            status: 'running' as const,
            model: 'claude-3',
            task: 'test',
            teamId: 'team-test-123';
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            progress: 0,
            maxRetries: 3,
            retryCount: 0,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'agent-test-456',
            label: 'test-agent',
            status: 'running' as const,
            model: 'claude-3',
            task: 'test',
            teamId: 'team-test-123';
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            progress: 50,
            maxRetries: 3,
            retryCount: 0,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'agent-test-456',
            label: 'test-agent',
            status: 'completed' as const,
            model: 'claude-3',
            task: 'test',
            teamId: 'team-test-123';
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            progress: 100,
            result: { output: 'Task completed successfully' },
            maxRetries: 3,
            retryCount: 0,
          },
        });

      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroyTeam.mockResolvedValue({ success: true });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      // 1. Spawn agent
      const spawnResult = await adapter.spawnAgent('session-123', {
        agentType: 'code-review',
        task: 'Review the codebase',
        model: 'claude-3',
      });

      expect(spawnResult.godelAgentId).toBe('agent-test-456');
      expect(spawnResult.status).toBe('running');

      // 2. Check status
      let status = await adapter.getStatus('session-123');
      expect(status.status).toBe('running');
      expect(status.progress).toBe(0);

      // 3. Send message
      await adapter.sendMessage('session-123', 'Please focus on security issues');

      expect(mockBus.publish).toHaveBeenCalledWith(
        'agent.agent-test-456.messages',
        expect.objectContaining({
          content: 'Please focus on security issues',
        }),
        expect.any(Object)
      );

      // 4. Progress through agent lifecycle
      status = await adapter.getStatus('session-123');
      expect(status.progress).toBe(50);

      status = await adapter.getStatus('session-123');
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);

      // 5. Kill agent (cleanup)
      await adapter.killAgent('session-123');

      expect(mockClient.killAgent).toHaveBeenCalledWith('agent-test-456', undefined);
      expect(mockClient.destroyTeam).toHaveBeenCalledWith('team-test-123', undefined);
    }, 10000);

    it('should stream events to webhook', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: {
          id: 'swarm-event-123',
          name: 'test-swarm',
          status: 'active' as const,
          config: {
            name: 'test',
            task: 'test',
            initialAgents: 1,
            maxAgents: 5,
            strategy: 'parallel' as const,
          },
          agents: [],
          createdAt: new Date(),
          budget: { allocated: 0, consumed: 0, remaining: 0 },
          metrics: { totalAgents: 0, completedAgents: 0, failedAgents: 0 },
        },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-event-456',
          label: 'test-agent',
          status: 'running' as const,
          model: 'claude-3',
          task: 'test',
          teamId: 'team-event-123',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          maxRetries: 3,
          retryCount: 0,
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      // Spawn agent
      await adapter.spawnAgent('session-events', {
        agentType: 'test',
        task: 'Test events',
      });

      // Simulate event being emitted
      const eventHandler = mockBus.subscribe.mock.calls.find(
        call => call[0] === '*'
      )?.[1];

      if (eventHandler) {
        await eventHandler({
          id: 'evt-1',
          topic: 'agent.agent-event-456.events',
          payload: { eventType: 'agent.spawned', data: 'test' },
          timestamp: new Date(),
          metadata: {},
        });
      }

      // Verify webhook was called
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Skill Commands', () => {
    const createMockContext = (sessionKey: string): any => ({
      sessionKey,
      input: 'test task',
      model: 'claude-3',
      reply: jest.fn(),
      error: jest.fn(),
    });

    it('should handle spawn command', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-skill-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-skill-456',
          status: 'running',
        },
      });

      const context = createMockContext('session-skill');

      await skill.spawn(context, ['code-review', '--agents', '3', '--model', 'claude-3']);

      expect(context.reply).toHaveBeenCalledWith(
        expect.stringContaining('Spawned Godel agent')
      );
    });

    it('should handle status command', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-status-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-status-456',
          status: 'running',
        },
      });

      await adapter.spawnAgent('session-status', {
        agentType: 'test',
        task: 'test',
      });

      mockClient.getAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-status-456',
          status: 'running',
          progress: 75,
        },
      });

      const context = createMockContext('session-status');

      await skill.status(context, []);

      expect(context.reply).toHaveBeenCalledWith(
        expect.stringContaining('running')
      );
    });

    it('should handle kill command', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-kill-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-kill-456',
          status: 'running',
        },
      });

      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroyTeam.mockResolvedValue({ success: true });

      await adapter.spawnAgent('session-kill', {
        agentType: 'test',
        task: 'test',
      });

      const context = createMockContext('session-kill');

      await skill.kill(context, ['--force']);

      expect(context.reply).toHaveBeenCalledWith('💀 Agent killed');
    });

    it('should handle list command', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-list-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-list-456',
          status: 'running',
        },
      });

      await adapter.spawnAgent('session-list', {
        agentType: 'code-review',
        task: 'test',
      });

      mockClient.getAgent.mockResolvedValue({
        success: true,
        data: { status: 'running' },
      });

      const context = createMockContext('any-session');

      await skill.list(context);

      expect(context.reply).toHaveBeenCalledWith(
        expect.stringContaining('Active Godel Agent')
      );
    });

    it('should handle logs command', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-logs-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-logs-456',
          status: 'running',
        },
      });

      await adapter.spawnAgent('session-logs', {
        agentType: 'test',
        task: 'test',
      });

      mockClient.getAgent.mockResolvedValue({
        success: true,
        data: { status: 'running' },
      });

      const context = createMockContext('session-logs');

      await skill.logs(context, ['--lines', '10']);

      expect(context.reply).toHaveBeenCalledWith(
        expect.stringContaining('Fetching logs')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle spawn failures gracefully', async () => {
      mockClient.createTeam.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        adapter.spawnAgent('session-error', {
          agentType: 'test',
          task: 'test',
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle webhook failures without crashing', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-webhook-123' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-webhook-456',
          status: 'running',
        },
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Webhook unreachable'));

      await adapter.spawnAgent('session-webhook', {
        agentType: 'test',
        task: 'test',
      });

      // Should not throw, just log error
      expect(adapter.getStats().activeSessions).toBe(1);
    });

    it('should handle missing agent gracefully', async () => {
      const status = await adapter.getStatus('non-existent-session');
      expect(status.status).toBe('not_found');
    });
  });

  describe('Multiple Agents', () => {
    it('should handle multiple concurrent agents', async () => {
      mockClient.createTeam
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-multi-1' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-multi-2' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-multi-3' } });

      mockClient.spawnAgent
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-multi-1', status: 'running' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-multi-2', status: 'running' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-multi-3', status: 'running' } });

      // Spawn multiple agents
      const results = await Promise.all([
        adapter.spawnAgent('session-1', { agentType: 'code-review', task: 'review 1' }),
        adapter.spawnAgent('session-2', { agentType: 'security', task: 'audit' }),
        adapter.spawnAgent('session-3', { agentType: 'testing', task: 'test' }),
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].godelAgentId).toBe('agent-multi-1');
      expect(results[1].godelAgentId).toBe('agent-multi-2');
      expect(results[2].godelAgentId).toBe('agent-multi-3');

      // Verify all are tracked
      const agents = await adapter.listAgents();
      expect(agents).toHaveLength(3);

      // Verify correct mappings
      expect(adapter.getGodelAgentId('session-1')).toBe('agent-multi-1');
      expect(adapter.getGodelAgentId('session-2')).toBe('agent-multi-2');
      expect(adapter.getGodelAgentId('session-3')).toBe('agent-multi-3');
    });

    it('should isolate agents by session', async () => {
      mockClient.createTeam
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-iso-1' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-iso-2' } });

      mockClient.spawnAgent
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-iso-1', status: 'running' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-iso-2', status: 'running' } });

      await adapter.spawnAgent('session-iso-1', { agentType: 'test', task: 'test 1' });
      await adapter.spawnAgent('session-iso-2', { agentType: 'test', task: 'test 2' });

      // Send message to session 1 only
      await adapter.sendMessage('session-iso-1', 'Hello');

      // Should only go to agent-iso-1
      expect(mockBus.publish).toHaveBeenCalledWith(
        'agent.agent-iso-1.messages',
        expect.any(Object),
        expect.any(Object)
      );

      // Should not go to agent-iso-2
      const callsToAgent2 = mockBus.publish.mock.calls.filter(
        call => call[0] === 'agent.agent-iso-2.messages'
      );
      expect(callsToAgent2).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources on dispose', async () => {
      mockClient.createTeam.mockResolvedValue({
        success: true,
        data: { id: 'swarm-cleanup' },
      });

      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-cleanup',
          status: 'running',
        },
      });

      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroyTeam.mockResolvedValue({ success: true });

      // Spawn some agents
      await adapter.spawnAgent('session-cleanup-1', { agentType: 'test', task: 'test 1' });
      await adapter.spawnAgent('session-cleanup-2', { agentType: 'test', task: 'test 2' });

      expect(adapter.getStats().activeSessions).toBe(2);

      // Dispose
      await adapter.dispose();

      expect(adapter.getStats().activeSessions).toBe(0);
      expect(mockClient.killAgent).toHaveBeenCalledTimes(2);
    });
  });
});

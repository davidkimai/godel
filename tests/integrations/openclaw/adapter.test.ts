/**
 * OpenClaw Adapter Tests
 *
 * Unit tests for the OpenClaw Adapter - protocol translation layer
 * between OpenClaw and Dash.
 */

import {
  OpenClawAdapter,
  getOpenClawAdapter,
  resetOpenClawAdapter,
  isOpenClawAdapterInitialized,
} from '../../../src/integrations/openclaw/adapter';
import { getGlobalClient } from '../../../src/cli/lib/client';
import { getGlobalBus } from '../../../src/bus/index';
import { AgentStatus } from '../../../src/models/agent';

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

describe('OpenClawAdapter', () => {
  let adapter: OpenClawAdapter;
  let mockClient: any; // Use any to bypass strict typing in tests
  let mockBus: any;

  const mockConfig = {
    dashApiUrl: 'http://localhost:7373',
    dashApiKey: 'dash_test_key_1234567890123456789012345678901234567890123456789012345678901234',
    openclawSessionKey: 'test-session-123',
    eventWebhookUrl: 'http://localhost:8080/webhook',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenClawAdapter();

    // Create mock client
    mockClient = {
      createSwarm: jest.fn(),
      destroySwarm: jest.fn(),
      spawnAgent: jest.fn(),
      killAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
    } as unknown as jest.Mocked<ReturnType<typeof getGlobalClient>>;

    // Create mock message bus
    mockBus = {
      publish: jest.fn(),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as jest.Mocked<ReturnType<typeof getGlobalBus>>;

    (getGlobalClient as jest.Mock).mockReturnValue(mockClient);
    (getGlobalBus as jest.Mock).mockReturnValue(mockBus);

    adapter = new OpenClawAdapter(mockConfig);
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(adapter).toBeDefined();
    });

    it('should have empty mappings on init', () => {
      expect(adapter.getStats()).toEqual({
        activeSessions: 0,
        activeAgents: 0,
        activeSwarms: 0,
      });
    });
  });

  describe('spawnAgent', () => {
    const spawnOptions = {
      agentType: 'code-review',
      task: 'Review PR #123',
      model: 'claude-3',
      timeout: 60000,
    };

    it('should spawn agent and return agent ID', async () => {
      const mockSwarm = {
        success: true,
        data: { id: 'swarm-abc123' },
      };
      const mockAgent = {
        success: true,
        data: {
          id: 'agent-xyz789',
          status: 'spawning',
          swarmId: 'swarm-abc123',
        },
      };

      mockClient.createSwarm.mockResolvedValue(mockSwarm);
      mockClient.spawnAgent.mockResolvedValue(mockAgent);

      const result = await adapter.spawnAgent('session-1', spawnOptions);

      expect(result.dashAgentId).toBe('agent-xyz789');
      expect(result.status).toBe('spawning');
      expect(result.swarmId).toBe('swarm-abc123');
    });

    it('should create swarm with correct config', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'spawning' },
      });

      await adapter.spawnAgent('session-1', spawnOptions);

      expect(mockClient.createSwarm).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'openclaw-session-1',
          config: expect.objectContaining({
            agentType: 'code-review',
            task: 'Review PR #123',
            model: 'claude-3',
            timeout: 60000,
          }),
        })
      );
    });

    it('should map session to agent', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'spawning' },
      });

      await adapter.spawnAgent('session-1', spawnOptions);

      expect(adapter.getDashAgentId('session-1')).toBe('agent-xyz789');
      expect(adapter.getOpenClawSessionKey('agent-xyz789')).toBe('session-1');
    });

    it('should throw error if swarm creation fails', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: false,
        error: { code: 'SWARM_ERROR', message: 'Failed to create swarm' },
      });

      await expect(adapter.spawnAgent('session-1', spawnOptions)).rejects.toThrow();
    });

    it('should throw error if agent spawn fails and cleanup swarm', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: false,
        error: { code: 'SPAWN_ERROR', message: 'Failed to spawn agent' },
      });

      await expect(adapter.spawnAgent('session-1', spawnOptions)).rejects.toThrow();
      expect(mockClient.destroySwarm).toHaveBeenCalledWith('swarm-abc123', true);
    });

    it('should setup event forwarding', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'spawning' },
      });

      await adapter.spawnAgent('session-1', spawnOptions);

      expect(mockBus.subscribe).toHaveBeenCalledWith(
        'agent.agent-xyz789.events',
        expect.any(Function)
      );
    });
  });

  describe('sendMessage', () => {
    it('should send message to mapped agent', async () => {
      // First spawn an agent
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });

      await adapter.spawnAgent('session-1', {
        agentType: 'code-review',
        task: 'test',
      });

      // Send message
      await adapter.sendMessage('session-1', 'Hello agent');

      expect(mockBus.publish).toHaveBeenCalledWith(
        'agent.agent-xyz789.messages',
        expect.objectContaining({
          type: 'openclaw.message',
          content: 'Hello agent',
        }),
        expect.any(Object)
      );
    });

    it('should throw error if no agent mapped', async () => {
      await expect(
        adapter.sendMessage('unknown-session', 'Hello')
      ).rejects.toThrow('No Dash agent mapped');
    });
  });

  describe('killAgent', () => {
    beforeEach(async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });

      await adapter.spawnAgent('session-1', {
        agentType: 'code-review',
        task: 'test',
      });
    });

    it('should kill agent and cleanup', async () => {
      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroySwarm.mockResolvedValue({ success: true });

      await adapter.killAgent('session-1');

      expect(mockClient.killAgent).toHaveBeenCalledWith('agent-xyz789', undefined);
      expect(mockClient.destroySwarm).toHaveBeenCalledWith('swarm-abc123', undefined);
    });

    it('should force kill when specified', async () => {
      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroySwarm.mockResolvedValue({ success: true });

      await adapter.killAgent('session-1', true);

      expect(mockClient.killAgent).toHaveBeenCalledWith('agent-xyz789', true);
      expect(mockClient.destroySwarm).toHaveBeenCalledWith('swarm-abc123', true);
    });

    it('should remove mappings after kill', async () => {
      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroySwarm.mockResolvedValue({ success: true });

      expect(adapter.hasAgent('session-1')).toBe(true);

      await adapter.killAgent('session-1');

      expect(adapter.hasAgent('session-1')).toBe(false);
      expect(adapter.getDashAgentId('session-1')).toBeUndefined();
    });

    it('should not throw if no agent mapped', async () => {
      await expect(adapter.killAgent('unknown-session')).resolves.not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return agent status', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });

      await adapter.spawnAgent('session-1', {
        agentType: 'code-review',
        task: 'test',
      });

      mockClient.getAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-xyz789',
          status: 'running',
          progress: 50,
          runtime: 30000,
        },
      });

      const status = await adapter.getStatus('session-1');

      expect(status.status).toBe('running');
      expect(status.progress).toBe(50);
      expect(status.runtime).toBe(30000);
    });

    it('should return not_found for unknown session', async () => {
      const status = await adapter.getStatus('unknown-session');

      expect(status.status).toBe('not_found');
    });

    it('should return not_found if agent API fails', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });

      await adapter.spawnAgent('session-1', {
        agentType: 'code-review',
        task: 'test',
      });

      mockClient.getAgent.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
      });

      const status = await adapter.getStatus('session-1');

      expect(status.status).toBe('not_found');
    });
  });

  describe('listAgents', () => {
    it('should return empty array when no agents', async () => {
      const agents = await adapter.listAgents();
      expect(agents).toEqual([]);
    });

    it('should return list of active agents', async () => {
      // Spawn two agents
      mockClient.createSwarm
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-1' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'swarm-2' } });

      mockClient.spawnAgent
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-1', status: 'running' } })
        .mockResolvedValueOnce({ success: true, data: { id: 'agent-2', status: 'pending' } });

      await adapter.spawnAgent('session-1', { agentType: 'code-review', task: 'test' });
      await adapter.spawnAgent('session-2', { agentType: 'security-audit', task: 'test' });

      mockClient.getAgent
        .mockResolvedValueOnce({ success: true, data: { status: 'running' } })
        .mockResolvedValueOnce({ success: true, data: { status: 'pending' } });

      const agents = await adapter.listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].dashAgentId).toBe('agent-1');
      expect(agents[0].agentType).toBe('code-review');
      expect(agents[1].dashAgentId).toBe('agent-2');
      expect(agents[1].agentType).toBe('security-audit');
    });
  });

  describe('Stats', () => {
    it('should track active sessions', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });

      expect(adapter.getStats().activeSessions).toBe(0);

      await adapter.spawnAgent('session-1', { agentType: 'test', task: 'test' });

      expect(adapter.getStats().activeSessions).toBe(1);
    });
  });

  describe('dispose', () => {
    it('should kill all agents and cleanup', async () => {
      mockClient.createSwarm.mockResolvedValue({
        success: true,
        data: { id: 'swarm-abc123' },
      });
      mockClient.spawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent-xyz789', status: 'running' },
      });
      mockClient.killAgent.mockResolvedValue({ success: true });
      mockClient.destroySwarm.mockResolvedValue({ success: true });

      await adapter.spawnAgent('session-1', { agentType: 'test', task: 'test' });

      await adapter.dispose();

      expect(mockClient.killAgent).toHaveBeenCalled();
      expect(adapter.getStats().activeSessions).toBe(0);
    });
  });
});

describe('Singleton Functions', () => {
  const mockConfig = {
    dashApiUrl: 'http://localhost:7373',
    dashApiKey: 'dash_test_key_1234567890123456789012345678901234567890123456789012345678901234',
    openclawSessionKey: 'test-session-123',
  };

  beforeEach(() => {
    resetOpenClawAdapter();
  });

  afterEach(() => {
    resetOpenClawAdapter();
  });

  it('should create adapter with getOpenClawAdapter', () => {
    const adapter = getOpenClawAdapter(mockConfig);
    expect(adapter).toBeDefined();
    expect(isOpenClawAdapterInitialized()).toBe(true);
  });

  it('should return same instance on subsequent calls', () => {
    const adapter1 = getOpenClawAdapter(mockConfig);
    const adapter2 = getOpenClawAdapter();
    expect(adapter1).toBe(adapter2);
  });

  it('should throw if getOpenClawAdapter called without config first', () => {
    expect(() => getOpenClawAdapter()).toThrow('OpenClawAdapter not initialized');
  });

  it('should reset with resetOpenClawAdapter', () => {
    getOpenClawAdapter(mockConfig);
    expect(isOpenClawAdapterInitialized()).toBe(true);

    resetOpenClawAdapter();
    expect(isOpenClawAdapterInitialized()).toBe(false);
  });
});

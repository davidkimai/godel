/**
 * PiRuntime Unit Tests
 *
 * Comprehensive tests for PiRuntime including:
 * - Spawning agents with different configurations
 * - Executing commands
 * - Killing agents
 * - Checking agent status
 * - Listing all agents
 * - Event handling
 * - Error cases
 */

// Mock logger before any imports
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { PiRuntime, getGlobalPiRuntime, resetGlobalPiRuntime, hasGlobalPiRuntime } from '../../src/runtime/pi';
import {
  Agent,
  AgentNotFoundError,
  SpawnError,
  ExecError,
  AgentStatus,
} from '../../src/runtime/types';

// Mock PiClient
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockInitSession = jest.fn();
const mockCloseSession = jest.fn();
const mockSendMessage = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('../../src/integrations/pi/client', () => ({
  PiClient: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    initSession: mockInitSession,
    closeSession: mockCloseSession,
    sendMessage: mockSendMessage,
    getStatus: mockGetStatus,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  })),
  ConnectionError: class ConnectionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConnectionError';
    }
  },
  SessionError: class SessionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SessionError';
    }
  },
}));

describe('PiRuntime', () => {
  let runtime: PiRuntime;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = new PiRuntime({
      endpoint: 'ws://localhost:3000',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });
  });

  afterEach(async () => {
    // Clean up any spawned agents
    await runtime.killAll().catch(() => {});
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const customRuntime = new PiRuntime({
        endpoint: 'ws://custom:4000',
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(customRuntime.id).toBe('pi');
      expect(customRuntime.name).toBe('Pi Coding Agent');
    });

    it('should use default configuration when none provided', () => {
      const defaultRuntime = new PiRuntime();

      expect(defaultRuntime.id).toBe('pi');
      expect(defaultRuntime.name).toBe('Pi Coding Agent');
    });

    it('should use environment variables when config not provided', () => {
      process.env['PI_ENDPOINT'] = 'ws://env-endpoint:5000';
      process.env['PI_API_KEY'] = 'test-api-key';

      const envRuntime = new PiRuntime();

      expect(envRuntime).toBeDefined();

      delete process.env['PI_ENDPOINT'];
      delete process.env['PI_API_KEY'];
    });
  });

  describe('spawn', () => {
    it('should spawn agent with default model', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: ['read', 'edit'],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({
        name: 'test-agent',
        workdir: '/tmp/test',
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe('running');
      expect(agent.runtime).toBe('pi');
      expect(agent.model).toBe('claude-sonnet-4-5');
      expect(agent.metadata).toBeDefined();
      expect(agent.metadata?.sessionId).toBe('test-session-1');

      expect(mockConnect).toHaveBeenCalled();
      expect(mockInitSession).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        worktreePath: '/tmp/test',
      }));
    });

    it('should spawn agent with specified model', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-2',
        provider: 'openai',
        model: 'gpt-4o',
        tools: ['read', 'edit'],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({
        name: 'gpt-agent',
        provider: 'openai',
        model: 'gpt-4o',
        workdir: '/tmp/gpt-test',
      });

      expect(agent).toBeDefined();
      expect(agent.model).toBe('gpt-4o');
      expect(agent.metadata?.provider).toBe('openai');

      expect(mockInitSession).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4o',
      }));
    });

    it('should spawn agent with custom provider and model', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-3',
        provider: 'google',
        model: 'gemini-1.5-pro',
        tools: [],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({
        name: 'gemini-agent',
        provider: 'google',
        model: 'gemini-1.5-pro',
      });

      expect(agent).toBeDefined();
      expect(agent.model).toBe('gemini-1.5-pro');
    });

    it('should generate unique agent IDs', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const agent1 = await runtime.spawn({ name: 'agent-1' });
      const agent2 = await runtime.spawn({ name: 'agent-2' });

      expect(agent1.id).not.toBe(agent2.id);
      expect(agent1.id).toMatch(/^pi-\d+-\d+$/);
      expect(agent2.id).toMatch(/^pi-\d+-\d+$/);
    });

    it('should auto-generate name if not provided', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({});

      expect(agent.name).toMatch(/^pi-agent-\d+$/);
    });

    it('should handle spawn errors', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      await expect(runtime.spawn({ name: 'fail-agent' })).rejects.toThrow(SpawnError);
      await expect(runtime.spawn({ name: 'fail-agent' })).rejects.toThrow(/Failed to spawn agent/);
    });

    it('should handle session init errors', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockRejectedValue(new Error('Session init failed'));

      await expect(runtime.spawn({ name: 'fail-agent' })).rejects.toThrow(SpawnError);
    });

    it('should pass tools and system prompt to session', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: ['read', 'edit', 'bash'],
        createdAt: new Date(),
      });

      await runtime.spawn({
        name: 'agent-with-tools',
        tools: ['read', 'edit', 'bash'],
        systemPrompt: 'You are a helpful coding assistant',
      });

      expect(mockInitSession).toHaveBeenCalledWith(expect.objectContaining({
        tools: ['read', 'edit', 'bash'],
        systemPrompt: 'You are a helpful coding assistant',
      }));
    });

    it('should emit agent.spawned event', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const emitSpy = jest.spyOn(runtime, 'emit');

      await runtime.spawn({ name: 'event-agent' });

      expect(emitSpy).toHaveBeenCalledWith('agent.spawned', expect.objectContaining({
        name: 'event-agent',
        status: 'running',
        runtime: 'pi',
      }));
    });
  });

  describe('exec', () => {
    let testAgent: Agent;

    beforeEach(async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-exec',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      testAgent = await runtime.spawn({ name: 'exec-agent' });
    });

    it('should execute command', async () => {
      mockSendMessage.mockResolvedValue({
        messageId: 'msg-1',
        content: 'Command output',
        toolCalls: [],
      });

      const result = await runtime.exec(testAgent.id, 'Implement a function');

      expect(result).toBeDefined();
      expect(result.stdout).toBe('Command output');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.timestamp).toBeInstanceOf(Date);

      expect(mockSendMessage).toHaveBeenCalledWith('Implement a function');
    });

    it('should execute command with tool calls', async () => {
      mockSendMessage.mockResolvedValue({
        messageId: 'msg-2',
        content: 'Let me help with that',
        toolCalls: [
          { id: 'tool-1', tool: 'read', arguments: { path: '/tmp/file.ts' } },
        ],
      });

      const result = await runtime.exec(testAgent.id, 'Read the file');

      expect(result.stdout).toBe('Let me help with that');
      expect(result.metadata?.toolCalls).toBe(1);
    });

    it('should throw for non-existent agent', async () => {
      await expect(runtime.exec('non-existent-id', 'command')).rejects.toThrow(AgentNotFoundError);
      await expect(runtime.exec('non-existent-id', 'command')).rejects.toThrow(/Agent not found/);
    });

    it('should throw when agent is not running', async () => {
      // Kill the agent first
      mockCloseSession.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);
      await runtime.kill(testAgent.id);

      await expect(runtime.exec(testAgent.id, 'command')).rejects.toThrow(AgentNotFoundError);
    });

    it('should handle execution errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Execution failed'));

      await expect(runtime.exec(testAgent.id, 'failing command')).rejects.toThrow(ExecError);
    });

    it('should emit exec.completed event on success', async () => {
      mockSendMessage.mockResolvedValue({
        messageId: 'msg-3',
        content: 'Success',
        toolCalls: [],
      });

      const emitSpy = jest.spyOn(runtime, 'emit');

      await runtime.exec(testAgent.id, 'command');

      expect(emitSpy).toHaveBeenCalledWith('exec.completed', testAgent.id, expect.objectContaining({
        stdout: 'Success',
        exitCode: 0,
      }));
    });

    it('should emit exec.completed event on failure', async () => {
      mockSendMessage.mockRejectedValue(new Error('Failed'));

      const emitSpy = jest.spyOn(runtime, 'emit');

      try {
        await runtime.exec(testAgent.id, 'failing command');
      } catch {
        // Expected to throw
      }

      expect(emitSpy).toHaveBeenCalledWith('exec.completed', testAgent.id, expect.objectContaining({
        exitCode: 1,
        stderr: expect.stringContaining('Failed'),
      }));
    });

    it('should update lastActivityAt on successful execution', async () => {
      const beforeExec = testAgent.lastActivityAt;

      mockSendMessage.mockResolvedValue({
        messageId: 'msg-4',
        content: 'Done',
        toolCalls: [],
      });

      // Wait a tiny bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      await runtime.exec(testAgent.id, 'command');

      const updatedAgent = runtime.getAgent(testAgent.id);
      expect(updatedAgent?.lastActivityAt?.getTime()).toBeGreaterThan(beforeExec?.getTime() || 0);
    });
  });

  describe('kill', () => {
    let testAgent: Agent;

    beforeEach(async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-kill',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      testAgent = await runtime.spawn({ name: 'kill-agent' });
    });

    it('should kill running agent', async () => {
      mockCloseSession.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      await runtime.kill(testAgent.id);

      expect(mockCloseSession).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();

      // Agent should be removed from tracking
      expect(runtime.getAgent(testAgent.id)).toBeUndefined();
    });

    it('should emit agent.killed event', async () => {
      mockCloseSession.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(runtime, 'emit');

      await runtime.kill(testAgent.id);

      expect(emitSpy).toHaveBeenCalledWith('agent.killed', testAgent.id);
    });

    it('should emit agent.status_changed event', async () => {
      mockCloseSession.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(runtime, 'emit');

      await runtime.kill(testAgent.id);

      expect(emitSpy).toHaveBeenCalledWith('agent.status_changed', testAgent.id, 'running', 'stopped');
    });

    it('should throw for non-existent agent', async () => {
      await expect(runtime.kill('non-existent-id')).rejects.toThrow(AgentNotFoundError);
    });

    it('should handle kill errors gracefully', async () => {
      mockCloseSession.mockRejectedValue(new Error('Close failed'));

      // Should throw but still remove agent
      await expect(runtime.kill(testAgent.id)).rejects.toThrow('Close failed');

      expect(runtime.getAgent(testAgent.id)).toBeUndefined();
    });

    it('should emit agent.error on kill failure', async () => {
      mockCloseSession.mockRejectedValue(new Error('Close failed'));

      const emitSpy = jest.spyOn(runtime, 'emit');

      // Should throw but emit error event first
      await expect(runtime.kill(testAgent.id)).rejects.toThrow();

      expect(emitSpy).toHaveBeenCalledWith('agent.error', testAgent.id, expect.any(Error));
    });
  });

  describe('status', () => {
    let testAgent: Agent;

    beforeEach(async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'test-session-status',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      testAgent = await runtime.spawn({ name: 'status-agent' });
    });

    it('should return agent status', async () => {
      mockGetStatus.mockResolvedValue({
        sessionId: 'test-session-status',
        state: 'active',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageCount: 5,
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
        lastActivityAt: new Date(),
      });

      const status = await runtime.status(testAgent.id);

      expect(status).toBe('running');
      expect(mockGetStatus).toHaveBeenCalled();
    });

    it('should map Pi states correctly', async () => {
      const stateMappings: Array<[string, AgentStatus]> = [
        ['active', 'running'],
        ['paused', 'pending'],
        ['error', 'error'],
        ['terminated', 'stopped'],
      ];

      for (const [piState, expectedStatus] of stateMappings) {
        mockGetStatus.mockResolvedValue({
          sessionId: 'test-session-status',
          state: piState,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          messageCount: 0,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          lastActivityAt: new Date(),
        });

        // Reset agent status
        const agent = runtime.getAgent(testAgent.id);
        if (agent) {
          agent.status = 'running';
        }

        const status = await runtime.status(testAgent.id);
        expect(status).toBe(expectedStatus);
      }
    });

    it('should throw for non-existent agent', async () => {
      await expect(runtime.status('non-existent-id')).rejects.toThrow(AgentNotFoundError);
    });

    it('should handle status check errors', async () => {
      mockGetStatus.mockRejectedValue(new Error('Status check failed'));

      const status = await runtime.status(testAgent.id);

      expect(status).toBe('error');

      // Agent status should be updated to error
      const agent = runtime.getAgent(testAgent.id);
      expect(agent?.status).toBe('error');
    });

    it('should emit agent.status_changed when status changes', async () => {
      mockGetStatus.mockResolvedValue({
        sessionId: 'test-session-status',
        state: 'paused',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageCount: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        lastActivityAt: new Date(),
      });

      const emitSpy = jest.spyOn(runtime, 'emit');

      await runtime.status(testAgent.id);

      expect(emitSpy).toHaveBeenCalledWith('agent.status_changed', testAgent.id, 'running', 'pending');
    });
  });

  describe('list', () => {
    it('should return empty array when no agents', async () => {
      const agents = await runtime.list();

      expect(agents).toEqual([]);
    });

    it('should list all agents', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const agent1 = await runtime.spawn({ name: 'agent-1' });

      mockInitSession.mockResolvedValue({
        id: 'session-2',
        provider: 'openai',
        model: 'gpt-4o',
        tools: [],
        createdAt: new Date(),
      });

      const agent2 = await runtime.spawn({ name: 'agent-2' });

      const agents = await runtime.list();

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain(agent1.id);
      expect(agents.map(a => a.id)).toContain(agent2.id);
    });

    it('should return agent copies (not references)', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-copy',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({ name: 'copy-agent' });
      const agents = await runtime.list();

      expect(agents[0]).not.toBe(agent);
      expect(agents[0].id).toBe(agent.id);
    });
  });

  describe('getAgent', () => {
    it('should return undefined for non-existent agent', () => {
      const agent = runtime.getAgent('non-existent');
      expect(agent).toBeUndefined();
    });

    it('should return agent by ID', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-get',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const spawned = await runtime.spawn({ name: 'get-agent' });
      const retrieved = runtime.getAgent(spawned.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(spawned.id);
      expect(retrieved?.name).toBe('get-agent');
    });
  });

  describe('getClient', () => {
    it('should return undefined for non-existent agent', () => {
      const client = runtime.getClient('non-existent');
      expect(client).toBeUndefined();
    });

    it('should return PiClient for agent', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-client',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      const agent = await runtime.spawn({ name: 'client-agent' });
      const client = runtime.getClient(agent.id);

      expect(client).toBeDefined();
    });
  });

  describe('getAgentCount', () => {
    it('should return 0 when no agents', () => {
      expect(runtime.getAgentCount()).toBe(0);
    });

    it('should return correct count', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-count',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      expect(runtime.getAgentCount()).toBe(0);

      await runtime.spawn({ name: 'count-agent-1' });
      expect(runtime.getAgentCount()).toBe(1);

      await runtime.spawn({ name: 'count-agent-2' });
      expect(runtime.getAgentCount()).toBe(2);
    });
  });

  describe('killAll', () => {
    it('should kill all agents', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockCloseSession.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      mockInitSession.mockResolvedValue({
        id: 'session-ka-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });
      await runtime.spawn({ name: 'ka-agent-1' });

      mockInitSession.mockResolvedValue({
        id: 'session-ka-2',
        provider: 'openai',
        model: 'gpt-4o',
        tools: [],
        createdAt: new Date(),
      });
      await runtime.spawn({ name: 'ka-agent-2' });

      expect(runtime.getAgentCount()).toBe(2);

      await runtime.killAll();

      expect(runtime.getAgentCount()).toBe(0);
    });

    it('should handle kill errors gracefully', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockCloseSession.mockRejectedValue(new Error('Close failed'));
      mockDisconnect.mockResolvedValue(undefined);

      mockInitSession.mockResolvedValue({
        id: 'session-ka-err',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });
      await runtime.spawn({ name: 'ka-agent-err' });

      // Should not throw even if close fails
      await runtime.killAll();

      expect(runtime.getAgentCount()).toBe(0);
    });

    it('should work when no agents', async () => {
      await runtime.killAll();
      expect(runtime.getAgentCount()).toBe(0);
    });
  });

  describe('global singleton', () => {
    beforeEach(() => {
      resetGlobalPiRuntime();
    });

    afterEach(() => {
      resetGlobalPiRuntime();
    });

    it('should create singleton on first get', () => {
      expect(hasGlobalPiRuntime()).toBe(false);

      const runtime1 = getGlobalPiRuntime();

      expect(hasGlobalPiRuntime()).toBe(true);
      expect(runtime1).toBeDefined();
    });

    it('should return same instance on subsequent calls', () => {
      const runtime1 = getGlobalPiRuntime();
      const runtime2 = getGlobalPiRuntime();

      expect(runtime1).toBe(runtime2);
    });

    it('should reset singleton', () => {
      getGlobalPiRuntime();
      expect(hasGlobalPiRuntime()).toBe(true);

      resetGlobalPiRuntime();
      expect(hasGlobalPiRuntime()).toBe(false);
    });

    it('should use config on first call only', () => {
      const runtime1 = getGlobalPiRuntime({ endpoint: 'ws://test:3000' });
      const runtime2 = getGlobalPiRuntime({ endpoint: 'ws://different:4000' });

      expect(runtime1).toBe(runtime2);
    });
  });

  describe('event handling', () => {
    it('should handle client error events', async () => {
      // This test verifies that the setupClientHandlers method properly
      // registers event handlers with the PiClient
      mockConnect.mockResolvedValue(undefined);
      mockInitSession.mockResolvedValue({
        id: 'session-events',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: [],
        createdAt: new Date(),
      });

      // Capture the client instance and its on calls
      let registeredHandlers: Record<string, Function> = {};
      const { PiClient } = require('../../src/integrations/pi/client');
      PiClient.mockImplementationOnce(() => {
        return {
          connect: mockConnect,
          disconnect: mockDisconnect,
          initSession: mockInitSession,
          closeSession: mockCloseSession,
          sendMessage: mockSendMessage,
          getStatus: mockGetStatus,
          on: jest.fn().mockImplementation((event: string, handler: Function) => {
            registeredHandlers[event] = handler;
          }),
          off: jest.fn(),
          emit: jest.fn(),
        };
      });

      const agent = await runtime.spawn({ name: 'event-agent' });
      const emitSpy = jest.spyOn(runtime, 'emit');

      // Verify error handler was registered
      expect(registeredHandlers['error']).toBeDefined();

      // Simulate error from client
      if (registeredHandlers['error']) {
        registeredHandlers['error'](new Error('Client error'));
      }

      // Agent status should be updated
      const updatedAgent = runtime.getAgent(agent.id);
      expect(updatedAgent?.status).toBe('error');
      expect(emitSpy).toHaveBeenCalledWith('agent.error', agent.id, expect.any(Error));
    });
  });
});

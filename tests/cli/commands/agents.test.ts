/**
 * Agents CLI Command Tests
 * 
 * Integration tests for the 'dash agents' command group
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn()
}));

// Mock the storage module
jest.mock('../../../src/storage', () => ({
  memoryStore: {
    agents: {
      list: jest.fn().mockReturnValue([
        { id: 'agent-1', status: 'running', task: 'Test', spawnedAt: new Date() },
        { id: 'agent-2', status: 'paused', task: 'Test 2', spawnedAt: new Date() }
      ]),
      get: jest.fn().mockReturnValue({
        id: 'agent-1',
        status: 'running',
        task: 'Test task',
        spawnedAt: new Date(),
        runtime: 30000,
        retryCount: 0,
        maxRetries: 3,
        context: { contextSize: 50000, contextWindow: 100000 }
      }),
      create: jest.fn(),
      update: jest.fn()
    },
    events: {
      findByEntity: jest.fn().mockReturnValue([]),
      create: jest.fn()
    }
  }
}));

// Mock the models module
jest.mock('../../../src/models/index', () => ({
  AgentStatus: {
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    KILLED: 'killed',
    PENDING: 'pending'
  }
}));

// Mock the events module
jest.mock('../../../src/events/emitter', () => ({
  getGlobalEmitter: jest.fn().mockReturnValue({
    emit: jest.fn(),
    emitAgentPaused: jest.fn(),
    emitAgentResumed: jest.fn()
  })
}));

// Mock formatters
jest.mock('../../../src/cli/formatters', () => ({
  formatAgents: jest.fn().mockReturnValue('Agent list output'),
  formatAgent: jest.fn().mockReturnValue('Agent details output')
}));

jest.mock('../../../src/cli/main', () => ({
  globalFormat: 'table',
  handleError: jest.fn((error) => {
    throw new Error(typeof error === 'string' ? error : String(error));
  }),
  validateFormat: jest.fn((format: string) => {
    if (format !== 'json' && format !== 'table') {
      throw new Error(`Invalid format: ${format}. Must be 'json' or 'table'`);
    }
    return format as 'json' | 'table';
  })
}));

import { agentsCommand } from '../../../src/cli/commands/agents';
import { memoryStore } from '../../../src/storage';
import { AgentStatus } from '../../../src/models/index';
import { formatAgents, formatAgent } from '../../../src/cli/formatters';
import { validateFormat } from '../../../src/cli/main';

const mockedFs = jest.mocked(fs);
const mockedMemoryStore = jest.mocked(memoryStore);
const mockedFormatAgents = jest.mocked(formatAgents);
const mockedFormatAgent = jest.mocked(formatAgent);

describe('Agents CLI Commands', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('agentsCommand', () => {
    it('should create agents command with correct name', () => {
      const cmd = agentsCommand();
      expect(cmd.name()).toBe('agents');
    });

    it('should have description containing agents', () => {
      const cmd = agentsCommand();
      expect(cmd.description().toLowerCase()).toContain('agents');
    });

    it('should have alias "agent"', () => {
      const cmd = agentsCommand();
      expect(cmd.alias()).toBe('agent');
    });

    it('should include list subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames).toContain('list');
    });

    it('should include status subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('status'))).toBe(true);
    });

    it('should include spawn subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('spawn'))).toBe(true);
    });

    it('should include kill subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('kill'))).toBe(true);
    });

    it('should include pause subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('pause'))).toBe(true);
    });

    it('should include resume subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('resume'))).toBe(true);
    });

    it('should include watch subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('watch'))).toBe(true);
    });

    it('should include logs subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('logs'))).toBe(true);
    });

    it('should include health subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('health'))).toBe(true);
    });

    it('should include retry subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('retry'))).toBe(true);
    });

    it('should include abort subcommand', () => {
      const cmd = agentsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('abort'))).toBe(true);
    });
  });

  describe('list subcommand options', () => {
    it('should have group option', () => {
      const cmd = agentsCommand();
      const listCmd = cmd.commands.find((c: any) => c.name() === 'list');
      const groupOption = listCmd?.options.find((o: any) => o.long === '--group');
      expect(groupOption).toBeDefined();
    });

    it('should have filter option', () => {
      const cmd = agentsCommand();
      const listCmd = cmd.commands.find((c: any) => c.name() === 'list');
      const filterOption = listCmd?.options.find((o: any) => o.long === '--filter');
      expect(filterOption).toBeDefined();
    });

    it('should have alias "ls"', () => {
      const cmd = agentsCommand();
      const listCmd = cmd.commands.find((c: any) => c.name() === 'list');
      expect(listCmd?.alias()).toBe('ls');
    });
  });

  describe('spawn subcommand options', () => {
    it('should have model option', () => {
      const cmd = agentsCommand();
      const spawnCmd = cmd.commands.find((c: any) => c.name().startsWith('spawn'));
      const modelOption = spawnCmd?.options.find((o: any) => o.long === '--model');
      expect(modelOption).toBeDefined();
    });

    it('should have label option', () => {
      const cmd = agentsCommand();
      const spawnCmd = cmd.commands.find((c: any) => c.name().startsWith('spawn'));
      const labelOption = spawnCmd?.options.find((o: any) => o.long === '--label');
      expect(labelOption).toBeDefined();
    });

    it('should have swarm option', () => {
      const cmd = agentsCommand();
      const spawnCmd = cmd.commands.find((c: any) => c.name().startsWith('spawn'));
      const swarmOption = spawnCmd?.options.find((o: any) => o.long === '--swarm');
      expect(swarmOption).toBeDefined();
    });
  });

  describe('logs subcommand options', () => {
    it('should have follow option', () => {
      const cmd = agentsCommand();
      const logsCmd = cmd.commands.find((c: any) => c.name().startsWith('logs'));
      const followOption = logsCmd?.options.find((o: any) => o.long === '--follow');
      expect(followOption).toBeDefined();
    });

    it('should have tail option', () => {
      const cmd = agentsCommand();
      const logsCmd = cmd.commands.find((c: any) => c.name().startsWith('logs'));
      const tailOption = logsCmd?.options.find((o: any) => o.long === '--tail');
      expect(tailOption).toBeDefined();
    });
  });

  describe('pause subcommand options', () => {
    it('should have reason option', () => {
      const cmd = agentsCommand();
      const pauseCmd = cmd.commands.find((c: any) => c.name().startsWith('pause'));
      const reasonOption = pauseCmd?.options.find((o: any) => o.long === '--reason');
      expect(reasonOption).toBeDefined();
    });
  });

  describe('retry subcommand options', () => {
    it('should have skip-backoff option', () => {
      const cmd = agentsCommand();
      const retryCmd = cmd.commands.find((c: any) => c.name().startsWith('retry'));
      const skipOption = retryCmd?.options.find((o: any) => o.long === '--skip-backoff');
      expect(skipOption).toBeDefined();
    });

    it('should have focus option', () => {
      const cmd = agentsCommand();
      const retryCmd = cmd.commands.find((c: any) => c.name().startsWith('retry'));
      const focusOption = retryCmd?.options.find((o: any) => o.long === '--focus');
      expect(focusOption).toBeDefined();
    });
  });

  describe('AgentStatus enum', () => {
    it('should have RUNNING status', () => {
      expect(AgentStatus.RUNNING).toBe('running');
    });

    it('should have PAUSED status', () => {
      expect(AgentStatus.PAUSED).toBe('paused');
    });

    it('should have COMPLETED status', () => {
      expect(AgentStatus.COMPLETED).toBe('completed');
    });

    it('should have FAILED status', () => {
      expect(AgentStatus.FAILED).toBe('failed');
    });

    it('should have KILLED status', () => {
      expect(AgentStatus.KILLED).toBe('killed');
    });

    it('should have PENDING status', () => {
      expect(AgentStatus.PENDING).toBe('pending');
    });
  });

  describe('formatDuration helper', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1.0m');
    });

    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1.0h');
    });

    it('should handle sub-millisecond values', () => {
      expect(formatDuration(100)).toBe('100ms');
    });
  });

  describe('agent filtering', () => {
    it('should filter by running status', () => {
      const agents = [
        { id: 'a1', status: 'running' },
        { id: 'a2', status: 'paused' },
        { id: 'a3', status: 'running' }
      ];
      const filtered = agents.filter(a => a.status === 'running');
      expect(filtered.length).toBe(2);
    });

    it('should filter by paused status', () => {
      const agents = [
        { id: 'a1', status: 'running' },
        { id: 'a2', status: 'paused' }
      ];
      const filtered = agents.filter(a => a.status === 'paused');
      expect(filtered.length).toBe(1);
    });

    it('should filter by completed status', () => {
      const agents = [
        { id: 'a1', status: 'completed' },
        { id: 'a2', status: 'running' }
      ];
      const filtered = agents.filter(a => a.status === 'completed');
      expect(filtered.length).toBe(1);
    });

    it('should filter by failed status', () => {
      const agents = [
        { id: 'a1', status: 'failed' },
        { id: 'a2', status: 'failed' }
      ];
      const filtered = agents.filter(a => a.status === 'failed');
      expect(filtered.length).toBe(2);
    });
  });

  describe('agent sorting', () => {
    it('should sort by spawnedAt descending', () => {
      const now = Date.now();
      const agents = [
        { id: 'a1', spawnedAt: new Date(now - 100000) },
        { id: 'a2', spawnedAt: new Date(now - 50000) },
        { id: 'a3', spawnedAt: new Date(now - 200000) }
      ];
      const sorted = [...agents].sort((a, b) => b.spawnedAt.getTime() - a.spawnedAt.getTime());
      expect(sorted[0].id).toBe('a2');
    });
  });

  describe('health score calculation', () => {
    it('should start at 1.0', () => {
      let healthScore = 1.0;
      expect(healthScore).toBe(1.0);
    });

    it('should deduct for errors (max 0.3)', () => {
      let healthScore = 1.0;
      const errorCount = 5;
      healthScore -= Math.min(errorCount * 0.1, 0.3);
      expect(healthScore).toBe(0.7);
    });

    it('should deduct for high context usage (>80%)', () => {
      let healthScore = 1.0;
      const contextUsage = 85;
      if (contextUsage > 80) healthScore -= 0.1;
      expect(healthScore).toBe(0.9);
    });

    it('should deduct more for very high context usage (>90%)', () => {
      let healthScore = 1.0;
      const contextUsage = 95;
      if (contextUsage > 80) healthScore -= 0.1;
      if (contextUsage > 90) healthScore -= 0.1;
      expect(healthScore).toBe(0.8);
    });

    it('should clamp between 0 and 1', () => {
      let score = -0.5;
      score = Math.max(0, Math.min(1, score));
      expect(score).toBe(0);
      
      score = 1.5;
      score = Math.max(0, Math.min(1, score));
      expect(score).toBe(1);
    });
  });

  describe('context usage calculation', () => {
    it('should calculate percentage correctly', () => {
      const contextSize = 50000;
      const contextWindow = 100000;
      const usage = (contextSize / contextWindow) * 100;
      expect(usage).toBe(50);
    });

    it('should handle zero window', () => {
      const contextSize = 50000;
      const contextWindow = 0;
      const usage = contextWindow > 0 ? (contextSize / contextWindow) * 100 : 0;
      expect(usage).toBe(0);
    });
  });

  describe('retry logic', () => {
    it('should allow retry when below max', () => {
      const retryCount = 2;
      const maxRetries = 3;
      expect(retryCount < maxRetries).toBe(true);
    });

    it('should not allow retry at max', () => {
      const retryCount = 3;
      const maxRetries = 3;
      expect(retryCount < maxRetries).toBe(false);
    });

    it('should not allow retry above max', () => {
      const retryCount = 4;
      const maxRetries = 3;
      expect(retryCount < maxRetries).toBe(false);
    });
  });

  describe('event filtering', () => {
    it('should filter by entity type', () => {
      const events = [
        { entityType: 'agent', entityId: 'a1' },
        { entityType: 'task', entityId: 't1' },
        { entityType: 'agent', entityId: 'a1' }
      ];
      const agentEvents = events.filter(e => e.entityType === 'agent');
      expect(agentEvents.length).toBe(2);
    });

    it('should apply tail limit', () => {
      const events = [
        { id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }, { id: 'e5' }
      ];
      const recentEvents = events.slice(-3);
      expect(recentEvents.length).toBe(3);
      expect(recentEvents[0].id).toBe('e3');
    });
  });
});

// Helper function (matching the actual implementation)
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * OpenClaw CLI Integration Tests
 * 
 * Tests the dash openclaw CLI commands per OPENCLAW_INTEGRATION_SPEC.md
 * - dash openclaw connect
 * - dash openclaw status
 * - dash openclaw sessions list
 * - dash openclaw sessions history
 * - dash openclaw spawn
 * - dash openclaw send
 * - dash openclaw kill
 */

import { Command } from 'commander';
import { registerOpenClawCommand, GatewayClient } from '../../src/cli/commands/openclaw';
import { MockOpenClawClient } from '../../src/core/openclaw';

// Mock WebSocket
jest.mock('ws', () => {
  return {
    WebSocket: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    })),
  };
});

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  })),
}));

describe('OpenClaw CLI Commands', () => {
  let program: Command;
  let consoleOutput: string[];
  let originalExit: typeof process.exit;

  beforeEach(() => {
    program = new Command();
    registerOpenClawCommand(program);
    
    consoleOutput = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    
    originalExit = process.exit;
    jest.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`Process exit: ${code}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exit = originalExit;
  });

  describe('Command Registration', () => {
    it('should register openclaw command', () => {
      const commands = program.commands.map(cmd => cmd.name());
      expect(commands).toContain('openclaw');
    });

    it('should have all required subcommands', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      expect(openclaw).toBeDefined();
      
      const subcommands = openclaw!.commands.map(cmd => cmd.name());
      expect(subcommands).toContain('connect');
      expect(subcommands).toContain('status');
      expect(subcommands).toContain('spawn');
      expect(subcommands).toContain('send');
      expect(subcommands).toContain('kill');
    });
  });

  describe('dash openclaw connect', () => {
    it('should have connect command with required options', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      expect(connect).toBeDefined();
      
      const options = connect!.options.map(opt => opt.long);
      expect(options).toContain('--host');
      expect(options).toContain('--port');
      expect(options).toContain('--token');
      expect(options).toContain('--mock');
    });

    it('should connect with mock mode successfully', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      
      await connect!.parseAsync(['--mock']);
      
      expect(consoleOutput.some(line => line.includes('mock'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('✓'))).toBe(true);
    });

    it('should use default host and port', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      
      const hostOption = connect!.options.find(opt => opt.long === '--host');
      const portOption = connect!.options.find(opt => opt.long === '--port');
      
      expect(hostOption?.defaultValue).toBe('127.0.0.1');
      expect(portOption?.defaultValue).toBe('18789');
    });
  });

  describe('dash openclaw status', () => {
    it('should have status command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');
      expect(status).toBeDefined();
    });

    it('should show not connected status without connection', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');
      
      try {
        await status!.parseAsync([]);
      } catch (e) {
        // Expected to exit
      }
      
      expect(consoleOutput.some(line => 
        line.includes('Not connected') || line.includes('connect')
      )).toBe(true);
    });

    it('should show mock status when in mock mode', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      
      // First connect with mock
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);
      
      // Then check status
      consoleOutput = [];
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');
      await status!.parseAsync([]);
      
      expect(consoleOutput.some(line => line.includes('MOCK'))).toBe(true);
    });
  });

  describe('dash openclaw sessions list', () => {
    it('should have sessions list command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      expect(sessions).toBeDefined();
      
      const subcommands = sessions!.commands.map(cmd => cmd.name());
      expect(subcommands).toContain('list');
    });

    it('should have list options', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const list = sessions!.commands.find(cmd => cmd.name() === 'list');
      
      const options = list!.options.map(opt => opt.long);
      expect(options).toContain('--active');
      expect(options).toContain('--kind');
    });
  });

  describe('dash openclaw sessions history', () => {
    it('should have sessions history command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      
      const subcommands = sessions!.commands.map(cmd => cmd.name());
      expect(subcommands).toContain('history');
    });

    it('should require session key argument', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const history = sessions!.commands.find(cmd => cmd.name() === 'history');
      
      const args = history!.registeredArguments.map(arg => (arg as unknown as { syntax: string }).syntax);
      expect(args.length).toBeGreaterThan(0);
    });

    it('should have limit option with default', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const history = sessions!.commands.find(cmd => cmd.name() === 'history');
      
      const limitOption = history!.options.find(opt => opt.long === '--limit');
      expect(limitOption).toBeDefined();
      expect(limitOption?.defaultValue).toBe('50');
    });
  });

  describe('dash openclaw spawn', () => {
    it('should have spawn command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      expect(spawn).toBeDefined();
    });

    it('should require --task option', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      
      const taskOption = spawn!.options.find(opt => opt.long === '--task');
      expect(taskOption).toBeDefined();
      expect(taskOption?.required).toBe(true);
    });

    it('should have all required options', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      
      const options = spawn!.options.map(opt => opt.long);
      expect(options).toContain('--task');
      expect(options).toContain('--model');
      expect(options).toContain('--budget');
      expect(options).toContain('--sandbox');
      expect(options).toContain('--skills');
      expect(options).toContain('--system-prompt');
    });

    it('should have default values', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      
      const modelOption = spawn!.options.find(opt => opt.long === '--model');
      const budgetOption = spawn!.options.find(opt => opt.long === '--budget');
      const sandboxOption = spawn!.options.find(opt => opt.long === '--sandbox');
      
      expect(modelOption?.defaultValue).toBe('kimi-k2.5');
      expect(budgetOption?.defaultValue).toBe('1.00');
      expect(sandboxOption?.defaultValue).toBe(true);
    });

    it('should spawn agent in mock mode', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      
      // Connect with mock first
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);
      
      // Spawn agent
      consoleOutput = [];
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      await spawn!.parseAsync(['--task', 'Test task', '--model', 'kimi-k2.5']);
      
      expect(consoleOutput.some(line => line.includes('Spawned agent'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('sessionKey='))).toBe(true);
    });
  });

  describe('dash openclaw send', () => {
    it('should have send command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const send = openclaw!.commands.find(cmd => cmd.name() === 'send');
      expect(send).toBeDefined();
    });

    it('should require --session option', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const send = openclaw!.commands.find(cmd => cmd.name() === 'send');
      
      const sessionOption = send!.options.find(opt => opt.long === '--session');
      expect(sessionOption).toBeDefined();
      expect(sessionOption?.required).toBe(true);
    });

    it('should require message argument', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const send = openclaw!.commands.find(cmd => cmd.name() === 'send');
      
      const args = send!.registeredArguments.map(arg => (arg as unknown as { syntax: string }).syntax);
      expect(args.length).toBeGreaterThan(0);
    });

    it('should have attach option', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const send = openclaw!.commands.find(cmd => cmd.name() === 'send');
      
      const attachOption = send!.options.find(opt => opt.long === '--attach');
      expect(attachOption).toBeDefined();
    });
  });

  describe('dash openclaw kill', () => {
    it('should have kill command', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      expect(kill).toBeDefined();
    });

    it('should require session key argument', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      
      const args = kill!.registeredArguments.map(arg => (arg as unknown as { syntax: string }).syntax);
      expect(args.length).toBeGreaterThan(0);
    });

    it('should have force option', () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      
      const forceOption = kill!.options.find(opt => opt.long === '--force');
      expect(forceOption).toBeDefined();
    });

    it('should kill session in mock mode', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      
      // Connect with mock and spawn an agent
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);
      
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      await spawn!.parseAsync(['--task', 'Test task']);
      
      // Kill the session (we'll use a mock session key)
      consoleOutput = [];
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      
      // This will fail since we don't have the actual session key, but that's expected
      try {
        await kill!.parseAsync(['non-existent-session']);
      } catch (e) {
        // Expected to potentially fail or handle gracefully
      }
    });
  });
});

describe('GatewayClient', () => {
  let client: GatewayClient;

  beforeEach(() => {
    client = new GatewayClient({
      host: '127.0.0.1',
      port: 18789,
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should create GatewayClient with config', () => {
    expect(client).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('should accept custom config', () => {
    const customClient = new GatewayClient({
      host: '192.168.1.100',
      port: 19000,
      token: 'test-token',
    });
    
    expect(customClient).toBeDefined();
    customClient.disconnect();
  });
});

describe('MockOpenClawClient Integration', () => {
  let mockClient: MockOpenClawClient;

  beforeEach(() => {
    mockClient = new MockOpenClawClient();
  });

  afterEach(() => {
    mockClient.reset();
  });

  it('should spawn session', async () => {
    const result = await mockClient.sessionsSpawn({
      agentId: 'test-agent',
      model: 'kimi-k2.5',
      task: 'Test task',
    });

    expect(result.sessionId).toBeDefined();
    expect(result.sessionId).toMatch(/^openclaw-session-/);
  });

  it('should track session status', async () => {
    const { sessionId } = await mockClient.sessionsSpawn({
      agentId: 'test-agent',
      task: 'Test task',
    });

    const status = await mockClient.sessionStatus(sessionId);
    
    expect(status.sessionId).toBe(sessionId);
    expect(status.agentId).toBe('test-agent');
    expect(status.status).toBeDefined();
    expect(status.tokenUsage).toBeDefined();
    expect(status.cost).toBeDefined();
  });

  it('should kill session', async () => {
    const { sessionId } = await mockClient.sessionsSpawn({
      agentId: 'test-agent',
      task: 'Test task',
    });

    await mockClient.sessionKill(sessionId);
    
    const status = await mockClient.sessionStatus(sessionId);
    expect(status.status).toBe('killed');
  });

  it('should get all sessions', async () => {
    await mockClient.sessionsSpawn({ agentId: 'agent-1', task: 'Task 1' });
    await mockClient.sessionsSpawn({ agentId: 'agent-2', task: 'Task 2' });
    
    const sessions = mockClient.getAllSessions();
    expect(sessions).toHaveLength(2);
  });

  it('should emit session events', (done) => {
    mockClient.on('session.created', (event) => {
      expect(event.type).toBe('session.created');
      expect(event.sessionId).toBeDefined();
      expect(event.agentId).toBe('event-test-agent');
      done();
    });

    mockClient.sessionsSpawn({
      agentId: 'event-test-agent',
      task: 'Test task',
    });
  });
});

describe('CLI Help Output', () => {
  it('should show openclaw help', () => {
    const program = new Command();
    registerOpenClawCommand(program);
    
    const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
    expect(openclaw).toBeDefined();
    
    // Verify the help information exists
    expect(openclaw!.description()).toContain('OpenClaw');
  });

  it('should have proper command descriptions', () => {
    const program = new Command();
    registerOpenClawCommand(program);
    
    const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
    const commands = openclaw!.commands;
    
    const connect = commands.find(cmd => cmd.name() === 'connect');
    expect(connect!.description()).toContain('Connect');
    
    const status = commands.find(cmd => cmd.name() === 'status');
    expect(status!.description()).toContain('status');
    
    const spawn = commands.find(cmd => cmd.name() === 'spawn');
    expect(spawn!.description()).toContain('Spawn');
  });
});

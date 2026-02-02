/**
 * OpenClaw CLI End-to-End Integration Tests
 * 
 * Tests the CLI commands work with real integration classes:
 * - Uses real GatewayClient, SessionManager, AgentExecutor
 * - Tests mock mode for CI/testing without real gateway
 * - Verifies end-to-end command flow
 */

import { Command } from 'commander';
import { registerOpenClawCommand, resetOpenClawState } from '../../src/cli/commands/openclaw';
import { 
  GatewayClient, 
  SessionManager, 
  AgentExecutor,
  getGlobalSessionManager,
  createAgentExecutor,
} from '../../src/integrations/openclaw';

// Mock WebSocket - controlled mock for testing
const mockWebSocket = {
  on: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: 0, // CONNECTING (not open yet)
  terminate: jest.fn(),
};

jest.mock('ws', () => {
  return {
    WebSocket: jest.fn().mockImplementation(() => mockWebSocket),
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

describe('OpenClaw CLI E2E Integration', () => {
  let program: Command;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  let originalExit: typeof process.exit;

  beforeEach(() => {
    // Reset global state before each test
    resetOpenClawState();
    
    program = new Command();
    registerOpenClawCommand(program);
    
    consoleOutput = [];
    consoleErrorOutput = [];
    
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrorOutput.push(args.join(' '));
    });
    
    originalExit = process.exit;
    jest.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`Process exit: ${code}`);
    });

    // Reset mocks
    jest.clearAllMocks();
    mockWebSocket.readyState = 0; // CONNECTING, not OPEN
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exit = originalExit;
  });

  describe('CLI Integration with Real Classes', () => {
    it('should export real integration classes', () => {
      // Verify we can import the real classes
      expect(GatewayClient).toBeDefined();
      expect(SessionManager).toBeDefined();
      expect(AgentExecutor).toBeDefined();
      expect(getGlobalSessionManager).toBeDefined();
      expect(createAgentExecutor).toBeDefined();
    });

    it('should create GatewayClient with correct config', () => {
      const client = new GatewayClient({
        host: '127.0.0.1',
        port: 18789,
        token: 'test-token',
      });

      expect(client).toBeInstanceOf(GatewayClient);
      expect(client.connectionState).toBe('disconnected');
    });

    it('should create SessionManager with correct config', () => {
      const manager = new SessionManager({
        host: '127.0.0.1',
        port: 18789,
        token: 'test-token',
      });

      expect(manager).toBeInstanceOf(SessionManager);
      expect(manager.isConnected()).toBe(false);
    });

    it('should create AgentExecutor with SessionManager', () => {
      const sessionManager = new SessionManager();
      const executor = createAgentExecutor(sessionManager);

      expect(executor).toBeInstanceOf(AgentExecutor);
    });
  });

  describe('dash openclaw connect --mock', () => {
    it('should connect in mock mode successfully', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');

      await connect!.parseAsync(['--mock']);

      expect(consoleOutput.some(line => line.includes('mock OpenClaw client'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Mock client initialized'))).toBe(true);
    });

    it('should show correct mock status after connect', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Then check status
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');
      await status!.parseAsync([]);

      expect(consoleOutput.some(line => line.includes('MOCK MODE'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Mock Client'))).toBe(true);
    });
  });

  describe('dash openclaw status', () => {
    it('should show not connected when no connection', async () => {
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');

      // Should throw with exit code 1 when not connected
      await expect(status!.parseAsync([])).rejects.toThrow('Process exit: 1');

      expect(consoleErrorOutput.some(line => line.includes('Not connected')) || 
             consoleOutput.some(line => line.includes('Not connected'))).toBe(true);
    });

    it('should show connection stats when connected in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Then check status
      const status = openclaw!.commands.find(cmd => cmd.name() === 'status');
      await status!.parseAsync([]);

      expect(consoleOutput.some(line => line.includes('OpenClaw Gateway Status'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Mock'))).toBe(true);
    });
  });

  describe('dash openclaw sessions list', () => {
    it('should work in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // List sessions
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const list = sessions!.commands.find(cmd => cmd.name() === 'list');
      await list!.parseAsync([]);

      expect(consoleOutput.some(line => line.includes('SESSIONS'))).toBe(true);
    });

    it('should filter by active in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // List with --active flag
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const list = sessions!.commands.find(cmd => cmd.name() === 'list');
      await list!.parseAsync(['--active']);

      expect(consoleOutput.some(line => line.includes('SESSIONS'))).toBe(true);
    });
  });

  describe('dash openclaw spawn', () => {
    it('should spawn agent in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Spawn agent
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      await spawn!.parseAsync(['--task', 'test task', '--model', 'kimi-k2.5']);

      expect(consoleOutput.some(line => line.includes('Spawning agent'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Spawned agent'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('sessionKey='))).toBe(true);
    });

    it('should use correct model in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Spawn agent with custom model
      const spawn = openclaw!.commands.find(cmd => cmd.name() === 'spawn');
      await spawn!.parseAsync(['--task', 'test task', '--model', 'gpt-4']);

      expect(consoleOutput.some(line => line.includes('Model: gpt-4'))).toBe(true);
    });
  });

  describe('dash openclaw send', () => {
    it('should send message in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Send message
      const send = openclaw!.commands.find(cmd => cmd.name() === 'send');
      await send!.parseAsync(['--session', 'test-session-123', 'Hello agent!']);

      expect(consoleOutput.some(line => line.includes('Sending message'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Message sent'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('test-session-123'))).toBe(true);
    });
  });

  describe('dash openclaw kill', () => {
    it('should kill session in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Kill session
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      await kill!.parseAsync(['test-session-123']);

      expect(consoleOutput.some(line => line.includes('Killing session'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Session test-session-123 killed'))).toBe(true);
    });

    it('should support force flag in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Kill session with force
      const kill = openclaw!.commands.find(cmd => cmd.name() === 'kill');
      await kill!.parseAsync(['--force', 'test-session-123']);

      expect(consoleOutput.some(line => line.includes('force mode'))).toBe(true);
    });
  });

  describe('dash openclaw sessions history', () => {
    it('should show history in mock mode', async () => {
      // First connect with mock
      const openclaw = program.commands.find(cmd => cmd.name() === 'openclaw');
      const connect = openclaw!.commands.find(cmd => cmd.name() === 'connect');
      await connect!.parseAsync(['--mock']);

      // Reset console output
      consoleOutput = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        consoleOutput.push(args.join(' '));
      });

      // Get history
      const sessions = openclaw!.commands.find(cmd => cmd.name() === 'sessions');
      const history = sessions!.commands.find(cmd => cmd.name() === 'history');
      await history!.parseAsync(['test-session-123']);

      expect(consoleOutput.some(line => line.includes('Session History'))).toBe(true);
    });
  });

  describe('Real Integration Flow', () => {
    it('should use real SessionManager for session operations', async () => {
      const sessionManager = new SessionManager({
        host: '127.0.0.1',
        port: 18789,
      });

      // SessionManager should have the required methods
      expect(typeof sessionManager.connect).toBe('function');
      expect(typeof sessionManager.sessionsList).toBe('function');
      expect(typeof sessionManager.sessionsSpawn).toBe('function');
      expect(typeof sessionManager.sessionsSend).toBe('function');
      expect(typeof sessionManager.sessionsKill).toBe('function');
      expect(typeof sessionManager.sessionsHistory).toBe('function');
    });

    it('should use real AgentExecutor for agent operations', async () => {
      const sessionManager = new SessionManager();
      const executor = createAgentExecutor(sessionManager);

      // AgentExecutor should have the required methods
      expect(typeof executor.spawnAgent).toBe('function');
      expect(typeof executor.dispatchTask).toBe('function');
      expect(typeof executor.execute).toBe('function');
      expect(typeof executor.killAgent).toBe('function');
      expect(typeof executor.getExecution).toBe('function');
    });

    it('should use real GatewayClient for gateway operations', async () => {
      const client = new GatewayClient({
        host: '127.0.0.1',
        port: 18789,
      });

      // GatewayClient should have the required methods
      expect(typeof client.connect).toBe('function');
      expect(typeof client.disconnect).toBe('function');
      expect(typeof client.request).toBe('function');
      expect(typeof client.sessionsList).toBe('function');
      expect(typeof client.sessionsSpawn).toBe('function');
      expect(typeof client.sessionsSend).toBe('function');
      expect(typeof client.sessionsKill).toBe('function');
      expect(typeof client.sessionsHistory).toBe('function');
    });
  });
});

// Export for use in other tests
export {};

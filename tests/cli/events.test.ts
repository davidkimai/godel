/**
 * CLI Events Command Tests
 * 
 * Tests for:
 * - godel events list [--format json|jsonl|table] [--since <duration>] [--agent <id>]
 * - godel events stream [--follow] [--agent <id>] [--type <type>]
 * - godel events get <event-id>
 * - Error handling for each
 * 
 * Target: 90% coverage
 */

import { Command } from 'commander';

// Mock logger before importing modules that use it
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import mocked modules
import { registerEventsCommand } from '../../src/cli/commands/events';
import * as clientModule from '../../src/cli/lib/client';
import { logger as mockLogger } from '../../src/utils/logger';

// ============================================================================
// Mocks
// ============================================================================

const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`EXIT:${code}`);
});

// ============================================================================
// Test Data
// ============================================================================

const mockEvent = {
  id: 'evt-test-001',
  type: 'agent.spawned',
  timestamp: new Date('2026-02-07T12:00:00Z'),
  entityId: 'agent-001',
  entityType: 'agent',
  payload: { message: 'Agent spawned successfully' },
  correlationId: 'corr-001',
  parentEventId: undefined,
};

const mockEvent2 = {
  id: 'evt-test-002',
  type: 'agent.completed',
  timestamp: new Date('2026-02-07T12:30:00Z'),
  entityId: 'agent-001',
  entityType: 'agent',
  payload: { message: 'Agent completed task' },
  correlationId: 'corr-002',
  parentEventId: 'evt-test-001',
};

const mockErrorEvent = {
  id: 'evt-test-003',
  type: 'agent.failed',
  timestamp: new Date('2026-02-07T12:45:00Z'),
  entityId: 'agent-002',
  entityType: 'agent',
  payload: { message: 'Agent failed with error' },
  correlationId: 'corr-003',
  parentEventId: undefined,
};

// ============================================================================
// Helper Functions
// ============================================================================

function createMockClient(overrides: Partial<clientModule.DashApiClient> = {}): clientModule.DashApiClient {
  return {
    listEvents: jest.fn().mockResolvedValue({
      success: true,
      data: {
        items: [mockEvent, mockEvent2],
        total: 2,
        page: 1,
        pageSize: 50,
        hasMore: false,
      },
    }),
    getEvent: jest.fn().mockResolvedValue({
      success: true,
      data: mockEvent,
    }),
    streamEvents: jest.fn().mockImplementation(async function* () {
      yield mockEvent;
      yield mockEvent2;
    }),
    ...overrides,
  } as unknown as clientModule.DashApiClient;
}

function createMockClientWithError(errorMessage: string): clientModule.DashApiClient {
  return {
    listEvents: jest.fn().mockResolvedValue({
      success: false,
      error: { code: 'ERROR', message: errorMessage },
    }),
    getEvent: jest.fn().mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Event not found' },
    }),
    streamEvents: jest.fn().mockImplementation(async function* () {
      throw new Error(errorMessage);
    }),
  } as unknown as clientModule.DashApiClient;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (error) {
    // Commands exit with process.exit which throws in tests
    if (error instanceof Error && error.message.startsWith('EXIT:')) {
      throw error; // Re-throw so tests can catch it
    }
    throw error;
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('CLI Events Command', () => {
  let program: Command;
  let getGlobalClientSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    registerEventsCommand(program);
  });

  afterEach(() => {
    if (getGlobalClientSpy) {
      getGlobalClientSpy.mockRestore();
    }
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  // ==========================================================================
  // events list command tests
  // ==========================================================================
  describe('events list', () => {
    it('should list events with default options', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list']);

      expect(mockClient.listEvents).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should list events in table format (default)', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list']);

      expect(mockClient.listEvents).toHaveBeenCalled();
      const outputCall = mockLogger.info.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('TIMESTAMP')
      );
      expect(outputCall).toBeTruthy();
    });

    it('should list events in JSON format', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--format', 'json']);

      expect(mockClient.listEvents).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should list events in JSONL format', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--format', 'jsonl']);

      expect(mockClient.listEvents).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should filter events by agent ID', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--agent', 'agent-001']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-001',
        })
      );
    });

    it('should filter events by task ID', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--task', 'task-001']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
        })
      );
    });

    it('should filter events by type', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--type', 'agent.spawned']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.spawned',
        })
      );
    });

    it('should filter events by time range with minutes', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--since', '30m']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          since: expect.any(Date),
        })
      );
    });

    it('should filter events by time range with hours', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--since', '2h']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          since: expect.any(Date),
        })
      );
    });

    it('should filter events by time range with days', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--since', '1d']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          since: expect.any(Date),
        })
      );
    });

    it('should filter events by end time', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--until', '2026-02-07T12:00:00Z']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          until: new Date('2026-02-07T12:00:00Z'),
        })
      );
    });

    it('should limit number of events returned', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list', '--limit', '10']);

      expect(mockClient.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 10,
        })
      );
    });

    it('should show message when no events found', async () => {
      const mockClient = createMockClient({
        listEvents: jest.fn().mockResolvedValue({
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 50,
            hasMore: false,
          },
        }),
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list']);

      expect(mockLogger.info).toHaveBeenCalledWith('📭 No events found');
    });

    it('should show pagination info when there are more events', async () => {
      const mockClient = createMockClient({
        listEvents: jest.fn().mockResolvedValue({
          success: true,
          data: {
            items: [mockEvent],
            total: 100,
            page: 1,
            pageSize: 50,
            hasMore: true,
          },
        }),
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'list']);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Showing 1 of 100 events'));
    });

    it('should handle invalid since format', async () => {
      await expect(runCommand(program, ['events', 'list', '--since', 'invalid'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Invalid since format. Use: 30m, 1h, 1d');
    });

    it('should handle invalid until date', async () => {
      await expect(runCommand(program, ['events', 'list', '--until', 'invalid-date'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Invalid until date format');
    });

    it('should handle API error', async () => {
      const mockClient = createMockClientWithError('Database connection failed');
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await expect(runCommand(program, ['events', 'list'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to list events:', 'Database connection failed');
    });

    it('should handle unexpected errors', async () => {
      const mockClient = {
        listEvents: jest.fn().mockRejectedValue(new Error('Unexpected error')),
      };
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient as any);

      await expect(runCommand(program, ['events', 'list'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to list events:', 'Unexpected error');
    });
  });

  // ==========================================================================
  // events get command tests
  // ==========================================================================
  describe('events get', () => {
    it('should get event details by ID', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'get', 'evt-test-001']);

      expect(mockClient.getEvent).toHaveBeenCalledWith('evt-test-001');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Event: evt-test-001'));
    });

    it('should display event details correctly', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'get', 'evt-test-001']);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Timestamp:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Type:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Severity:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Entity:'));
    });

    it('should display correlation ID when present', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'get', 'evt-test-001']);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Correlation:'));
    });

    it('should display parent event ID when present', async () => {
      const mockClient = createMockClient({
        getEvent: jest.fn().mockResolvedValue({
          success: true,
          data: mockEvent2,
        }),
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'get', 'evt-test-002']);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Parent:'));
    });

    it('should display payload', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await runCommand(program, ['events', 'get', 'evt-test-001']);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Payload:'));
    });

    it('should handle event not found', async () => {
      const mockClient = createMockClientWithError('Event not found');
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      await expect(runCommand(program, ['events', 'get', 'non-existent-id'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Event non-existent-id not found');
    });

    it('should handle API error', async () => {
      const mockClient = {
        getEvent: jest.fn().mockResolvedValue({
          success: false,
          error: { code: 'ERROR', message: 'Internal server error' },
        }),
      };
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient as any);

      await expect(runCommand(program, ['events', 'get', 'evt-test-001'])).rejects.toThrow('EXIT:1');
    });

    it('should handle unexpected errors', async () => {
      const mockClient = {
        getEvent: jest.fn().mockRejectedValue(new Error('Network timeout')),
      };
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient as any);

      await expect(runCommand(program, ['events', 'get', 'evt-test-001'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to get event:', 'Network timeout');
    });

    it('should require event ID argument', async () => {
      // Testing that the command expects an argument
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const getCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'get');
      expect(getCmd).toBeDefined();
      
      // Check that the command has the expected argument
      const args = getCmd?.registeredArguments || [];
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].required).toBe(true);
    });
  });

  // ==========================================================================
  // events stream command tests
  // ==========================================================================
  describe('events stream', () => {
    it('should start streaming events', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      // Stream will process events then we simulate SIGINT
      const streamPromise = runCommand(program, ['events', 'stream']);
      
      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockLogger.info).toHaveBeenCalledWith('📡 Streaming events...\n');
    });

    it('should filter stream by agent ID', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--agent', 'agent-001']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('agent=agent-001'));
    });

    it('should filter stream by task ID', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--task', 'task-001']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('task=task-001'));
    });

    it('should filter stream by event type', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--type', 'agent.spawned']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('type=agent.spawned'));
    });

    it('should filter stream by severity level', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--severity', 'warning']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('severity>=warning'));
    });

    it('should output raw JSON when --raw flag is used', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--raw']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // The stream should process events
      expect(mockClient.streamEvents).toHaveBeenCalled();
    });

    it('should apply client-side agent filter', async () => {
      const mockStreamEvents = jest.fn().mockImplementation(async function* () {
        yield { ...mockEvent, entityId: 'agent-001' };
        yield { ...mockEvent2, entityId: 'agent-002' };
      });
      
      const mockClient = createMockClient({
        streamEvents: mockStreamEvents,
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--agent', 'agent-001']);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStreamEvents).toHaveBeenCalled();
    });

    it('should apply client-side task filter', async () => {
      const mockStreamEvents = jest.fn().mockImplementation(async function* () {
        yield { ...mockEvent, entityId: 'task-001' };
        yield { ...mockEvent2, entityId: 'task-002' };
      });
      
      const mockClient = createMockClient({
        streamEvents: mockStreamEvents,
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--task', 'task-001']);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStreamEvents).toHaveBeenCalled();
    });

    it('should apply client-side type filter', async () => {
      const mockStreamEvents = jest.fn().mockImplementation(async function* () {
        yield { ...mockEvent, type: 'agent.spawned' };
        yield { ...mockEvent2, type: 'agent.completed' };
      });
      
      const mockClient = createMockClient({
        streamEvents: mockStreamEvents,
      });
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const streamPromise = runCommand(program, ['events', 'stream', '--type', 'agent.spawned']);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStreamEvents).toHaveBeenCalled();
    });

    it('should handle stream errors', async () => {
      const mockClient = {
        streamEvents: jest.fn().mockImplementation(async function* () {
          throw new Error('Stream connection lost');
        }),
      };
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient as any);

      await expect(runCommand(program, ['events', 'stream'])).rejects.toThrow('EXIT:1');
      expect(mockLogger.error).toHaveBeenCalledWith('❌ Stream error:', 'Stream connection lost');
    });

    it('should setup SIGINT handler', async () => {
      const mockClient = createMockClient();
      getGlobalClientSpy = jest.spyOn(clientModule, 'getGlobalClient').mockReturnValue(mockClient);

      const onSpy = jest.spyOn(process, 'on');
      
      const streamPromise = runCommand(program, ['events', 'stream']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      
      onSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Command registration tests
  // ==========================================================================
  describe('command registration', () => {
    it('should register events command', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      expect(eventsCmd).toBeDefined();
      expect(eventsCmd?.description()).toBe('Event streaming and management');
    });

    it('should register list subcommand', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const listCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'list');
      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toBe('List historical events');
    });

    it('should register get subcommand', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const getCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'get');
      expect(getCmd).toBeDefined();
      expect(getCmd?.description()).toBe('Get event details');
    });

    it('should register stream subcommand', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const streamCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'stream');
      expect(streamCmd).toBeDefined();
      expect(streamCmd?.description()).toBe('Stream events in real-time');
    });

    it('should have all expected options on list command', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const listCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'list');
      
      const options = listCmd?.options || [];
      const optionFlags = options.map((opt: any) => opt.long);
      
      expect(optionFlags).toContain('--format');
      expect(optionFlags).toContain('--agent');
      expect(optionFlags).toContain('--task');
      expect(optionFlags).toContain('--type');
      expect(optionFlags).toContain('--since');
      expect(optionFlags).toContain('--until');
      expect(optionFlags).toContain('--limit');
    });

    it('should have all expected options on stream command', () => {
      const eventsCmd = program.commands.find(cmd => cmd.name() === 'events');
      const streamCmd = eventsCmd?.commands.find(cmd => cmd.name() === 'stream');
      
      const options = streamCmd?.options || [];
      const optionFlags = options.map((opt: any) => opt.long);
      
      expect(optionFlags).toContain('--agent');
      expect(optionFlags).toContain('--task');
      expect(optionFlags).toContain('--type');
      expect(optionFlags).toContain('--severity');
      expect(optionFlags).toContain('--raw');
    });
  });
});

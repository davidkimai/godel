/**
 * Runtime Mock
 * 
 * Mock implementations for agent runtimes (Pi, Native, etc.)
 * Provides type-safe mocking of AgentRuntime interface.
 * 
 * @example
 * ```typescript
 * import { mockRuntime, setupMockRuntime, createMockAgent } from '../mocks/runtime';
 * 
 * beforeEach(() => {
 *   setupMockRuntime();
 * });
 * 
 * const agent = await mockRuntime.spawn({ name: 'test-agent' });
 * ```
 */

import { EventEmitter } from 'events';
import type {
  AgentRuntime,
  SpawnConfig,
  Agent,
  AgentStatus,
  ExecResult,
  ExecMetadata,
  RuntimeError,
  AgentNotFoundError,
  SpawnError,
  ExecError,
} from '../../src/runtime/types';

// ============================================================================
// Types
// ============================================================================

interface MockRuntimeState {
  agents: Map<string, Agent>;
  agentCounter: number;
  shouldFailSpawn: boolean;
  shouldFailExec: boolean;
  spawnDelay: number;
  execDelay: number;
}

// ============================================================================
// State Management
// ============================================================================

const mockRuntimeState: MockRuntimeState = {
  agents: new Map(),
  agentCounter: 0,
  shouldFailSpawn: false,
  shouldFailExec: false,
  spawnDelay: 0,
  execDelay: 0,
};

// ============================================================================
// Mock Runtime Implementation
// ============================================================================

/**
 * Creates a mock AgentRuntime implementation
 */
export function createMockRuntime(runtimeId: string = 'mock', runtimeName: string = 'Mock Runtime'): AgentRuntime & EventEmitter {
  const emitter = new EventEmitter();
  
  const runtime = {
    ...emitter,
    
    id: runtimeId,
    name: runtimeName,
    
    spawn: jest.fn().mockImplementation(async (config: SpawnConfig): Promise<Agent> => {
      // Simulate delay
      if (mockRuntimeState.spawnDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, mockRuntimeState.spawnDelay));
      }
      
      // Simulate failure
      if (mockRuntimeState.shouldFailSpawn) {
        throw new Error('Failed to spawn agent');
      }
      
      mockRuntimeState.agentCounter++;
      const agentId = `${runtimeId}-${Date.now()}-${mockRuntimeState.agentCounter}`;
      const agentName = config.name || `${runtimeId}-agent-${mockRuntimeState.agentCounter}`;
      
      const agent: Agent = {
        id: agentId,
        name: agentName,
        status: 'running',
        runtime: runtimeId,
        model: config.model || 'claude-sonnet-4-5',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {
          config,
          pid: 12345 + mockRuntimeState.agentCounter,
        },
      };
      
      mockRuntimeState.agents.set(agentId, agent);
      
      emitter.emit('agent.spawned', agent);
      
      return agent;
    }),
    
    kill: jest.fn().mockImplementation(async (agentId: string): Promise<void> => {
      const agent = mockRuntimeState.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      
      const previousStatus = agent.status;
      agent.status = 'stopped';
      
      mockRuntimeState.agents.delete(agentId);
      
      emitter.emit('agent.killed', agentId);
      emitter.emit('agent.status_changed', agentId, previousStatus, 'stopped');
    }),
    
    exec: jest.fn().mockImplementation(async (agentId: string, command: string): Promise<ExecResult> => {
      // Simulate delay
      if (mockRuntimeState.execDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, mockRuntimeState.execDelay));
      }
      
      const agent = mockRuntimeState.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      
      if (agent.status !== 'running') {
        throw new Error(`Agent is not running: ${agent.status}`);
      }
      
      // Simulate failure
      if (mockRuntimeState.shouldFailExec) {
        const result: ExecResult = {
          stdout: '',
          stderr: 'Command execution failed',
          exitCode: 1,
          duration: 100,
          metadata: {
            timestamp: new Date(),
          },
        };
        emitter.emit('exec.completed', agentId, result);
        throw new Error('Command execution failed');
      }
      
      agent.lastActivityAt = new Date();
      
      const startTime = Date.now();
      const result: ExecResult = {
        stdout: `Executed: ${command}`,
        stderr: '',
        exitCode: 0,
        duration: Date.now() - startTime + 100, // Add minimum duration
        metadata: {
          timestamp: new Date(),
          model: agent.model,
          tokenUsage: {
            prompt: command.length,
            completion: 50,
            total: command.length + 50,
          },
        },
      };
      
      emitter.emit('exec.completed', agentId, result);
      
      return result;
    }),
    
    status: jest.fn().mockImplementation(async (agentId: string): Promise<AgentStatus> => {
      const agent = mockRuntimeState.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      return agent.status;
    }),
    
    list: jest.fn().mockImplementation(async (): Promise<Agent[]> => {
      return Array.from(mockRuntimeState.agents.values());
    }),
  } as unknown as AgentRuntime & EventEmitter;
  
  return runtime;
}

// ============================================================================
// Singleton Mock Instance
// ============================================================================

/**
 * Global mock runtime instance
 */
export const mockRuntime = createMockRuntime();

// ============================================================================
// Module Mock Setup
// ============================================================================

/**
 * Sets up Jest to mock the runtime registry
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockRuntime();
 * });
 * ```
 */
export function setupMockRuntime(): void {
  jest.mock('../../src/runtime/registry', () => ({
    RuntimeRegistry: jest.fn().mockImplementation(() => ({
      register: jest.fn(),
      unregister: jest.fn().mockReturnValue(true),
      get: jest.fn().mockImplementation((id: string) => {
        if (id === 'pi' || id === 'native' || id === 'mock') {
          return createMockRuntime(id);
        }
        throw new Error(`Runtime not found: ${id}`);
      }),
      getDefault: jest.fn().mockReturnValue(createMockRuntime('mock')),
      setDefault: jest.fn(),
      getDefaultId: jest.fn().mockReturnValue('mock'),
      list: jest.fn().mockReturnValue([createMockRuntime('pi'), createMockRuntime('native')]),
      listIds: jest.fn().mockReturnValue(['pi', 'native']),
      has: jest.fn().mockImplementation((id: string) => ['pi', 'native'].includes(id)),
      count: jest.fn().mockReturnValue(2),
      clear: jest.fn(),
      getConfig: jest.fn().mockReturnValue({
        default: 'pi',
        pi: {
          defaultModel: 'claude-sonnet-4-5',
          providers: ['anthropic', 'openai', 'google'],
        },
      }),
      updateConfig: jest.fn(),
    })),
    getRuntimeRegistry: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((id: string) => createMockRuntime(id)),
      getDefault: jest.fn().mockReturnValue(createMockRuntime('pi')),
      listIds: jest.fn().mockReturnValue(['pi', 'native']),
    }),
    resetRuntimeRegistry: jest.fn(),
    loadRuntimeConfig: jest.fn().mockReturnValue({
      default: 'pi',
      pi: {
        defaultModel: 'claude-sonnet-4-5',
        providers: ['anthropic', 'openai', 'google'],
      },
    }),
    saveRuntimeConfig: jest.fn(),
    getAvailableRuntimes: jest.fn().mockReturnValue([
      { id: 'pi', name: 'Pi Multi-Model Runtime', available: true },
      { id: 'native', name: 'Native Runtime', available: true },
    ]),
    AVAILABLE_RUNTIMES: [
      { id: 'pi', name: 'Pi Multi-Model Runtime', available: true },
      { id: 'native', name: 'Native Runtime', available: true },
    ],
  }));
}

/**
 * Sets up Jest to mock the Pi runtime specifically
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockPiRuntime();
 * });
 * ```
 */
export function setupMockPiRuntime(): void {
  jest.mock('../../src/runtime/pi', () => ({
    PiRuntime: jest.fn().mockImplementation(() => createMockRuntime('pi', 'Pi Coding Agent')),
    getGlobalPiRuntime: jest.fn().mockReturnValue(createMockRuntime('pi', 'Pi Coding Agent')),
    resetGlobalPiRuntime: jest.fn(),
    hasGlobalPiRuntime: jest.fn().mockReturnValue(true),
  }));
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Resets the mock runtime state
 * Call this in afterEach to ensure test isolation
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetMockRuntimeState();
 * });
 * ```
 */
export function resetMockRuntimeState(): void {
  mockRuntimeState.agents.clear();
  mockRuntimeState.agentCounter = 0;
  mockRuntimeState.shouldFailSpawn = false;
  mockRuntimeState.shouldFailExec = false;
  mockRuntimeState.spawnDelay = 0;
  mockRuntimeState.execDelay = 0;
  
  // Clear all mocks
  Object.values(mockRuntime).forEach(fn => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      fn.mockClear();
    }
  });
}

/**
 * Simulates spawn failure
 * 
 * @example
 * ```typescript
 * simulateSpawnFailure();
 * await expect(runtime.spawn({})).rejects.toThrow();
 * ```
 */
export function simulateSpawnFailure(): void {
  mockRuntimeState.shouldFailSpawn = true;
}

/**
 * Simulates exec failure
 * 
 * @example
 * ```typescript
 * simulateExecFailure();
 * await expect(runtime.exec('agent-1', 'test')).rejects.toThrow();
 * ```
 */
export function simulateExecFailure(): void {
  mockRuntimeState.shouldFailExec = true;
}

/**
 * Sets spawn delay
 * 
 * @example
 * ```typescript
 * setSpawnDelay(1000); // 1 second delay
 * ```
 */
export function setSpawnDelay(ms: number): void {
  mockRuntimeState.spawnDelay = ms;
}

/**
 * Sets exec delay
 * 
 * @example
 * ```typescript
 * setExecDelay(500); // 500ms delay
 * ```
 */
export function setExecDelay(ms: number): void {
  mockRuntimeState.execDelay = ms;
}

/**
 * Gets all mock agents
 * 
 * @example
 * ```typescript
 * const agents = getMockAgents();
 * expect(agents).toHaveLength(2);
 * ```
 */
export function getMockAgents(): Agent[] {
  return Array.from(mockRuntimeState.agents.values());
}

/**
 * Gets a specific mock agent
 * 
 * @example
 * ```typescript
 * const agent = getMockAgent('agent-1');
 * expect(agent?.status).toBe('running');
 * ```
 */
export function getMockAgent(agentId: string): Agent | undefined {
  return mockRuntimeState.agents.get(agentId);
}

/**
 * Adds a pre-existing mock agent
 * 
 * @example
 * ```typescript
 * const agent = addMockAgent({ status: 'running' });
 * ```
 */
export function addMockAgent(overrides?: Partial<Agent>): Agent {
  mockRuntimeState.agentCounter++;
  const agent: Agent = {
    id: `mock-${Date.now()}-${mockRuntimeState.agentCounter}`,
    name: `mock-agent-${mockRuntimeState.agentCounter}`,
    status: 'running',
    runtime: 'mock',
    model: 'claude-sonnet-4-5',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
  mockRuntimeState.agents.set(agent.id, agent);
  return agent;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a mock agent for testing
 */
export function createMockAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: `agent-${Date.now()}`,
    name: 'Test Agent',
    status: 'running',
    runtime: 'mock',
    model: 'claude-sonnet-4-5',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

/**
 * Creates a mock spawn configuration
 */
export function createMockSpawnConfig(overrides?: Partial<SpawnConfig>): SpawnConfig {
  return {
    name: 'test-agent',
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    workdir: '/tmp/test',
    env: {},
    systemPrompt: 'You are a test agent',
    tools: [],
    timeout: 60000,
    ...overrides,
  };
}

/**
 * Creates a mock execution result
 */
export function createMockExecResult(overrides?: Partial<ExecResult>): ExecResult {
  return {
    stdout: 'Mock output',
    stderr: '',
    exitCode: 0,
    duration: 100,
    metadata: {
      timestamp: new Date(),
      model: 'claude-sonnet-4-5',
      tokenUsage: {
        prompt: 100,
        completion: 50,
        total: 150,
      },
    },
    ...overrides,
  };
}

/**
 * Creates a mock execution error
 */
export function createMockExecError(overrides?: Partial<ExecResult>): ExecResult {
  return {
    stdout: '',
    stderr: 'Mock error',
    exitCode: 1,
    duration: 50,
    metadata: {
      timestamp: new Date(),
    },
    ...overrides,
  };
}

/**
 * Waits for an agent event
 * 
 * @example
 * ```typescript
 * const promise = waitForAgentEvent(runtime, 'agent.spawned');
 * await runtime.spawn({});
 * const agent = await promise;
 * ```
 */
export function waitForAgentEvent(
  runtime: EventEmitter,
  event: string,
  timeout: number = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);
    
    runtime.once(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockRuntime,
  createMockRuntime,
  setupMockRuntime,
  setupMockPiRuntime,
  resetMockRuntimeState,
  simulateSpawnFailure,
  simulateExecFailure,
  setSpawnDelay,
  setExecDelay,
  getMockAgents,
  getMockAgent,
  addMockAgent,
  createMockAgent,
  createMockSpawnConfig,
  createMockExecResult,
  createMockExecError,
  waitForAgentEvent,
};

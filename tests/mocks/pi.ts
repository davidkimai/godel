/**
 * Pi Client Mock
 * 
 * Comprehensive mock implementation for the Pi CLI client.
 * Provides complete type-safe mocking of PiClient with configurable behaviors.
 * 
 * @example
 * ```typescript
 * import { mockPiClient, setupMockPiClient } from '../mocks/pi';
 * 
 * // Setup mock in test
 * setupMockPiClient();
 * 
 * // Configure mock behavior
 * mockPiClient.sendMessage.mockResolvedValue({
 *   content: 'Mock response',
 *   messageId: 'msg-123'
 * });
 * ```
 */

import type {
  PiClient,
  PiClientConfig,
  SessionInitConfig,
  SessionInfo,
  SessionStatus,
  MessageResponse,
  MessageOptions,
  TreeInfo,
  CompactResult,
  ToolCall,
  ToolResult,
} from '../../src/integrations/pi/client';

// ============================================================================
// Mock State
// ============================================================================

interface MockState {
  connected: boolean;
  sessionId: string | null;
  messageCount: number;
  lastMessage: string | null;
  toolCalls: ToolCall[];
  responses: Map<string, MessageResponse>;
}

const mockState: MockState = {
  connected: false,
  sessionId: null,
  messageCount: 0,
  lastMessage: null,
  toolCalls: [],
  responses: new Map(),
};

// ============================================================================
// Mock Functions
// ============================================================================

/**
 * Creates a mock PiClient instance with full type safety
 */
export function createMockPiClient(config?: PiClientConfig): jest.Mocked<PiClient> {
  const mockClient = {
    // Connection methods
    connect: jest.fn().mockImplementation(async () => {
      mockState.connected = true;
      mockState.sessionId = `session-${Date.now()}`;
    }),
    
    disconnect: jest.fn().mockImplementation(async () => {
      mockState.connected = false;
      mockState.sessionId = null;
    }),
    
    isConnected: jest.fn().mockImplementation(() => mockState.connected),
    
    // Session methods
    initSession: jest.fn().mockImplementation(async (sessionConfig?: SessionInitConfig): Promise<SessionInfo> => {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      mockState.sessionId = sessionId;
      
      return {
        id: sessionId,
        provider: sessionConfig?.provider || config?.provider || 'anthropic',
        model: sessionConfig?.model || config?.model || 'claude-sonnet-4-5',
        tools: sessionConfig?.tools || config?.tools || [],
        createdAt: new Date(),
        worktreePath: sessionConfig?.worktreePath,
      };
    }),
    
    closeSession: jest.fn().mockImplementation(async () => {
      mockState.sessionId = null;
    }),
    
    getSessionId: jest.fn().mockImplementation(() => mockState.sessionId),
    
    // Message methods
    sendMessage: jest.fn().mockImplementation(async (content: string, _options?: MessageOptions): Promise<MessageResponse> => {
      mockState.messageCount++;
      mockState.lastMessage = content;
      
      // Check for configured responses
      const configuredResponse = mockState.responses.get(content);
      if (configuredResponse) {
        return configuredResponse;
      }
      
      // Default response
      return {
        messageId: `msg-${Date.now()}`,
        content: `Mock response to: ${content.substring(0, 50)}...`,
        toolCalls: [],
      };
    }),
    
    sendMessageStream: jest.fn().mockImplementation(async function* (content: string, _options?: MessageOptions) {
      mockState.messageCount++;
      mockState.lastMessage = content;
      
      // Yield mock stream chunks
      yield { type: 'content' as const, content: 'Mock ', done: false };
      yield { type: 'content' as const, content: 'streaming ', done: false };
      yield { type: 'content' as const, content: 'response', done: false };
      yield { type: 'done' as const, done: true };
    }),
    
    // Status and info
    getStatus: jest.fn().mockImplementation(async (): Promise<SessionStatus> => ({
      sessionId: mockState.sessionId || 'no-session',
      state: mockState.connected ? 'active' : 'terminated',
      provider: config?.provider || 'anthropic',
      model: config?.model || 'claude-sonnet-4-5',
      messageCount: mockState.messageCount,
      tokenUsage: {
        prompt: mockState.messageCount * 100,
        completion: mockState.messageCount * 50,
        total: mockState.messageCount * 150,
      },
      lastActivityAt: new Date(),
    })),
    
    getSessionInfo: jest.fn().mockImplementation(async (): Promise<SessionInfo> => ({
      id: mockState.sessionId || 'no-session',
      provider: config?.provider || 'anthropic',
      model: config?.model || 'claude-sonnet-4-5',
      tools: config?.tools || [],
      createdAt: new Date(),
    })),
    
    // Tree operations
    getTree: jest.fn().mockImplementation(async (): Promise<TreeInfo> => ({
      rootNodeId: 'root-1',
      currentNodeId: 'node-1',
      nodes: [
        {
          id: 'root-1',
          parentId: null,
          childIds: ['node-1'],
          role: 'system',
          contentPreview: 'System prompt',
          createdAt: new Date(),
        },
        {
          id: 'node-1',
          parentId: 'root-1',
          childIds: [],
          role: 'assistant',
          contentPreview: 'Assistant response',
          createdAt: new Date(),
        },
      ],
      branches: [
        {
          id: 'main',
          name: 'Main',
          rootNodeId: 'root-1',
          createdAt: new Date(),
        },
      ],
    })),
    
    switchToNode: jest.fn().mockResolvedValue(undefined),
    createBranch: jest.fn().mockResolvedValue(undefined),
    
    compactHistory: jest.fn().mockImplementation(async (): Promise<CompactResult> => ({
      nodesRemoved: 10,
      tokensFreed: 5000,
      newRootNodeId: 'compacted-root',
      summary: 'Compacted conversation history',
    })),
    
    // Tool handling
    submitToolResult: jest.fn().mockImplementation(async (result: ToolResult) => {
      mockState.toolCalls.push({
        id: result.toolCallId,
        tool: 'mock-tool',
        arguments: {},
      });
    }),
    
    // Event emitter methods (mocked)
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeAllListeners: jest.fn(),
    
    // Model/Provider switching
    switchModel: jest.fn().mockResolvedValue(undefined),
    switchProvider: jest.fn().mockResolvedValue(undefined),
    
    // Checkpoint
    createCheckpoint: jest.fn().mockResolvedValue(`checkpoint-${Date.now()}`),
    restoreCheckpoint: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PiClient>;
  
  return mockClient;
}

// ============================================================================
// Singleton Mock Instance
// ============================================================================

/**
 * Global mock PiClient instance for shared state across tests
 */
export const mockPiClient = createMockPiClient();

// ============================================================================
// Jest Module Mock Setup
// ============================================================================

/**
 * Sets up Jest to mock the PiClient module
 * Call this in your test setup or beforeEach
 * 
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupMockPiClient();
 * });
 * ```
 */
export function setupMockPiClient(): void {
  jest.mock('../../src/integrations/pi/client', () => ({
    PiClient: jest.fn().mockImplementation((config?: PiClientConfig) => createMockPiClient(config)),
    PiClientError: class PiClientError extends Error {
      constructor(message: string, public code: string, public context?: Record<string, unknown>) {
        super(message);
        this.name = 'PiClientError';
      }
    },
    ConnectionError: class ConnectionError extends Error {
      constructor(message: string, public context?: Record<string, unknown>) {
        super(message);
        this.name = 'ConnectionError';
      }
    },
    RpcRequestError: class RpcRequestError extends Error {
      constructor(method: string, public error: { code: number; message: string }) {
        super(`RPC request '${method}' failed: ${error.message}`);
        this.name = 'RpcRequestError';
      }
    },
    TimeoutError: class TimeoutError extends Error {
      constructor(operation: string, timeoutMs: number) {
        super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
        this.name = 'TimeoutError';
      }
    },
    SessionError: class SessionError extends Error {
      constructor(message: string, public context?: Record<string, unknown>) {
        super(message);
        this.name = 'SessionError';
      }
    },
  }));
}

/**
 * Resets the mock state to initial values
 * Call this in afterEach to ensure test isolation
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetMockPiState();
 * });
 * ```
 */
export function resetMockPiState(): void {
  mockState.connected = false;
  mockState.sessionId = null;
  mockState.messageCount = 0;
  mockState.lastMessage = null;
  mockState.toolCalls = [];
  mockState.responses.clear();
  
  // Reset all mock functions
  Object.values(mockPiClient).forEach(fn => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      fn.mockClear();
    }
  });
}

/**
 * Configures a mock response for a specific message content
 * 
 * @example
 * ```typescript
 * configureMockResponse('Hello', {
 *   content: 'Hi there!',
 *   messageId: 'custom-123'
 * });
 * ```
 */
export function configureMockResponse(content: string, response: MessageResponse): void {
  mockState.responses.set(content, response);
}

/**
 * Gets the current mock state for assertions
 * 
 * @example
 * ```typescript
 * expect(getMockPiState().messageCount).toBe(2);
 * expect(getMockPiState().lastMessage).toBe('Hello');
 * ```
 */
export function getMockPiState(): Readonly<MockState> {
  return { ...mockState };
}

/**
 * Simulates a connection error
 * 
 * @example
 * ```typescript
 * simulateConnectionError();
 * await expect(client.connect()).rejects.toThrow();
 * ```
 */
export function simulateConnectionError(message = 'Connection failed'): void {
  mockPiClient.connect.mockRejectedValueOnce(new Error(message));
}

/**
 * Simulates a message sending error
 * 
 * @example
 * ```typescript
 * simulateMessageError('Network timeout');
 * await expect(client.sendMessage('test')).rejects.toThrow('Network timeout');
 * ```
 */
export function simulateMessageError(message = 'Message failed'): void {
  mockPiClient.sendMessage.mockRejectedValueOnce(new Error(message));
}

/**
 * Simulates a tool call in the next response
 * 
 * @example
 * ```typescript
 * simulateToolCall({
 *   id: 'tool-1',
 *   tool: 'Bash',
 *   arguments: { command: 'ls -la' }
 * });
 * ```
 */
export function simulateToolCall(toolCall: ToolCall): void {
  mockPiClient.sendMessage.mockResolvedValueOnce({
    messageId: `msg-${Date.now()}`,
    content: '',
    toolCalls: [toolCall],
  });
}

// ============================================================================
// Mock Data Helpers
// ============================================================================

/**
 * Creates a mock message response
 */
export function createMockMessageResponse(overrides?: Partial<MessageResponse>): MessageResponse {
  return {
    messageId: `msg-${Date.now()}`,
    content: 'Mock response content',
    toolCalls: [],
    ...overrides,
  };
}

/**
 * Creates a mock tool call
 */
export function createMockToolCall(overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: `tool-${Date.now()}`,
    tool: 'Bash',
    arguments: { command: 'echo "Hello"' },
    ...overrides,
  };
}

/**
 * Creates a mock tool result
 */
export function createMockToolResult(overrides?: Partial<ToolResult>): ToolResult {
  return {
    toolCallId: `tool-${Date.now()}`,
    status: 'success',
    content: 'Tool execution result',
    executionTimeMs: 100,
    ...overrides,
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockPiClient,
  createMockPiClient,
  setupMockPiClient,
  resetMockPiState,
  configureMockResponse,
  getMockPiState,
  simulateConnectionError,
  simulateMessageError,
  simulateToolCall,
  createMockMessageResponse,
  createMockToolCall,
  createMockToolResult,
};

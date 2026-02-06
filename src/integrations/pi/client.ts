/**
 * Pi Client Wrapper
 *
 * A headless WebSocket client for the Pi CLI RPC protocol.
 * Provides session management, message streaming, tree operations,
 * and tool call handling with auto-reconnect and heartbeat support.
 *
 * @example
 * ```typescript
 * const client = new PiClient({
 *   endpoint: 'ws://localhost:3000',
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5'
 * });
 *
 * await client.connect();
 * await client.initSession();
 *
 * const response = await client.sendMessage('Hello, Pi!');
 * console.log(response.content);
 *
 * await client.disconnect();
 * ```
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../utils/logger';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for PiClient connection and behavior
 */
export interface PiClientConfig {
  /** WebSocket endpoint URL */
  endpoint: string;

  /** API key for authentication (optional) */
  apiKey?: string;

  /** Default provider to use */
  provider: string;

  /** Default model identifier */
  model: string;

  /** Enabled tools for the session */
  tools?: string[];

  /** System prompt for the session */
  systemPrompt?: string;

  /** Enable automatic reconnection on disconnect */
  reconnect?: boolean;

  /** Reconnection interval in milliseconds */
  reconnectInterval?: number;

  /** Maximum number of reconnection attempts */
  maxReconnects?: number;

  /** Request timeout in milliseconds */
  requestTimeout?: number;

  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

/**
 * Configuration for initializing a new session
 */
export interface SessionInitConfig {
  /** Provider to use (defaults to client config) */
  provider?: string;

  /** Model identifier (defaults to client config) */
  model?: string;

  /** Enabled tools for this session */
  tools?: string[];

  /** System prompt for this session */
  systemPrompt?: string;

  /** Worktree path for the session */
  worktreePath?: string;

  /** Whether to inherit context from parent session */
  inheritContext?: boolean;
}

/**
 * Options for sending messages
 */
export interface MessageOptions {
  /** Tool results to include with the message */
  toolResults?: ToolResult[];

  /** Whether to create a checkpoint after this message */
  checkpoint?: boolean;
}

// ============================================================================
// RPC Protocol Types
// ============================================================================

/**
 * RPC request structure
 */
export interface RpcRequest {
  /** Unique request identifier */
  id: string;

  /** RPC method name */
  method: string;

  /** Method parameters */
  params: Record<string, unknown>;
}

/**
 * RPC response structure
 */
export interface RpcResponse {
  /** Request identifier (matches the request) */
  id: string;

  /** Response result (if successful) */
  result?: unknown;

  /** Error details (if failed) */
  error?: RpcError;
}

/**
 * RPC error structure
 */
export interface RpcError {
  /** Error code */
  code: number;

  /** Error message */
  message: string;

  /** Additional error data */
  data?: unknown;
}

/**
 * WebSocket message types
 */
export type WebSocketMessage =
  | RpcResponse
  | ServerNotification
  | StreamChunkMessage;

/**
 * Server notification message
 */
export interface ServerNotification {
  /** Notification type (not a response) */
  type: 'notification';

  /** Notification event name */
  event: string;

  /** Notification payload */
  data: unknown;
}

// ============================================================================
// Message and Response Types
// ============================================================================

/**
 * Tool call representation
 */
export interface ToolCall {
  /** Unique tool call identifier */
  id: string;

  /** Tool name */
  tool: string;

  /** Tool arguments */
  arguments: Record<string, unknown>;
}

/**
 * Tool result representation
 */
export interface ToolResult {
  /** Tool call ID this result corresponds to */
  toolCallId: string;

  /** Result status */
  status: 'success' | 'error' | 'pending';

  /** Result content */
  content: unknown;

  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

/**
 * Message response from Pi
 */
export interface MessageResponse {
  /** Message identifier */
  messageId: string;

  /** Response content */
  content: string;

  /** Tool calls requested by the assistant */
  toolCalls?: ToolCall[];

  /** Checkpoint reference (if checkpoint was created) */
  checkpointRef?: string;
}

/**
 * Stream chunk for streaming responses
 */
export interface StreamChunk {
  /** Chunk type */
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'done';

  /** Chunk content */
  content?: string;

  /** Tool call (if type is 'tool_call') */
  toolCall?: ToolCall;

  /** Tool result (if type is 'tool_result') */
  toolResult?: ToolResult;

  /** Error details (if type is 'error') */
  error?: string;

  /** Whether this is the final chunk */
  done?: boolean;
}

/**
 * Stream chunk message from server
 */
interface StreamChunkMessage {
  /** Stream chunk type */
  type: 'stream';

  /** Request ID this chunk belongs to */
  requestId: string;

  /** Chunk data */
  chunk: StreamChunk;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session information
 */
export interface SessionInfo {
  /** Session identifier */
  id: string;

  /** Current provider */
  provider: string;

  /** Current model */
  model: string;

  /** Enabled tools */
  tools: string[];

  /** Session creation timestamp */
  createdAt: Date;

  /** Current worktree path */
  worktreePath?: string;
}

/**
 * Session status
 */
export interface SessionStatus {
  /** Session identifier */
  sessionId: string;

  /** Current state */
  state: 'active' | 'paused' | 'error' | 'terminated';

  /** Current provider */
  provider: string;

  /** Current model */
  model: string;

  /** Message count in session */
  messageCount: number;

  /** Token usage statistics */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };

  /** Last activity timestamp */
  lastActivityAt: Date;
}

// ============================================================================
// Tree Types
// ============================================================================

/**
 * Conversation tree information
 */
export interface TreeInfo {
  /** Root node identifier */
  rootNodeId: string;

  /** Current node identifier */
  currentNodeId: string;

  /** All nodes in the tree */
  nodes: TreeNodeInfo[];

  /** Available branches */
  branches: BranchInfo[];
}

/**
 * Tree node information
 */
export interface TreeNodeInfo {
  /** Node identifier */
  id: string;

  /** Parent node ID (null for root) */
  parentId: string | null;

  /** Child node IDs */
  childIds: string[];

  /** Message role */
  role: 'user' | 'assistant' | 'system' | 'tool';

  /** Message content preview */
  contentPreview: string;

  /** Node creation timestamp */
  createdAt: Date;
}

/**
 * Branch information
 */
export interface BranchInfo {
  /** Branch identifier */
  id: string;

  /** Branch name */
  name: string;

  /** Root node ID for this branch */
  rootNodeId: string;

  /** Branch creation timestamp */
  createdAt: Date;
}

/**
 * Compact history result
 */
export interface CompactResult {
  /** Number of nodes removed */
  nodesRemoved: number;

  /** Number of tokens freed */
  tokensFreed: number;

  /** New root node ID */
  newRootNodeId: string;

  /** Summary of compacted content */
  summary: string;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Queued message for offline handling
 */
interface QueuedMessage {
  /** Message identifier */
  id: string;

  /** Request to send */
  request: RpcRequest;

  /** Resolve callback */
  resolve: (value: RpcResponse) => void;

  /** Reject callback */
  reject: (reason: Error) => void;

  /** Timeout handle */
  timeout: NodeJS.Timeout;
}

/**
 * Pending request awaiting response
 */
interface PendingRequest {
  /** Request identifier */
  id: string;

  /** Resolve callback */
  resolve: (value: RpcResponse) => void;

  /** Reject callback */
  reject: (reason: Error) => void;

  /** Timeout handle */
  timeout: NodeJS.Timeout;

  /** Request timestamp */
  timestamp: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for Pi client operations
 */
export class PiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PiClientError';
  }
}

/**
 * Error for connection failures
 */
export class ConnectionError extends PiClientError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', context);
    this.name = 'ConnectionError';
  }
}

/**
 * Error for RPC request failures
 */
export class RpcRequestError extends PiClientError {
  constructor(
    method: string,
    error: RpcError,
    context?: Record<string, unknown>
  ) {
    super(
      `RPC request '${method}' failed: ${error.message}`,
      'RPC_REQUEST_ERROR',
      { method, errorCode: error.code, ...context }
    );
    this.name = 'RpcRequestError';
  }
}

/**
 * Error for timeout failures
 */
export class TimeoutError extends PiClientError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'TIMEOUT_ERROR',
      { operation, timeoutMs }
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Error for session-related failures
 */
export class SessionError extends PiClientError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SESSION_ERROR', context);
    this.name = 'SessionError';
  }
}

// ============================================================================
// Events
// ============================================================================

/**
 * Events emitted by PiClient
 */
export interface PiClientEvents {
  /** Emitted when connection is established */
  connected: () => void;

  /** Emitted when connection is closed */
  disconnected: (reason?: string) => void;

  /** Emitted when an error occurs */
  error: (error: Error) => void;

  /** Emitted when a message is received from the assistant */
  message: (message: MessageResponse) => void;

  /** Emitted when a tool call is requested */
  tool_call: (toolCall: ToolCall) => void;

  /** Emitted when session status changes */
  status_change: (status: SessionStatus) => void;

  /** Emitted when model is switched */
  model_change: (model: string, previousModel: string) => void;

  /** Emitted when provider is switched */
  provider_change: (provider: string, previousProvider: string) => void;
}

/**
 * Type-safe event emitter for PiClient
 */
export declare interface PiClient {
  on<K extends keyof PiClientEvents>(
    event: K,
    listener: PiClientEvents[K]
  ): this;
  emit<K extends keyof PiClientEvents>(
    event: K,
    ...args: Parameters<PiClientEvents[K]>
  ): boolean;
  off<K extends keyof PiClientEvents>(
    event: K,
    listener: PiClientEvents[K]
  ): this;
  once<K extends keyof PiClientEvents>(
    event: K,
    listener: PiClientEvents[K]
  ): this;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique identifier
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Pick<
  PiClientConfig,
  'reconnect' | 'reconnectInterval' | 'maxReconnects' | 'requestTimeout' | 'heartbeatInterval'
>> = {
  reconnect: true,
  reconnectInterval: 5000,
  maxReconnects: 3,
  requestTimeout: 60000,
  heartbeatInterval: 30000,
};

// ============================================================================
// PiClient Class
// ============================================================================

/**
 * Pi CLI headless WebSocket client
 *
 * Provides a complete wrapper around the Pi RPC protocol with:
 * - Connection management with auto-reconnect
 * - Session lifecycle management
 * - Message sending (sync and streaming)
 * - Tool call handling
 * - Conversation tree operations
 * - Heartbeat keepalive
 *
 * @emits connected - When WebSocket connection is established
 * @emits disconnected - When connection is closed
 * @emits error - When an error occurs
 * @emits message - When an assistant message is received
 * @emits tool_call - When a tool call is requested
 * @emits status_change - When session status changes
 * @emits model_change - When model is switched
 */
export class PiClient extends EventEmitter {
  // Configuration
  private config: PiClientConfig & typeof DEFAULT_CONFIG;
  private endpoint: string;
  private apiKey?: string;

  // Connection state
  private ws: WebSocket | null = null;
  private connected = false;
  private messageQueue: QueuedMessage[] = [];
  private pendingRequests = new Map<string, PendingRequest>();

  // State
  private currentModel: string;
  private currentProvider: string;
  private sessionId: string | null = null;

  // Reconnect state
  private reconnectCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Heartbeat state
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();

  // Tool call state
  private pendingToolResults = new Map<string, (result: ToolResult) => void>();

  /**
   * Create a new PiClient instance
   *
   * @param config - Client configuration
   */
  constructor(config: PiClientConfig) {
    super();

    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.currentModel = config.model;
    this.currentProvider = config.provider;

    logger.debug('pi-client', 'PiClient instance created', {
      endpoint: this.endpoint,
      provider: this.currentProvider,
      model: this.currentModel,
    });
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Establish WebSocket connection to Pi server
   *
   * @returns Promise that resolves when connected
   * @throws ConnectionError if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      logger.debug('pi-client', 'Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new ConnectionError('Connection timeout', { endpoint: this.endpoint }));
      }, this.config.requestTimeout);

      try {
        // Create WebSocket with auth if provided
        const headers: Record<string, string> = {};
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        this.ws = new WebSocket(this.endpoint, { headers });

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.connected = true;
          this.reconnectCount = 0;
          this.lastPongTime = Date.now();

          this.startHeartbeat();
          this.processMessageQueue();

          logger.info('pi-client', 'Connected to Pi server', {
            endpoint: this.endpoint,
          });

          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          logger.error('pi-client', 'WebSocket error', { error: error.message });
          this.emit('error', error);
          reject(new ConnectionError(error.message, { endpoint: this.endpoint }));
        });

        this.ws.on('close', (code, reason) => {
          this.onClose(code, reason.toString());
        });

        this.ws.on('pong', () => {
          this.lastPongTime = Date.now();
        });
      } catch (error) {
        clearTimeout(connectionTimeout);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new ConnectionError(errorMessage, { endpoint: this.endpoint }));
      }
    });
  }

  /**
   * Close WebSocket connection
   *
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    // Stop reconnect attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    // Reject all pending requests
    for (const [id, request] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError('Connection closed'));
      this.pendingRequests.delete(id);
    }

    // Clear queued messages
    for (const msg of this.messageQueue) {
      clearTimeout(msg.timeout);
      msg.reject(new ConnectionError('Connection closed'));
    }
    this.messageQueue = [];

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Client disconnect');
      }
    }

    this.connected = false;
    this.sessionId = null;

    logger.info('pi-client', 'Disconnected from Pi server');
    this.emit('disconnected');
  }

  /**
   * Check if client is connected
   *
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle WebSocket close event
   *
   * @param code - Close code
   * @param reason - Close reason
   */
  private onClose(code: number, reason: string): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.stopHeartbeat();

    logger.warn('pi-client', 'WebSocket closed', { code, reason });

    // Reject pending requests
    for (const [id, request] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError(`Connection closed: ${reason}`));
      this.pendingRequests.delete(id);
    }

    this.emit('disconnected', reason);

    // Auto-reconnect if enabled and not manually closed
    if (wasConnected && this.config.reconnect && code !== 1000) {
      if (this.reconnectCount < this.config.maxReconnects) {
        this.reconnectCount++;
        logger.info('pi-client', `Reconnecting (attempt ${this.reconnectCount})...`);

        this.reconnectTimer = setTimeout(() => {
          this.connect().catch((error) => {
            logger.error('pi-client', 'Reconnect failed', { error: error.message });
          });
        }, this.config.reconnectInterval);
      } else {
        logger.error('pi-client', 'Max reconnection attempts reached');
        this.emit('error', new ConnectionError('Max reconnection attempts reached'));
      }
    }
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.config.heartbeatInterval * 2) {
        logger.warn('pi-client', 'Heartbeat timeout, closing connection');
        this.ws.terminate();
        return;
      }

      // Send ping
      this.ws.ping();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Initialize a new Pi session
   *
   * @param sessionConfig - Session configuration
   * @returns Session information
   */
  async initSession(sessionConfig?: SessionInitConfig): Promise<SessionInfo> {
    this.ensureConnected();

    const config = {
      provider: sessionConfig?.provider ?? this.currentProvider,
      model: sessionConfig?.model ?? this.currentModel,
      tools: sessionConfig?.tools ?? this.config.tools,
      system_prompt: sessionConfig?.systemPrompt ?? this.config.systemPrompt,
      worktree_path: sessionConfig?.worktreePath,
      inherit_context: sessionConfig?.inheritContext,
    };

    const response = await this.sendRequest({
      id: generateId(),
      method: 'session.init',
      params: config,
    });

    if (response.error) {
      throw new SessionError(`Failed to initialize session: ${response.error.message}`, {
        errorCode: response.error.code,
      });
    }

    const result = response.result as {
      session_id: string;
      provider: string;
      model: string;
      tools: string[];
      created_at: string;
      worktree_path?: string;
    };

    this.sessionId = result.session_id;
    this.currentProvider = result.provider;
    this.currentModel = result.model;

    const sessionInfo: SessionInfo = {
      id: result.session_id,
      provider: result.provider,
      model: result.model,
      tools: result.tools,
      createdAt: new Date(result.created_at),
      worktreePath: result.worktree_path,
    };

    logger.info('pi-client', 'Session initialized', { sessionId: this.sessionId });

    return sessionInfo;
  }

  /**
   * Close the current session
   */
  async closeSession(): Promise<void> {
    this.ensureConnected();

    if (!this.sessionId) {
      logger.warn('pi-client', 'No active session to close');
      return;
    }

    try {
      await this.sendRequest({
        id: generateId(),
        method: 'session.close',
        params: {},
      });
    } catch (error) {
      logger.warn('pi-client', 'Error closing session', { error });
    }

    logger.info('pi-client', 'Session closed', { sessionId: this.sessionId });
    this.sessionId = null;
  }

  /**
   * Get current session ID
   *
   * @returns Session ID or null if no session
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // ============================================================================
  // Message Sending
  // ============================================================================

  /**
   * Send a message and wait for response
   *
   * @param content - Message content
   * @param options - Message options
   * @returns Message response
   */
  async sendMessage(content: string, options?: MessageOptions): Promise<MessageResponse> {
    this.ensureConnected();
    this.ensureSession();

    const request: RpcRequest = {
      id: generateId(),
      method: 'session.send',
      params: {
        content,
        tool_results: options?.toolResults?.map((r) => ({
          tool_call_id: r.toolCallId,
          status: r.status,
          content: r.content,
          execution_time_ms: r.executionTimeMs,
        })),
        checkpoint: options?.checkpoint,
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new RpcRequestError('session.send', response.error);
    }

    const result = response.result as {
      message_id: string;
      content: string;
      tool_calls?: ToolCall[];
      checkpoint_ref?: string;
    };

    const messageResponse: MessageResponse = {
      messageId: result.message_id,
      content: result.content,
      toolCalls: result.tool_calls,
      checkpointRef: result.checkpoint_ref,
    };

    this.emit('message', messageResponse);

    // Handle tool calls
    if (result.tool_calls && result.tool_calls.length > 0) {
      for (const toolCall of result.tool_calls) {
        await this.handleToolCall(toolCall);
      }
    }

    return messageResponse;
  }

  /**
   * Send a message and stream the response
   *
   * @param content - Message content
   * @param options - Message options
   * @returns Async iterable of stream chunks
   */
  async *sendMessageStream(content: string, options?: MessageOptions): AsyncIterable<StreamChunk> {
    this.ensureConnected();
    this.ensureSession();

    const requestId = generateId();
    const streamChunks: StreamChunk[] = [];
    let streamResolve: (() => void) | null = null;
    let streamDone = false;
    let streamError: Error | null = null;

    // Set up stream handler
    const handleStreamChunk = (chunk: StreamChunk) => {
      streamChunks.push(chunk);
      if (streamResolve) {
        streamResolve();
        streamResolve = null;
      }

      if (chunk.type === 'done' || chunk.type === 'error') {
        streamDone = true;
        if (chunk.type === 'error' && chunk.error) {
          streamError = new Error(chunk.error);
        }
      }
    };

    // Store handler for this request
    (this as unknown as Record<string, (chunk: StreamChunk) => void>)[`_streamHandler_${requestId}`] = handleStreamChunk;

    // Send streaming request
    const request: RpcRequest = {
      id: requestId,
      method: 'session.send_stream',
      params: {
        content,
        tool_results: options?.toolResults,
        checkpoint: options?.checkpoint,
      },
    };

    // Send without waiting for full response
    this.sendWebSocketMessage(request);

    try {
      // Yield chunks as they arrive
      while (!streamDone) {
        // Wait for chunks or timeout
        if (streamChunks.length === 0) {
          await new Promise<void>((resolve, reject) => {
            streamResolve = resolve;
            setTimeout(() => {
              if (streamChunks.length === 0) {
                reject(new TimeoutError('stream', this.config.requestTimeout));
              }
            }, this.config.requestTimeout);
          });
        }

        // Yield all available chunks
        while (streamChunks.length > 0) {
          const chunk = streamChunks.shift()!;
          yield chunk;

          // Handle tool calls
          if (chunk.type === 'tool_call' && chunk.toolCall) {
            await this.handleToolCall(chunk.toolCall);
          }
        }

        if (streamError) {
          throw streamError;
        }
      }
    } finally {
      // Clean up handler
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (this as unknown as Record<string, unknown>)[`_streamHandler_${requestId}`];
    }
  }

  // ============================================================================
  // Tool Result Submission
  // ============================================================================

  /**
   * Submit a tool result to the session
   *
   * @param toolCallId - Tool call ID
   * @param result - Tool result
   */
  async submitToolResult(toolCallId: string, result: unknown): Promise<void> {
    // Resolve pending tool result promise
    const resolver = this.pendingToolResults.get(toolCallId);
    if (resolver) {
      resolver({
        toolCallId,
        status: 'success',
        content: result,
      });
      this.pendingToolResults.delete(toolCallId);
      return;
    }

    // If no pending resolver, send directly
    this.ensureConnected();
    this.ensureSession();

    await this.sendRequest({
      id: generateId(),
      method: 'session.submit_tool_result',
      params: {
        tool_call_id: toolCallId,
        result,
      },
    });
  }

  /**
   * Wait for a tool result from external handler
   *
   * @param toolCallId - Tool call ID to wait for
   * @returns Tool result
   */
  private waitForToolResult(toolCallId: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      this.pendingToolResults.set(toolCallId, resolve);

      // Set timeout
      setTimeout(() => {
        if (this.pendingToolResults.has(toolCallId)) {
          this.pendingToolResults.delete(toolCallId);
          resolve({
            toolCallId,
            status: 'error',
            content: 'Tool execution timeout',
          });
        }
      }, this.config.requestTimeout);
    });
  }

  /**
   * Handle incoming tool call
   *
   * @param toolCall - Tool call to handle
   */
  private async handleToolCall(toolCall: ToolCall): Promise<void> {
    logger.info('pi-client', 'Tool call received', {
      toolCallId: toolCall.id,
      tool: toolCall.tool,
    });

    this.emit('tool_call', toolCall);

    // Wait for external handler to provide result
    const result = await this.waitForToolResult(toolCall.id);

    // Submit result
    await this.submitToolResult(toolCall.id, result.content);
  }

  // ============================================================================
  // Session Control
  // ============================================================================

  /**
   * Force kill the current session
   */
  async killSession(): Promise<void> {
    this.ensureConnected();

    if (!this.sessionId) {
      logger.warn('pi-client', 'No active session to kill');
      return;
    }

    try {
      await this.sendRequest({
        id: generateId(),
        method: 'session.kill',
        params: {},
      });
    } catch (error) {
      logger.warn('pi-client', 'Error killing session', { error });
    }

    logger.info('pi-client', 'Session killed', { sessionId: this.sessionId });
    this.sessionId = null;
  }

  /**
   * Get current session status
   *
   * @returns Session status
   */
  async getStatus(): Promise<SessionStatus> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'session.status',
      params: {},
    });

    if (response.error) {
      throw new RpcRequestError('session.status', response.error);
    }

    const result = response.result as {
      session_id: string;
      state: 'active' | 'paused' | 'error' | 'terminated';
      provider: string;
      model: string;
      message_count: number;
      token_usage: {
        prompt: number;
        completion: number;
        total: number;
      };
      last_activity_at: string;
    };

    const status: SessionStatus = {
      sessionId: result.session_id,
      state: result.state,
      provider: result.provider,
      model: result.model,
      messageCount: result.message_count,
      tokenUsage: result.token_usage,
      lastActivityAt: new Date(result.last_activity_at),
    };

    this.emit('status_change', status);

    return status;
  }

  // ============================================================================
  // Model Switching
  // ============================================================================

  /**
   * Switch to a different model
   *
   * @param model - New model identifier
   */
  async switchModel(model: string): Promise<void> {
    this.ensureConnected();
    this.ensureSession();

    const previousModel = this.currentModel;

    const response = await this.sendRequest({
      id: generateId(),
      method: 'session.switch_model',
      params: { model },
    });

    if (response.error) {
      throw new RpcRequestError('session.switch_model', response.error);
    }

    this.currentModel = model;

    logger.info('pi-client', 'Model switched', {
      from: previousModel,
      to: model,
    });

    this.emit('model_change', model, previousModel);
  }

  /**
   * Switch to a different provider
   *
   * @param provider - New provider identifier
   */
  async switchProvider(provider: string): Promise<void> {
    this.ensureConnected();
    this.ensureSession();

    const previousProvider = this.currentProvider;

    const response = await this.sendRequest({
      id: generateId(),
      method: 'session.switch_provider',
      params: { provider },
    });

    if (response.error) {
      throw new RpcRequestError('session.switch_provider', response.error);
    }

    this.currentProvider = provider;

    logger.info('pi-client', 'Provider switched', {
      from: previousProvider,
      to: provider,
    });

    this.emit('provider_change', provider, previousProvider);
  }

  /**
   * Get current model
   *
   * @returns Current model identifier
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Get current provider
   *
   * @returns Current provider identifier
   */
  getCurrentProvider(): string {
    return this.currentProvider;
  }

  // ============================================================================
  // Tree Operations
  // ============================================================================

  /**
   * Get the conversation tree
   *
   * @returns Tree information
   */
  async getTree(): Promise<TreeInfo> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'tree.get',
      params: {},
    });

    if (response.error) {
      throw new RpcRequestError('tree.get', response.error);
    }

    const result = response.result as {
      root_node_id: string;
      current_node_id: string;
      nodes: Array<{
        id: string;
        parent_id: string | null;
        child_ids: string[];
        role: 'user' | 'assistant' | 'system' | 'tool';
        content_preview: string;
        created_at: string;
      }>;
      branches: Array<{
        id: string;
        name: string;
        root_node_id: string;
        created_at: string;
      }>;
    };

    return {
      rootNodeId: result.root_node_id,
      currentNodeId: result.current_node_id,
      nodes: result.nodes.map((n) => ({
        id: n.id,
        parentId: n.parent_id,
        childIds: n.child_ids,
        role: n.role,
        contentPreview: n.content_preview,
        createdAt: new Date(n.created_at),
      })),
      branches: result.branches.map((b) => ({
        id: b.id,
        name: b.name,
        rootNodeId: b.root_node_id,
        createdAt: new Date(b.created_at),
      })),
    };
  }

  /**
   * Create a new branch in the conversation tree
   *
   * @param fromNodeId - Node to branch from
   * @param name - Branch name
   * @returns Branch information
   */
  async createBranch(fromNodeId: string, name: string): Promise<BranchInfo> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'tree.branch',
      params: { from_node_id: fromNodeId, name },
    });

    if (response.error) {
      throw new RpcRequestError('tree.branch', response.error);
    }

    const result = response.result as {
      id: string;
      name: string;
      root_node_id: string;
      created_at: string;
    };

    return {
      id: result.id,
      name: result.name,
      rootNodeId: result.root_node_id,
      createdAt: new Date(result.created_at),
    };
  }

  /**
   * Switch to a different branch
   *
   * @param branchId - Branch ID to switch to
   */
  async switchBranch(branchId: string): Promise<void> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'tree.switch_branch',
      params: { branch_id: branchId },
    });

    if (response.error) {
      throw new RpcRequestError('tree.switch_branch', response.error);
    }

    logger.info('pi-client', 'Switched branch', { branchId });
  }

  /**
   * Fork a new session from a specific node
   *
   * @param fromNodeId - Node to fork from
   * @returns New session information
   */
  async forkSession(fromNodeId: string): Promise<SessionInfo> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'tree.fork',
      params: { from_node_id: fromNodeId },
    });

    if (response.error) {
      throw new RpcRequestError('tree.fork', response.error);
    }

    const result = response.result as {
      session_id: string;
      provider: string;
      model: string;
      tools: string[];
      created_at: string;
      worktree_path?: string;
    };

    const sessionInfo: SessionInfo = {
      id: result.session_id,
      provider: result.provider,
      model: result.model,
      tools: result.tools,
      createdAt: new Date(result.created_at),
      worktreePath: result.worktree_path,
    };

    logger.info('pi-client', 'Session forked', {
      fromNodeId,
      newSessionId: sessionInfo.id,
    });

    return sessionInfo;
  }

  /**
   * Compact conversation history
   *
   * @param threshold - Token threshold for compaction
   * @returns Compaction result
   */
  async compactHistory(threshold: number): Promise<CompactResult> {
    this.ensureConnected();
    this.ensureSession();

    const response = await this.sendRequest({
      id: generateId(),
      method: 'tree.compact',
      params: { threshold },
    });

    if (response.error) {
      throw new RpcRequestError('tree.compact', response.error);
    }

    const result = response.result as {
      nodes_removed: number;
      tokens_freed: number;
      new_root_node_id: string;
      summary: string;
    };

    return {
      nodesRemoved: result.nodes_removed,
      tokensFreed: result.tokens_freed,
      newRootNodeId: result.new_root_node_id,
      summary: result.summary,
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Send an RPC request and wait for response
   *
   * @param request - RPC request
   * @returns RPC response
   */
  private async sendRequest(request: RpcRequest): Promise<RpcResponse> {
    // If not connected, queue the message
    if (!this.isConnected()) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = this.messageQueue.findIndex((m) => m.id === request.id);
          if (index > -1) {
            this.messageQueue.splice(index, 1);
          }
          reject(new TimeoutError(request.method, this.config.requestTimeout));
        }, this.config.requestTimeout);

        this.messageQueue.push({
          id: request.id,
          request,
          resolve,
          reject,
          timeout,
        });
      });
    }

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new TimeoutError(request.method, this.config.requestTimeout));
      }, this.config.requestTimeout);

      // Store pending request
      this.pendingRequests.set(request.id, {
        id: request.id,
        resolve,
        reject,
        timeout,
        timestamp: Date.now(),
      });

      // Send via WebSocket
      this.sendWebSocketMessage(request);
    });
  }

  /**
   * Send a message via WebSocket
   *
   * @param message - Message to send
   */
  private sendWebSocketMessage(message: RpcRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new ConnectionError('WebSocket not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Process queued messages after connection
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift()!;

      // Clear the queued timeout
      clearTimeout(queued.timeout);

      // Send as new request
      this.sendRequest(queued.request)
        .then(queued.resolve)
        .catch(queued.reject);
    }
  }

  /**
   * Handle incoming WebSocket message
   *
   * @param data - Raw message data
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;

      // Handle stream chunks
      if ('type' in message && message.type === 'stream') {
        const streamMsg = message as StreamChunkMessage;
        const handlerKey = `_streamHandler_${streamMsg.requestId}`;
        const handler = (this as unknown as Record<string, (chunk: StreamChunk) => void>)[handlerKey];
        if (handler) {
          handler(streamMsg.chunk);
        }
        return;
      }

      // Handle notifications
      if ('type' in message && message.type === 'notification') {
        const notification = message as ServerNotification;
        this.handleNotification(notification);
        return;
      }

      // Handle RPC responses
      const response = message as RpcResponse;
      if (response.id) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.error) {
            pending.reject(new RpcRequestError('unknown', response.error));
          } else {
            pending.resolve(response);
          }
        }
      }
    } catch (error) {
      logger.error('pi-client', 'Failed to parse message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data: data.toString().substring(0, 200),
      });
    }
  }

  /**
   * Handle server notification
   *
   * @param notification - Server notification
   */
  private handleNotification(notification: ServerNotification): void {
    logger.debug('pi-client', 'Received notification', {
      event: notification.event,
    });

    switch (notification.event) {
      case 'status_change': {
        const data = notification.data as SessionStatus;
        this.emit('status_change', data);
        break;
      }
      case 'model_change': {
        const data = notification.data as { model: string; previous: string };
        this.currentModel = data.model;
        this.emit('model_change', data.model, data.previous);
        break;
      }
      default:
        logger.debug('pi-client', 'Unhandled notification', {
          event: notification.event,
        });
    }
  }

  /**
   * Ensure client is connected
   *
   * @throws ConnectionError if not connected
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected to Pi server', {
        endpoint: this.endpoint,
      });
    }
  }

  /**
   * Ensure session is initialized
   *
   * @throws SessionError if no session
   */
  private ensureSession(): void {
    if (!this.sessionId) {
      throw new SessionError('No active session', {
        hint: 'Call initSession() first',
      });
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export default PiClient;

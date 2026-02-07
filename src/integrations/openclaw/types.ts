/**
 * OpenClaw Gateway Protocol Types
 * 
 * TypeScript interfaces for the OpenClaw Gateway WebSocket API
 * Based on OPENCLAW_INTEGRATION_SPEC.md Section 4.1 Gateway Protocol
 */

// ============================================================================
// Gateway Connection Types
// ============================================================================

/**
 * Configuration for connecting to the OpenClaw Gateway
 */
export interface GatewayConfig {
  /** Host address (default: '127.0.0.1') */
  host: string;
  /** Port number (default: 18789) */
  port: number;
  /** Authentication token from OPENCLAW_GATEWAY_TOKEN */
  token?: string;
  /** Reconnection delay in milliseconds (default: 1000) */
  reconnectDelay: number;
  /** Maximum reconnection retries (default: 10) */
  maxRetries: number;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout: number;
}

/**
 * Connection parameters for the Gateway
 */
export interface ConnectParams {
  /** Authentication credentials */
  auth?: {
    token: string;
  };
  /** Client identifier */
  clientId?: string;
  /** Session identifier */
  sessionId?: string;
}

/**
 * Connection state of the Gateway client
 */
export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'authenticating' 
  | 'authenticated' 
  | 'reconnecting' 
  | 'error';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Gateway request message structure
 */
export interface Request {
  type: 'req';
  /** Idempotency key for request tracking */
  id: string;
  /** Method name to invoke */
  method: string;
  /** Method parameters */
  params: Record<string, unknown>;
}

/**
 * Gateway response message structure
 */
export interface Response {
  type: 'res';
  /** Request id matching the request */
  id: string;
  /** Success flag */
  ok: boolean;
  /** Response payload on success */
  payload?: unknown;
  /** Error details on failure */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Pending request tracking
 */
export interface PendingRequest {
  id: string;
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Gateway event message structure
 */
export interface Event {
  type: 'event';
  /** Event name/type */
  event: string;
  /** Event payload */
  payload: unknown;
  /** Sequence number for ordering */
  seq?: number;
  /** State version for sync */
  stateVersion?: number;
}

/**
 * Event handler function type
 */
export type EventHandler = (payload: unknown, event: Event) => void;

/**
 * Event subscription options
 */
export interface EventSubscription {
  event: string;
  handler: EventHandler;
}

// ============================================================================
// Session Management Types
// ============================================================================

/**
 * Session information returned by sessions_list
 */
export interface SessionInfo {
  /** Unique session key */
  key: string;
  /** Session identifier */
  id: string;
  /** Model name */
  model: string;
  /** Provider name */
  provider: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Input token count */
  inputTokens: number;
  /** Output token count */
  outputTokens: number;
  /** Session status */
  status: 'active' | 'idle' | 'stale';
  /** Session kind */
  kind?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for sessions_list method
 */
export interface SessionsListParams {
  /** Filter by active minutes */
  activeMinutes?: number;
  /** Filter by session kinds */
  kinds?: string[];
}

/**
 * Response from sessions_list method
 */
export interface SessionsListResponse {
  sessions: SessionInfo[];
}

/**
 * Sandbox configuration for session spawning
 */
export interface SandboxConfig {
  /** Sandbox mode */
  mode: 'non-main' | 'docker';
  /** Allowed tools (whitelist) */
  allowedTools?: string[];
  /** Denied tools (blacklist) */
  deniedTools?: string[];
}

/**
 * Parameters for sessions_spawn method
 */
export interface SessionsSpawnParams {
  /** Task prompt for the spawned session */
  task: string;
  /** Optional label for logs/UI */
  label?: string;
  /** Optional OpenClaw agent id override */
  agentId?: string;
  /** Model to use (default: configured default) */
  model?: string;
  /** Run timeout in seconds */
  runTimeoutSeconds?: number;
  /** Cleanup policy */
  cleanup?: 'delete' | 'keep';
  /** Thinking level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' */
  thinking?: string;
  /** Verbose output */
  verbose?: boolean;
  /** Workspace path */
  workspace?: string;
  /** Skills to load */
  skills?: string[];
  /** System prompt (legacy/optional compatibility) */
  systemPrompt?: string;
  /** Sandbox configuration */
  sandbox?: SandboxConfig;
  /** Agent permissions */
  permissions?: AgentPermissions;
}

/**
 * Response from sessions_spawn method
 */
export interface SessionsSpawnResponse {
  /** Session key in legacy Godel/OpenClaw payloads */
  sessionKey?: string;
  /** Session id in legacy payloads */
  sessionId?: string;
  /** Session key in current OpenClaw payloads */
  childSessionKey?: string;
  /** Spawn run id in current OpenClaw payloads */
  runId?: string;
  /** Request acceptance status in current OpenClaw payloads */
  status?: string;
  /** Optional free-form message from gateway */
  message?: string;
}

/**
 * Attachment for messages
 */
export interface Attachment {
  /** File path */
  path?: string;
  /** Base64 content */
  buffer?: string;
  /** MIME type */
  mimeType?: string;
  /** File name */
  filename?: string;
}

/**
 * Parameters for sessions_send method
 */
export interface SessionsSendParams {
  /** Target session key */
  sessionKey: string;
  /** Message content */
  message: string;
  /** File attachments */
  attachments?: Attachment[];
  /** Reply to message ID */
  replyTo?: string;
}

/**
 * Response from sessions_send method
 */
export interface SessionsSendResponse {
  runId: string;
  status: 'accepted';
}

/**
 * Message in session history
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for sessions_history method
 */
export interface SessionsHistoryParams {
  /** Session key */
  sessionKey: string;
  /** Maximum messages to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Response from sessions_history method
 */
export interface SessionsHistoryResponse {
  messages: Message[];
  total: number;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent execution state
 */
export interface AgentExecution {
  sessionKey: string;
  status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
  runId?: string;
  model: string;
  task: string;
  startedAt: Date;
  completedAt?: Date;
  results?: AgentResult[];
  error?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Agent permissions schema
 */
export interface AgentPermissions {
  /** Allowed tools (whitelist) */
  allowedTools: string[];
  /** Denied tools (blacklist, takes precedence) */
  deniedTools: string[];
  /** Sandbox mode */
  sandboxMode: 'none' | 'non-main' | 'docker';
  /** Maximum execution duration in seconds */
  maxDuration: number;
  /** Maximum tokens allowed */
  maxTokens: number;
  /** Maximum cost allowed */
  maxCost: number;
  /** Require approval for actions */
  requireApproval: boolean;
  /** Channels for approval requests */
  approvalChannels: string[];
}

/**
 * Default permissions for agents
 */
export const DEFAULT_PERMISSIONS: AgentPermissions = {
  allowedTools: [
    'read', 'write', 'edit', 'exec', 'browser', 'canvas', 
    'nodes', 'cron', 'webhook',
    'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'
  ],
  deniedTools: ['gateway', 'discord', 'slack'],
  sandboxMode: 'non-main',
  maxDuration: 3600,
  maxTokens: 100000,
  maxCost: 1.00,
  requireApproval: false,
  approvalChannels: [],
};

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * Agent event payload
 */
export interface AgentEventPayload {
  sessionKey: string;
  runId: string;
  status: string;
  model?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Chat event payload
 */
export interface ChatEventPayload {
  sessionKey: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  runId?: string;
}

/**
 * Presence event payload
 */
export interface PresenceEventPayload {
  sessionKey: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: string;
}

/**
 * Tick event payload (heartbeat)
 */
export interface TickEventPayload {
  timestamp: string;
  seq: number;
  stateVersion: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Gateway error codes
 */
export type GatewayErrorCode =
  | 'CONNECTION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'REQUEST_ERROR'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXISTS'
  | 'PERMISSION_DENIED'
  | 'TOOL_NOT_ALLOWED'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/**
 * Gateway error class
 */
export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Connection error class
 */
export class ConnectionError extends GatewayError {
  constructor(message: string, details?: unknown) {
    super('CONNECTION_ERROR', message, details);
    this.name = 'ConnectionError';
  }
}

/**
 * Timeout error class
 */
export class TimeoutError extends GatewayError {
  constructor(message: string, details?: unknown) {
    super('TIMEOUT_ERROR', message, details);
    this.name = 'TimeoutError';
  }
}

/**
 * Agent timeout error class
 */
export class AgentTimeoutError extends GatewayError {
  constructor(public sessionKey: string) {
    super('TIMEOUT_ERROR', `Agent timeout: ${sessionKey}`, { sessionKey });
    this.name = 'AgentTimeoutError';
  }
}

/**
 * Budget exceeded error class
 */
export class BudgetExceededError extends GatewayError {
  constructor(public agentId: string) {
    super('BUDGET_EXCEEDED', `Budget exceeded for agent: ${agentId}`, { agentId });
    this.name = 'BudgetExceededError';
  }
}

/**
 * Permission denied error class
 */
export class PermissionDeniedError extends GatewayError {
  constructor(
    public agentId: string,
    public tool: string
  ) {
    super('PERMISSION_DENIED', `Permission denied: ${agentId} cannot use ${tool}`, { agentId, tool });
    this.name = 'PermissionDeniedError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Gateway client options
 */
export interface GatewayClientOptions {
  /** Auto-reconnect on disconnect */
  autoReconnect: boolean;
  /** Event subscriptions on connect */
  subscriptions?: string[];
  /** Connection timeout */
  connectionTimeout: number;
  /** Heartbeat interval */
  heartbeatInterval: number;
}

/**
 * Reconnection state
 */
export interface ReconnectionState {
  attempt: number;
  lastAttempt: number;
  nextDelay: number;
  maxRetries: number;
}

/**
 * Gateway statistics
 */
export interface GatewayStats {
  connectedAt?: Date;
  disconnectedAt?: Date;
  reconnections: number;
  requestsSent: number;
  responsesReceived: number;
  eventsReceived: number;
  errors: number;
  lastPing?: number;
}

/**
 * Default gateway configuration
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  host: '127.0.0.1',
  port: 18789,
  reconnectDelay: 1000,
  maxRetries: 10,
  requestTimeout: 30000,
};

/**
 * Default gateway client options
 */
export const DEFAULT_GATEWAY_OPTIONS: GatewayClientOptions = {
  autoReconnect: true,
  connectionTimeout: 10000,
  heartbeatInterval: 30000,
};

// ============================================================================
// Event Bridge Types
// ============================================================================

/**
 * OpenClaw Event - Events sent from Godel to OpenClaw
 */
export interface OpenClawEvent {
  /** Event source */
  source: 'godel';
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** OpenClaw session key */
  sessionKey: string;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Event metadata */
  metadata: Record<string, unknown>;
}

/**
 * Godel Event - Events originating from Godel system
 */
export interface GodelEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event topic */
  topic: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Event metadata */
  metadata?: {
    source?: string;
    priority?: string;
    agentId?: string;
    teamId?: string;
    [key: string]: unknown;
  };
}

/**
 * Event Transformer - Transforms events between Godel and OpenClaw formats
 */
export interface EventTransformer {
  /** Transform Godel event to OpenClaw format */
  toOpenClaw(godelEvent: GodelEvent): OpenClawEvent;
  /** Transform OpenClaw event to Godel format */
  toDash(openclawEvent: OpenClawEvent): GodelEvent;
}

/**
 * Default Event Transformer implementation
 */
export const DefaultEventTransformer: EventTransformer = {
  toOpenClaw(godelEvent: GodelEvent): OpenClawEvent {
    return {
      source: 'godel',
      type: godelEvent.type,
      timestamp: godelEvent.timestamp,
      sessionKey: godelEvent.metadata?.['sessionKey'] as string || 'unknown',
      data: godelEvent.payload,
      metadata: {
        godelAgentId: godelEvent.metadata?.['agentId'],
        godelTeamId: godelEvent.metadata?.['teamId'],
        topic: godelEvent.topic,
        messageId: godelEvent.id,
        ...godelEvent.metadata,
      },
    };
  },

  toDash(openclawEvent: OpenClawEvent): GodelEvent {
    return {
      id: openclawEvent.metadata?.['messageId'] as string || `evt-${Date.now()}`,
      type: openclawEvent.type,
      timestamp: openclawEvent.timestamp,
      topic: `openclaw.${openclawEvent.sessionKey}.events`,
      payload: openclawEvent.data,
      metadata: {
        source: 'openclaw',
        sessionKey: openclawEvent.sessionKey,
        ...openclawEvent.metadata,
      },
    };
  },
};

/**
 * Event Transformer registry for custom transformers
 */
export class EventTransformerRegistry {
  private transformers: Map<string, EventTransformer> = new Map();

  /**
   * Register a custom transformer for an event type
   */
  register(eventType: string, transformer: EventTransformer): void {
    this.transformers.set(eventType, transformer);
  }

  /**
   * Get transformer for an event type
   */
  get(eventType: string): EventTransformer {
    return this.transformers.get(eventType) || DefaultEventTransformer;
  }

  /**
   * Check if a custom transformer exists
   */
  has(eventType: string): boolean {
    return this.transformers.has(eventType);
  }

  /**
   * Remove a transformer
   */
  unregister(eventType: string): boolean {
    return this.transformers.delete(eventType);
  }
}

/**
 * Global transformer registry instance
 */
let globalTransformerRegistry: EventTransformerRegistry | null = null;

/**
 * Get the global event transformer registry
 */
export function getEventTransformerRegistry(): EventTransformerRegistry {
  if (!globalTransformerRegistry) {
    globalTransformerRegistry = new EventTransformerRegistry();
  }
  return globalTransformerRegistry;
}

/**
 * Reset the global transformer registry (for testing)
 */
export function resetEventTransformerRegistry(): void {
  globalTransformerRegistry = null;
}

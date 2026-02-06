/**
 * Pi Integration Types
 *
 * TypeScript interfaces for the Pi CLI integration, including instance
 * discovery, registration, health monitoring, and selection criteria.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Core Instance Types
// ============================================================================

/**
 * Represents the health status of a Pi instance
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Provider identifiers for Pi instances
 */
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'groq'
  | 'cerebras'
  | 'ollama'
  | 'kimi'
  | 'minimax'
  | 'custom';

/**
 * Deployment mode for Pi instances
 */
export type DeploymentMode = 'local' | 'docker' | 'kubernetes' | 'remote';

/**
 * Capabilities that a Pi instance may support
 */
export type PiCapability =
  | 'code-generation'
  | 'code-review'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'analysis'
  | 'architecture'
  | 'debugging'
  | 'web-search'
  | 'file-operations'
  | 'git-operations'
  | 'shell-execution'
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java';

/**
 * Represents a single Pi instance in the registry
 */
export interface PiInstance {
  /** Unique identifier for the instance */
  id: string;

  /** Human-readable name */
  name: string;

  /** Provider identifier (e.g., 'anthropic', 'openai') */
  provider: ProviderId;

  /** Specific model identifier */
  model: string;

  /** Deployment mode */
  mode: DeploymentMode;

  /** Endpoint URL for the instance */
  endpoint: string;

  /** Current health status */
  health: HealthStatus;

  /** Capabilities supported by this instance */
  capabilities: PiCapability[];

  /** Region/location for geo-routing */
  region?: string;

  /** Current load/capacity metrics */
  capacity: InstanceCapacity;

  /** Last successful health check timestamp */
  lastHeartbeat: Date;

  /** Instance metadata */
  metadata: Record<string, unknown>;

  /** Authentication configuration */
  auth?: {
    type: 'token' | 'api-key' | 'mtls' | 'none';
    config?: Record<string, unknown>;
  };

  /** When the instance was registered */
  registeredAt: Date;

  /** Tags for categorization */
  tags?: string[];
}

/**
 * Capacity metrics for a Pi instance
 */
export interface InstanceCapacity {
  /** Maximum concurrent tasks */
  maxConcurrent: number;

  /** Currently active tasks */
  activeTasks: number;

  /** Queue depth (pending tasks) */
  queueDepth: number;

  /** Available capacity (max - active) */
  available: number;

  /** Utilization percentage (0-100) */
  utilizationPercent: number;
}

// ============================================================================
// Discovery Strategy Types
// ============================================================================

/**
 * Discovery strategy types for finding Pi instances
 */
export type DiscoveryStrategyType =
  | 'static'
  | 'openclaw-gateway'
  | 'kubernetes'
  | 'auto-spawn';

/**
 * Base configuration for discovery strategies
 */
export interface BaseDiscoveryConfig {
  /** Strategy type */
  type: DiscoveryStrategyType;

  /** Whether to auto-register discovered instances */
  autoRegister?: boolean;

  /** Health check timeout in milliseconds */
  healthCheckTimeoutMs?: number;
}

/**
 * Static discovery configuration - pre-configured instance list
 */
export interface StaticDiscoveryConfig extends BaseDiscoveryConfig {
  type: 'static';

  /** List of pre-configured instances */
  instances: Array<{
    id: string;
    name: string;
    provider: ProviderId;
    model: string;
    endpoint: string;
    capabilities?: PiCapability[];
    region?: string;
    capacity?: Partial<InstanceCapacity>;
    auth?: PiInstance['auth'];
    tags?: string[];
  }>;
}

/**
 * OpenClaw Gateway discovery configuration
 */
export interface OpenClawDiscoveryConfig extends BaseDiscoveryConfig {
  type: 'openclaw-gateway';

  /** Gateway URL */
  gatewayUrl: string;

  /** Authentication token for gateway */
  token?: string;

  /** Filter by session kinds */
  kinds?: string[];

  /** Filter by active minutes */
  activeMinutes?: number;
}

/**
 * Kubernetes discovery configuration
 */
export interface KubernetesDiscoveryConfig extends BaseDiscoveryConfig {
  type: 'kubernetes';

  /** Kubernetes namespace */
  namespace: string;

  /** Label selector for Pi pods */
  labelSelector: string;

  /** Field selector for additional filtering */
  fieldSelector?: string;

  /** Kubeconfig path (defaults to in-cluster config) */
  kubeconfigPath?: string;

  /** Service name pattern for endpoints */
  servicePattern?: string;

  /** Port name for Pi service */
  portName?: string;
}

/**
 * Auto-spawn discovery configuration
 */
export interface AutoSpawnDiscoveryConfig extends BaseDiscoveryConfig {
  type: 'auto-spawn';

  /** Spawn configuration */
  spawn: SpawnConfig;

  /** Minimum instances to maintain */
  minInstances: number;

  /** Maximum instances to spawn */
  maxInstances: number;

  /** Spawn when available capacity below this threshold */
  capacityThreshold?: number;
}

/**
 * Configuration for spawning new Pi instances
 */
export interface SpawnConfig {
  /** Provider to use */
  provider: ProviderId;

  /** Model identifier */
  model: string;

  /** Deployment mode */
  mode: DeploymentMode;

  /** Docker image (for docker/k8s mode) */
  image?: string;

  /** Resource limits */
  resources?: {
    cpu?: string;
    memory?: string;
    gpu?: string;
  };

  /** Environment variables */
  env?: Record<string, string>;

  /** Command override */
  command?: string[];

  /** Arguments override */
  args?: string[];

  /** Working directory */
  workingDir?: string;

  /** Capabilities to enable */
  capabilities?: PiCapability[];

  /** Region to deploy to */
  region?: string;

  /** Tags for spawned instances */
  tags?: string[];
}

/**
 * Union type for all discovery configurations
 */
export type DiscoveryStrategy =
  | StaticDiscoveryConfig
  | OpenClawDiscoveryConfig
  | KubernetesDiscoveryConfig
  | AutoSpawnDiscoveryConfig;

// ============================================================================
// Registry Configuration
// ============================================================================

/**
 * Configuration for the PiRegistry
 */
export interface PiRegistryConfig {
  /** Discovery strategies to use */
  discoveryStrategies: DiscoveryStrategy[];

  /** Health monitoring configuration */
  healthMonitoring?: {
    /** Enable automatic health checks */
    enabled: boolean;

    /** Check interval in milliseconds */
    intervalMs: number;

    /** Timeout for health checks */
    timeoutMs: number;

    /** Number of retries before marking unhealthy */
    maxRetries: number;

    /** Grace period before removing unhealthy instances (ms) */
    removalGracePeriodMs: number;
  };

  /** Default instance configuration */
  defaults?: {
    /** Default capacity for new instances */
    capacity?: Partial<InstanceCapacity>;

    /** Default capabilities */
    capabilities?: PiCapability[];

    /** Default region */
    region?: string;
  };

  /** Circuit breaker configuration for health checks */
  circuitBreaker?: {
    /** Failure threshold to open circuit */
    failureThreshold: number;

    /** Reset timeout in milliseconds */
    resetTimeoutMs: number;
  };
}

/**
 * Interface for PiRegistry to avoid circular dependencies
 */
export interface PiRegistryInterface {
  /** Get instance by ID */
  getInstance(instanceId: string): PiInstance | undefined;

  /** Get all registered instances */
  getAllInstances(): PiInstance[];

  /** Get healthy instances */
  getHealthyInstances(): PiInstance[];

  /** Select instance based on criteria */
  selectInstance(criteria: SelectionCriteria): PiInstance | null;

  /** Get available capacity report */
  getAvailableCapacity(): CapacityReport;
}

// ============================================================================
// Selection and Capacity Types
// ============================================================================

/**
 * Criteria for selecting a Pi instance
 */
export interface SelectionCriteria {
  /** Preferred provider */
  preferredProvider?: string;

  /** Required capabilities */
  requiredCapabilities?: string[];

  /** Minimum available capacity required */
  minAvailableCapacity?: number;

  /** Preferred region */
  region?: string;

  /** Instance IDs to exclude from selection */
  excludeInstances?: string[];

  /** Selection strategy */
  strategy?: 'least-loaded' | 'round-robin' | 'random' | 'capability-match';

  /** Tags to match */
  tags?: string[];
}

/**
 * Capacity report for all registered instances
 */
export interface CapacityReport {
  /** Total number of registered instances */
  totalInstances: number;

  /** Number of healthy instances */
  healthyInstances: number;

  /** Total capacity across all instances */
  totalCapacity: number;

  /** Available capacity across all instances */
  availableCapacity: number;

  /** Overall utilization percentage (0-100) */
  utilizationPercent: number;

  /** Breakdown by provider */
  byProvider: Record<string, ProviderCapacity>;

  /** Breakdown by region */
  byRegion: Record<string, RegionCapacity>;
}

/**
 * Capacity metrics per provider
 */
export interface ProviderCapacity {
  /** Provider identifier */
  provider: string;

  /** Number of instances */
  instances: number;

  /** Healthy instances */
  healthyInstances: number;

  /** Total capacity */
  totalCapacity: number;

  /** Available capacity */
  availableCapacity: number;

  /** Utilization percentage */
  utilizationPercent: number;
}

/**
 * Capacity metrics per region
 */
export interface RegionCapacity {
  /** Region identifier */
  region: string;

  /** Number of instances */
  instances: number;

  /** Healthy instances */
  healthyInstances: number;

  /** Total capacity */
  totalCapacity: number;

  /** Available capacity */
  availableCapacity: number;

  /** Utilization percentage */
  utilizationPercent: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by PiRegistry
 */
export interface PiRegistryEvents {
  /** Emitted when a new instance is registered */
  'instance.registered': (instance: PiInstance) => void;

  /** Emitted when an instance is unregistered */
  'instance.unregistered': (instanceId: string, reason?: string) => void;

  /** Emitted when instance health changes */
  'instance.health_changed': (
    instanceId: string,
    previousHealth: HealthStatus,
    newHealth: HealthStatus
  ) => void;

  /** Emitted when an instance fails health check */
  'instance.failed': (instanceId: string, error: Error) => void;

  /** Emitted when capacity changes significantly */
  'capacity.changed': (report: CapacityReport) => void;

  /** Emitted when discovery completes */
  'discovery.completed': (
    strategy: DiscoveryStrategyType,
    instancesFound: number
  ) => void;

  /** Emitted when discovery fails */
  'discovery.failed': (strategy: DiscoveryStrategyType, error: Error) => void;
}

/**
 * Type-safe event emitter for PiRegistry
 */
export declare interface PiRegistryEventEmitter {
  on<K extends keyof PiRegistryEvents>(
    event: K,
    listener: PiRegistryEvents[K]
  ): this;
  emit<K extends keyof PiRegistryEvents>(
    event: K,
    ...args: Parameters<PiRegistryEvents[K]>
  ): boolean;
  off<K extends keyof PiRegistryEvents>(
    event: K,
    listener: PiRegistryEvents[K]
  ): this;
  once<K extends keyof PiRegistryEvents>(
    event: K,
    listener: PiRegistryEvents[K]
  ): this;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown by PiRegistry operations
 */
export class PiRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PiRegistryError';
  }
}

/**
 * Error thrown when an instance is not found
 */
export class InstanceNotFoundError extends PiRegistryError {
  constructor(instanceId: string) {
    super(
      `Pi instance not found: ${instanceId}`,
      'INSTANCE_NOT_FOUND',
      { instanceId }
    );
    this.name = 'InstanceNotFoundError';
  }
}

/**
 * Error thrown when discovery fails
 */
export class DiscoveryError extends PiRegistryError {
  constructor(
    strategy: DiscoveryStrategyType,
    message: string,
    cause?: Error
  ) {
    super(
      `Discovery failed for strategy '${strategy}': ${message}`,
      'DISCOVERY_FAILED',
      { strategy, cause: cause?.message }
    );
    this.name = 'DiscoveryError';
  }
}

/**
 * Error thrown when selection fails
 */
export class SelectionError extends PiRegistryError {
  constructor(criteria: SelectionCriteria) {
    super(
      'No instance matches the selection criteria',
      'SELECTION_FAILED',
      { criteria }
    );
    this.name = 'SelectionError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Instance ID */
  instanceId: string;

  /** Health status */
  status: HealthStatus;

  /** Response time in milliseconds */
  responseTimeMs: number;

  /** Error message if failed */
  error?: string;

  /** Additional health metrics */
  metrics?: Record<string, number>;

  /** Timestamp of the check */
  checkedAt: Date;
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  /** Strategy used */
  strategy: DiscoveryStrategyType;

  /** Instances discovered */
  instances: PiInstance[];

  /** Errors encountered during discovery */
  errors: Error[];

  /** Time taken in milliseconds */
  durationMs: number;

  /** Timestamp of discovery */
  discoveredAt: Date;
}

/**
 * Selection result with metadata
 */
export interface SelectionResult {
  /** Selected instance */
  instance: PiInstance;

  /** Selection method used */
  method: string;

  /** Score for the selection (higher is better) */
  score?: number;

  /** Alternative instances that matched */
  alternatives: PiInstance[];

  /** Selection timestamp */
  selectedAt: Date;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default instance capacity
 */
export const DEFAULT_INSTANCE_CAPACITY: InstanceCapacity = {
  maxConcurrent: 5,
  activeTasks: 0,
  queueDepth: 0,
  available: 5,
  utilizationPercent: 0,
};

/**
 * Default health monitoring configuration
 */
export const DEFAULT_HEALTH_MONITORING: PiRegistryConfig['healthMonitoring'] = {
  enabled: true,
  intervalMs: 30000,
  timeoutMs: 5000,
  maxRetries: 3,
  removalGracePeriodMs: 300000, // 5 minutes
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER: PiRegistryConfig['circuitBreaker'] = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
};

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session state in the lifecycle state machine
 */
export type SessionState =
  | 'creating'
  | 'active'
  | 'paused'
  | 'resuming'
  | 'terminating'
  | 'terminated'
  | 'failed';

/**
 * Trigger for creating a checkpoint
 */
export type CheckpointTrigger =
  | 'auto'           // Automatic periodic checkpoint
  | 'manual'         // User-initiated checkpoint
  | 'pre_tool'       // Before tool execution
  | 'pre_migration'  // Before session migration
  | 'state_change'   // On significant state change
  | 'message_count'; // After N messages

/**
 * Represents a Pi session
 */
export interface PiSession {
  /** Unique session identifier */
  id: string;

  /** Associated agent ID */
  agentId: string;

  /** Current session state */
  state: SessionState;

  /** Pi instance managing this session */
  instanceId: string;

  /** Session configuration */
  config: SessionConfig;

  /** Conversation tree root */
  conversationRoot?: ConversationNode;

  /** Current conversation node */
  currentNodeId?: string;

  /** Tool call state */
  toolState: ToolCallState;

  /** Message count since last checkpoint */
  messageCount: number;

  /** Number of checkpoints created */
  checkpointCount: number;

  /** Last checkpoint timestamp */
  lastCheckpointAt?: Date;

  /** Session creation timestamp */
  createdAt: Date;

  /** Session last activity timestamp */
  lastActivityAt: Date;

  /** Session metadata */
  metadata: Record<string, unknown>;
}

/**
 * Conversation tree node
 */
export interface ConversationNode {
  /** Node identifier */
  id: string;

  /** Parent node ID (null for root) */
  parentId: string | null;

  /** Child node IDs */
  childIds: string[];

  /** Message content */
  message: {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
  };

  /** Token count for this node */
  tokenCount: number;

  /** Node creation timestamp */
  createdAt: Date;
}

/**
 * Tool call representation
 */
export interface ToolCall {
  /** Tool call ID */
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
 * Tool call state for session
 */
export interface ToolCallState {
  /** Pending tool calls */
  pending: Map<string, ToolCall>;

  /** Completed tool results */
  completed: Map<string, ToolResult>;

  /** Currently executing tool call ID */
  current?: string;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Associated agent ID */
  agentId: string;

  /** Pi CLI configuration */
  piConfig: {
    /** Provider to use */
    provider?: string;

    /** Model identifier */
    model?: string;

    /** Thinking level */
    thinking?: 'low' | 'medium' | 'high';

    /** Enabled tools */
    tools?: string[];

    /** System prompt */
    systemPrompt?: string;
  };

  /** Routing configuration */
  routing?: {
    /** Routing strategy */
    strategy?: string;

    /** Preferred provider */
    preferredProvider?: string;

    /** Fallback provider chain */
    fallbackChain?: string[];

    /** Cost limit in USD */
    costLimit?: number;
  };

  /** Persistence configuration */
  persistence?: {
    /** Enable auto-checkpointing */
    autoCheckpoint?: boolean;

    /** Checkpoint interval (number of messages) */
    checkpointInterval?: number;

    /** Compact threshold (token count) */
    compactThreshold?: number;
  };
}

/**
 * Checkpoint for session state
 */
export interface Checkpoint {
  /** Checkpoint identifier */
  id: string;

  /** Session ID this checkpoint belongs to */
  sessionId: string;

  /** Checkpoint trigger */
  trigger: CheckpointTrigger;

  /** Serialized session state */
  state: {
    conversationTree: SerializedConversationNode[];
    currentNodeId: string;
    toolState: SerializedToolState;
    messageCount: number;
    metadata: Record<string, unknown>;
  };

  /** Token count at checkpoint */
  tokenCount: number;

  /** Storage locations */
  storage: {
    redis?: string;      // Redis key
    postgresql?: string; // PostgreSQL record ID
  };

  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Serialized conversation node for storage
 */
export interface SerializedConversationNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  message: {
    role: string;
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
  };
  tokenCount: number;
  createdAt: string;
}

/**
 * Serialized tool state for storage
 */
export interface SerializedToolState {
  pending: Array<[string, ToolCall]>;
  completed: Array<[string, ToolResult]>;
  current?: string;
}

/**
 * Filter for listing sessions
 */
export interface SessionFilter {
  /** Filter by agent ID */
  agentId?: string;

  /** Filter by state */
  state?: SessionState;

  /** Filter by instance ID */
  instanceId?: string;

  /** Filter by creation time (after) */
  createdAfter?: Date;

  /** Filter by creation time (before) */
  createdBefore?: Date;

  /** Include only sessions with checkpoints */
  hasCheckpoints?: boolean;
}

/**
 * Options for session termination
 */
export interface TerminateOptions {
  /** Force termination even if active */
  force?: boolean;

  /** Create final checkpoint before termination */
  createCheckpoint?: boolean;

  /** Reason for termination */
  reason?: string;
}

/**
 * Dependencies for PiSessionManager
 */
/**
 * Session manager dependencies
 */
export interface SessionManagerDeps {
  /** Pi registry for instance management */
  registry: PiRegistryInterface;

  /** Model router for instance selection */
  router?: ModelRouterInterface;

  /** State synchronizer */
  stateSync?: StateSynchronizer;

  /** Storage adapter for persistence */
  storage: StorageAdapter;
}

/**
 * Model router interface
 */
export interface ModelRouterInterface {
  /** Select an instance based on criteria */
  selectInstance(criteria: SelectionCriteria): PiInstance | null;

  /** Get routing strategy */
  getStrategy(): string;
}

/**
 * State synchronizer interface
 */
export interface StateSynchronizer {
  /** Sync session state to storage */
  sync(sessionId: string, state: unknown): Promise<void>;

  /** Get last synced state */
  getLastSync(sessionId: string): Promise<unknown | null>;
}

// ============================================================================
// Enhanced State Synchronization Types
// ============================================================================

/**
 * Session status in the state synchronizer
 */
export type SessionStatus =
  | 'active'
  | 'paused'
  | 'migrating'
  | 'terminated'
  | 'error';

/**
 * Trigger for creating a checkpoint
 */
export type CheckpointTriggerType =
  | 'manual'
  | 'auto'
  | 'pre_tool'
  | 'post_tool'
  | 'migration';

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  /** Number of messages at checkpoint */
  messageCount: number;

  /** Token count at checkpoint */
  tokenCount: number;

  /** Trigger that created this checkpoint */
  trigger: CheckpointTriggerType;

  /** Reference to Pi's internal checkpoint */
  piCheckpointRef?: string;

  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Checkpoint representation
 */
export interface CheckpointData {
  /** Unique checkpoint identifier */
  id: string;

  /** Session ID this checkpoint belongs to */
  sessionId: string;

  /** Checkpoint creation timestamp */
  createdAt: Date;

  /** Serialized session state */
  state: SynchronizerSessionState;

  /** Checkpoint metadata */
  metadata: CheckpointMetadata;
}

/**
 * Session state for synchronizer
 */
export interface SynchronizerSessionState {
  /** Session identifier */
  sessionId: string;

  /** Instance ID managing this session */
  instanceId: string;

  /** Current session status */
  status: SessionStatus;

  /** Provider identifier */
  provider: string;

  /** Model identifier */
  model: string;

  /** Enabled tools */
  tools: string[];

  /** Current conversation node ID */
  currentNodeId: string;

  /** Token usage statistics */
  tokenUsage: { prompt: number; completion: number; total: number; };

  /** Cost incurred in USD */
  costIncurred: number;

  /** Custom session data */
  customData?: Record<string, unknown>;
}

/**
 * Conversation tree node
 */
export interface TreeNode {
  /** Node identifier */
  id: string;

  /** Parent node ID (null for root) */
  parentId: string | null;

  /** Child node IDs */
  childIds: string[];

  /** Message content */
  message: {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
  };

  /** Token count for this node */
  tokenCount: number;

  /** Node creation timestamp */
  createdAt: Date;
}

/**
 * Conversation tree structure
 */
export interface ConversationTree {
  /** Root node */
  root: TreeNode;

  /** All nodes indexed by ID */
  nodes: Map<string, TreeNode>;

  /** Current node ID */
  currentNodeId: string;

  /** Tree metadata */
  metadata: {
    totalNodes: number;
    totalTokens: number;
    lastModified: Date;
    [key: string]: unknown;
  };

  /** Branch information */
  branches: Array<{
    id: string;
    name: string;
    rootNodeId: string;
    createdAt: Date;
  }>;
}

/**
 * Redis client interface
 */
export interface RedisClient {
  /** Get value by key */
  get(key: string): Promise<string | null>;

  /** Set value with expiration (seconds) */
  setex(key: string, seconds: number, value: string): Promise<void>;

  /** Delete key */
  del(key: string): Promise<void>;

  /** Add element to list head */
  lpush(key: string, value: string): Promise<void>;

  /** Get list range */
  lrange(key: string, start: number, stop: number): Promise<string[]>;

  /** Trim list to range */
  ltrim(key: string, start: number, stop: number): Promise<void>;

  /** Execute pipeline of commands */
  pipeline(): RedisPipeline;
}

/**
 * Redis pipeline interface
 */
export interface RedisPipeline {
  /** Add setex command to pipeline */
  setex(key: string, seconds: number, value: string): this;

  /** Add del command to pipeline */
  del(key: string): this;

  /** Execute pipeline */
  exec(): Promise<void>;
}

/**
 * PostgreSQL query result
 */
export interface PostgresQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

/**
 * PostgreSQL client interface
 */
export interface PostgresClient {
  /** Execute query with parameters */
  query<T = unknown>(
    text: string,
    params?: unknown[]
  ): Promise<PostgresQueryResult<T>>;
}

/**
 * Logger interface
 */
export interface Logger {
  /** Log debug message */
  debug(message: string, meta?: Record<string, unknown>): void;

  /** Log info message */
  info(message: string, meta?: Record<string, unknown>): void;

  /** Log warning message */
  warn(message: string, meta?: Record<string, unknown>): void;

  /** Log error message */
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Enhanced StateSynchronizer interface with full checkpoint support
 */
export interface EnhancedStateSynchronizer {
  // Checkpoint operations
  saveCheckpoint(
    sessionId: string,
    state: SynchronizerSessionState,
    trigger?: CheckpointTriggerType
  ): Promise<CheckpointData>;
  loadCheckpoint(checkpointId: string): Promise<SynchronizerSessionState | null>;
  listCheckpoints(sessionId: string): Promise<CheckpointData[]>;
  deleteCheckpoint(checkpointId: string): Promise<void>;

  // Session state
  saveSessionState(sessionId: string, state: SynchronizerSessionState): Promise<void>;
  loadSessionState(sessionId: string): Promise<SynchronizerSessionState | null>;

  // Tree state
  saveTreeState(sessionId: string, tree: ConversationTree): Promise<void>;
  loadTreeState(sessionId: string): Promise<ConversationTree | null>;

  // Batch operations
  saveAll(sessionStates: Map<string, SynchronizerSessionState>): Promise<void>;
  cleanupOldCheckpoints(sessionId: string, keepCount: number): Promise<number>;
}

/**
 * Storage adapter interface for session persistence
 */
export interface StorageAdapter {
  /** Save to hot storage (Redis) */
  saveHot(key: string, data: unknown, ttl?: number): Promise<void>;

  /** Load from hot storage */
  loadHot<T>(key: string): Promise<T | null>;

  /** Save to cold storage (PostgreSQL) */
  saveCold(table: string, data: unknown): Promise<string>;

  /** Load from cold storage */
  loadCold<T>(table: string, id: string): Promise<T | null>;

  /** Delete from storage */
  delete(key: string): Promise<void>;
}

// ============================================================================
// Session Event Types
// ============================================================================

/**
 * Events emitted by PiSessionManager
 */
export interface PiSessionEvents {
  /** Emitted when a new session is created */
  'session.created': (session: PiSession) => void;

  /** Emitted when a session is initialized */
  'session.initialized': (session: PiSession) => void;

  /** Emitted when a session is paused */
  'session.paused': (sessionId: string) => void;

  /** Emitted when a session is resumed */
  'session.resumed': (session: PiSession) => void;

  /** Emitted when a checkpoint is created */
  'session.checkpointed': (sessionId: string, checkpoint: Checkpoint) => void;

  /** Emitted when a session is migrated */
  'session.migrated': (sessionId: string, fromInstance: string, toInstance: string) => void;

  /** Emitted when a session is terminated */
  'session.terminated': (sessionId: string, reason?: string) => void;

  /** Emitted when a session fails */
  'session.failed': (sessionId: string, error: Error) => void;

  /** Emitted on state transition */
  'session.state_changed': (
    sessionId: string,
    previousState: SessionState,
    newState: SessionState
  ) => void;
}

/**
 * Type-safe event emitter for PiSessionManager
 */
export declare interface PiSessionEventEmitter {
  on<K extends keyof PiSessionEvents>(
    event: K,
    listener: PiSessionEvents[K]
  ): this;
  emit<K extends keyof PiSessionEvents>(
    event: K,
    ...args: Parameters<PiSessionEvents[K]>
  ): boolean;
  off<K extends keyof PiSessionEvents>(
    event: K,
    listener: PiSessionEvents[K]
  ): this;
  once<K extends keyof PiSessionEvents>(
    event: K,
    listener: PiSessionEvents[K]
  ): this;
}

// ============================================================================
// Session Error Types
// ============================================================================

/**
 * Error thrown by PiSessionManager operations
 */
export class SessionManagerError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SessionManagerError';
  }
}

/**
 * Error thrown when a session is not found
 */
export class SessionNotFoundError extends SessionManagerError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      { sessionId }
    );
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when a session state transition is invalid
 */
export class InvalidStateTransitionError extends SessionManagerError {
  constructor(
    sessionId: string,
    currentState: SessionState,
    attemptedState: SessionState
  ) {
    super(
      `Invalid state transition for session ${sessionId}: ${currentState} -> ${attemptedState}`,
      'INVALID_STATE_TRANSITION',
      { sessionId, currentState, attemptedState }
    );
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Error thrown when checkpoint creation fails
 */
export class CheckpointError extends SessionManagerError {
  constructor(
    sessionId: string,
    message: string,
    cause?: Error
  ) {
    super(
      `Checkpoint failed for session ${sessionId}: ${message}`,
      'CHECKPOINT_FAILED',
      { sessionId, cause: cause?.message }
    );
    this.name = 'CheckpointError';
  }
}

/**
 * Error thrown when session migration fails
 */
export class MigrationError extends SessionManagerError {
  constructor(
    sessionId: string,
    fromInstance: string,
    toInstance: string,
    cause?: Error
  ) {
    super(
      `Migration failed for session ${sessionId} from ${fromInstance} to ${toInstance}`,
      'MIGRATION_FAILED',
      { sessionId, fromInstance, toInstance, cause: cause?.message }
    );
    this.name = 'MigrationError';
  }
}

// ============================================================================
// Default Session Configuration
// ============================================================================

/**
 * Default session persistence configuration
 */
export const DEFAULT_SESSION_PERSISTENCE: SessionConfig['persistence'] = {
  autoCheckpoint: true,
  checkpointInterval: 10,
  compactThreshold: 4000,
};

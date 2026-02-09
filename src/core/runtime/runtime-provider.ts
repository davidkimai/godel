/**
 * RuntimeProvider Interface
 * 
 * Abstraction for agent execution environments supporting Worktree, Kata, and E2B runtimes.
 * This interface defines the contract for all runtime provider implementations per SPEC-002.
 * 
 * @module core/runtime/runtime-provider
 * @version 1.0.0
 * @since 2026-02-08
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported runtime types
 * - worktree: Git worktree-based filesystem isolation (legacy)
 * - kata: Kata Containers with Firecracker MicroVMs
 * - e2b: E2B remote sandbox
 */
export type RuntimeType = 'worktree' | 'kata' | 'e2b';

/**
 * Runtime states representing the lifecycle of an agent runtime
 */
export type RuntimeState = 
  | 'pending'     // Initial state, waiting for resources
  | 'creating'    // Provisioning resources
  | 'running'     // Active and ready for execution
  | 'paused'      // Suspended but state preserved
  | 'terminating' // In process of shutting down
  | 'terminated'  // Shutdown complete
  | 'error';      // Error state

/**
 * Runtime events that can be subscribed to
 */
export type RuntimeEvent =
  | 'stateChange'      // Runtime state has changed
  | 'error'            // Error occurred
  | 'resourceWarning'  // Resource usage approaching limits
  | 'healthCheck'      // Health check result
  | 'executionStart'   // Execution started
  | 'executionEnd';    // Execution ended

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for spawning a new agent runtime
 */
export interface SpawnConfig {
  /** Runtime type to use */
  runtime: RuntimeType;
  /** Docker image for Kata/E2B runtimes */
  image?: string;
  /** Resource limits for the runtime */
  resources: ResourceLimits;
  /** Network configuration */
  network?: NetworkConfig;
  /** Volume mounts */
  volumes?: VolumeMount[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Labels for organization and filtering */
  labels?: Record<string, string>;
  /** Spawn timeout in seconds */
  timeout?: number;
}

/**
 * Resource limits for agent runtimes
 */
export interface ResourceLimits {
  /** CPU cores (fractional allowed: 0.5, 1.5, etc.) */
  cpu: number;
  /** Memory limit (e.g., "512Mi", "2Gi") */
  memory: string;
  /** Disk limit (e.g., "10Gi") */
  disk?: string;
  /** Maximum concurrent agents (for quota management) */
  agents?: number;
}

/**
 * Network configuration for agent runtimes
 */
export interface NetworkConfig {
  /** Network mode */
  mode: 'bridge' | 'host' | 'none';
  /** Network policies */
  policies?: NetworkPolicy[];
  /** Custom DNS servers */
  dns?: string[];
}

/**
 * Network policy definition
 */
export interface NetworkPolicy {
  /** Policy name */
  name: string;
  /** Policy type */
  type: 'ingress' | 'egress';
  /** Allowed ports */
  ports?: number[];
  /** Allowed CIDR blocks */
  cidr?: string[];
  /** Allowed domains (for egress) */
  domains?: string[];
}

/**
 * Network policy rule (legacy - kept for backward compatibility)
 */
export interface PolicyRule {
  /** Protocol (tcp, udp, icmp) */
  protocol: string;
  /** Port or port range */
  port?: number | string;
  /** Source/destination CIDR */
  cidr?: string;
}

/**
 * Volume mount configuration
 */
export interface VolumeMount {
  /** Volume name */
  name: string;
  /** Source path on host */
  source: string;
  /** Destination path in container */
  destination: string;
  /** Read-only mount */
  readOnly?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME STATE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Represents a running agent runtime instance
 */
export interface AgentRuntime {
  /** Unique runtime identifier */
  id: string;
  /** Runtime type */
  runtime: RuntimeType;
  /** Current state */
  state: RuntimeState;
  /** Current resource usage */
  resources: ResourceUsage;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** Runtime metadata */
  metadata: RuntimeMetadata;
}

/**
 * Runtime status information
 */
export interface RuntimeStatus {
  /** Runtime ID */
  id: string;
  /** Current state */
  state: RuntimeState;
  /** Resource usage */
  resources: ResourceUsage;
  /** Health status */
  health: 'healthy' | 'unhealthy' | 'unknown';
  /** Error message if in error state */
  error?: string;
  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Resource usage statistics
 */
export interface ResourceUsage {
  /** Current CPU usage in cores */
  cpu: number;
  /** Current memory usage in bytes */
  memory: number;
  /** Current disk usage in bytes */
  disk: number;
  /** Network statistics */
  network: NetworkStats;
}

/**
 * Network traffic statistics
 */
export interface NetworkStats {
  /** Bytes received */
  rxBytes: number;
  /** Bytes transmitted */
  txBytes: number;
  /** Packets received */
  rxPackets: number;
  /** Packets transmitted */
  txPackets: number;
}

/**
 * Runtime metadata
 */
export interface RuntimeMetadata {
  /** Runtime type */
  type: RuntimeType;
  /** Associated agent ID */
  agentId?: string;
  /** Team/namespace */
  teamId?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Additional labels */
  labels?: Record<string, string>;
  /** Snapshot ID this runtime was restored from */
  restoredFrom?: string;
}

/**
 * Filters for listing runtimes
 */
export interface RuntimeFilters {
  /** Filter by runtime type */
  runtime?: RuntimeType;
  /** Filter by state */
  state?: RuntimeState;
  /** Filter by team */
  teamId?: string;
  /** Filter by labels */
  labels?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for command execution
 */
export interface ExecutionOptions {
  /** Execution timeout in seconds */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** User to run as */
  user?: string;
}

/**
 * Result of command execution
 */
export interface ExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Execution metadata */
  metadata: ExecutionMetadata;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  /** Command that was executed */
  command?: string;
  /** Arguments passed to command */
  args?: string[];
  /** Runtime ID */
  runtimeId?: string;
  /** User who executed the command */
  user?: string;
  /** Start time */
  startedAt?: Date;
  /** End time */
  endedAt?: Date;
  /** Peak memory usage in bytes */
  peakMemory?: number;
  /** CPU time in milliseconds */
  cpuTime?: number;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Streaming execution output
 */
export interface ExecutionOutput {
  /** Output type */
  type: 'stdout' | 'stderr' | 'exit';
  /** Output data */
  data: string;
  /** Timestamp */
  timestamp: Date;
  /** Sequence number for ordering (optional) */
  sequence?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Snapshot of a runtime state
 */
export interface Snapshot {
  /** Unique snapshot ID */
  id: string;
  /** Runtime ID this snapshot belongs to */
  runtimeId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Snapshot size in bytes */
  size: number;
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
}

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
  /** Snapshot name */
  name?: string;
  /** Description */
  description?: string;
  /** Labels for organization */
  labels?: Record<string, string>;
  /** Parent snapshot ID for incremental snapshots */
  parentId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event data passed to event handlers
 */
export interface EventData {
  /** Runtime ID */
  runtimeId: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event type */
  event?: RuntimeEvent;
  /** Previous state (for stateChange events) */
  previousState?: RuntimeState;
  /** Current state (for stateChange events) */
  currentState?: RuntimeState;
  /** Error details (for error events) */
  error?: Error;
  /** Resource usage (for resourceWarning events) */
  resourceUsage?: ResourceUsage;
  /** Health status (for healthCheck events) */
  health?: 'healthy' | 'unhealthy';
  /** Execution metadata (for executionStart/executionEnd events) */
  execution?: ExecutionMetadata;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: RuntimeEvent, data: EventData) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base class for all runtime errors
 */
export abstract class RuntimeError extends Error {
  /** Error code */
  abstract readonly code: string;
  /** Whether the error is retryable */
  abstract readonly retryable: boolean;
  /** Associated runtime ID */
  runtimeId?: string;
  /** Additional context */
  context?: Record<string, unknown>;

  constructor(message: string, runtimeId?: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.runtimeId = runtimeId;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error during runtime spawn
 */
export class SpawnError extends RuntimeError {
  readonly code = 'SPAWN_ERROR';
  readonly retryable = true;

  constructor(message: string, runtimeId?: string, context?: Record<string, unknown>) {
    super(message, runtimeId, context);
  }
}

/**
 * Error during command execution
 */
export class ExecutionError extends RuntimeError {
  readonly code = 'EXECUTION_ERROR';
  readonly retryable = false;
  /** Exit code if available */
  exitCode?: number;

  constructor(message: string, runtimeId?: string, exitCode?: number, context?: Record<string, unknown>) {
    super(message, runtimeId, context);
    this.exitCode = exitCode;
  }
}

/**
 * Error when resources are exhausted
 */
export class ResourceExhaustedError extends RuntimeError {
  readonly code = 'RESOURCE_EXHAUSTED';
  readonly retryable = true;
  /** Resource type that was exhausted */
  resourceType: 'cpu' | 'memory' | 'disk' | 'agents' | 'network';

  constructor(
    message: string,
    resourceType: 'cpu' | 'memory' | 'disk' | 'agents' | 'network',
    runtimeId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, runtimeId, context);
    this.resourceType = resourceType;
  }
}

/**
 * Error when operation times out
 */
export class TimeoutError extends RuntimeError {
  readonly code = 'TIMEOUT';
  readonly retryable = true;
  /** Timeout duration in milliseconds */
  timeout: number;
  /** Operation that timed out */
  operation: string;

  constructor(message: string, timeout: number, operation: string, runtimeId?: string, context?: Record<string, unknown>) {
    super(message, runtimeId, context);
    this.timeout = timeout;
    this.operation = operation;
  }
}

/**
 * Error when a resource is not found
 */
export class NotFoundError extends RuntimeError {
  readonly code = 'NOT_FOUND';
  readonly retryable = false;
  /** Resource type that was not found */
  resourceType: 'runtime' | 'snapshot' | 'file' | 'directory';
  /** Resource identifier */
  resourceId: string;

  constructor(
    message: string,
    resourceType: 'runtime' | 'snapshot' | 'file' | 'directory',
    resourceId: string,
    runtimeId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, runtimeId, context);
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error for configuration issues
 */
export class ConfigurationError extends RuntimeError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly retryable = false;
  /** Configuration key that caused the error */
  configKey?: string;

  constructor(
    message: string,
    configKey?: string,
    runtimeId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, runtimeId, context);
    this.configKey = configKey;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runtime provider capabilities
 */
export interface RuntimeCapabilities {
  /** Supports snapshots */
  snapshots: boolean;
  /** Supports streaming execution */
  streaming: boolean;
  /** Supports interactive execution */
  interactive: boolean;
  /** Supports file operations */
  fileOperations: boolean;
  /** Supports network configuration */
  networkConfiguration: boolean;
  /** Supports resource limits */
  resourceLimits: boolean;
  /** Supports health checks */
  healthChecks: boolean;
  /** Maximum concurrent runtimes */
  maxConcurrentRuntimes?: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider type */
  type: RuntimeType;
  /** Provider name */
  name: string;
  /** Provider capabilities */
  capabilities: RuntimeCapabilities;
  /** Default configuration */
  defaults?: Partial<SpawnConfig>;
  /** Provider-specific settings */
  settings?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME PROVIDER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME PROVIDER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RuntimeProvider - Abstraction for agent execution environments
 * 
 * Supports Worktree, Kata, and E2B runtimes with a consistent API.
 * All methods are async and return Promises.
 * 
 * @example
 * ```typescript
 * const provider: RuntimeProvider = new KataRuntimeProvider();
 * const runtime = await provider.spawn({
 *   runtime: 'kata',
 *   resources: { cpu: 1, memory: '512Mi' }
 * });
 * ```
 */
export interface RuntimeProvider {
  // ═════════════════════════════════════════════════════════════════════════════
  // Lifecycle Management
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a new agent runtime
   * @param config - Spawn configuration
   * @returns Promise resolving to the created AgentRuntime
   * @throws {SpawnError} If spawn fails
   * @throws {ResourceExhaustedError} If resources unavailable
   * @throws {TimeoutError} If spawn times out
   */
  spawn(config: SpawnConfig): Promise<AgentRuntime>;

  /**
   * Terminate a running runtime
   * @param runtimeId - ID of the runtime to terminate
   * @param force - Whether to force termination even with uncommitted changes (worktree only)
   * @returns Promise resolving when termination is complete
   * @throws {NotFoundError} If runtime not found
   * @throws {TimeoutError} If termination times out
   */
  terminate(runtimeId: string, force?: boolean): Promise<void>;

  /**
   * Get current status of a runtime
   * @param runtimeId - Runtime ID
   * @returns Promise resolving to runtime status
   * @throws {NotFoundError} If runtime not found
   */
  getStatus(runtimeId: string): Promise<RuntimeStatus>;

  /**
   * List all runtimes with optional filtering
   * @param filters - Optional filters
   * @returns Promise resolving to array of AgentRuntime
   */
  listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]>;

  // ═════════════════════════════════════════════════════════════════════════════
  // Execution
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Execute a command in a runtime
   * @param runtimeId - Runtime ID
   * @param command - Command to execute
   * @param options - Execution options
   * @returns Promise resolving to execution result
   * @throws {NotFoundError} If runtime not found
   * @throws {ExecutionError} If command execution fails
   * @throws {TimeoutError} If execution times out
   */
  execute(runtimeId: string, command: string, options?: ExecutionOptions): Promise<ExecutionResult>;

  /**
   * Execute a command with streaming output
   * @param runtimeId - Runtime ID
   * @param command - Command to execute
   * @returns Async iterable of execution output chunks
   * @throws {NotFoundError} If runtime not found
   */
  executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput>;

  /**
   * Execute a command with interactive input
   * @param runtimeId - Runtime ID
   * @param command - Command to execute
   * @param stdin - Readable stream for input
   * @returns Promise resolving to execution result
   * @throws {NotFoundError} If runtime not found
   * @throws {ExecutionError} If command execution fails
   */
  executeInteractive(runtimeId: string, command: string, stdin: ReadableStream): Promise<ExecutionResult>;

  // ═════════════════════════════════════════════════════════════════════════════
  // File Operations
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Read a file from the runtime
   * @param runtimeId - Runtime ID
   * @param path - File path in the runtime
   * @returns Promise resolving to file contents as Buffer
   * @throws {NotFoundError} If runtime or file not found
   */
  readFile(runtimeId: string, path: string): Promise<Buffer>;

  /**
   * Write a file to the runtime
   * @param runtimeId - Runtime ID
   * @param path - File path in the runtime
   * @param data - File contents as Buffer
   * @returns Promise resolving when write is complete
   * @throws {NotFoundError} If runtime not found
   * @throws {ResourceExhaustedError} If disk space exhausted
   */
  writeFile(runtimeId: string, path: string, data: Buffer): Promise<void>;

  /**
   * Upload a directory to the runtime
   * @param runtimeId - Runtime ID
   * @param localPath - Local directory path
   * @param remotePath - Destination path in runtime
   * @returns Promise resolving when upload is complete
   * @throws {NotFoundError} If runtime not found or local path not found
   * @throws {ResourceExhaustedError} If disk space exhausted
   */
  uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void>;

  /**
   * Download a directory from the runtime
   * @param runtimeId - Runtime ID
   * @param remotePath - Source path in runtime
   * @param localPath - Local destination path
   * @returns Promise resolving when download is complete
   * @throws {NotFoundError} If runtime or remote path not found
   */
  downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void>;

  // ═════════════════════════════════════════════════════════════════════════════
  // State Management
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Create a snapshot of runtime state
   * @param runtimeId - Runtime ID
   * @param metadata - Optional snapshot metadata
   * @returns Promise resolving to created Snapshot
   * @throws {NotFoundError} If runtime not found
   * @throws {ResourceExhaustedError} If storage exhausted
   */
  snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot>;

  /**
   * Restore a runtime from a snapshot
   * @param snapshotId - Snapshot ID to restore from
   * @returns Promise resolving to restored AgentRuntime
   * @throws {NotFoundError} If snapshot not found
   * @throws {SpawnError} If restore fails
   */
  restore(snapshotId: string): Promise<AgentRuntime>;

  /**
   * List snapshots for a runtime or all snapshots
   * @param runtimeId - Optional runtime ID filter
   * @returns Promise resolving to array of Snapshots
   */
  listSnapshots(runtimeId?: string): Promise<Snapshot[]>;

  /**
   * Delete a snapshot
   * @param snapshotId - Snapshot ID to delete
   * @returns Promise resolving when deletion is complete
   * @throws {NotFoundError} If snapshot not found
   */
  deleteSnapshot(snapshotId: string): Promise<void>;

  // ═════════════════════════════════════════════════════════════════════════════
  // Events
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to runtime events
   * @param event - Event type to subscribe to
   * @param handler - Event handler function
   */
  on(event: RuntimeEvent, handler: EventHandler): void;

  /**
   * Unsubscribe from runtime events
   * @param event - Event type to unsubscribe from
   * @param handler - Event handler function to remove
   */
  off(event: RuntimeEvent, handler: EventHandler): void;

  /**
   * Wait for a runtime to reach a specific state
   * @param runtimeId - Runtime ID
   * @param state - Target state to wait for
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise resolving to true if state reached, false if timed out
   * @throws {NotFoundError} If runtime not found
   */
  waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean>;
}

export default RuntimeProvider;

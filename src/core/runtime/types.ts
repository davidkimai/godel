/**
 * ExecutionContext Types
 * 
 * Core type definitions for the Godel RuntimeProvider abstraction.
 * Supports Worktree, Kata, and E2B runtime environments.
 * 
 * @see SPEC-002 Section 3.2
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for spawning a new runtime instance
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
  /** Labels for organization */
  labels?: Record<string, string>;
  /** Spawn timeout in seconds */
  timeout?: number;
}

/**
 * Resource limits for a runtime instance
 */
export interface ResourceLimits {
  /** CPU cores (fractional allowed: 0.5, 1.5, etc.) */
  cpu: number;
  /** Memory limit (e.g., "512Mi", "2Gi") */
  memory: string;
  /** Disk limit (e.g., "10Gi") */
  disk?: string;
  /** Max concurrent agents (for quota) */
  agents?: number;
}

/**
 * Network configuration for a runtime
 */
export interface NetworkConfig {
  /** Network mode */
  mode: NetworkMode;
  /** Network policies to apply */
  policies?: NetworkPolicy[];
  /** DNS servers to use */
  dns?: string[];
}

/**
 * Network mode options
 */
export type NetworkMode = 'bridge' | 'host' | 'none';

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
 * Volume mount specification
 */
export interface VolumeMount {
  /** Volume name */
  name: string;
  /** Source path (host or PVC name) */
  source: string;
  /** Destination path in container */
  destination: string;
  /** Whether mount is read-only */
  readOnly?: boolean;
}

/**
 * Filters for listing runtimes
 */
export interface RuntimeFilters {
  /** Filter by runtime type */
  runtime?: RuntimeType | RuntimeType[];
  /** Filter by runtime state */
  state?: RuntimeState | RuntimeState[];
  /** Filter by labels (key=value pairs) */
  labels?: Record<string, string>;
  /** Filter by creation time range */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Filter by agent ID */
  agentId?: string;
}

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * Runtime type options
 */
export type RuntimeType = 'worktree' | 'kata' | 'e2b';

/**
 * Runtime state options
 */
export type RuntimeState = 
  | 'pending' 
  | 'creating' 
  | 'running' 
  | 'paused' 
  | 'terminating' 
  | 'terminated' 
  | 'error';

/**
 * Runtime metadata
 */
export interface RuntimeMetadata {
  /** Runtime version */
  version?: string;
  /** Runtime image */
  image?: string;
  /** Kubernetes namespace (for Kata) */
  namespace?: string;
  /** Pod name (for Kata) */
  podName?: string;
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Agent runtime instance
 */
export interface AgentRuntime {
  /** Unique runtime identifier */
  id: string;
  /** Runtime type */
  runtime: RuntimeType;
  /** Current state */
  state: RuntimeState;
  /** Resource usage statistics */
  resources: ResourceUsage;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** Runtime metadata */
  metadata: RuntimeMetadata;
  /** Associated agent ID */
  agentId?: string;
  /** Associated team ID */
  teamId?: string;
}

// ============================================================================
// Resource Types
// ============================================================================

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
  /** GPU usage (if applicable) */
  gpu?: GpuStats;
}

/**
 * Network statistics
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
  /** Receive errors */
  rxErrors?: number;
  /** Transmit errors */
  txErrors?: number;
  /** Receive dropped packets */
  rxDropped?: number;
  /** Transmit dropped packets */
  txDropped?: number;
}

/**
 * GPU statistics
 */
export interface GpuStats {
  /** GPU utilization percentage */
  utilization: number;
  /** GPU memory usage in bytes */
  memory: number;
  /** GPU memory total in bytes */
  memoryTotal: number;
  /** GPU temperature in Celsius */
  temperature?: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Options for command execution
 */
export interface ExecutionOptions {
  /** Execution timeout in seconds */
  timeout?: number;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory for execution */
  cwd?: string;
  /** User to run as */
  user?: string;
  /** Whether to capture stdout */
  captureStdout?: boolean;
  /** Whether to capture stderr */
  captureStderr?: boolean;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Execution metadata */
  metadata: ExecutionMetadata;
  /** Execution ID for tracking */
  executionId?: string;
}

/**
 * Execution output chunk (for streaming)
 */
export interface ExecutionOutput {
  /** Output type */
  type: 'stdout' | 'stderr' | 'exit';
  /** Output data */
  data: string;
  /** Timestamp */
  timestamp: Date;
  /** Sequence number for ordering */
  sequence?: number;
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
  /** Additional metadata */
  [key: string]: unknown;
}

// ============================================================================
// Snapshot Types
// ============================================================================

/**
 * Runtime snapshot
 */
export interface Snapshot {
  /** Snapshot ID */
  id: string;
  /** Runtime ID this snapshot was created from */
  runtimeId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Snapshot size in bytes */
  size: number;
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
  /** Parent snapshot ID (for incremental snapshots) */
  parentId?: string;
  /** Storage location */
  storageLocation?: string;
}

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
  /** Snapshot name */
  name?: string;
  /** Snapshot description */
  description?: string;
  /** Labels for organization */
  labels?: Record<string, string>;
  /** Snapshot tags */
  tags?: string[];
  /** Creator information */
  createdBy?: string;
  /** Expiration date */
  expiresAt?: Date;
  /** Additional metadata */
  [key: string]: unknown;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Runtime event types
 */
export type RuntimeEvent = 
  | 'stateChange' 
  | 'error' 
  | 'resourceWarning' 
  | 'healthCheck'
  | 'executionStart'
  | 'executionEnd';

/**
 * Event data structure
 */
export interface EventData {
  /** Event timestamp */
  timestamp: Date;
  /** Runtime ID */
  runtimeId: string;
  /** Event type */
  event: RuntimeEvent;
  /** Previous state (for stateChange events) */
  previousState?: RuntimeState;
  /** Current state (for stateChange events) */
  currentState?: RuntimeState;
  /** Error information (for error events) */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  /** Resource usage (for resourceWarning events) */
  resourceUsage?: ResourceUsage;
  /** Resource limits exceeded */
  resourceLimits?: ResourceLimits;
  /** Health check result */
  healthy?: boolean;
  /** Additional event data */
  [key: string]: unknown;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: RuntimeEvent, data: EventData) => void;

/**
 * Event subscription options
 */
export interface EventSubscriptionOptions {
  /** Filter by event types */
  events?: RuntimeEvent[];
  /** Filter by runtime IDs */
  runtimeIds?: string[];
  /** Include past events */
  includeHistory?: boolean;
  /** Maximum number of historical events */
  historyLimit?: number;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Runtime status information
 */
export interface RuntimeStatus {
  /** Runtime ID */
  runtimeId: string;
  /** Current state */
  state: RuntimeState;
  /** Resource usage */
  resources: ResourceUsage;
  /** Health status */
  healthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck?: Date;
  /** Error information (if in error state) */
  error?: {
    code: string;
    message: string;
  };
  /** Pending operations */
  pendingOperations?: string[];
}

/**
 * Runtime metrics
 */
export interface RuntimeMetrics {
  /** Runtime ID */
  runtimeId: string;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
  /** Disk usage percentage (0-100) */
  diskPercent: number;
  /** Network I/O rates */
  networkRxRate: number;
  networkTxRate: number;
  /** Uptime in seconds */
  uptime: number;
  /** Boot duration in milliseconds */
  bootDuration?: number;
  /** Last updated timestamp */
  timestamp: Date;
}

// ============================================================================
// Provider Types
// ============================================================================

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

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base runtime error codes
 */
export type RuntimeErrorCode =
  | 'SPAWN_ERROR'
  | 'EXECUTION_ERROR'
  | 'RESOURCE_EXHAUSTED'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_STATE'
  | 'NETWORK_ERROR'
  | 'STORAGE_ERROR'
  | 'PERMISSION_DENIED'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Error context for debugging
 */
export interface ErrorContext {
  /** Runtime ID (if applicable) */
  runtimeId?: string;
  /** Execution ID (if applicable) */
  executionId?: string;
  /** Operation being performed */
  operation?: string;
  /** Additional context data */
  [key: string]: unknown;
}

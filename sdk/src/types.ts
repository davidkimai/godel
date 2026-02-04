/**
 * @dash/client SDK - Type Definitions
 * 
 * Comprehensive TypeScript type definitions for the Dash API.
 */

// ============================================================================
// Common Types
// ============================================================================

/**
 * Standard pagination parameters for list endpoints
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Generic paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Items in current page */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page number */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
  /** Cursor for next page (if cursor-based) */
  nextCursor?: string;
  /** Cursor for previous page (if cursor-based) */
  prevCursor?: string;
  /** Whether there are more pages */
  hasMore: boolean;
}

/**
 * Generic metadata object for extensibility
 */
export interface Metadata {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Mixin for timestamped entities
 */
export interface Timestamped {
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

// ============================================================================
// Swarm Types
// ============================================================================

/**
 * Possible states for a swarm
 */
export type SwarmStatus = 
  | 'pending'
  | 'provisioning'
  | 'running'
  | 'scaling'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'destroyed';

/**
 * Scaling policy configuration for auto-scaling
 */
export interface SwarmScalingPolicy {
  /** Minimum number of agents */
  minAgents: number;
  /** Maximum number of agents */
  maxAgents: number;
  /** Target CPU utilization percentage (0-100) */
  targetCpuUtilization?: number;
  /** Target memory utilization percentage (0-100) */
  targetMemoryUtilization?: number;
  /** Scale up cooldown in seconds */
  scaleUpCooldown?: number;
  /** Scale down cooldown in seconds */
  scaleDownCooldown?: number;
  /** Metrics window in seconds for scaling decisions */
  metricsWindow?: number;
}

/**
 * Runtime metrics for a swarm
 */
export interface SwarmMetrics {
  /** Total number of agents in the swarm */
  totalAgents: number;
  /** Number of agents currently running */
  runningAgents: number;
  /** Number of agents in error state */
  errorAgents: number;
  /** Average CPU utilization across all agents */
  avgCpuUtilization: number;
  /** Average memory utilization across all agents */
  avgMemoryUtilization: number;
  /** Total tasks processed */
  totalTasksProcessed: number;
  /** Tasks processed per second */
  tasksPerSecond: number;
  /** Average task latency in milliseconds */
  avgTaskLatencyMs: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Timestamp of last metrics update */
  lastUpdated: string;
}

/**
 * Configuration for a new or existing swarm
 */
export interface SwarmConfig {
  /** Agent image/container to use */
  agentImage: string;
  /** Agent version/tag */
  agentVersion?: string;
  /** Environment variables for agents */
  env?: Record<string, string>;
  /** Resource limits per agent */
  resources?: {
    cpu?: string;
    memory?: string;
    gpu?: string;
  };
  /** Scaling policy configuration */
  scalingPolicy?: SwarmScalingPolicy;
  /** Network configuration */
  network?: {
    port?: number;
    protocol?: 'http' | 'https' | 'tcp' | 'grpc';
    ingressEnabled?: boolean;
  };
  /** Health check configuration */
  healthCheck?: {
    path?: string;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  /** Additional metadata */
  metadata?: Metadata;
}

/**
 * Swarm entity representing a managed group of agents
 */
export interface Swarm extends Timestamped {
  /** Unique swarm identifier */
  id: string;
  /** Human-readable swarm name */
  name: string;
  /** Optional description */
  description?: string;
  /** Current swarm status */
  status: SwarmStatus;
  /** Swarm configuration */
  config: SwarmConfig;
  /** Current swarm metrics */
  metrics: SwarmMetrics;
  /** Associated agent IDs */
  agentIds: string[];
  /** Region/zone where swarm is deployed */
  region?: string;
  /** Tags for organization */
  tags?: string[];
  /** Owner/user ID */
  ownerId: string;
  /** Organization ID */
  organizationId?: string;
}

/**
 * Request body for creating a new swarm
 */
export interface CreateSwarmRequest {
  /** Swarm name (required) */
  name: string;
  /** Optional description */
  description?: string;
  /** Swarm configuration (required) */
  config: SwarmConfig;
  /** Initial number of agents */
  initialAgentCount?: number;
  /** Region for deployment */
  region?: string;
  /** Tags for organization */
  tags?: string[];
  /** Organization ID */
  organizationId?: string;
}

/**
 * Request body for updating a swarm
 */
export interface UpdateSwarmRequest {
  /** New name */
  name?: string;
  /** New description */
  description?: string;
  /** Updated configuration */
  config?: Partial<SwarmConfig>;
  /** Updated tags */
  tags?: string[];
}

/**
 * Request body for scaling a swarm
 */
export interface ScaleSwarmRequest {
  /** Target number of agents */
  targetAgentCount: number;
  /** Whether to wait for scaling to complete */
  wait?: boolean;
  /** Timeout in seconds */
  timeout?: number;
}

/**
 * Response for swarm list endpoint
 */
export type SwarmListResponse = PaginatedResponse<Swarm>;

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Possible states for an agent
 */
export type AgentStatus =
  | 'pending'
  | 'provisioning'
  | 'starting'
  | 'idle'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'crashed'
  | 'destroyed';

/**
 * Agent capabilities and features
 */
export interface AgentCapabilities {
  /** Can execute code */
  canExecute?: boolean;
  /** Can access filesystem */
  canAccessFilesystem?: boolean;
  /** Can make network requests */
  canMakeNetworkRequests?: boolean;
  /** Can access GPU */
  canUseGpu?: boolean;
  /** Supported programming languages */
  supportedLanguages?: string[];
  /** Maximum file size agent can handle */
  maxFileSize?: number;
  /** Custom capability flags */
  [key: string]: boolean | string[] | number | undefined;
}

/**
 * Runtime metrics for an agent
 */
export interface AgentMetrics {
  /** CPU utilization percentage (0-100) */
  cpuUtilization: number;
  /** Memory utilization percentage (0-100) */
  memoryUtilization: number;
  /** Memory usage in bytes */
  memoryUsageBytes: number;
  /** Total tasks processed */
  tasksProcessed: number;
  /** Tasks currently in queue */
  tasksInQueue: number;
  /** Average task processing time in milliseconds */
  avgTaskTimeMs: number;
  /** Timestamp of last heartbeat */
  lastHeartbeat: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Configuration for a new or existing agent
 */
export interface AgentConfig {
  /** Agent image/container */
  image: string;
  /** Agent version/tag */
  version?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Resource limits */
  resources?: {
    cpu?: string;
    memory?: string;
    gpu?: string;
  };
  /** Capability configuration */
  capabilities?: AgentCapabilities;
  /** Command to run on start */
  command?: string[];
  /** Arguments to pass to command */
  args?: string[];
  /** Working directory */
  workingDir?: string;
  /** Volumes to mount */
  volumes?: Array<{
    source: string;
    target: string;
    readOnly?: boolean;
  }>;
  /** Additional metadata */
  metadata?: Metadata;
}

/**
 * Agent entity representing a single worker
 */
export interface Agent extends Timestamped {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Current agent status */
  status: AgentStatus;
  /** Agent configuration */
  config: AgentConfig;
  /** Current agent metrics */
  metrics: AgentMetrics;
  /** Network endpoint */
  endpoint?: string;
  /** Internal IP address */
  internalIp?: string;
  /** Tags for organization */
  tags?: string[];
  /** Owner/user ID */
  ownerId: string;
}

/**
 * Agent log entry
 */
export interface AgentLog {
  /** Log timestamp */
  timestamp: string;
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Log message */
  message: string;
  /** Source component */
  source?: string;
  /** Additional structured data */
  metadata?: Metadata;
}

/**
 * Possible task states
 */
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Task result data
 */
export interface TaskResult {
  /** Whether task succeeded */
  success: boolean;
  /** Result data (if successful) */
  data?: unknown;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  /** Exit code (if applicable) */
  exitCode?: number;
  /** Output artifacts */
  artifacts?: Array<{
    name: string;
    url: string;
    size: number;
    contentType: string;
  }>;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Configuration for a task
 */
export interface TaskConfig {
  /** Task type/purpose */
  type: string;
  /** Task payload/data */
  payload: unknown;
  /** Timeout in seconds */
  timeout?: number;
  /** Priority (1-10, higher = more urgent) */
  priority?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Dependencies that must complete first */
  dependencies?: string[];
  /** Callback URL for completion notification */
  callbackUrl?: string;
  /** Additional metadata */
  metadata?: Metadata;
}

/**
 * Task entity
 */
export interface Task extends Timestamped {
  /** Unique task identifier */
  id: string;
  /** Human-readable task name */
  name?: string;
  /** Task configuration */
  config: TaskConfig;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent ID */
  assignedAgentId?: string;
  /** Task result (when completed) */
  result?: TaskResult;
  /** When task was started */
  startedAt?: string;
  /** When task was completed */
  completedAt?: string;
  /** Owner/user ID */
  ownerId: string;
}

/**
 * Request to spawn a new agent
 */
export interface SpawnAgentRequest {
  /** Optional custom name */
  name?: string;
  /** Agent configuration (required) */
  config: AgentConfig;
  /** Target swarm ID (optional, will create standalone agent if omitted) */
  swarmId?: string;
  /** Tags */
  tags?: string[];
  /** Whether to wait for agent to be ready */
  wait?: boolean;
  /** Timeout in seconds */
  timeout?: number;
}

/**
 * Request to assign a task to an agent
 */
export interface AssignTaskRequest {
  /** Task configuration (required) */
  config: TaskConfig;
  /** Target agent ID (optional, will auto-assign if omitted) */
  agentId?: string;
  /** Target swarm ID for auto-assignment */
  swarmId?: string;
  /** Whether to wait for task completion */
  wait?: boolean;
  /** Timeout in seconds */
  timeout?: number;
}

/**
 * Response for agent list endpoint
 */
export type AgentListResponse = PaginatedResponse<Agent>;

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event type categories
 */
export type EventType =
  | 'swarm.created'
  | 'swarm.updated'
  | 'swarm.deleted'
  | 'swarm.scaled'
  | 'swarm.error'
  | 'agent.spawned'
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.crashed'
  | 'agent.error'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'system.maintenance'
  | 'system.alert'
  | 'user.action';

/**
 * Event severity levels
 */
export type EventSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * Event entity
 */
export interface Event extends Timestamped {
  /** Unique event identifier */
  id: string;
  /** Event type */
  type: EventType;
  /** Event severity */
  severity: EventSeverity;
  /** Event title/message */
  title: string;
  /** Detailed description */
  description?: string;
  /** Source entity type */
  sourceType?: 'swarm' | 'agent' | 'task' | 'system';
  /** Source entity ID */
  sourceId?: string;
  /** Related entity IDs */
  relatedIds?: string[];
  /** Event payload data */
  payload?: unknown;
  /** Region where event occurred */
  region?: string;
  /** User who triggered the event (if applicable) */
  userId?: string;
  /** Organization ID */
  organizationId?: string;
  /** Whether event has been acknowledged */
  acknowledged: boolean;
  /** When event was acknowledged */
  acknowledgedAt?: string;
  /** User who acknowledged */
  acknowledgedBy?: string;
}

/**
 * Filter parameters for event queries
 */
export interface EventFilter {
  /** Filter by event types */
  types?: EventType[];
  /** Filter by severity */
  severities?: EventSeverity[];
  /** Filter by source type */
  sourceType?: 'swarm' | 'agent' | 'task' | 'system';
  /** Filter by source ID */
  sourceId?: string;
  /** Filter by time range start */
  startTime?: string;
  /** Filter by time range end */
  endTime?: string;
  /** Filter by acknowledged status */
  acknowledged?: boolean;
  /** Filter by organization */
  organizationId?: string;
  /** Search query string */
  query?: string;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  /** Subscription ID */
  id: string;
  /** Subscription name */
  name: string;
  /** Filter criteria */
  filter: EventFilter;
  /** Webhook URL for event delivery */
  webhookUrl?: string;
  /** Whether to include full event payload */
  includePayload?: boolean;
  /** Created timestamp */
  createdAt: string;
  /** Whether subscription is active */
  active: boolean;
}

/**
 * Response for event list endpoint
 */
export type EventListResponse = PaginatedResponse<Event>;

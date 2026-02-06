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

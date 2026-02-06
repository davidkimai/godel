/**
 * Federation Types - OpenClaw Instance Federation Architecture
 * 
 * This module defines the core types for managing a federation of 10-50+ OpenClaw instances.
 * Supports distributed routing, health monitoring, and capacity management across regions.
 * 
 * @module federation/types
 */

// ============================================================================
// HEALTH STATUS
// ============================================================================

/**
 * Health status of an OpenClaw instance
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Result of a health check probe
 */
export interface ProbeResult {
  /** Whether the probe succeeded */
  success: boolean;
  /** HTTP status code or error code */
  statusCode: number;
  /** Response latency in milliseconds */
  latency: number;
  /** Error message if probe failed */
  error?: string;
  /** Response body data */
  data?: Record<string, unknown>;
  /** Timestamp of the probe */
  timestamp: Date;
}

// ============================================================================
// INSTANCE DEFINITION
// ============================================================================

/**
 * OpenClaw Instance - Represents a single node in the federation
 * 
 * An instance is an OpenClaw server that can accept and execute agent tasks.
 * Instances are distributed across regions and zones for high availability.
 */
export interface OpenClawInstance {
  /** Unique identifier for this instance */
  id: string;
  
  /** Base URL endpoint (e.g., https://instance-1.openclaw.io) */
  endpoint: string;
  
  /** Geographic region (e.g., 'us-east-1', 'eu-west-1') */
  region?: string;
  
  /** Availability zone within region */
  zone?: string;
  
  /** Software version running on this instance */
  version?: string;
  
  /** Capabilities this instance supports (e.g., 'gpu', 'large-model', 'vision') */
  capabilities: string[];
  
  // Health and Load
  
  /** Current health status of the instance */
  healthStatus: HealthStatus;
  
  /** Number of active sessions currently running */
  currentSessions: number;
  
  /** Maximum number of sessions this instance can handle */
  maxSessions: number;
  
  /** Current CPU utilization percentage (0-100) */
  cpuPercent?: number;
  
  /** Current memory utilization percentage (0-100) */
  memoryPercent?: number;
  
  // Routing
  
  /** Weight for weighted routing (higher = more traffic) */
  routingWeight: number;
  
  /** Whether this instance is active and available for routing */
  isActive: boolean;
  
  // Timestamps
  
  /** When the last health check was performed */
  lastHealthCheck?: Date;
  
  /** When this instance was first registered */
  createdAt: Date;
  
  /** When this instance was last updated */
  updatedAt: Date;
}

/**
 * Input type for registering a new instance
 * Omits auto-generated fields
 */
export interface OpenClawInstanceInput {
  endpoint: string;
  region?: string;
  zone?: string;
  version?: string;
  capabilities?: string[];
  maxSessions: number;
  routingWeight?: number;
}

// ============================================================================
// REGISTRY CONFIGURATION
// ============================================================================

/**
 * Available routing strategies for the federation
 */
export type RoutingStrategyType = 
  | 'least-loaded'      // Route to instance with lowest utilization
  | 'round-robin'       // Cycle through instances sequentially
  | 'session-affinity'  // Prefer same instance for same session
  | 'capability-match'  // Match required capabilities
  | 'weighted';         // Use routing weights

/**
 * Configuration for the federation registry
 */
export interface FederationRegistryConfig {
  /** Health check interval in milliseconds (default: 30000) */
  healthCheckInterval: number;
  
  /** Health check timeout in milliseconds (default: 5000) */
  healthCheckTimeout: number;
  
  /** Number of consecutive failures before marking unhealthy (default: 3) */
  unhealthyThreshold: number;
  
  /** Auto-remove instances after being unhealthy for this many ms (default: null = never) */
  autoRemoveAfterMs?: number;
  
  /** Default routing strategy when none specified */
  defaultRoutingStrategy: RoutingStrategyType;
  
  /** Backpressure threshold - reject new sessions when utilization exceeds this (default: 0.95) */
  backpressureThreshold?: number;
  
  /** Warning threshold for high utilization (default: 0.90) */
  warningThreshold?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_REGISTRY_CONFIG: FederationRegistryConfig = {
  healthCheckInterval: 30000,
  healthCheckTimeout: 5000,
  unhealthyThreshold: 3,
  autoRemoveAfterMs: undefined,
  defaultRoutingStrategy: 'least-loaded',
  backpressureThreshold: 0.95,
  warningThreshold: 0.90,
};

// ============================================================================
// ROUTING CONTEXT
// ============================================================================

/**
 * Context for routing decisions
 * Provides hints and constraints for instance selection
 */
export interface RoutingContext {
  /** Optional tenant ID for multi-tenant isolation */
  tenantId?: string;
  
  /** Session ID for session affinity (prefer same instance) */
  sessionAffinity?: string;
  
  /** Required capabilities that the instance must support */
  requiredCapabilities?: string[];
  
  /** Preferred region for latency optimization */
  preferredRegion?: string;
  
  /** Instance IDs to exclude from selection */
  excludeInstances?: string[];
  
  /** Preferred routing strategy override */
  strategy?: RoutingStrategyType;
  
  /** Minimum capacity required (in sessions) */
  minCapacity?: number;
}

/**
 * Result of an instance selection operation
 */
export interface InstanceSelection {
  /** The selected instance */
  instance: OpenClawInstance;
  
  /** Human-readable reason for selection */
  reason: string;
  
  /** Alternative instances that could have been selected */
  alternatives: OpenClawInstance[];
  
  /** Routing strategy used for this selection */
  strategy: RoutingStrategyType;
  
  /** Latency of the selection decision in milliseconds */
  decisionLatencyMs: number;
}

// ============================================================================
// CAPACITY REPORTING
// ============================================================================

/**
 * Capacity information for a specific region
 */
export interface RegionCapacity {
  /** Total number of instances in this region */
  instances: number;
  
  /** Number of healthy instances */
  healthy: number;
  
  /** Total session capacity */
  capacity: number;
  
  /** Available session slots */
  available: number;
  
  /** Average utilization percentage */
  utilizationPercent: number;
}

/**
 * Comprehensive capacity report across the federation
 */
export interface FederationCapacityReport {
  /** Total number of registered instances */
  totalInstances: number;
  
  /** Number of healthy instances */
  healthyInstances: number;
  
  /** Total session capacity across all instances */
  totalCapacity: number;
  
  /** Available session slots */
  availableCapacity: number;
  
  /** Overall utilization percentage */
  utilizationPercent: number;
  
  /** Capacity breakdown by region */
  byRegion: Record<string, RegionCapacity>;
  
  /** Timestamp of the report */
  generatedAt: Date;
}

// ============================================================================
// HEALTH MONITORING
// ============================================================================

/**
 * Result of a health check operation
 */
export interface HealthCheckResult {
  /** Instance ID that was checked */
  instanceId: string;
  
  /** Determined health status */
  status: HealthStatus;
  
  /** Response latency in milliseconds */
  latency: number;
  
  /** Error message if check failed */
  error?: string;
  
  /** Detailed metrics from the instance */
  details?: {
    cpu?: number;
    memory?: number;
    activeSessions?: number;
    version?: string;
    uptime?: number;
  };
  
  /** When the check was performed */
  timestamp: Date;
}

/**
 * History of health checks for trend analysis
 */
export interface HealthCheckHistory {
  instanceId: string;
  checks: HealthCheckResult[];
  failureCount: number;
  lastSuccess?: Date;
  lastFailure?: Date;
}

/**
 * Events emitted by the HealthMonitor
 */
export interface HealthMonitorEvents {
  /** Emitted when an instance health check completes */
  'health.checked': { 
    instanceId: string; 
    status: HealthStatus; 
    latency: number;
    timestamp: Date;
  };
  
  /** Emitted when instance health degrades */
  'health.degraded': { 
    instanceId: string; 
    previousStatus: HealthStatus;
    latency: number;
    error?: string;
    timestamp: Date;
  };
  
  /** Emitted when instance becomes unhealthy */
  'health.unhealthy': { 
    instanceId: string; 
    previousStatus: HealthStatus;
    error: string;
    consecutiveFailures: number;
    timestamp: Date;
  };
  
  /** Emitted when instance recovers to healthy */
  'health.recovered': { 
    instanceId: string; 
    latency: number;
    timestamp: Date;
  };
  
  /** Emitted when health check cycle completes */
  'cycle.completed': {
    checked: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    totalLatency: number;
    timestamp: Date;
  };
}

// ============================================================================
// BACKPRESSURE
// ============================================================================

/**
 * Backpressure status for the federation
 */
export interface BackpressureStatus {
  /** Whether new sessions should be rejected */
  shouldReject: boolean;
  
  /** Current utilization percentage (0-100) */
  currentUtilization: number;
  
  /** Threshold that triggered backpressure */
  threshold: number;
  
  /** Human-readable message explaining the status */
  message: string;
  
  /** Recommended action for callers */
  recommendedAction?: 'queue' | 'reject' | 'scale' | 'ok';
  
  /** Estimated wait time in seconds if queuing is recommended */
  estimatedWaitSeconds?: number;
}

// ============================================================================
// STORAGE ADAPTER
// ============================================================================

/**
 * Storage adapter interface for persisting instance data
 * Implementations can use PostgreSQL, Redis, or other backends
 */
export interface StorageAdapter {
  /** Save an instance to storage */
  save(instance: OpenClawInstance): Promise<void>;
  
  /** Find an instance by ID */
  findById(id: string): Promise<OpenClawInstance | null>;
  
  /** Find an instance by endpoint */
  findByEndpoint(endpoint: string): Promise<OpenClawInstance | null>;
  
  /** List all instances */
  list(): Promise<OpenClawInstance[]>;
  
  /** Delete an instance */
  delete(id: string): Promise<boolean>;
  
  /** Update an instance */
  update(id: string, updates: Partial<OpenClawInstance>): Promise<void>;
  
  /** Find instances by region */
  findByRegion(region: string): Promise<OpenClawInstance[]>;
  
  /** Find instances by capability */
  findByCapability(capability: string): Promise<OpenClawInstance[]>;
  
  /** Get healthy instances */
  getHealthy(): Promise<OpenClawInstance[]>;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Events emitted by the FederationRegistry
 */
export interface FederationRegistryEvents {
  /** Emitted when a new instance is registered */
  'instance.registered': { instance: OpenClawInstance; timestamp: Date };
  
  /** Emitted when an instance is unregistered */
  'instance.unregistered': { instanceId: string; timestamp: Date };
  
  /** Emitted when instance health changes */
  'instance.health_changed': { 
    instance: OpenClawInstance; 
    previousStatus: HealthStatus; 
    newStatus: HealthStatus;
    timestamp: Date;
  };
  
  /** Emitted when an instance is updated */
  'instance.updated': { instance: OpenClawInstance; changes: string[]; timestamp: Date };
  
  /** Emitted when capacity changes significantly */
  'capacity.changed': { 
    previousCapacity: number; 
    newCapacity: number; 
    reason: string;
    timestamp: Date;
  };
  
  /** Emitted when backpressure state changes */
  'backpressure.activated': { utilization: number; threshold: number; timestamp: Date };
  
  /** Emitted when backpressure is relieved */
  'backpressure.relieved': { utilization: number; timestamp: Date };
  
  /** Emitted on health check cycle completion */
  'health.check_completed': { 
    checked: number; 
    healthy: number; 
    degraded: number; 
    unhealthy: number;
    duration: number;
    timestamp: Date;
  };
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Error thrown when no suitable instance can be found for routing
 */
export class NoAvailableInstanceError extends Error {
  constructor(context: RoutingContext) {
    const details = Object.entries(context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
      .join(', ');
    super(`No available instance for routing context: ${details}`);
    this.name = 'NoAvailableInstanceError';
  }
}

/**
 * Error thrown when the federation is at capacity
 */
export class FederationCapacityError extends Error {
  utilization: number;
  threshold: number;
  
  constructor(utilization: number, threshold: number) {
    super(`Federation at capacity: ${(utilization * 100).toFixed(1)}% utilized (threshold: ${(threshold * 100).toFixed(1)}%)`);
    this.name = 'FederationCapacityError';
    this.utilization = utilization;
    this.threshold = threshold;
  }
}

/**
 * Error thrown when an instance is not found
 */
export class InstanceNotFoundError extends Error {
  instanceId: string;
  
  constructor(instanceId: string) {
    super(`Instance not found: ${instanceId}`);
    this.name = 'InstanceNotFoundError';
    this.instanceId = instanceId;
  }
}

/**
 * Error thrown when instance registration fails
 */
export class InstanceRegistrationError extends Error {
  cause?: Error;
  
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'InstanceRegistrationError';
    this.cause = cause;
  }
}

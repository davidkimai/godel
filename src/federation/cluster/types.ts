/**
 * Cluster Federation Types - Core type definitions for multi-region federation
 * 
 * These types define the data models for cluster management, inter-cluster
 * communication, and transparent agent proxying across regions.
 * 
 * @module federation/cluster/types
 */

// ============================================================================
// Cluster Types
// ============================================================================

/**
 * Cluster status values
 */
export type ClusterStatus = 'active' | 'degraded' | 'offline' | 'maintenance';

/**
 * Geographic region identifier
 */
export type Region = 
  | 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'eu-west-1' | 'eu-west-2' | 'eu-west-3' | 'eu-central-1'
  | 'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1'
  | 'ap-south-1' | 'sa-east-1' | 'ca-central-1'
  | 'local' | 'unknown';

/**
 * Cluster capabilities for workload matching
 */
export interface ClusterCapabilities {
  /** Maximum number of agents the cluster can run */
  maxAgents: number;
  /** Currently available agent slots */
  availableAgents: number;
  /** Currently active agents */
  activeAgents: number;
  /** Whether GPU support is available */
  gpuEnabled: boolean;
  /** Available GPU types (e.g., 'nvidia-a100', 'nvidia-h100') */
  gpuTypes: string[];
  /** Cost per hour in USD */
  costPerHour: number;
  /** Round-trip latency in milliseconds */
  latency: number;
  /** Additional capability flags */
  flags: Record<string, boolean>;
}

/**
 * Cluster metadata for management and identification
 */
export interface ClusterMetadata {
  /** Cluster version */
  version: string;
  /** Kubernetes context (if applicable) */
  k8sContext?: string;
  /** Cloud provider (aws, gcp, azure, local) */
  provider: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Custom tags for organization */
  tags: string[];
  /** Contact information for ops team */
  contact?: string;
  /** Notes about the cluster */
  notes?: string;
}

/**
 * Cluster information for registry
 */
export interface Cluster {
  /** Unique cluster identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** gRPC/WebSocket endpoint for communication */
  endpoint: string;
  /** Geographic region */
  region: Region;
  /** Current operational status */
  status: ClusterStatus;
  /** Cluster capabilities */
  capabilities: ClusterCapabilities;
  /** Cluster metadata */
  metadata: ClusterMetadata;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
  /** When the cluster was registered */
  registeredAt: number;
  /** Authentication token for cluster communication */
  authToken?: string;
  /** TLS certificate (if using mTLS) */
  tlsCert?: string;
}

/**
 * Criteria for selecting the best cluster
 */
export interface ClusterSelectionCriteria {
  /** Primary optimization priority */
  priority: 'latency' | 'cost' | 'availability' | 'gpu';
  /** Minimum available agents required */
  minAgents?: number;
  /** Whether GPU is required */
  requiresGpu?: boolean;
  /** Required GPU type */
  gpuType?: string;
  /** Maximum acceptable latency in ms */
  maxLatency?: number;
  /** Maximum cost per hour in USD */
  maxCostPerHour?: number;
  /** Preferred regions */
  preferredRegions?: Region[];
  /** Excluded regions */
  excludedRegions?: Region[];
  /** Required capability flags */
  requiredCapabilities?: string[];
}

/**
 * Cluster selection result
 */
export interface ClusterSelection {
  /** Selected cluster or null if local */
  cluster: Cluster | null;
  /** Whether this is the local cluster */
  isLocal: boolean;
  /** Selection score (higher is better) */
  score?: number;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent configuration for spawning
 */
export interface SpawnConfig {
  /** Unique agent ID (optional, auto-generated if not provided) */
  id?: string;
  /** Model to use (e.g., 'claude-sonnet-4', 'gpt-4o') */
  model: string;
  /** Labels for organization and selection */
  labels: Record<string, string>;
  /** Timeout in seconds */
  timeout: number;
  /** Whether GPU is required */
  requiresGpu?: boolean;
  /** Required GPU type */
  gpuType?: string;
  /** Environment variables */
  envVars?: Record<string, string>;
}

/**
 * Agent information
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;
  /** Cluster where the agent is running */
  clusterId?: string;
  /** Agent endpoint for direct communication */
  endpoint?: string;
  /** Current status */
  status: AgentStatus;
  /** Model being used */
  model: string;
  /** When the agent was started */
  startedAt: number;
  /** Agent labels */
  labels: Record<string, string>;
}

/**
 * Agent status values
 */
export type AgentStatus = 
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'migrating'
  | 'terminated';

/**
 * Reference to a remote agent for proxying
 */
export interface RemoteAgentRef {
  id: string;
  clusterId: string;
  client: ClusterClient;
}

/**
 * Agent execution result
 */
export interface ExecResult {
  /** Command output */
  output: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  durationMs?: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Federation event types
 */
export type FederationEventType =
  | 'agent:spawned'
  | 'agent:killed'
  | 'agent:migrated'
  | 'agent:status_changed'
  | 'cluster:joined'
  | 'cluster:left'
  | 'cluster:degraded'
  | 'cluster:recovered'
  | 'command:started'
  | 'command:completed'
  | 'command:failed'
  | 'heartbeat:received';

/**
 * Federation event
 */
export interface FederationEvent {
  /** Event type */
  type: FederationEventType;
  /** Affected agent ID (if applicable) */
  agentId?: string;
  /** Source cluster ID */
  clusterId: string;
  /** Event payload */
  payload: unknown;
  /** Event timestamp */
  timestamp: number;
  /** Original source cluster (for multi-hop events) */
  sourceCluster?: string;
}

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Agent state snapshot for migration
 */
export interface AgentSnapshot {
  /** Agent ID */
  agentId: string;
  /** Serialized state data */
  stateData: Buffer;
  /** Metadata about the state */
  metadata: Record<string, string>;
  /** Creation timestamp */
  createdAt: number;
  /** Source cluster */
  sourceCluster: string;
}

/**
 * Migration status
 */
export type MigrationStatus = 
  | 'pending'
  | 'exporting'
  | 'transferring'
  | 'importing'
  | 'completed'
  | 'failed';

/**
 * Migration tracking information
 */
export interface Migration {
  /** Migration ID */
  id: string;
  /** Agent being migrated */
  agentId: string;
  /** Source cluster */
  fromCluster: string;
  /** Destination cluster */
  toCluster: string;
  /** Current status */
  status: MigrationStatus;
  /** When migration started */
  startedAt: number;
  /** When migration completed (if applicable) */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Health Types
// ============================================================================

/**
 * Cluster health state
 */
export interface ClusterHealthState {
  clusterId: string;
  status: ClusterStatus;
  lastHeartbeat: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  latency: number;
  message?: string;
}

/**
 * Health check configuration
 */
export interface ClusterHealthConfig {
  /** Check interval in milliseconds */
  interval: number;
  /** Timeout for health checks in milliseconds */
  timeout: number;
  /** Threshold for marking as degraded (consecutive failures) */
  degradedThreshold: number;
  /** Threshold for marking as offline */
  offlineThreshold: number;
  /** Auto-remove offline clusters after this many ms */
  autoRemoveAfterMs?: number;
}

// ============================================================================
// Import ClusterClient for type references
// ============================================================================

import type { ClusterClient } from './cluster-client';

// Re-export for convenience
export { ClusterClient };

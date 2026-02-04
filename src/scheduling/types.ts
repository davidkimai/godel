/**
 * Scheduling Types
 * 
 * Core type definitions for the advanced scheduling system.
 * Includes resource tracking, affinity rules, priority classes, and scheduling policies.
 */

import { Agent } from '../models/agent';

// ============================================================================
// RESOURCE TYPES
// ============================================================================

/**
 * Resource requirements for an agent
 */
export interface ResourceRequirements {
  /** CPU cores requested (can be fractional, e.g., 0.5) */
  cpu: number;
  /** Memory in MB */
  memory: number;
  /** GPU memory in MB (if applicable) */
  gpuMemory?: number;
  /** Number of GPU units */
  gpuCount?: number;
  /** Disk space in MB */
  disk?: number;
  /** Network bandwidth in Mbps */
  network?: number;
  /** Custom resource requirements */
  custom?: Record<string, number>;
}

/**
 * Current resource usage of an agent
 */
export interface ResourceUsage {
  /** Current CPU usage (0-1 percentage) */
  cpu: number;
  /** Current memory usage in MB */
  memory: number;
  /** Current GPU memory usage in MB */
  gpuMemory?: number;
  /** Timestamp of last update */
  timestamp: Date;
}

/**
 * Resource capacity of a node
 */
export interface NodeCapacity {
  /** Node unique identifier */
  nodeId: string;
  /** Node labels for affinity/selector matching */
  labels: Record<string, string>;
  /** Total CPU cores available */
  cpu: number;
  /** Total memory in MB */
  memory: number;
  /** Total GPU memory in MB */
  gpuMemory?: number;
  /** Total GPU units */
  gpuCount?: number;
  /** Total disk in MB */
  disk?: number;
  /** Network bandwidth in Mbps */
  network?: number;
  /** Custom resources */
  custom?: Record<string, number>;
}

/**
 * Current allocation state of a node
 */
export interface NodeAllocation {
  /** Node capacity */
  capacity: NodeCapacity;
  /** Currently allocated resources */
  allocated: ResourceRequirements;
  /** Agents scheduled on this node */
  agents: string[];
  /** Last heartbeat timestamp */
  lastHeartbeat: Date;
  /** Node health status */
  healthy: boolean;
}

// ============================================================================
// AFFINITY TYPES
// ============================================================================

/**
 * Affinity rule types
 */
export type AffinityType = 'affinity' | 'antiAffinity';

/**
 * Affinity rule weight (soft vs hard constraints)
 */
export type AffinityWeight = 'hard' | 'soft';

/**
 * Label selector for matching agents/nodes
 */
export interface LabelSelector {
  /** Match labels exactly */
  matchLabels?: Record<string, string>;
  /** Match expressions for complex queries */
  matchExpressions?: MatchExpression[];
}

/**
 * Match expression for label selectors
 */
export interface MatchExpression {
  /** Label key */
  key: string;
  /** Operator for matching */
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
  /** Values for In/NotIn operators */
  values?: string[];
}

/**
 * Affinity rule for agent placement
 */
export interface AffinityRule {
  /** Type of affinity */
  type: AffinityType;
  /** Weight of the rule (hard = must satisfy, soft = prefer) */
  weight: AffinityWeight;
  /** Weight value for soft constraints (1-100, higher = more important) */
  weightValue?: number;
  /** Label selector to match other agents */
  agentSelector?: LabelSelector;
  /** Label selector to match nodes */
  nodeSelector?: LabelSelector;
  /** Namespaces to consider (empty = all) */
  namespaces?: string[];
  /** Topology key for spreading (e.g., 'zone', 'rack', 'host') */
  topologyKey?: string;
}

/**
 * Agent affinity/anti-affinity configuration
 */
export interface AgentAffinity {
  /** Rules for co-locating with other agents */
  agentAffinity?: AffinityRule[];
  /** Rules for separating from other agents */
  agentAntiAffinity?: AffinityRule[];
  /** Rules for node selection */
  nodeAffinity?: AffinityRule[];
}

// ============================================================================
// PRIORITY TYPES
// ============================================================================

/**
 * Priority classes for preemption
 */
export enum PriorityClass {
  /** System-critical agents that cannot be preempted */
  CRITICAL = 1000,
  /** High priority agents */
  HIGH = 500,
  /** Normal priority (default) */
  NORMAL = 100,
  /** Low priority, can be preempted easily */
  LOW = 10,
  /** Background/batch jobs */
  BATCH = 1,
}

/**
 * Priority configuration for an agent
 */
export interface AgentPriority {
  /** Priority class */
  priorityClass: PriorityClass;
  /** Preemption policy */
  preemptionPolicy: 'PreemptLowerPriority' | 'Never';
}

// ============================================================================
// SCHEDULING POLICY
// ============================================================================

/**
 * Scheduling policy configuration
 */
export interface SchedulingPolicy {
  /** Resource limits per node */
  nodeResourceLimits?: {
    maxAgentsPerNode?: number;
    maxCpuPerNode?: number;
    maxMemoryPerNode?: number;
  };
  /** Bin packing strategy */
  binPackingStrategy: 'bestFit' | 'firstFit' | 'worstFit' | 'spread';
  /** Enable preemption */
  enablePreemption: boolean;
  /** Default priority class */
  defaultPriorityClass: PriorityClass;
}

// ============================================================================
// SCHEDULING REQUEST & RESULT
// ============================================================================

/**
 * Scheduling request for an agent
 */
export interface SchedulingRequest {
  /** Agent to schedule */
  agent: Agent;
  /** Resource requirements */
  resources: ResourceRequirements;
  /** Affinity rules */
  affinity?: AgentAffinity;
  /** Priority configuration */
  priority?: AgentPriority;
  /** Preferred nodes (optional hints) */
  preferredNodes?: string[];
  /** Deadline for scheduling */
  deadline?: Date;
}

/**
 * Scheduling decision result
 */
export interface SchedulingResult {
  /** Whether scheduling succeeded */
  success: boolean;
  /** Selected node ID (if successful) */
  nodeId?: string;
  /** Agent ID */
  agentId: string;
  /** Scheduling timestamp */
  scheduledAt: Date;
  /** Resources allocated */
  allocatedResources?: ResourceRequirements;
  /** Preempted agents (if any) */
  preemptedAgents?: string[];
  /** Error message (if failed) */
  error?: string;
  /** Affinity score (0-100, higher = better match) */
  affinityScore?: number;
}

/**
 * Preemption candidate
 */
export interface PreemptionCandidate {
  /** Agent ID that could be preempted */
  agentId: string;
  /** Current priority of the candidate */
  priority: PriorityClass;
  /** Resources that would be freed */
  resources: ResourceRequirements;
  /** Node where the agent is running */
  nodeId: string;
  /** Whether checkpoint is available */
  hasCheckpoint: boolean;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

/**
 * Scheduling metrics
 */
export interface SchedulingMetrics {
  /** Total scheduling attempts */
  schedulingAttempts: number;
  /** Successful scheduling operations */
  schedulingSuccesses: number;
  /** Failed scheduling operations */
  schedulingFailures: number;
  /** Scheduling latency in milliseconds */
  schedulingLatencyMs: number;
  /** Number of preemptions performed */
  preemptionCount: number;
  /** Average resource utilization per node */
  resourceUtilization: Record<string, number>;
  /** Affinity rule violations */
  affinityViolations: number;
}

/**
 * Checkpoint data for preempted agents
 */
export interface AgentCheckpoint {
  /** Agent ID */
  agentId: string;
  /** Checkpoint timestamp */
  timestamp: Date;
  /** Serialized agent state */
  state: Record<string, unknown>;
  /** Resource usage at checkpoint */
  resourceUsage: ResourceUsage;
  /** Progress percentage (0-1) */
  progress: number;
}

// ============================================================================
// SCHEDULING EVENTS
// ============================================================================

/**
 * Scheduling event types
 */
export type SchedulingEventType =
  | 'scheduling.requested'
  | 'scheduling.succeeded'
  | 'scheduling.failed'
  | 'scheduling.preempted'
  | 'scheduling.resumed'
  | 'resource.usage_updated'
  | 'node.heartbeat'
  | 'node.failed';

/**
 * Base scheduling event
 */
export interface SchedulingEvent {
  /** Event type */
  type: SchedulingEventType;
  /** Timestamp */
  timestamp: Date;
  /** Agent ID */
  agentId?: string;
  /** Node ID */
  nodeId?: string;
  /** Event payload */
  payload: Record<string, unknown>;
}

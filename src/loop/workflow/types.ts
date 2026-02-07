/**
 * Workflow Engine Types - DAG-based workflow execution with complex orchestration
 * 
 * Core type definitions for workflow specifications including:
 * - Multi-type nodes (task, condition, parallel, merge, delay, sub-workflow)
 * - Directed edges with conditional traversal
 * - Variable system with type safety
 * - Event-driven triggers
 */

// ============================================================================
// Node Type Enums
// ============================================================================

export type WorkflowNodeType = 
  | 'task' 
  | 'condition' 
  | 'parallel' 
  | 'merge' 
  | 'delay' 
  | 'sub-workflow';

export enum WorkflowNodeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled',
}

export enum WorkflowInstanceStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

// ============================================================================
// Variable Types
// ============================================================================

export type WorkflowVariableType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface WorkflowVariable {
  name: string;
  type: WorkflowVariableType;
  default?: unknown;
  required?: boolean;
  description?: string;
}

// ============================================================================
// Trigger Types
// ============================================================================

export type WorkflowTriggerType = 'schedule' | 'webhook' | 'event' | 'manual';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: Record<string, unknown>;
  enabled?: boolean;
}

// ============================================================================
// Node Configurations
// ============================================================================

export interface AgentSelectionCriteria {
  strategy: 'balanced' | 'least-busy' | 'round-robin' | 'specific';
  agentId?: string;
  capabilities?: string[];
  tags?: string[];
}

export interface TaskNodeConfig {
  type: 'task';
  taskType: string;
  parameters: Record<string, unknown>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryBackoff?: 'fixed' | 'linear' | 'exponential';
  agentSelector?: AgentSelectionCriteria;
}

export interface ConditionNodeConfig {
  type: 'condition';
  condition: string;  // Expression like "${result.status} == 'success'"
  trueBranch: string; // Node ID
  falseBranch: string; // Node ID
}

export type ParallelWaitStrategy = 'all' | 'any' | number;

export interface ParallelNodeConfig {
  type: 'parallel';
  branches: string[]; // Node IDs to execute in parallel
  waitFor: ParallelWaitStrategy; // Wait strategy
}

export type MergeStrategy = 'collect' | 'first' | 'reduce' | 'last' | 'concat';

export interface MergeNodeConfig {
  type: 'merge';
  strategy: MergeStrategy;
  reduceFunction?: string; // For reduce strategy - expression or function name
}

export interface DelayNodeConfig {
  type: 'delay';
  duration: number; // milliseconds
  until?: string;   // ISO timestamp for scheduled delay
}

export interface SubWorkflowNodeConfig {
  type: 'sub-workflow';
  workflowId: string;
  version?: string;
  inputs: Record<string, string>; // Map parent vars to sub-workflow inputs (using ${var} syntax)
  propagateErrors?: boolean;
  waitForCompletion?: boolean;
  timeout?: number;
}

export type NodeConfig = 
  | TaskNodeConfig
  | ConditionNodeConfig
  | ParallelNodeConfig
  | MergeNodeConfig
  | DelayNodeConfig
  | SubWorkflowNodeConfig;

// ============================================================================
// Core Workflow Types
// ============================================================================

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description?: string;
  config: NodeConfig;
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  from: string;  // Node ID
  to: string;    // Node ID
  condition?: string; // Optional condition for edge traversal (evaluated at runtime)
  priority?: number;  // For conditional edges, higher priority wins
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
  triggers?: WorkflowTrigger[];
  metadata?: Record<string, unknown>;
  timeout?: number;  // Global workflow timeout
  onFailure?: 'stop' | 'continue' | 'retry-all';
}

// ============================================================================
// Workflow Instance Types
// ============================================================================

export interface NodeState {
  nodeId: string;
  status: WorkflowNodeStatus;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  status: WorkflowInstanceStatus;
  variables: Record<string, unknown>;
  nodeStates: Map<string, NodeState>;
  currentNodes: string[];
  completedNodes: Set<string>;
  failedNodes: Set<string>;
  startedAt: number;
  completedAt?: number;
  results: Map<string, unknown>;
  parentInstanceId?: string; // For sub-workflows
  rootInstanceId?: string;   // Top-level instance
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Workflow Status Type
// ============================================================================

export interface WorkflowStatus {
  id: string;
  status: WorkflowInstanceStatus;
  progress: number;
  startedAt: number;
  completedAt?: number;
  currentNodes: string[];
  completedNodes: number;
  totalNodes: number;
  failedNodes: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type WorkflowEventType =
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'workflow:paused'
  | 'workflow:resumed'
  | 'workflow:cancelled'
  | 'node:started'
  | 'node:completed'
  | 'node:failed'
  | 'node:skipped'
  | 'node:retrying'
  | 'edge:traversed';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: number;
  instanceId: string;
  workflowId: string;
  nodeId?: string;
  edgeId?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Engine Dependencies
// ============================================================================

export interface TaskExecutor {
  execute(agentId: string, task: {
    type: string;
    parameters: Record<string, unknown>;
    timeout?: number;
  }): Promise<unknown>;
}

export interface AgentSelector {
  selectAgent(criteria: AgentSelectionCriteria): Promise<{ id: string; name: string }>;
  releaseAgent(agentId: string): Promise<void>;
}

export interface EventBus {
  publish(event: string, data: Record<string, unknown>): void;
  subscribe(event: string, handler: (data: Record<string, unknown>) => void): () => void;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DAGValidationResult {
  valid: boolean;
  hasCycle: boolean;
  cycle?: string[];
  disconnectedNodes: string[];
  orphanedNodes: string[];
  topologicalOrder: string[][];
}

// ============================================================================
// Engine Options
// ============================================================================

export interface WorkflowEngineOptions {
  maxConcurrentNodes: number;
  defaultTaskTimeout: number;
  defaultRetries: number;
  defaultRetryDelay: number;
  defaultRetryBackoff: 'fixed' | 'linear' | 'exponential';
  enableMetrics: boolean;
  enableEventPublishing: boolean;
  subWorkflowTimeout: number;
}

export const DefaultWorkflowEngineOptions: WorkflowEngineOptions = {
  maxConcurrentNodes: 10,
  defaultTaskTimeout: 300000, // 5 minutes
  defaultRetries: 3,
  defaultRetryDelay: 1000,
  defaultRetryBackoff: 'exponential',
  enableMetrics: true,
  enableEventPublishing: true,
  subWorkflowTimeout: 600000, // 10 minutes
};

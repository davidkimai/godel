/**
 * Task Queue Types
 * 
 * Type definitions for the Redis-backed task queue system.
 */

import type { TaskPriority } from '../models/task';

// ============================================================================
// TASK STATES
// ============================================================================

export type TaskQueueStatus = 
  | 'pending'      // Task is waiting in queue
  | 'assigned'     // Task assigned to an agent but not yet started
  | 'processing'   // Agent is actively processing the task
  | 'completed'    // Task finished successfully
  | 'failed'       // Task failed
  | 'cancelled'    // Task was cancelled
  | 'dead'         // Task moved to dead letter queue after retries
  | 'scheduled';   // Task scheduled for future execution

// ============================================================================
// TASK DEFINITION
// ============================================================================

export interface QueuedTask {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: TaskPriority;
  status: TaskQueueStatus;
  
  // Assignment
  assigneeId?: string;
  assigneeSkills?: string[];
  
  // Scheduling
  createdAt: Date;
  scheduledFor?: Date;  // For delayed execution
  startedAt?: Date;
  completedAt?: Date;
  
  // Retry configuration
  retryCount: number;
  maxRetries: number;
  retryDelayMs: number;  // Base delay for exponential backoff
  
  // Routing
  requiredSkills?: string[];
  stickyKey?: string;    // For sticky routing (same agent for related tasks)
  routingHint?: 'round-robin' | 'load-based' | 'skill-based' | 'sticky';
  
  // Progress tracking
  progress: number;      // 0-100
  progressData?: Record<string, unknown>;
  
  // Metadata
  metadata: {
    source?: string;
    correlationId?: string;
    tags?: string[];
    estimatedDurationMs?: number;
    [key: string]: unknown;
  };
  
  // Dead letter info
  deadLetterReason?: string;
  lastError?: string;
}

// ============================================================================
// TASK CREATION OPTIONS
// ============================================================================

export interface EnqueueTaskOptions {
  id?: string;
  type: string;
  payload: Record<string, unknown>;
  priority?: TaskPriority;
  delayMs?: number;           // Delay before task becomes available
  scheduledFor?: Date;        // Specific time to execute
  maxRetries?: number;
  retryDelayMs?: number;
  requiredSkills?: string[];
  stickyKey?: string;
  routingHint?: 'round-robin' | 'load-based' | 'skill-based' | 'sticky';
  metadata?: {
    source?: string;
    correlationId?: string;
    tags?: string[];
    estimatedDurationMs?: number;
    [key: string]: unknown;
  };
}

// ============================================================================
// AGENT REGISTRATION
// ============================================================================

export interface TaskAgent {
  id: string;
  skills: string[];
  capacity: number;           // Max concurrent tasks
  currentLoad: number;        // Current number of tasks
  status: 'idle' | 'busy' | 'offline';
  lastHeartbeat: Date;
  metadata?: Record<string, unknown>;
}

export interface RegisterAgentOptions {
  id: string;
  skills?: string[];
  capacity?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// WORK DISTRIBUTION
// ============================================================================

export type DistributionStrategy = 
  | 'round-robin'
  | 'load-based'
  | 'skill-based'
  | 'sticky';

export interface DistributionResult {
  taskId: string;
  agentId: string;
  strategy: DistributionStrategy;
  reason?: string;
}

export interface DistributionContext {
  task: QueuedTask;
  availableAgents: TaskAgent[];
  lastAssignmentIndex?: number;
  stickyAssignments: Map<string, string>;
  agentAssignments: Map<string, number>;
}

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

export interface TaskQueueConfig {
  // Redis configuration
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  
  // Queue settings
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  defaultTimeoutMs: number;
  heartbeatTimeoutMs: number;
  
  // Dead letter queue
  deadLetterEnabled: boolean;
  deadLetterMaxAgeDays: number;
  
  // Processing
  pollIntervalMs: number;
  batchSize: number;
  
  // Distribution
  defaultStrategy: DistributionStrategy;
}

// ============================================================================
// QUEUE METRICS
// ============================================================================

export interface QueueMetrics {
  // Queue depth
  pendingCount: number;
  processingCount: number;
  scheduledCount: number;
  deadLetterCount: number;
  
  // Throughput (since last reset)
  tasksEnqueued: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
  tasksDeadLettered: number;
  
  // Processing times (milliseconds)
  avgProcessingTimeMs: number;
  minProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  
  // Agent stats
  activeAgents: number;
  totalCapacity: number;
  currentLoad: number;
}

// ============================================================================
// QUEUE EVENTS
// ============================================================================

export type QueueEventType =
  | 'task.enqueued'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.retried'
  | 'task.cancelled'
  | 'task.dead_lettered'
  | 'task.progress'
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.heartbeat'
  | 'queue.scaling_needed';

export interface QueueEvent {
  type: QueueEventType;
  timestamp: Date;
  taskId?: string;
  agentId?: string;
  payload?: Record<string, unknown>;
}

export type QueueEventHandler = (event: QueueEvent) => void | Promise<void>;

// ============================================================================
// TASK RESULT
// ============================================================================

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  processingTimeMs: number;
  retryCount: number;
}

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

export interface DeadLetterEntry {
  task: QueuedTask;
  deadAt: Date;
  reason: string;
  errorHistory: Array<{
    error: string;
    timestamp: Date;
  }>;
}

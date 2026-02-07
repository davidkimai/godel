/**
 * Godel Loop Event Types
 * Domain-specific event types for agent coordination
 */

import type { Task } from '../../tasks/types';

/**
 * Event priority levels
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Event metadata for tracking and correlation
 */
export interface EventMetadata {
  /** For tracking request chains across multiple events */
  correlationId?: string;
  /** Event that caused this one (causation tracking) */
  causationId?: string;
  /** Event version for schema evolution */
  version: number;
  /** Event priority for processing */
  priority: EventPriority;
  /** Time to live in milliseconds (for TTL-based expiration) */
  ttl?: number;
}

/**
 * Base GodelEvent interface - all events extend this
 */
export interface GodelEvent<T = unknown> {
  /** Unique event identifier */
  id: string;
  /** Event type (e.g., 'agent:state-changed') */
  type: string;
  /** Agent or component that emitted the event */
  source: string;
  /** Optional specific target agent/component */
  target?: string;
  /** Event timestamp (Unix ms) */
  timestamp: number;
  /** Event payload - type-specific data */
  payload: T;
  /** Event metadata */
  metadata: EventMetadata;
}

/**
 * Agent state changed event
 * Emitted when an agent transitions between states
 */
export interface AgentStateChangedEvent extends GodelEvent<{
  agentId: string;
  previousState: string;
  newState: string;
  reason?: string;
}> {
  type: 'agent:state-changed';
}

/**
 * Task assigned event
 * Emitted when a task is assigned to an agent
 */
export interface TaskAssignedEvent extends GodelEvent<{
  taskId: string;
  agentId: string;
  task: Task;
}> {
  type: 'task:assigned';
}

/**
 * Task completed event
 * Emitted when an agent completes a task
 */
export interface TaskCompletedEvent extends GodelEvent<{
  taskId: string;
  agentId: string;
  result: unknown;
  duration: number;
}> {
  type: 'task:completed';
}

/**
 * Task failed event
 * Emitted when a task execution fails
 */
export interface TaskFailedEvent extends GodelEvent<{
  taskId: string;
  agentId: string;
  error: string;
  retryable: boolean;
}> {
  type: 'task:failed';
}

/**
 * Agent error event
 * Emitted when an agent encounters an error
 */
export interface AgentErrorEvent extends GodelEvent<{
  agentId: string;
  from: string;
  to: string;
  error: string;
}> {
  type: 'agent:error';
}

/**
 * Metrics snapshot event
 * Periodic metrics emission for monitoring
 */
export interface MetricsSnapshotEvent extends GodelEvent<{
  timestamp: number;
  metrics: Record<string, number>;
}> {
  type: 'metrics:snapshot';
}

/**
 * Loop started event
 * Emitted when the Godel Loop starts
 */
export interface LoopStartedEvent extends GodelEvent<{
  loopId: string;
  config: Record<string, unknown>;
}> {
  type: 'loop:started';
}

/**
 * Loop stopped event
 * Emitted when the Godel Loop stops
 */
export interface LoopStoppedEvent extends GodelEvent<{
  loopId: string;
  reason: string;
  duration: number;
}> {
  type: 'loop:stopped';
}

/**
 * Loop iteration event
 * Emitted on each loop iteration
 */
export interface LoopIterationEvent extends GodelEvent<{
  iteration: number;
  agentCount: number;
  taskCount: number;
}> {
  type: 'loop:iteration';
}

/**
 * Union type of all Godel event types
 */
export type GodelEventType =
  | AgentStateChangedEvent
  | TaskAssignedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | AgentErrorEvent
  | MetricsSnapshotEvent
  | LoopStartedEvent
  | LoopStoppedEvent
  | LoopIterationEvent;

/**
 * Type mapping from event type string to event interface
 */
export interface GodelEventMap {
  'agent:state-changed': AgentStateChangedEvent;
  'task:assigned': TaskAssignedEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;
  'agent:error': AgentErrorEvent;
  'metrics:snapshot': MetricsSnapshotEvent;
  'loop:started': LoopStartedEvent;
  'loop:stopped': LoopStoppedEvent;
  'loop:iteration': LoopIterationEvent;
}

/**
 * Extract payload type from event type string
 */
export type GodelEventPayload<T extends keyof GodelEventMap> = 
  GodelEventMap[T] extends GodelEvent<infer P> ? P : never;

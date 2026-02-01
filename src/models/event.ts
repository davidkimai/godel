/**
 * Event Model
 * 
 * Core data model representing events in the Mission Control system.
 * Includes event types for agent lifecycle, task lifecycle, context, quality, and safety.
 */

/**
 * All possible event types in the system
 */
export type EventType =
  // Agent lifecycle events
  | 'agent.spawned'
  | 'agent.status_changed'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.blocked'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.killed'
  
  // Task lifecycle events
  | 'task.created'
  | 'task.status_changed'
  | 'task.assigned'
  | 'task.completed'
  | 'task.blocked'
  | 'task.failed'
  | 'task.cancelled'
  
  // Context events
  | 'context.added'
  | 'context.removed'
  | 'context.changed'
  | 'context.snapshot'
  
  // Quality events
  | 'critique.requested'
  | 'critique.completed'
  | 'critique.failed'
  | 'quality.gate_passed'
  | 'quality.gate_failed'
  
  // Testing events
  | 'test.started'
  | 'test.completed'
  | 'test.failed'
  | 'test.coverage'
  
  // Reasoning events
  | 'reasoning.trace'
  | 'reasoning.decision'
  | 'reasoning.confidence_changed'
  
  // Safety events
  | 'safety.violation_attempted'
  | 'safety.boundary_crossed'
  | 'safety.escalation_required'
  | 'safety.human_approval'
  
  // System events
  | 'system.bottleneck_detected'
  | 'system.disconnected'
  | 'system.emergency_stop'
  | 'system.checkpoint';

/**
 * Agent status change payload
 */
export interface AgentStatusChangePayload {
  /** Agent ID */
  agentId: string;
  /** Previous status */
  previousStatus: string;
  /** New status */
  newStatus: string;
  /** Reason for change (optional) */
  reason?: string;
}

/**
 * Task status change payload
 */
export interface TaskStatusChangePayload {
  /** Task ID */
  taskId: string;
  /** Previous status */
  previousStatus: string;
  /** New status */
  newStatus: string;
  /** Agent ID (if assigned) */
  agentId?: string;
}

/**
 * Context change payload
 */
export interface ContextChangePayload {
  /** Agent ID */
  agentId: string;
  /** Context type */
  contextType: 'input' | 'output' | 'shared';
  /** Item that was added/removed/changed */
  item: string;
  /** Context size after change */
  contextSize: number;
}

/**
 * Quality gate result payload
 */
export interface QualityGateResultPayload {
  /** Task ID */
  taskId: string;
  /** Agent ID */
  agentId: string;
  /** Quality gate type */
  gateType: string;
  /** Overall score (0-1) */
  score: number;
  /** Whether it passed */
  passed: boolean;
  /** Individual dimension scores */
  dimensions: Record<string, number>;
}

/**
 * Test result payload
 */
export interface TestResultPayload {
  /** Agent ID */
  agentId: string;
  /** Test file pattern */
  pattern?: string;
  /** Total tests */
  total: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Coverage statistics */
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
  };
}

/**
 * Reasoning trace payload
 */
export interface ReasoningTracePayload {
  /** Agent ID */
  agentId: string;
  /** Trace ID */
  traceId: string;
  /** Trace type */
  traceType: string;
  /** Content */
  content: string;
  /** Confidence level */
  confidence: number;
}

/**
 * Safety event payload
 */
export interface SafetyEventPayload {
  /** Agent ID */
  agentId: string;
  /** Action that triggered safety event */
  action: string;
  /** Safety boundary that was affected */
  boundary: string;
  /** Severity level */
  severity: 'warning' | 'error' | 'critical';
  /** Description of the event */
  description: string;
}

/**
 * Event payload - discriminated union based on event type
 */
export type EventPayload =
  | AgentStatusChangePayload
  | TaskStatusChangePayload
  | ContextChangePayload
  | QualityGateResultPayload
  | TestResultPayload
  | ReasoningTracePayload
  | SafetyEventPayload
  | Record<string, unknown>;

/**
 * Core Event model representing something that happened in the system
 */
export interface Event {
  /** Unique event identifier */
  id: string;
  /** Type of event */
  type: EventType;
  /** When the event occurred */
  timestamp: Date;
  /** Primary entity ID (agent or task) */
  entityId: string;
  /** Entity type */
  entityType: 'agent' | 'task' | 'system';
  /** Event payload */
  payload: EventPayload;
  /** Optional correlation ID for tracing */
  correlationId?: string;
  /** Parent event ID for chaining */
  parentEventId?: string;
}

/**
 * Options for creating an event
 */
export interface CreateEventOptions {
  /** Event type */
  type: EventType;
  /** Entity ID (agent or task) */
  entityId: string;
  /** Entity type */
  entityType: 'agent' | 'task' | 'system';
  /** Event payload */
  payload?: EventPayload;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Parent event ID */
  parentEventId?: string;
  /** Timestamp (defaults to now) */
  timestamp?: Date;
}

/**
 * Creates a new Event instance
 * 
 * @param options - Event creation options
 * @returns A new Event instance
 * 
 * @example
 * ```typescript
 * const event = createEvent({
 *   type: 'agent.spawned',
 *   entityId: 'agent-123',
 *   entityType: 'agent',
 *   payload: { model: 'kimi-k2.5', task: 'Build API' }
 * });
 * ```
 */
export function createEvent(options: CreateEventOptions): Event {
  const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id,
    type: options.type,
    timestamp: options.timestamp || new Date(),
    entityId: options.entityId,
    entityType: options.entityType,
    payload: options.payload || {},
    correlationId: options.correlationId,
    parentEventId: options.parentEventId
  };
}

/**
 * Creates an agent status change event
 * 
 * @param agentId - Agent ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param reason - Optional reason
 * @returns A new Event instance
 */
export function createAgentStatusEvent(
  agentId: string,
  previousStatus: string,
  newStatus: string,
  reason?: string
): Event {
  return createEvent({
    type: 'agent.status_changed',
    entityId: agentId,
    entityType: 'agent',
    payload: {
      agentId,
      previousStatus,
      newStatus,
      reason
    }
  });
}

/**
 * Creates a task status change event
 * 
 * @param taskId - Task ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param agentId - Optional agent ID
 * @returns A new Event instance
 */
export function createTaskStatusEvent(
  taskId: string,
  previousStatus: string,
  newStatus: string,
  agentId?: string
): Event {
  return createEvent({
    type: 'task.status_changed',
    entityId: taskId,
    entityType: 'task',
    payload: {
      taskId,
      previousStatus,
      newStatus,
      agentId
    }
  });
}

/**
 * Creates a quality gate result event
 * 
 * @param taskId - Task ID
 * @param agentId - Agent ID
 * @param gateType - Quality gate type
 * @param score - Overall score
 * @param passed - Whether it passed
 * @param dimensions - Dimension scores
 * @returns A new Event instance
 */
export function createQualityGateEvent(
  taskId: string,
  agentId: string,
  gateType: string,
  score: number,
  passed: boolean,
  dimensions: Record<string, number>
): Event {
  return createEvent({
    type: passed ? 'quality.gate_passed' : 'quality.gate_failed',
    entityId: taskId,
    entityType: 'task',
    payload: {
      taskId,
      agentId,
      gateType,
      score,
      passed,
      dimensions
    }
  });
}

/**
 * Creates a test result event
 * 
 * @param agentId - Agent ID
 * @param total - Total tests
 * @param passed - Passed tests
 * @param failed - Failed tests
 * @param coverage - Optional coverage
 * @returns A new Event instance
 */
export function createTestResultEvent(
  agentId: string,
  total: number,
  passed: number,
  failed: number,
  coverage?: { statements: number; branches: number; functions: number }
): Event {
  return createEvent({
    type: failed > 0 ? 'test.failed' : 'test.completed',
    entityId: agentId,
    entityType: 'agent',
    payload: {
      agentId,
      total,
      passed,
      failed,
      coverage
    }
  });
}

/**
 * Creates a safety event
 * 
 * @param agentId - Agent ID
 * @param action - Action that triggered event
 * @param boundary - Safety boundary affected
 * @param severity - Severity level
 * @param description - Description
 * @returns A new Event instance
 */
export function createSafetyEvent(
  agentId: string,
  action: string,
  boundary: string,
  severity: 'warning' | 'error' | 'critical',
  description: string
): Event {
  const eventType: EventType = severity === 'critical' 
    ? 'safety.escalation_required' 
    : 'safety.boundary_crossed';
  
  return createEvent({
    type: eventType,
    entityId: agentId,
    entityType: 'agent',
    payload: {
      agentId,
      action,
      boundary,
      severity,
      description
    }
  });
}

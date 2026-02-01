/**
 * Event Types - SPEC_V3.md Part III
 * Defines all event types and their payloads
 */

export type EventType =
  // Agent lifecycle
  | 'agent.spawned'
  | 'agent.status_changed'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.blocked'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.killed'
  
  // Task lifecycle
  | 'task.created'
  | 'task.status_changed'
  | 'task.assigned'
  | 'task.completed'
  | 'task.blocked'
  | 'task.failed'
  | 'task.cancelled'
  
  // Context
  | 'context.added'
  | 'context.removed'
  | 'context.changed'
  | 'context.snapshot'
  
  // Quality
  | 'critique.requested'
  | 'critique.completed'
  | 'critique.failed'
  | 'quality.gate_passed'
  | 'quality.gate_failed'
  
  // Testing
  | 'test.started'
  | 'test.completed'
  | 'test.failed'
  | 'test.coverage'
  
  // Reasoning
  | 'reasoning.trace'
  | 'reasoning.decision'
  | 'reasoning.confidence_changed'
  
  // Safety
  | 'safety.violation_attempted'
  | 'safety.boundary_crossed'
  | 'safety.escalation_required'
  | 'safety.human_approval'
  
  // System
  | 'system.bottleneck_detected'
  | 'system.disconnected'
  | 'system.emergency_stop'
  | 'system.checkpoint';

// Agent status for events
export type AgentStatus = 
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'killed';

// Task status for events
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Base event structure
export interface BaseEvent {
  id: string;
  timestamp: Date;
  eventType: EventType;
  source: {
    agentId?: string;
    taskId?: string;
    orchestrator?: string;
  };
  correlationId?: string;
}

// Agent event payloads
export interface AgentSpawnedPayload {
  agentId: string;
  label?: string;
  model: string;
  task: string;
  swarmId?: string;
  parentId?: string;
}

export interface AgentStatusChangedPayload {
  agentId: string;
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
  reason?: string;
}

export interface AgentCompletedPayload {
  agentId: string;
  runtime: number;
  output?: string;
  error?: string;
}

export interface AgentFailedPayload {
  agentId: string;
  error: string;
  retryCount: number;
  maxRetries: number;
}

export interface AgentEvent extends BaseEvent {
  eventType: 
    | 'agent.spawned'
    | 'agent.status_changed'
    | 'agent.completed'
    | 'agent.failed'
    | 'agent.blocked'
    | 'agent.paused'
    | 'agent.resumed'
    | 'agent.killed';
  payload: 
    | AgentSpawnedPayload
    | AgentStatusChangedPayload
    | AgentCompletedPayload
    | AgentFailedPayload;
}

// Task event payloads
export interface TaskCreatedPayload {
  taskId: string;
  title: string;
  description: string;
  assigneeId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependsOn: string[];
}

export interface TaskStatusChangedPayload {
  taskId: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  assigneeId?: string;
}

export interface TaskCompletedPayload {
  taskId: string;
  runtime: number;
  output?: string;
}

export interface TaskEvent extends BaseEvent {
  eventType:
    | 'task.created'
    | 'task.status_changed'
    | 'task.assigned'
    | 'task.completed'
    | 'task.blocked'
    | 'task.failed'
    | 'task.cancelled';
  payload:
    | TaskCreatedPayload
    | TaskStatusChangedPayload
    | TaskCompletedPayload;
}

// Context event payloads
export interface ContextAddedPayload {
  agentId: string;
  filePath: string;
  type: 'input' | 'output' | 'shared' | 'reasoning';
}

export interface ContextRemovedPayload {
  agentId: string;
  filePath: string;
}

export interface ContextChangedPayload {
  agentId: string;
  filePath: string;
  changes: {
    lineStart: number;
    lineEnd: number;
    description: string;
  };
}

export interface ContextSnapshotPayload {
  agentId: string;
  snapshotPath: string;
  contextSize: number;
}

export interface ContextEvent extends BaseEvent {
  eventType:
    | 'context.added'
    | 'context.removed'
    | 'context.changed'
    | 'context.snapshot';
  payload:
    | ContextAddedPayload
    | ContextRemovedPayload
    | ContextChangedPayload
    | ContextSnapshotPayload;
}

// Quality event payloads
export interface CritiqueRequestedPayload {
  agentId: string;
  dimensions: string[];
  threshold: number;
}

export interface CritiqueCompletedPayload {
  critiqueId: string;
  agentId: string;
  results: {
    dimension: string;
    score: number;
    feedback: string;
  }[];
}

export interface QualityGatePayload {
  taskId: string;
  gateType: string;
  criteria: {
    dimension: string;
    score: number;
    threshold: number;
  }[];
  passed: boolean;
}

export interface QualityEvent extends BaseEvent {
  eventType:
    | 'critique.requested'
    | 'critique.completed'
    | 'critique.failed'
    | 'quality.gate_passed'
    | 'quality.gate_failed';
  payload:
    | CritiqueRequestedPayload
    | CritiqueCompletedPayload
    | QualityGatePayload;
}

// Testing event payloads
export interface TestStartedPayload {
  agentId: string;
  pattern?: string;
  coverage: boolean;
}

export interface TestCompletedPayload {
  agentId: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
}

export interface TestCoveragePayload {
  agentId: string;
  coverage: {
    statements: number;
    branches: number;
    functions: number;
  };
}

export interface TestEvent extends BaseEvent {
  eventType:
    | 'test.started'
    | 'test.completed'
    | 'test.failed'
    | 'test.coverage';
  payload:
    | TestStartedPayload
    | TestCompletedPayload
    | TestCoveragePayload;
}

// Reasoning event payloads
export interface ReasoningTracePayload {
  agentId: string;
  taskId?: string;
  traceId: string;
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction';
  content: string;
  evidence: string[];
  confidence: number;
  parentTraceId?: string;
}

export interface ReasoningDecisionPayload {
  agentId: string;
  decisionId: string;
  decision: string;
  alternatives: string[];
  criteria: string[];
  confidence: number;
}

export interface ReasoningConfidencePayload {
  agentId: string;
  traceId: string;
  previousConfidence: number;
  newConfidence: number;
  reason: string;
}

export interface ReasoningEvent extends BaseEvent {
  eventType:
    | 'reasoning.trace'
    | 'reasoning.decision'
    | 'reasoning.confidence_changed';
  payload:
    | ReasoningTracePayload
    | ReasoningDecisionPayload
    | ReasoningConfidencePayload;
}

// Safety event payloads
export interface SafetyViolationPayload {
  agentId: string;
  violationType: string;
  attemptedAction: string;
  blocked: boolean;
}

export interface SafetyBoundaryPayload {
  agentId: string;
  boundaryType: string;
  currentValue: number;
  threshold: number;
}

export interface SafetyEscalationPayload {
  escalationId: string;
  agentId: string;
  type: 'safety' | 'cost' | 'ethics' | 'security';
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SafetyHumanApprovalPayload {
  escalationId: string;
  agentId: string;
  request: string;
  requiredApproval: string;
}

export interface SafetyEvent extends BaseEvent {
  eventType:
    | 'safety.violation_attempted'
    | 'safety.boundary_crossed'
    | 'safety.escalation_required'
    | 'safety.human_approval';
  payload:
    | SafetyViolationPayload
    | SafetyBoundaryPayload
    | SafetyEscalationPayload
    | SafetyHumanApprovalPayload;
}

// System event payloads
export interface SystemBottleneckPayload {
  metric: string;
  currentValue: number;
  threshold: number;
  recommendation?: string;
}

export interface SystemDisconnectedPayload {
  component: string;
  reason?: string;
  reconnecting: boolean;
}

export interface SystemCheckpointPayload {
  checkpointId: string;
  timestamp: Date;
  state: {
    agents: number;
    tasks: number;
    events: number;
  };
}

export interface SystemEvent extends BaseEvent {
  eventType:
    | 'system.bottleneck_detected'
    | 'system.disconnected'
    | 'system.emergency_stop'
    | 'system.checkpoint';
  payload:
    | SystemBottleneckPayload
    | SystemDisconnectedPayload
    | SystemCheckpointPayload
    | { reason: string }; // For emergency_stop
}

// Union type for all events
export type MissionEvent = 
  | AgentEvent
  | TaskEvent
  | ContextEvent
  | QualityEvent
  | TestEvent
  | ReasoningEvent
  | SafetyEvent
  | SystemEvent;

// Event filter for subscriptions and replay
export interface EventFilter {
  eventTypes?: EventType[];
  agentIds?: string[];
  taskIds?: string[];
  since?: Date;
  until?: Date;
  correlationId?: string;
}

// Helper function to create base event
export function createBaseEvent(
  eventType: EventType,
  source: BaseEvent['source'],
  correlationId?: string
): Omit<BaseEvent, 'id' | 'timestamp'> {
  return {
    eventType,
    source,
    correlationId
  };
}

// Generate unique event ID
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

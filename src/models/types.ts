/**
 * TypeScript Type Definitions for Mission Control
 * 
 * These types define the core data models for agents, tasks, events, and context.
 * 
 * Note: This is a placeholder file. Full model implementations should be added
 * in Phase 1 Workstream B.
 */

// ============================================================================
// Enums are defined in agent.ts (AgentStatus) and task.ts (TaskStatus, Priority)
// ============================================================================

import { AgentStatus } from './agent';
import { TaskStatus, TaskPriority as Priority } from './task';

// ============================================================================
// Agent Model
// ============================================================================

export interface AgentContext {
  inputContext: string[];
  outputContext: string[];
  sharedContext: string[];
  contextSize: number;
  contextWindow: number;
  contextUsage: number;
}

export interface AgentCode {
  language: string;
  fileTree?: FileNode;
  dependencies?: DependencyGraph;
  symbolIndex?: SymbolTable;
}

export interface AgentReasoning {
  traces: ReasoningTrace[];
  decisions: DecisionLog[];
  confidence: number;
}

export interface SafetyConfig {
  doNotHarm: boolean;
  preservePrivacy: boolean;
  noDeception: boolean;
  authorizedAccessOnly: boolean;
}

export interface Agent {
  id: string;
  label?: string;
  status: AgentStatus;
  model: string;
  task: string;
  spawnedAt: Date;
  completedAt?: Date;
  runtime: number;
  
  // Grouping & Hierarchy
  swarmId?: string;
  parentId?: string;
  childIds: string[];
  
  // Context Management
  context: AgentContext;
  
  // Code-Specific
  code?: AgentCode;
  
  // Reasoning-Specific
  reasoning?: AgentReasoning;
  
  // Retry & Failure Tracking
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  
  // Safety & Budget
  budgetLimit?: number;
  safetyBoundaries?: SafetyConfig;
  
  metadata: Record<string, unknown>;
}

// ============================================================================
// Task Model
// ============================================================================

export interface TaskReasoning {
  hypothesis?: string;
  alternatives?: string[];
  criteria?: string[];
  evaluation?: string;
  confidence: number;
}

export interface QualityCriterion {
  dimension: 'correctness' | 'completeness' | 'consistency' | 'clarity' | 
             'performance' | 'security' | 'style' | 'type_safety' | 'test_coverage';
  weight: number;
  threshold: number;
}

export interface QualityGate {
  type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
  criteria: QualityCriterion[];
  passingThreshold: number;
  maxIterations: number;
  autoRetry: boolean;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  timestamp: Date;
  progress: number;
  state: Record<string, unknown>;
  label?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId?: string;
  
  // Dependencies
  dependsOn: string[];
  blocks: string[];
  
  // Planning & Reasoning
  reasoning?: TaskReasoning;
  
  // Quality Gates
  qualityGate?: QualityGate;
  
  // Checkpoints
  checkpoints?: Checkpoint[];
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  priority: Priority;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Event Model
// ============================================================================

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

export interface Event {
  id: string;
  type: EventType;
  timestamp: Date;
  source: string;  // agent-id, task-id, or system
  data: Record<string, unknown>;
}

// ============================================================================
// Reasoning Models
// ============================================================================

export interface ReasoningTrace {
  id: string;
  agentId: string;
  taskId?: string;
  timestamp: Date;
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction';
  content: string;
  evidence: string[];
  confidence: number;
  parentTraceId?: string;
  childTraceIds: string[];
}

export interface DecisionLog {
  id: string;
  agentId: string;
  timestamp: Date;
  decision: string;
  alternatives: string[];
  criteria: string[];
  evaluation: string;
  outcome?: string;
  confidence: number;
}

// ============================================================================
// Code Models
// ============================================================================

export interface FileNode {
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  exports?: string[];
  imports?: string[];
  content?: string;
}

export interface DependencyGraph {
  nodes: { id: string; path: string }[];
  edges: { from: string; to: string; type: string }[];
}

export interface SymbolTable {
  symbols: { name: string; type: string; path: string; line: number }[];
}

// ============================================================================
// Storage Interfaces
// ============================================================================

export interface Storage<T> {
  get(_id: string): Promise<T | null>;
  list(_filter?: Record<string, unknown>): Promise<T[]>;
  create(_data: Partial<T>): Promise<T>;
  update(_id: string, _data: Partial<T>): Promise<T>;
  delete(_id: string): Promise<void>;
}

export interface AgentStorage extends Storage<Agent> {
  spawn(_data: Partial<Agent>): Promise<Agent>;
  kill(_id: string): Promise<void>;
  pause(_id: string): Promise<void>;
  resume(_id: string): Promise<void>;
  retry(_id: string, _options?: Record<string, unknown>): Promise<Agent>;
}

export interface TaskStorage extends Storage<Task> {
  create(_data: Partial<Task>): Promise<Task>;
  assign(_taskId: string, _agentId: string): Promise<Task>;
  getDependencies(_taskId: string): Promise<{ dependsOn: string[]; blocks: string[] }>;
  createCheckpoint(_taskId: string, _data: Partial<Checkpoint>): Promise<Checkpoint>;
  resolveBlocker(_taskId: string, _blockerId: string): Promise<void>;
}

export interface EventStorage extends Storage<Event> {
  query(_filter: {
    since?: Date;
    until?: Date;
    agentId?: string;
    taskId?: string;
    type?: EventType;
  }): Promise<Event[]>;
  getRecent(_options: { limit: number; type?: EventType }): Promise<Event[]>;
}

// ============================================================================
// CLI Options Types
// ============================================================================

export interface GlobalOptions {
  format: 'json' | 'table';
  output?: string;
  quiet: boolean;
  debug: boolean;
}

export interface AgentsListOptions extends GlobalOptions {
  group?: 'swarm' | 'hierarchy';
  filter?: string;
}

export interface AgentsSpawnOptions extends GlobalOptions {
  model?: string;
  label?: string;
  swarm?: string;
}

export interface TasksListOptions extends GlobalOptions {
  status?: string;
  assignee?: string;
}

export interface EventsStreamOptions extends GlobalOptions {
  filter?: string;
  agent?: string;
  task?: string;
}

export interface EventsReplayOptions extends GlobalOptions {
  since?: string;
  until?: string;
  agent?: string;
  task?: string;
}

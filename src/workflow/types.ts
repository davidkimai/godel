/**
 * Workflow Types - DAG-based workflow execution engine
 * 
 * Core type definitions for workflow specifications, step execution,
 * state management, and event handling.
 */

import { z } from 'zod';

// ============================================================================
// Workflow Status Enum
// ============================================================================

export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled',
}

// ============================================================================
// Workflow Log Type
// ============================================================================

export interface WorkflowLog {
  id: string;
  executionId: string;
  stepId: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  agent: z.string().min(1),
  task: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  next: z.array(z.string()).default([]),
  condition: z.object({
    expression: z.string().optional(),
    variable: z.string().optional(),
    equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }).optional(),
  retry: z.object({
    maxAttempts: z.number().int().min(1).default(3),
    backoff: z.enum(['fixed', 'linear', 'exponential']).default('exponential'),
    delayMs: z.number().int().min(0).default(1000),
  }).optional(),
  timeout: z.number().int().min(0).optional(),
  inputs: z.record(z.any()).optional(),
  outputs: z.array(z.string()).optional(),
  parallel: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

export const WorkflowSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  steps: z.array(WorkflowStepSchema).min(1),
  variables: z.record(z.any()).optional(),
  onFailure: z.enum(['stop', 'continue', 'retry_all']).default('stop'),
  timeout: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  agent: string;
  task: string;
  dependsOn: string[];
  next: string[];
  condition?: {
    expression?: string;
    variable?: string;
    equals?: string | number | boolean;
  };
  retry?: {
    maxAttempts: number;
    backoff: 'fixed' | 'linear' | 'exponential';
    delayMs: number;
  };
  timeout?: number;
  inputs?: Record<string, unknown>;
  outputs?: string[];
  parallel: boolean;
  metadata?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  steps: WorkflowStep[];
  variables?: Record<string, unknown>;
  onFailure: 'stop' | 'continue' | 'retry_all';
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowStepState {
  stepId: string;
  status: StepStatus;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  output?: Record<string, unknown>;
  logs: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowState {
  workflowId: string;
  executionId: string;
  status: WorkflowStatus;
  currentSteps: string[];
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  stepStates: Map<string, WorkflowStepState>;
  variables: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  error?: {
    message: string;
    code?: string;
    failedStep?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflow: Workflow;
  state: WorkflowState;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Event Types
// ============================================================================

export type WorkflowEventType =
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:fail'
  | 'workflow:pause'
  | 'workflow:resume'
  | 'workflow:cancel'
  | 'step:start'
  | 'step:complete'
  | 'step:fail'
  | 'step:retry'
  | 'step:skip'
  | 'step:cancel';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: number;
  executionId: string;
  workflowId: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Execution Context
// ============================================================================

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  variables: Record<string, unknown>;
  stepOutputs: Map<string, Record<string, unknown>>;
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;
  getStepOutput(stepId: string): Record<string, unknown> | undefined;
  setStepOutput(stepId: string, output: Record<string, unknown>): void;
}

// ============================================================================
// Step Executor Interface
// ============================================================================

export interface StepExecutor {
  execute(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<Record<string, unknown>>;
}

// ============================================================================
// Workflow Engine Options
// ============================================================================

export interface WorkflowEngineOptions {
  maxConcurrentSteps: number;
  defaultRetryAttempts: number;
  defaultRetryBackoff: 'fixed' | 'linear' | 'exponential';
  defaultRetryDelayMs: number;
  stepTimeoutMs: number;
  workflowTimeoutMs: number;
  enableMetrics: boolean;
}

export const DefaultWorkflowEngineOptions: WorkflowEngineOptions = {
  maxConcurrentSteps: 10,
  defaultRetryAttempts: 3,
  defaultRetryBackoff: 'exponential',
  defaultRetryDelayMs: 1000,
  stepTimeoutMs: 300000, // 5 minutes
  workflowTimeoutMs: 3600000, // 1 hour
  enableMetrics: true,
};

// ============================================================================
// Validation Result
// ============================================================================

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Topological Sort Result
// ============================================================================

export interface TopologicalSortResult {
  ordered: string[][];
  hasCycle: boolean;
  cycle?: string[];
}

// ============================================================================
// Metrics
// ============================================================================

export interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  averageExecutionTimeMs: number;
  averageStepTimeMs: number;
  stepMetrics: Map<string, {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageTimeMs: number;
  }>;
}

// ============================================================================
// Workflow Engine Forward Declaration
// ============================================================================

import type { EventEmitter } from 'events';

export interface WorkflowEngine extends EventEmitter {
  execute(workflow: Workflow, initialVariables?: Record<string, unknown>): Promise<{
    executionId: string;
    workflowId: string;
    status: WorkflowStatus;
    state: WorkflowState;
    startedAt?: Date;
    completedAt?: Date;
    durationMs?: number;
    error?: { message: string; code?: string; failedStep?: string };
  }>;
  pause(executionId: string): boolean;
  resume(executionId: string): boolean;
  cancel(executionId: string): boolean;
  getExecutionState(executionId: string): WorkflowState | undefined;
  getActiveExecutions(): string[];
  onWorkflowEvent(
    eventType: WorkflowEventType | WorkflowEventType[],
    handler: (event: WorkflowEvent) => void
  ): void;
  validate(workflow: Workflow): { valid: boolean; errors: string[] };
}

// Re-export DependencyGraph from dag.ts
export interface DependencyGraph {
  nodes: Array<{
    id: string;
    name: string;
    status?: string;
    layer: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: 'dependency' | 'next';
  }>;
  layers: string[][];
}

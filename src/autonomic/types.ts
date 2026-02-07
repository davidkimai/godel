/**
 * Autonomic Maintenance Team - Type Definitions
 * 
 * Core types for the self-maintaining maintenance system.
 */

import { AgentEventBus } from '../core/event-bus';

// ============================================================================
// Error Event Types
// ============================================================================

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  sessionId?: string;
  taskId?: string;
  agentId?: string;
  teamId?: string;
  inputs?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

export interface ErrorEvent {
  id: string;
  timestamp: number;
  source: string;
  errorType: string;
  message: string;
  stackTrace?: string;
  context: ErrorContext;
  severity: ErrorSeverity;
  reproducible: boolean;
}

// ============================================================================
// Fix Result Types
// ============================================================================

export interface FixResult {
  id: string;
  errorId: string;
  prUrl?: string;
  commitSha?: string;
  status: 'success' | 'failure' | 'pending';
}

export interface FileChange {
  file: string;
  original: string;
  modified: string;
  diff: string;
}

export interface PatchResult {
  id: string;
  errorId: string;
  fileChanges: FileChange[];
  description: string;
  testPasses: boolean;
}

// ============================================================================
// Task Types
// ============================================================================

export interface TestGenerationTask {
  errorId: string;
  error: ErrorEvent;
  targetFile: string;
  functionName?: string;
}

export interface PatchTask {
  errorId: string;
  error: ErrorEvent;
  testCode: string;
  targetFile: string;
}

export interface PRTask {
  fix: PatchResult;
  error: ErrorEvent;
  branch?: string;
}

// ============================================================================
// Test Result Types
// ============================================================================

export interface TestResult {
  testCode: string;
  testFile: string;
  reproducesError: boolean;
}

export interface TestValidation {
  passes: boolean;
  reproducesError: boolean;
  errors?: string;
}

// ============================================================================
// PR Result Types
// ============================================================================

export interface PRResult {
  prNumber: number;
  prUrl: string;
  branch: string;
}

// ============================================================================
// Service Dependencies
// ============================================================================

export interface ErrorListenerDependencies {
  eventBus: AgentEventBus;
}

export interface TestWriterDependencies {
  llm: LLMService;
  fileSystem: FileSystem;
}

export interface PatchAgentDependencies {
  llm: LLMService;
  fileSystem: FileSystem;
  testRunner: TestRunner;
}

export interface PRAgentDependencies {
  git: GitService;
  github: GitHubAPI;
}

export interface OrchestratorDependencies {
  errorListener: ErrorListenerService;
  testWriter: TestWriterAgent;
  patchAgent: PatchAgent;
  prAgent: PRAgent;
  workflowEngine?: WorkflowEngine;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface LLMService {
  complete(prompt: string): Promise<string>;
}

export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface TestRunner {
  runTest(testCode: string): Promise<{ passes: boolean; error?: string }>;
}

export interface GitService {
  checkoutBranch(branch: string): Promise<void>;
  writeFile(file: string, content: string): Promise<void>;
  add(file: string): Promise<void>;
  commit(message: string): Promise<void>;
  push(branch: string): Promise<void>;
}

export interface GitHubAPI {
  createPullRequest(options: {
    title: string;
    body: string;
    head: string;
    base: string;
    labels?: string[];
  }): Promise<{ number: number; html_url: string }>;
}

export interface WorkflowEngine {
  execute(workflow: unknown): Promise<unknown>;
}

// ============================================================================
// Error Listener Service Interface
// ============================================================================

export interface ErrorListenerService {
  eventBus: AgentEventBus;
  getUnprocessedErrors(): ErrorEvent[];
  getProcessingErrors(): ErrorEvent[];
  getResolvedErrors(): ErrorEvent[];
  isAutoFixable(error: ErrorEvent): boolean;
  markAsProcessing(errorId: string): Promise<void>;
  markAsResolved(errorId: string, fix: FixResult): Promise<void>;
  markAsFailed(errorId: string, reason: string): Promise<void>;
  dispose?(): void;
}

// ============================================================================
// Agent Interfaces
// ============================================================================

export interface TestWriterAgent {
  generateReproductionTest(task: TestGenerationTask): Promise<TestResult>;
}

export interface PatchAgent {
  generateFix(task: PatchTask): Promise<PatchResult>;
}

export interface PRAgent {
  submitFix(task: PRTask): Promise<PRResult>;
}

// ============================================================================
// Autonomic Status
// ============================================================================

export interface AutonomicStatus {
  unprocessedErrors: number;
  autoFixableErrors: number;
  processingErrors: number;
  resolvedErrors: number;
  isRunning: boolean;
}

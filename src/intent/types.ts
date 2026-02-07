/**
 * @fileoverview Intent Types - Type definitions for intent-based "magic" system
 * 
 * This module provides TypeScript interfaces for the enhanced intent parsing
 * and automatic team configuration system.
 * 
 * @module @godel/intent/types
 */

// ============================================================================
// INTENT TYPES
// ============================================================================

/**
 * Supported task types for natural language commands.
 */
export type TaskType = 
  | 'refactor' 
  | 'implement' 
  | 'fix' 
  | 'test' 
  | 'review' 
  | 'document' 
  | 'analyze';

/**
 * Target types for intent parsing.
 */
export type TargetType = 'file' | 'module' | 'function' | 'feature' | 'bug' | 'test' | 'directory';

/**
 * Priority levels for task execution.
 */
export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Complexity levels for team sizing.
 */
export type ComplexityLevel = 'low' | 'medium' | 'high' | 'very-high';

/**
 * Agent types for team configuration.
 */
export type AgentType = 'architect' | 'implementer' | 'reviewer' | 'tester' | 'specialist';

/**
 * Parsed intent structure from natural language input.
 */
export interface ParsedIntent {
  /** The type of task to perform */
  taskType: TaskType;
  
  /** What to work on */
  target: string;
  
  /** Type of the target */
  targetType: TargetType;
  
  /** Specific aspect to focus on */
  focus?: string;
  
  /** Constraints (e.g., maintain backwards compatibility) */
  constraints?: string[];
  
  /** Priority level */
  priority?: PriorityLevel;
  
  /** Optional deadline */
  deadline?: Date;
  
  /** Original input */
  raw: string;
}

// ============================================================================
// COMPLEXITY ANALYSIS TYPES
// ============================================================================

/**
 * Code complexity metrics for a file.
 */
export interface FileMetrics {
  /** Lines of code */
  linesOfCode: number;
  
  /** Cyclomatic complexity */
  cyclomaticComplexity: number;
  
  /** Cognitive complexity */
  cognitiveComplexity: number;
  
  /** Number of dependencies */
  dependencies: number;
}

/**
 * Overall complexity metrics for a target.
 */
export interface ComplexityMetrics {
  /** Total lines of code */
  linesOfCode: number;
  
  /** Total cyclomatic complexity */
  cyclomaticComplexity: number;
  
  /** Total cognitive complexity */
  cognitiveComplexity: number;
  
  /** Total dependencies */
  dependencies: number;
  
  /** Test coverage percentage */
  testCoverage: number;
  
  /** Change frequency (commits per week) */
  changeFrequency: number;
  
  /** Number of files */
  fileCount: number;
  
  /** Estimated human hours */
  estimatedHours: number;
}

/**
 * Team complexity assessment.
 */
export interface TeamComplexity {
  /** Complexity level */
  level: ComplexityLevel;
  
  /** Complexity score (0-100) */
  score: number;
  
  /** Detailed metrics */
  metrics: ComplexityMetrics;
}

// ============================================================================
// TEAM CONFIGURATION TYPES
// ============================================================================

/**
 * Agent configuration for team generation.
 */
export interface AgentConfig {
  /** Role name */
  role: string;
  
  /** Agent type */
  type: AgentType;
  
  /** Number of agents */
  count: number;
  
  /** Required skills */
  skills: string[];
  
  /** Model preference */
  model?: string;
  
  /** Reasoning for this agent */
  reasoning?: string;
}

/**
 * Team configuration generated from intent.
 */
export interface TeamConfiguration {
  /** Team name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Agent configurations */
  agents: AgentConfig[];
  
  /** Workflow template ID */
  workflow: string;
  
  /** Estimated cost in USD */
  estimatedCost: number;
  
  /** Estimated time in minutes */
  estimatedTime: number;
  
  /** Complexity assessment */
  complexity: TeamComplexity;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Options for intent execution.
 */
export interface ExecuteOptions {
  /** Budget limit in USD */
  budget?: number;
  
  /** Skip confirmation */
  yes?: boolean;
  
  /** Dry run mode */
  dryRun?: boolean;
  
  /** Watch execution progress */
  watch?: boolean;
}

/**
 * Result of intent execution.
 */
export interface ExecutionResult {
  /** Parsed intent */
  intent: ParsedIntent;
  
  /** Generated configuration */
  config: TeamConfiguration;
  
  /** Workflow ID */
  workflowId: string;
  
  /** Spawned agents */
  agents: Array<{ id: string; role: string; type: AgentType }>;
  
  /** Execution status */
  status: 'started' | 'completed' | 'failed';
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// PARSER TYPES
// ============================================================================

/**
 * LLM service interface for intent parsing.
 */
export interface LLMService {
  complete(prompt: string): Promise<string>;
}

/**
 * Parser configuration.
 */
export interface ParserConfig {
  /** Whether to use LLM parsing */
  useLLM: boolean;
  
  /** LLM service instance */
  llm?: LLMService;
  
  /** Whether to enable strict mode */
  strictMode: boolean;
}

/**
 * Code analyzer interface for complexity analysis.
 */
export interface CodeAnalyzer {
  analyze(file: string): Promise<FileMetrics>;
}

/**
 * Git analyzer interface for change frequency.
 */
export interface GitAnalyzer {
  getChangeFrequency(files: string[]): Promise<number>;
}

// ============================================================================
// WORKFLOW TEMPLATE TYPES
// ============================================================================

/**
 * Workflow template definition.
 */
export interface WorkflowTemplate {
  /** Template ID */
  id: string;
  
  /** Template name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Applicable task types */
  taskTypes: TaskType[];
  
  /** Execution phases */
  phases: WorkflowPhase[];
}

/**
 * Workflow phase definition.
 */
export interface WorkflowPhase {
  /** Phase name */
  name: string;
  
  /** Phase description */
  description: string;
  
  /** Required agent roles */
  requiredRoles: AgentType[];
  
  /** Execution order */
  order: number;
}

/**
 * Library of workflow templates.
 */
export interface WorkflowTemplateLibrary {
  getTemplate(id: string): WorkflowTemplate | undefined;
  findTemplateForIntent(intent: ParsedIntent): WorkflowTemplate | undefined;
}

// ============================================================================
// AGENT REGISTRY TYPES
// ============================================================================

/**
 * Agent registration parameters.
 */
export interface AgentRegistration {
  /** Agent role */
  role: string;
  
  /** Agent capabilities */
  capabilities: {
    skills: string[];
    specialties: AgentType[];
  };
}

/**
 * Registered agent.
 */
export interface Agent {
  /** Agent ID */
  id: string;
  
  /** Agent role */
  role: string;
  
  /** Agent capabilities */
  capabilities: AgentRegistration['capabilities'];
}

/**
 * Agent registry interface.
 */
export interface AgentRegistry {
  register(config: AgentRegistration): Promise<Agent>;
}

// ============================================================================
// WORKFLOW ENGINE TYPES
// ============================================================================

/**
 * Workflow engine interface.
 */
export interface WorkflowEngine {
  start(templateId: string, context: {
    target: string;
    agents: string[];
    intent: string;
  }): Promise<string>;
}

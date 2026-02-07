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
 * Supported action types for natural language commands (Phase 2 - Core).
 * These are the core intent types for the "godel do" command.
 */
export type IntentAction = 
  | 'refactor' 
  | 'implement' 
  | 'fix' 
  | 'test' 
  | 'optimize';

/**
 * All valid intent action values for validation and iteration.
 */
export const INTENT_ACTIONS: IntentAction[] = [
  'refactor',
  'implement',
  'fix',
  'test',
  'optimize',
];

/**
 * Legacy TaskType for backwards compatibility.
 * @deprecated Use IntentAction instead
 */
export type TaskType = IntentAction | 'review' | 'document' | 'analyze';

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
 * Execution constraints for intent processing.
 */
export interface IntentConstraints {
  /** Budget limit in USD */
  budget?: number;
  
  /** Time limit in minutes */
  timeLimit?: number;
  
  /** Maximum team size */
  teamSize?: number;
  
  /** Additional custom constraints */
  custom?: string[];
}

/**
 * Core Intent structure as specified in Phase 2 requirements.
 * This is the standardized interface for all intent operations.
 */
export interface Intent {
  /** The type of action to perform */
  action: IntentAction;
  
  /** The main subject/target of the intent (e.g., "auth module", "bug #123") */
  target: string;
  
  /** Optional execution constraints */
  constraints?: IntentConstraints;
  
  /** Optional additional context */
  context?: {
    /** Original input text */
    originalInput?: string;
    
    /** Parsed requirements */
    requirements?: string[];
    
    /** Detected priority */
    priority?: PriorityLevel;
    
    /** Any additional metadata */
    [key: string]: unknown;
  };
}

/**
 * Parsed intent structure from natural language input.
 * Extends the core Intent with additional parsed metadata.
 */
export interface ParsedIntent extends Intent {
  /** 
   * Legacy taskType for backwards compatibility.
   * @deprecated Use action instead
   */
  taskType?: TaskType;
  
  /** Type of the target */
  targetType: TargetType;
  
  /** Specific aspect to focus on */
  focus?: string;
  
  /** Constraints (e.g., maintain backwards compatibility) */
  constraints?: IntentConstraints;
  
  /** Priority level */
  priority?: PriorityLevel;
  
  /** Optional deadline */
  deadline?: Date;
  
  /** Original input */
  raw: string;
}

// ============================================================================
// HANDLER TYPES
// ============================================================================

/**
 * Handler result containing execution outcome.
 */
export interface HandlerResult {
  /** Whether the handler execution was successful */
  success: boolean;
  
  /** Handler-specific output data */
  data?: Record<string, unknown>;
  
  /** Error message if failed */
  error?: string;
  
  /** Execution metrics */
  metrics?: {
    /** Duration in milliseconds */
    durationMs: number;
    
    /** Tokens consumed (if applicable) */
    tokensConsumed?: number;
    
    /** Cost incurred */
    cost?: number;
  };
}

/**
 * Intent handler interface.
 * All intent handlers must implement this interface.
 */
export interface IntentHandler {
  /** Handler identifier */
  readonly action: IntentAction;
  
  /** Handler display name */
  readonly name: string;
  
  /** Handler description */
  readonly description: string;
  
  /** Execute the handler for the given intent */
  execute(intent: Intent): Promise<HandlerResult>;
  
  /** Validate if the handler can process this intent */
  canHandle(intent: Intent): boolean;
}

/**
 * Handler registration for the router.
 */
export interface HandlerRegistration {
  /** Handler instance */
  handler: IntentHandler;
  
  /** Optional priority (higher = checked first) */
  priority?: number;
}

// ============================================================================
// ROUTER TYPES
// ============================================================================

/**
 * Routing result containing the selected handler and any preprocessing.
 */
export interface RoutingResult {
  /** Selected handler */
  handler: IntentHandler;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Any preprocessing applied to the intent */
  preprocessing?: {
    /** Intent was transformed/enhanced */
    transformed: boolean;
    
    /** Original intent before transformation */
    original?: Intent;
  };
}

/**
 * Router configuration options.
 */
export interface RouterConfig {
  /** Default handler to use when no match found */
  defaultHandler?: IntentHandler;
  
  /** Whether to allow multiple handlers */
  allowMultipleHandlers?: boolean;
  
  /** Enable preprocessing of intents */
  enablePreprocessing?: boolean;
  
  /** Strict mode - throw if no handler found */
  strictMode?: boolean;
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
 * Result of parsing a natural language input.
 */
export interface ParseResult {
  /** Whether parsing was successful */
  success: boolean;
  
  /** The parsed intent (if successful) */
  intent?: Intent;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Alternative interpretations */
  alternatives?: Intent[];
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
  taskTypes: IntentAction[];
  
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
  findTemplateForIntent(intent: Intent): WorkflowTemplate | undefined;
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

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Team configurations for different complexity levels.
 */
export const TEAM_CONFIGS: Record<ComplexityLevel, { initialAgents: number; maxAgents: number }> = {
  low: { initialAgents: 1, maxAgents: 2 },
  medium: { initialAgents: 3, maxAgents: 5 },
  high: { initialAgents: 5, maxAgents: 9 },
  'very-high': { initialAgents: 9, maxAgents: 15 },
};

/**
 * Default constraints.
 */
export const DEFAULT_CONSTRAINTS: IntentConstraints = {
  budget: 50,
  timeLimit: 60,
  teamSize: 5,
};

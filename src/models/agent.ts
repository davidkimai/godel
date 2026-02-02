/**
 * Agent Model
 * 
 * Core data model representing an agent in the Mission Control system.
 * Includes status, model, task, context, reasoning, and safety boundaries.
 */

/**
 * Possible states for an agent
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export enum AgentStatus {
  /** Agent has been created but not yet started */
  PENDING = 'pending',
  /** Agent is actively running */
  RUNNING = 'running',
  /** Agent is paused */
  PAUSED = 'paused',
  /** Agent has completed successfully */
  COMPLETED = 'completed',
  /** Agent has failed */
  FAILED = 'failed',
  /** Agent is blocked by dependencies */
  BLOCKED = 'blocked',
  /** Agent has been killed manually */
  KILLED = 'killed'
}

/**
 * Type of reasoning trace
 */

/**
 * Type of reasoning trace
 */
export type ReasoningTraceType = 
  | 'hypothesis'
  | 'analysis'
  | 'decision'
  | 'correction';

/**
 * Evidence item for reasoning traces
 */
export interface ReasoningTrace {
  /** Unique trace identifier */
  id: string;
  /** Agent that generated this trace */
  agentId: string;
  /** Optional task associated with this trace */
  taskId?: string;
  /** When the trace was created */
  timestamp: Date;
  /** Type of reasoning trace */
  type: ReasoningTraceType;
  /** Content of the reasoning trace */
  content: string;
  /** File paths or evidence references */
  evidence: string[];
  /** Confidence level 0-1 */
  confidence: number;
  /** Parent trace ID for chaining */
  parentTraceId?: string;
  /** Child trace IDs */
  childTraceIds: string[];
}

/**
 * Decision log entry
 */
export interface DecisionLog {
  /** Unique decision identifier */
  id: string;
  /** Agent that made this decision */
  agentId: string;
  /** When the decision was made */
  timestamp: Date;
  /** The decision made */
  decision: string;
  /** Alternative options considered */
  alternatives: string[];
  /** Criteria used for evaluation */
  criteria: string[];
  /** Evaluation of the decision */
  evaluation: string;
  /** Outcome after execution (filled later) */
  outcome?: string;
  /** Confidence level 0-1 */
  confidence: number;
}

/**
 * Reasoning data for an agent
 */
export interface AgentReasoning {
  /** Collection of reasoning traces */
  traces: ReasoningTrace[];
  /** Decision log entries */
  decisions: DecisionLog[];
  /** Current confidence level 0-1 */
  confidence: number;
}

/**
 * File node for representing project structure
 */
export interface FileNode {
  /** File name */
  name: string;
  /** File path */
  path: string;
  /** File type (file or directory) */
  type: 'file' | 'directory';
  /** Child files/directories */
  children?: Record<string, FileNode>;
  /** Exports (for source files) */
  exports?: string[];
  /** Imports (for source files) */
  imports?: string[];
}

/**
 * Dependency graph entry
 */
export interface DependencyGraph {
  /** Map of file path to its dependencies */
  dependencies: Record<string, string[]>;
}

/**
 * Symbol table entry
 */
export interface SymbolTable {
  /** Map of symbol name to its definition */
  symbols: Record<string, {
    /** Symbol definition location */
    location: string;
    /** Symbol type */
    type: string;
  }>;
}

/**
 * Code-specific data for an agent
 */
export interface AgentCode {
  /** Programming language */
  language: string;
  /** Project file tree */
  fileTree: FileNode;
  /** Dependency graph */
  dependencies: DependencyGraph;
  /** Symbol index */
  symbolIndex: SymbolTable;
}

/**
 * Safety configuration for an agent
 */
export interface SafetyConfig {
  /** Ethics boundaries */
  ethicsBoundaries: {
    doNotHarm: boolean;
    preservePrivacy: boolean;
    noDeception: boolean;
    authorizedAccessOnly: boolean;
  };
  /** Dangerous action classifications */
  dangerousActions: {
    dataDestruction: 'block' | 'confirm' | 'allow';
    agentTermination: 'confirm' | 'allow';
    externalPublishing: 'confirm' | 'block';
    resourceExhaustion: 'block' | 'confirm';
  };
  /** Human escalation triggers */
  escalationTriggers: {
    ethicsViolation: 'immediate';
    costExceeded: 'threshold';
    recursiveModification: 'approval';
    persistentFailure: 'threshold';
    securityBreach: 'immediate';
  };
}

/**
 * Context information for an agent
 */
export interface AgentContext {
  /** Input context items */
  inputContext: string[];
  /** Output context items */
  outputContext: string[];
  /** Shared context items */
  sharedContext: string[];
  /** Current context size */
  contextSize: number;
  /** Maximum context window size */
  contextWindow: number;
  /** Current context usage percentage */
  contextUsage: number;
}

/**
 * Core Agent model representing an active agent in the system
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;
  /** Human-readable label */
  label?: string;
  /** Current status */
  status: AgentStatus;
  /** Model identifier being used */
  model: string;
  /** Current task being executed */
  task: string;
  /** When the agent was spawned */
  spawnedAt: Date;
  /** When the agent completed (if applicable) */
  completedAt?: Date;
  /** Total runtime in milliseconds */
  runtime: number;
  
  /** Pause state information */
  pauseTime?: Date;
  pausedBy?: string;
  
  /** Swarm identifier for grouping */
  swarmId?: string;
  /** Parent agent ID for hierarchy */
  parentId?: string;
  /** Child agent IDs */
  childIds: string[];
  
  /** Context management information */
  context: AgentContext;
  
  /** Code-specific data */
  code?: AgentCode;
  
  /** Reasoning and decision data */
  reasoning?: AgentReasoning;
  
  /** Retry tracking */
  retryCount: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Last error message */
  lastError?: string;
  
  /** Budget limit */
  budgetLimit?: number;
  /** Safety boundaries */
  safetyBoundaries?: SafetyConfig;
  
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Options for creating an agent
 */
export interface CreateAgentOptions {
  /** Unique identifier (optional, auto-generated if not provided) */
  id?: string;
  /** Human-readable label */
  label?: string;
  /** Model identifier */
  model: string;
  /** Initial task description */
  task: string;
  /** Swarm identifier */
  swarmId?: string;
  /** Parent agent ID */
  parentId?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Budget limit */
  budgetLimit?: number;
  /** Initial context items */
  contextItems?: string[];
  /** Programming language (for code agents) */
  language?: string;
}

/**
 * Creates a new Agent instance
 * 
 * @param options - Agent creation options
 * @returns A new Agent instance
 * 
 * @example
 * ```typescript
 * const agent = createAgent({
 *   model: 'kimi-k2.5',
 *   task: 'Implement user authentication',
 *   label: 'Auth Agent',
 *   maxRetries: 3
 * });
 * ```
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const id = options.id || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  const initialContext: string[] = options.contextItems || [];
  
  return {
    id,
    label: options.label,
    status: AgentStatus.PENDING,
    model: options.model,
    task: options.task,
    spawnedAt: now,
    runtime: 0,
    swarmId: options.swarmId,
    parentId: options.parentId,
    childIds: [],
    context: {
      inputContext: initialContext,
      outputContext: [],
      sharedContext: [],
      contextSize: initialContext.length,
      contextWindow: 100000, // Default context window
      contextUsage: 0
    },
    code: options.language ? {
      language: options.language,
      fileTree: {
        name: 'root',
        path: '/',
        type: 'directory',
        children: {}
      },
      dependencies: { dependencies: {} },
      symbolIndex: { symbols: {} }
    } : undefined,
    reasoning: {
      traces: [],
      decisions: [],
      confidence: 1.0
    },
    retryCount: 0,
    maxRetries: options.maxRetries ?? 3,
    lastError: undefined,
    budgetLimit: options.budgetLimit,
    metadata: {}
  };
}

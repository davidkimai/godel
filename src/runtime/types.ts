/**
 * Agent Runtime Types
 *
 * Core type definitions for the agent runtime abstraction layer.
 * Provides a unified interface for managing agent lifecycles across
 * different runtime implementations (Pi, OpenClaw, etc.).
 *
 * @module runtime/types
 */

// ============================================================================
// Core Runtime Interface
// ============================================================================

/**
 * Agent runtime interface - implemented by all runtime adapters
 *
 * Provides lifecycle management for agent instances including spawning,
 * execution, monitoring, and termination.
 */
export interface AgentRuntime {
  /** Unique runtime identifier */
  readonly id: string;

  /** Human-readable runtime name */
  readonly name: string;

  /**
   * Spawn a new agent instance
   *
   * @param config - Agent spawn configuration
   * @returns Promise resolving to the spawned agent
   * @throws Error if spawn fails
   */
  spawn(config: SpawnConfig): Promise<Agent>;

  /**
   * Terminate an agent instance
   *
   * @param agentId - ID of the agent to kill
   * @returns Promise resolving when termination is complete
   * @throws Error if agent not found or kill fails
   */
  kill(agentId: string): Promise<void>;

  /**
   * Execute a command on an agent
   *
   * @param agentId - ID of the target agent
   * @param command - Command to execute
   * @returns Promise resolving to execution result
   * @throws Error if agent not found or execution fails
   */
  exec(agentId: string, command: string): Promise<ExecResult>;

  /**
   * Get the status of an agent
   *
   * @param agentId - ID of the agent to check
   * @returns Promise resolving to agent status
   * @throws Error if agent not found
   */
  status(agentId: string): Promise<AgentStatus>;

  /**
   * List all managed agents
   *
   * @returns Promise resolving to array of agents
   */
  list(): Promise<Agent[]>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for spawning a new agent
 */
export interface SpawnConfig {
  /** Optional agent name (auto-generated if not provided) */
  name?: string;

  /** Model identifier to use */
  model?: string;

  /** Provider identifier (e.g., 'anthropic', 'openai') */
  provider?: string;

  /** Working directory for the agent */
  workdir?: string;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** System prompt for the agent */
  systemPrompt?: string;

  /** Tools to enable */
  tools?: string[];

  /** Timeout for agent operations (milliseconds) */
  timeout?: number;

  /** Additional runtime-specific options */
  options?: Record<string, unknown>;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent instance representation
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;

  /** Human-readable agent name */
  name: string;

  /** Current agent status */
  status: AgentStatus;

  /** Runtime identifier that manages this agent */
  runtime: string;

  /** Model identifier being used */
  model: string;

  /** Process ID (if applicable) */
  pid?: number;

  /** Agent creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt?: Date;

  /** Agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent status values
 */
export type AgentStatus = 'pending' | 'running' | 'error' | 'stopped';

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Result of executing a command on an agent
 */
export interface ExecResult {
  /** Standard output from the command */
  stdout: string;

  /** Standard error from the command */
  stderr: string;

  /** Exit code (0 = success) */
  exitCode: number;

  /** Execution duration in milliseconds */
  duration: number;

  /** Additional metadata about the execution */
  metadata?: ExecMetadata;
}

/**
 * Metadata for command execution
 */
export interface ExecMetadata {
  /** Token usage statistics */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };

  /** Model used for execution */
  model?: string;

  /** Provider used for execution */
  provider?: string;

  /** Number of tool calls made */
  toolCalls?: number;

  /** Execution timestamp */
  timestamp?: Date;
}

// ============================================================================
// Runtime Events
// ============================================================================

/**
 * Events that can be emitted by AgentRuntime implementations
 */
export interface RuntimeEvents {
  /** Emitted when an agent is spawned */
  'agent.spawned': (agent: Agent) => void;

  /** Emitted when an agent is terminated */
  'agent.killed': (agentId: string, reason?: string) => void;

  /** Emitted when agent status changes */
  'agent.status_changed': (agentId: string, previous: AgentStatus, current: AgentStatus) => void;

  /** Emitted when an agent error occurs */
  'agent.error': (agentId: string, error: Error) => void;

  /** Emitted when a command completes */
  'exec.completed': (agentId: string, result: ExecResult) => void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for runtime operations
 */
export class RuntimeError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

/**
 * Error thrown when an agent is not found
 */
export class AgentNotFoundError extends RuntimeError {
  constructor(agentId: string) {
    super(
      `Agent not found: ${agentId}`,
      'AGENT_NOT_FOUND',
      { agentId }
    );
    this.name = 'AgentNotFoundError';
  }
}

/**
 * Error thrown when agent spawn fails
 */
export class SpawnError extends RuntimeError {
  constructor(message: string, cause?: Error) {
    super(
      `Failed to spawn agent: ${message}`,
      'SPAWN_FAILED',
      { cause: cause?.message }
    );
    this.name = 'SpawnError';
  }
}

/**
 * Error thrown when command execution fails
 */
export class ExecError extends RuntimeError {
  constructor(agentId: string, command: string, exitCode: number, stderr: string) {
    super(
      `Command execution failed on agent ${agentId}: ${stderr}`,
      'EXEC_FAILED',
      { agentId, command, exitCode, stderr }
    );
    this.name = 'ExecError';
  }
}

// ============================================================================
// Runtime Factory
// ============================================================================

/**
 * Runtime configuration for factory
 */
export interface RuntimeConfig {
  /** Runtime type identifier */
  type: 'pi' | 'openclaw' | 'mock';

  /** Runtime-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Factory function type for creating runtimes
 */
export type RuntimeFactory = (config: RuntimeConfig) => AgentRuntime;

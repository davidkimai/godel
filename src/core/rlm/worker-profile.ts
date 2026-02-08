/**
 * @fileoverview RLMWorker Agent Profile - Recursive Language Model Worker
 *
 * Defines the core RLMWorker interface and supporting types for Godel's
 * Recursive Language Model integration. RLMWorkers execute code in isolated
 * REPL environments with recursive sub-calling capabilities.
 *
 * Based on SPEC-003: RLM Integration Specification
 * @module @godel/core/rlm/worker-profile
 * @version 1.0.0
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Status of an RLMWorker instance
 */
export enum WorkerStatus {
  /** Worker is idle and available for tasks */
  IDLE = 'idle',
  /** Worker is currently executing a task */
  BUSY = 'busy',
  /** Worker encountered an error and needs recovery */
  ERROR = 'error',
  /** Worker has been terminated and is no longer usable */
  TERMINATED = 'terminated',
}

/**
 * Metadata for context references
 */
export interface ContextMetadata {
  /** Content type (e.g., 'text/plain', 'application/json') */
  contentType: string;
  /** Size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  modifiedAt: Date;
  /** Checksum for integrity verification */
  checksum?: string;
  /** Additional metadata key-value pairs */
  properties?: Record<string, unknown>;
}

/**
 * Reference to a context stored externally
 *
 * Context is treated as a symbolic object rather than neural input,
 * enabling processing of datasets larger than context windows.
 *
 * @example
 * ```typescript
 * const context: ContextReference = {
 *   uri: 'gs://bucket/dataset.json',
 *   metadata: { contentType: 'application/json', size: 104857600 }
 * };
 * ```
 */
export interface ContextReference {
  /** URI pointing to context location (gs://, s3://, file://, etc.) */
  uri: string;
  /** Context metadata */
  metadata: ContextMetadata;
}

/**
 * Byte range for partial context reading
 */
export interface ByteRange {
  /** Start byte position (inclusive) */
  start: number;
  /** End byte position (exclusive) */
  end: number;
}

/**
 * Chunk of context data for streaming operations
 */
export interface ContextChunk {
  /** Chunk index */
  index: number;
  /** Byte range of this chunk */
  range: ByteRange;
  /** Chunk data */
  data: Buffer | string;
  /** Total number of chunks */
  totalChunks: number;
}

/**
 * Result of code execution in REPL environment
 */
export interface ExecutionResult {
  /** Exit code (0 for success, non-zero for error) */
  code: number;
  /** Standard output from execution */
  output: string;
  /** Standard error output if any */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Peak memory usage in bytes */
  memoryUsage?: number;
  /** Timestamp of execution */
  timestamp: Date;
}

/**
 * Metadata for RLM execution results
 */
export interface RLMResultMetadata {
  /** Number of tokens used in this call */
  tokensUsed: number;
  /** Cost of execution in USD */
  cost: number;
  /** Execution duration in milliseconds */
  duration: number;
  /** Number of child agent calls made */
  childCalls: number;
  /** Current recursion depth */
  recursionDepth: number;
  /** Worker ID that processed the request */
  workerId: string;
}

/**
 * Result from RLM agent execution
 */
export interface RLMResult {
  /** Result output as string */
  result: string;
  /** Execution metadata */
  metadata: RLMResultMetadata;
}

/**
 * Options for invoking a child agent
 */
export interface ChildInvocationOptions {
  /** Maximum tokens for the child call */
  maxTokens?: number;
  /** Temperature for generation (0.0 - 2.0) */
  temperature?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Priority level for scheduling */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Additional metadata passed to child */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for RLMWorker initialization
 */
export interface RLMWorkerConfig {
  /** Worker unique identifier */
  id: string;
  /** Runtime environment ('kata', 'e2b', 'local') */
  runtime: 'kata' | 'e2b' | 'local';
  /** Maximum recursion depth allowed */
  maxRecursionDepth: number;
  /** Maximum parallel child calls */
  maxParallelChildren: number;
  /** Budget limit in USD for this worker */
  budgetLimit: number;
  /** Timeout per execution in milliseconds */
  executionTimeout: number;
  /** Pre-loaded library names */
  libraries: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Volume mounts for context access */
  volumeMounts: Array<{
    source: string;
    target: string;
    readOnly: boolean;
  }>;
  /** Resource limits */
  resources: {
    memory: number;
    cpu: number;
    disk: number;
  };
}

/**
 * Default worker configuration
 */
export const DEFAULT_WORKER_CONFIG: RLMWorkerConfig = {
  id: '',
  runtime: 'kata',
  maxRecursionDepth: 10,
  maxParallelChildren: 50,
  budgetLimit: 100.0,
  executionTimeout: 300000,
  libraries: ['numpy', 'pandas', 'json', 're', 'math', 'itertools'],
  env: {},
  volumeMounts: [],
  resources: {
    memory: 1024 * 1024 * 1024, // 1GB
    cpu: 1.0,
    disk: 10 * 1024 * 1024 * 1024, // 10GB
  },
};

// =============================================================================
// RLMWorker Interface
// =============================================================================

/**
 * RLMWorker - Recursive Language Model Worker Interface
 *
 * Core abstraction for agents that execute code in isolated REPL environments
 * with support for recursive sub-calling. RLMWorkers form the foundation of
 * Godel's distributed recursive agent runtime.
 *
 * Key capabilities:
 * - Code execution in isolated REPL environments
 * - Context management via external references
 * - Recursive child agent invocation
 * - Resource isolation and safety controls
 *
 * @example
 * ```typescript
 * const worker = await factory.createWorker(config);
 *
 * // Execute code
 * const result = await worker.executeCode('print("Hello, RLM!")');
 *
 * // Manage context
 * const context = await worker.getContext();
 * await worker.setContext(newContext);
 *
 * // Invoke child agent recursively
 * const childResult = await worker.invokeChild(
 *   'Summarize this section',
 *   context
 * );
 * ```
 */
export interface RLMWorker {
  /** Unique worker identifier */
  readonly id: string;
  /** Current worker status */
  readonly status: WorkerStatus;
  /** Worker creation timestamp */
  readonly createdAt: Date;
  /** Last activity timestamp */
  readonly lastActivity: Date;
  /** Worker configuration */
  readonly config: RLMWorkerConfig;

  /**
   * Execute code in the worker's REPL environment
   *
   * @param code - Code to execute
   * @returns Execution result with output and metadata
   *
   * @example
   * ```typescript
   * const result = await worker.executeCode('x = [1, 2, 3]; sum(x)');
   * console.log(result.output); // "6"
   * console.log(result.duration); // 15ms
   * ```
   */
  executeCode(code: string): Promise<ExecutionResult>;

  /**
   * Get the current context reference
   *
   * @returns Current context reference
   *
   * @example
   * ```typescript
   * const context = await worker.getContext();
   * console.log(context.uri); // "gs://bucket/context.json"
   * ```
   */
  getContext(): Promise<ContextReference>;

  /**
   * Set the worker's context reference
   *
   * @param context - New context reference
   * @returns Promise that resolves when context is set
   *
   * @example
   * ```typescript
   * await worker.setContext({
   *   uri: 'gs://bucket/new-data.json',
   *   metadata: { contentType: 'application/json', size: 1048576 }
   * });
   * ```
   */
  setContext(context: ContextReference): Promise<void>;

  /**
   * Invoke a child agent with recursive capabilities
   *
   * This method enables recursive decomposition - the core RLM pattern.
   * Child agents have identical architecture to the parent, enabling
   * arbitrary recursion depth (within configured limits).
   *
   * @param query - Query/instruction for the child agent
   * @param context - Context reference to pass to child
   * @param options - Optional invocation parameters
   * @returns Child agent result
   *
   * @example
   * ```typescript
   * const result = await worker.invokeChild(
   *   'Analyze sentiment of this section',
   *   sectionContext,
   *   { maxTokens: 1000, temperature: 0.5 }
   * );
   * console.log(result.result); // "Positive: 0.85"
   * console.log(result.metadata.childCalls); // 0
   * ```
   */
  invokeChild(
    query: string,
    context: ContextReference,
    options?: ChildInvocationOptions
  ): Promise<RLMResult>;

  /**
   * Read a byte range from the context
   *
   * Enables lazy loading of large contexts without loading entire files.
   *
   * @param range - Byte range to read
   * @returns Data buffer for the specified range
   *
   * @example
   * ```typescript
   * const chunk = await worker.readContextRange({ start: 0, end: 65536 });
   * console.log(chunk.toString()); // First 64KB of context
   * ```
   */
  readContextRange(range: ByteRange): Promise<Buffer>;

  /**
   * Stream context in chunks
   *
   * @param chunkSize - Size of each chunk in bytes
   * @returns Async iterable of context chunks
   *
   * @example
   * ```typescript
   * for await (const chunk of worker.iterateContext(1048576)) {
   *   console.log(`Processing chunk ${chunk.index + 1}/${chunk.totalChunks}`);
   *   await processChunk(chunk.data);
   * }
   * ```
   */
  iterateContext(chunkSize: number): AsyncIterable<ContextChunk>;

  /**
   * Get worker health status
   *
   * @returns True if worker is healthy and operational
   */
  health(): Promise<boolean>;

  /**
   * Terminate the worker and cleanup resources
   *
   * @returns Promise that resolves when cleanup is complete
   */
  terminate(): Promise<void>;
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * RLM execution options at the API level
 */
export interface RLMExecutionOptions {
  /** Maximum recursion depth */
  maxRecursionDepth?: number;
  /** Maximum parallel agents */
  maxParallelAgents?: number;
  /** Budget limit in USD */
  budgetLimit?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Runtime environment preference */
  runtime?: 'kata' | 'e2b' | 'local';
}

/**
 * Complete execution result with full metadata
 */
export interface RLMExecutionResult {
  /** Final result string */
  result: string;
  /** Full execution metadata */
  metadata: {
    /** Maximum recursion depth reached */
    recursionDepth: number;
    /** Total agent calls made */
    agentCalls: number;
    /** Total tokens consumed */
    tokensUsed: number;
    /** Total cost in USD */
    cost: number;
    /** Total duration in milliseconds */
    duration: number;
    /** Worker IDs involved */
    workers: string[];
  };
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed recursion depth (safety limit) */
export const MAX_RECURSION_DEPTH = 100;

/** Maximum allowed parallel agents (safety limit) */
export const MAX_PARALLEL_AGENTS = 1000;

/** Maximum budget limit in USD (safety limit) */
export const MAX_BUDGET_LIMIT = 1000.0;

/** Default chunk size for context streaming (1MB) */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a context reference from a URI
 *
 * @param uri - Context URI (gs://, s3://, file://, etc.)
 * @param metadata - Optional metadata
 * @returns ContextReference object
 */
export function createContextReference(
  uri: string,
  metadata?: Partial<ContextMetadata>
): ContextReference {
  return {
    uri,
    metadata: {
      contentType: metadata?.contentType ?? 'application/octet-stream',
      size: metadata?.size ?? 0,
      createdAt: metadata?.createdAt ?? new Date(),
      modifiedAt: metadata?.modifiedAt ?? new Date(),
      checksum: metadata?.checksum,
      properties: metadata?.properties ?? {},
    },
  };
}

/**
 * Validate worker configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateWorkerConfig(config: RLMWorkerConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.id) {
    errors.push('Worker ID is required');
  }

  if (config.maxRecursionDepth < 1 || config.maxRecursionDepth > MAX_RECURSION_DEPTH) {
    errors.push(`maxRecursionDepth must be between 1 and ${MAX_RECURSION_DEPTH}`);
  }

  if (config.maxParallelChildren < 1 || config.maxParallelChildren > MAX_PARALLEL_AGENTS) {
    errors.push(`maxParallelChildren must be between 1 and ${MAX_PARALLEL_AGENTS}`);
  }

  if (config.budgetLimit < 0 || config.budgetLimit > MAX_BUDGET_LIMIT) {
    errors.push(`budgetLimit must be between 0 and ${MAX_BUDGET_LIMIT}`);
  }

  if (config.executionTimeout < 1000) {
    errors.push('executionTimeout must be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Default export
export default {
  DEFAULT_WORKER_CONFIG,
  MAX_RECURSION_DEPTH,
  MAX_PARALLEL_AGENTS,
  MAX_BUDGET_LIMIT,
  DEFAULT_CHUNK_SIZE,
  createContextReference,
  validateWorkerConfig,
};

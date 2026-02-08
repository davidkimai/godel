/**
 * @fileoverview RLM Module - Recursive Language Model Integration
 *
 * Core module for Godel's Recursive Language Model support. Provides
 * RLMWorker agents, REPL environments, and factory/registry infrastructure
 * for distributed recursive agent execution.
 *
 * Based on SPEC-003: RLM Integration Specification
 * @module @godel/core/rlm
 * @version 1.0.0
 */

// =============================================================================
// Worker Profile Exports
// =============================================================================

export {
  // Types
  WorkerStatus,
  ContextMetadata,
  ContextReference,
  ByteRange,
  ContextChunk,
  ExecutionResult,
  RLMResultMetadata,
  RLMResult,
  ChildInvocationOptions,
  RLMWorkerConfig,
  RLMExecutionOptions,
  RLMExecutionResult,

  // Constants
  DEFAULT_WORKER_CONFIG,
  MAX_RECURSION_DEPTH,
  MAX_PARALLEL_AGENTS,
  MAX_BUDGET_LIMIT,
  DEFAULT_CHUNK_SIZE,

  // Functions
  createContextReference,
  validateWorkerConfig,
} from './worker-profile';

export type { RLMWorker } from './worker-profile';

// =============================================================================
// REPL Environment Exports
// =============================================================================

export {
  // Classes
  REPLEnvironment,

  // Functions
  createREPLEnvironment,

  // Constants
  DOCKERFILE_TEMPLATE,
  DEFAULT_CHUNK_SIZE as REPL_DEFAULT_CHUNK_SIZE,
  MAX_CONTEXT_SIZE,
  DEFAULT_EXECUTION_TIMEOUT,
  SUPPORTED_LIBRARIES,
} from './repl-environment';

export type {
  Library,
  FileOperationResult,
  ContextUtils,
  FileOperations,
  REPLOutput,
  REPLConfig,
} from './repl-environment';

// =============================================================================
// Worker Factory Exports
// =============================================================================

export {
  // Classes
  WorkerRegistry,
  RLMWorkerFactory,

  // Singleton functions
  getWorkerRegistry,
  getRLMWorkerFactory,
  resetFactory,
  configureFactory,
} from './worker-factory';

export type {
  RegistryEvent,
  RegistryStats,
  FactoryConfig,
  FactoryStats,
} from './worker-factory';

// =============================================================================
// Module Constants
// =============================================================================

/** RLM module version */
export const RLM_MODULE_VERSION = '1.0.0';

/** RLM module name */
export const RLM_MODULE_NAME = '@godel/core/rlm';

// =============================================================================
// Module Info
// =============================================================================

/**
 * Get RLM module information
 *
 * @returns Module information
 */
export function getRLMModuleInfo(): {
  name: string;
  version: string;
  components: string[];
} {
  return {
    name: RLM_MODULE_NAME,
    version: RLM_MODULE_VERSION,
    components: [
      'worker-profile',
      'repl-environment',
      'worker-factory',
      'context-management',
      'recursion-controls',
    ],
  };
}

// Default export
export default {
  RLM_MODULE_VERSION,
  RLM_MODULE_NAME,
  getRLMModuleInfo,
};

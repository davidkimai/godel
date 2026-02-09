/**
 * @fileoverview Runtime Module - RuntimeProvider Abstraction Layer
 *
 * Provides type definitions and interfaces for the RuntimeProvider abstraction
 * supporting Worktree, Kata, and E2B runtime environments.
 *
 * @module @godel/core/runtime
 * @version 1.0.0
 * @see SPEC-002
 */

// ============================================================================
// Import Types (needed for constants)
// ============================================================================

import type {
  RuntimeType,
  RuntimeState,
  RuntimeEvent,
  ResourceLimits,
  NetworkConfig,
  ExecutionOptions,
} from './types';

// ============================================================================
// Configuration Types
// ============================================================================

export type {
  SpawnConfig,
  ResourceLimits,
  NetworkConfig,
  NetworkMode,
  NetworkPolicy,
  VolumeMount,
  RuntimeFilters,
} from './types';

// ============================================================================
// Runtime Types
// ============================================================================

export type {
  RuntimeType,
  RuntimeState,
  RuntimeMetadata,
  AgentRuntime,
} from './types';

// ============================================================================
// Resource Types
// ============================================================================

export type {
  ResourceUsage,
  NetworkStats,
  GpuStats,
} from './types';

// ============================================================================
// Execution Types
// ============================================================================

export type {
  ExecutionOptions,
  ExecutionResult,
  ExecutionOutput,
  ExecutionMetadata,
} from './types';

// ============================================================================
// Snapshot Types
// ============================================================================

export type {
  Snapshot,
  SnapshotMetadata,
} from './types';

// ============================================================================
// Event Types
// ============================================================================

export type {
  RuntimeEvent,
  EventData,
  EventHandler,
  EventSubscriptionOptions,
} from './types';

// ============================================================================
// Status and Metrics Types
// ============================================================================

export type {
  RuntimeStatus,
  RuntimeMetrics,
} from './types';

// ============================================================================
// Provider Types
// ============================================================================

export type {
  RuntimeCapabilities,
  ProviderConfig,
} from './types';

// ============================================================================
// Error Types
// ============================================================================

export type {
  RuntimeErrorCode,
  ErrorContext,
} from './types';

// ============================================================================
// RuntimeProvider Interface
// ============================================================================

export type { RuntimeProvider } from './runtime-provider';

// ============================================================================
// Factory
// ============================================================================

export {
  RuntimeProviderFactory,
  getFactory,
  resetFactory,
  ProviderNotRegisteredError,
  ProviderAlreadyRegisteredError,
  FactoryInitializationError,
} from './runtime-provider-factory';

export type {
  ProviderFactory,
  ConfigSource,
  FactoryConfig,
} from './runtime-provider-factory';

// ============================================================================
// Provider Implementations
// ============================================================================

export {
  WorktreeRuntimeProvider,
  type WorktreeRuntimeProviderConfig,
} from './providers/worktree-runtime-provider';

// ============================================================================
// Constants
// ============================================================================

/** Runtime module version */
export const RUNTIME_VERSION = '1.0.0';

/** Runtime module name */
export const RUNTIME_MODULE_NAME = '@godel/core/runtime';

/** Supported runtime types */
export const SUPPORTED_RUNTIMES: RuntimeType[] = ['worktree', 'kata', 'e2b'];

/** Valid runtime states */
export const VALID_RUNTIME_STATES: RuntimeState[] = [
  'pending',
  'creating',
  'running',
  'paused',
  'terminating',
  'terminated',
  'error',
];

/** Valid runtime events */
export const VALID_RUNTIME_EVENTS: RuntimeEvent[] = [
  'stateChange',
  'error',
  'resourceWarning',
  'healthCheck',
  'executionStart',
  'executionEnd',
];

/** Default resource limits */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  cpu: 1,
  memory: '512Mi',
  disk: '10Gi',
  agents: 10,
};

/** Default network configuration */
export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  mode: 'bridge',
};

/** Default execution options */
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeout: 300,
  captureStdout: true,
  captureStderr: true,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a runtime type is valid
 *
 * @param runtime - Runtime type to check
 * @returns True if valid
 */
export function isValidRuntimeType(runtime: string): runtime is RuntimeType {
  return SUPPORTED_RUNTIMES.includes(runtime as RuntimeType);
}

/**
 * Check if a runtime state is valid
 *
 * @param state - Runtime state to check
 * @returns True if valid
 */
export function isValidRuntimeState(state: string): state is RuntimeState {
  return VALID_RUNTIME_STATES.includes(state as RuntimeState);
}

/**
 * Check if a runtime event is valid
 *
 * @param event - Runtime event to check
 * @returns True if valid
 */
export function isValidRuntimeEvent(event: string): event is RuntimeEvent {
  return VALID_RUNTIME_EVENTS.includes(event as RuntimeEvent);
}

/**
 * Check if a runtime is in an active state
 *
 * @param state - Runtime state
 * @returns True if active (running or paused)
 */
export function isRuntimeActive(state: RuntimeState): boolean {
  return state === 'running' || state === 'paused';
}

/**
 * Check if a runtime is in a terminal state
 *
 * @param state - Runtime state
 * @returns True if terminal (terminated or error)
 */
export function isRuntimeTerminal(state: RuntimeState): boolean {
  return state === 'terminated' || state === 'error';
}

/**
 * Get runtime module information
 *
 * @returns Module information object
 */
export function getRuntimeModuleInfo(): {
  name: string;
  version: string;
  supportedRuntimes: RuntimeType[];
  validStates: RuntimeState[];
  validEvents: RuntimeEvent[];
} {
  return {
    name: RUNTIME_MODULE_NAME,
    version: RUNTIME_VERSION,
    supportedRuntimes: SUPPORTED_RUNTIMES,
    validStates: VALID_RUNTIME_STATES,
    validEvents: VALID_RUNTIME_EVENTS,
  };
}

// Default export - Runtime module info
export default {
  name: RUNTIME_MODULE_NAME,
  version: RUNTIME_VERSION,
  get info() {
    return getRuntimeModuleInfo();
  },
};

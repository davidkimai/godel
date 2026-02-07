/**
 * Runtime Module
 *
 * Central exports for the agent runtime abstraction layer.
 * Provides unified interfaces for managing agent lifecycles across
 * different runtime implementations.
 *
 * @module runtime
 * @example
 * ```typescript
 * import { getRuntimeRegistry, PiRuntime, AgentRuntime } from '@jtan15010/godel/runtime';
 *
 * // Get the global registry
 * const registry = getRuntimeRegistry();
 *
 * // Register the Pi runtime
 * registry.register(new PiRuntime());
 *
 * // Get default runtime and spawn an agent
 * const runtime = registry.getDefault();
 * const agent = await runtime.spawn({ name: 'my-agent' });
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export {
  /** Core runtime interface implemented by all runtime adapters */
  AgentRuntime,
  /** Configuration for spawning a new agent */
  SpawnConfig,
  /** Agent instance representation */
  Agent,
  /** Result of executing a command on an agent */
  ExecResult,
  /** Agent status values */
  AgentStatus,
  /** Events emitted by AgentRuntime implementations */
  RuntimeEvents,
  /** Base error for runtime operations */
  RuntimeError,
  /** Error thrown when an agent is not found */
  AgentNotFoundError,
  /** Error thrown when agent spawn fails */
  SpawnError,
  /** Error thrown when command execution fails */
  ExecError,
  /** Runtime configuration for factory */
  RuntimeConfig as RuntimeFactoryConfig,
  /** Factory function type for creating runtimes */
  RuntimeFactory,
  /** Metadata for command execution */
  ExecMetadata,
} from './types';

// ============================================================================
// Runtime Implementations
// ============================================================================

// Pi Runtime - Multi-model agent runtime using Pi CLI
export {
  PiRuntime,
  PiClientRuntimeConfig,
  getGlobalPiRuntime,
  resetGlobalPiRuntime,
  hasGlobalPiRuntime,
} from './pi';

// Native Runtime - Direct process-based agent runtime
export {
  NativeRuntime,
  NativeRuntimeConfig as NativeClientRuntimeConfig,
  getGlobalNativeRuntime,
  resetGlobalNativeRuntime,
  hasGlobalNativeRuntime,
} from './native';

// ============================================================================
// Registry
// ============================================================================

export {
  /** Registry for managing multiple agent runtimes */
  RuntimeRegistry,
  /** Get the global RuntimeRegistry singleton instance */
  getRuntimeRegistry,
  /** Reset the global RuntimeRegistry singleton */
  resetRuntimeRegistry,
  /** Runtime configuration loaded from config file */
  RuntimeConfig,
  /** Pi runtime-specific configuration */
  PiRuntimeConfig,
  /** Native runtime-specific configuration */
  NativeRuntimeConfig,
  /** Load runtime configuration from config file */
  loadRuntimeConfig,
  /** Save runtime configuration to user-global config file */
  saveRuntimeConfig,
  /** Get metadata about available runtime types */
  getAvailableRuntimes,
  /** Available runtime types with metadata */
  AVAILABLE_RUNTIMES,
} from './registry';

// ============================================================================
// Multi-Runtime Adapter
// ============================================================================

export {
  MultiRuntime,
  getGlobalMultiRuntime,
  resetGlobalMultiRuntime,
  DEFAULT_MULTI_RUNTIME_CONFIG,
  DEFAULT_PROVIDER_CHAIN,
} from './multi-runtime';

export type {
  MultiRuntimeConfig,
  MultiRuntimeAgent,
  RoutingStrategyType,
  ProviderStatus,
} from './multi-runtime';

// ============================================================================
// Version
// ============================================================================

/** Runtime module version */
export const RUNTIME_VERSION = '2.0.0';

/**
 * Pi Integration Module
 *
 * Provides integration with Pi CLI for multi-model agent orchestration.
 * Includes the PiRegistry for instance management and discovery.
 *
 * @example
 * ```typescript
 * import { PiRegistry, getGlobalPiRegistry } from './integrations/pi';
 *
 * const registry = getGlobalPiRegistry({
 *   discoveryStrategies: [
 *     { type: 'static', instances: [...] }
 *   ]
 * });
 *
 * const instance = registry.selectInstance({ preferredProvider: 'anthropic' });
 * ```
 */

// Export PiClient class and types
export {
  PiClient,
  PiClientConfig,
  SessionInitConfig,
  MessageOptions,
  RpcRequest,
  RpcResponse,
  RpcError,
  MessageResponse,
  StreamChunk,
  SessionInfo,
  TreeInfo,
  TreeNodeInfo,
  BranchInfo,
  CompactResult,
  PiClientError,
  ConnectionError,
  RpcRequestError,
  TimeoutError,
  SessionError,
  PiClientEvents,
  // Re-export with distinct names to avoid conflicts with types.ts
  ToolCall as PiClientToolCall,
  ToolResult as PiClientToolResult,
  SessionStatus as PiClientSessionStatus,
} from './client';

// Export PiRegistry class and singleton functions
export {
  PiRegistry,
  getGlobalPiRegistry,
  resetGlobalPiRegistry,
  hasGlobalPiRegistry,
} from './registry';

// Export PiSessionManager class and singleton functions
export {
  PiSessionManager,
  getGlobalPiSessionManager,
  resetGlobalPiSessionManager,
  hasGlobalPiSessionManager,
} from './session';

// Export State Synchronizer
export {
  HybridStateSynchronizer,
  createStateSynchronizer,
} from './sync';

// Export all types
export type {
  // Core types
  PiInstance,
  HealthStatus,
  InstanceCapacity,
  ProviderId,
  PiCapability,
  DeploymentMode,

  // Discovery types
  DiscoveryStrategy,
  DiscoveryStrategyType,
  StaticDiscoveryConfig,
  OpenClawDiscoveryConfig,
  KubernetesDiscoveryConfig,
  AutoSpawnDiscoveryConfig,
  SpawnConfig,
  DiscoveryResult,

  // Configuration
  PiRegistryConfig,

  // Selection types
  SelectionCriteria,
  CapacityReport,
  ProviderCapacity,
  RegionCapacity,
  SelectionResult,

  // Health types
  HealthCheckResult,

  // Events
  PiRegistryEvents,
  PiRegistryEventEmitter,

  // Errors
  PiRegistryError,
  InstanceNotFoundError,
  DiscoveryError,
  SelectionError,

  // Defaults
  DEFAULT_INSTANCE_CAPACITY,
  DEFAULT_HEALTH_MONITORING,
  DEFAULT_CIRCUIT_BREAKER,

  // Session types
  PiSession,
  SessionState,
  SessionConfig,
  ConversationNode,
  ToolCall,
  ToolResult,
  ToolCallState,
  Checkpoint,
  CheckpointTrigger,
  SerializedConversationNode,
  SerializedToolState,
  SessionFilter,
  TerminateOptions,
  SessionManagerDeps,
  ModelRouterInterface,
  PiRegistryInterface,
  StateSynchronizer,
  StorageAdapter,
  EnhancedStateSynchronizer,
  SessionStatus,
  CheckpointTriggerType,
  CheckpointMetadata,
  CheckpointData,
  SynchronizerSessionState,
  TreeNode,
  ConversationTree,
  RedisClient,
  RedisPipeline,
  PostgresClient,
  PostgresQueryResult,
  Logger,
  PiSessionEvents,
  PiSessionEventEmitter,
  SessionManagerError,
  SessionNotFoundError,
  InvalidStateTransitionError,
  CheckpointError,
  MigrationError,
  DEFAULT_SESSION_PERSISTENCE,
} from './types';

// Export ModelRouter
export {
  ModelRouter,
  costOptimizedStrategy,
  capabilityStrategy,
  latencyStrategy,
  fallbackStrategy,
  estimateCost,
  scoreCapabilityMatch,
  classifyError,
  getRetryDelay,
} from './router';

// Export router types
export type {
  RoutingRequest,
  RoutingDecision,
  RoutingStrategy,
  StrategyResult,
  RoutingContext,
  CostEstimate,
  CostRecord,
  ExtendedHealthStatus,
  RoutingResult,
  RouterConfig,
  ErrorCategory,
} from './router';

// Export ToolInterceptor and tools
export {
  // Classes
  ToolInterceptor,
  DefaultAuditLogger,
  // Built-in tools
  readTool,
  writeTool,
  editTool,
  bashTool,
  todoWriteTool,
  treeNavigateTool,
  // Constants
  BUILTIN_TOOLS,
  BUILTIN_TOOL_NAMES,
  DEFAULT_POLICIES,
  // Utility functions
  resolveInWorktree,
  executeBash,
  applyEdits,
  generateDiff,
  // Factory functions
  createDefaultToolInterceptor,
  createReadOnlyToolInterceptor,
  createKubernetesExecutor,
} from './tools';

// Export tool types
export type {
  ToolCall,
  ToolResult,
  ToolContext,
  JSONSchema,
  Tool,
  PolicyDecision,
  ToolPolicy,
  RemoteExecutor,
  AuditLogEntry,
  AuditLogger,
  AuditQuery,
  TodoItem,
  EditOperation,
  BuiltInToolName,
} from './tools';

// Default export
export { PiRegistry as default } from './registry';

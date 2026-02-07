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

} from './client';

// Export PiRuntime class and singleton functions
export {
  PiRuntime,
  getGlobalPiRuntime,
  resetGlobalPiRuntime,
  hasGlobalPiRuntime,
} from './runtime';

// Export PiRuntime types
export type {
  PiRuntimeConfig,
  PiRuntimeSession,
  PiSpawnOptions,
  ExecResult,
  PiRuntimeEvents,
} from './runtime';

// Export PiRuntime errors
export {
  PiRuntimeError,
  SpawnError,
  SessionNotFoundError as RuntimeSessionNotFoundError,
  PortAllocationError,
  MaxInstancesError,
} from './runtime';

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
  ToolCall as PiSessionToolCall,
  ToolResult as PiSessionToolResult,
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

// Export SessionTreeManager and tree types
export {
  SessionTreeManager,
  calculateTokenCount,
} from './tree';

// Export tree types
export type {
  MessageRole,
  BranchStatus,
  MessageNode,
  Branch,
  TreeMetadata,
  NodeOptions,
  SessionConfig as TreeSessionConfig,
  PiSession as TreePiSession,
  CompactionReport,
  MessageForLLM,
  TreeVisualization,
  VisualNode,
  VisualConnection,
  VisualBranch,
  BranchVisualization,
  StorageAdapter as TreeStorageAdapter,
} from './tree';

// Export ProviderManager and provider management
export {
  ProviderManager,
  getGlobalProviderManager,
  resetGlobalProviderManager,
  PROVIDER_CONFIGS,
  DEFAULT_PROVIDER_CHAIN,
  getProviderConfig,
  getAllProviderConfigs,
  isValidProvider,
  getProvidersByCapability,
  getProvidersByPriority,
  providerRequiresAuth,
  getProviderApiKeyEnvVar,
  createProviderInstance,
  getProviderLatency,
  getProviderQualityScore,
  getProviderContextWindow,
} from './provider';

// Export provider types
export type {
  ProviderConfig,
} from './provider';

// Export FallbackChainManager
export {
  FallbackChainManager,
  getGlobalFallbackManager,
  resetGlobalFallbackManager,
  buildPriorityChain,
  buildCapabilityChain,
  buildLatencyChain,
  buildHybridChain,
  buildFallbackChain,
  executeWithFallback,
  DEFAULT_FALLBACK_CONFIG,
} from './fallback';

// Export fallback types
export type {
  FallbackStrategy,
  FallbackChainConfig,
  FallbackAttempt,
  FallbackChainResult,
  FallbackChainEntry,
} from './fallback';

// Export CostRouter
export {
  CostRouter,
  getGlobalCostRouter,
  resetGlobalCostRouter,
  MODEL_PRICING,
  getCheapestModel,
  calculateCostScore as calculateRouterCostScore,
  calculateQualityScore as calculateRouterQualityScore,
  DEFAULT_BUDGET_CONFIG,
} from './cost-router';

// Export cost router types (CostEstimate and CostRecord are exported from router.ts)
export type {
  BudgetConfig,
  CostRoutingRequest,
  CostRoutingResult,
} from './cost-router';

// Export LatencyRouter
export {
  LatencyRouter,
  getGlobalLatencyRouter,
  resetGlobalLatencyRouter,
  DEFAULT_PROVIDER_LATENCY,
  calculateLatencyScore,
  calculateLatencyStats,
  predictLatency,
  getExpectedLatency,
  DEFAULT_LATENCY_CONFIG,
} from './latency-router';

// Export latency router types
export type {
  LatencyRecord,
  LatencyStats,
  LatencyRoutingRequest,
  LatencyRoutingResult,
  LatencyRouterConfig,
} from './latency-router';

// Note: ExtendedHealthStatus and HealthCheckResult are exported from router.ts and health-monitor.ts
// The router.ts versions are the canonical ones for backwards compatibility

// Export HealthMonitor
export {
  HealthMonitor,
  getGlobalHealthMonitor,
  resetGlobalHealthMonitor,
  DEFAULT_HEALTH_CONFIG,
} from './health-monitor';

// Export health monitor types (ExtendedHealthStatus is from router.ts for compatibility)
export type {
  HealthCheckConfig,
  HealthCheckResult as ProviderHealthCheckResult,
} from './health-monitor';

// Default export
export { PiRegistry as default } from './registry';

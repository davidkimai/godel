/**
 * OpenClaw Integration Module
 * 
 * Provides permission management, sandboxing, and security enforcement
 * for Godel agents using OpenClaw.
 */

// ============================================================================
// Defaults and Configuration
// ============================================================================

export {
  // Constants
  DEFAULT_PERMISSIONS,
  RESTRICTED_PERMISSIONS,
  FULL_PERMISSIONS,
  READONLY_PERMISSIONS,
  DEFAULT_DOCKER_CONFIG,
  RESTRICTED_DOCKER_CONFIG,
  PERMISSIVE_DOCKER_CONFIG,
  DEFAULT_RESOURCE_LIMITS,
  RESTRICTED_RESOURCE_LIMITS,
  GENEROUS_RESOURCE_LIMITS,
  SECURITY_PROFILES,
  DEFAULT_INHERITANCE_OPTIONS,
  STRICT_INHERITANCE_OPTIONS,
  PERMISSIVE_INHERITANCE_OPTIONS,
  // Tool Categories
  ALL_TOOLS,
  DANGEROUS_TOOLS,
  FILE_TOOLS,
  NETWORK_TOOLS,
  SESSION_TOOLS,
  SAFE_TOOLS,
  // Helpers
  validatePermissions,
  isValidSandboxMode,
  computeInheritedPermissions,
} from './defaults';

export type {
  SandboxMode,
  AgentPermissions,
  SandboxConfig,
  SecurityProfile,
  ResourceLimits,
  PermissionInheritanceOptions,
} from './defaults';

// ============================================================================
// Permission Manager
// ============================================================================

export {
  PermissionManager,
  getGlobalPermissionManager,
  resetGlobalPermissionManager,
  // Errors
  PermissionDeniedError,
  ToolNotAllowedError,
  ToolBlacklistedError,
  SandboxRequiredError,
  ResourceLimitExceededError,
} from './PermissionManager';

export type {
  PermissionCheck,
  PermissionViolation,
  PermissionAuditLog,
  PermissionCache,
  PermissionManagerConfig,
} from './PermissionManager';

// ============================================================================
// Sandbox Manager
// ============================================================================

export {
  SandboxManager,
  getGlobalSandboxManager,
  resetGlobalSandboxManager,
  // Errors
  SandboxError,
  ContainerNotFoundError,
  ContainerAlreadyRunningError,
  ResourceLimitError,
  DockerNotAvailableError,
} from './SandboxManager';

export type {
  SandboxContainer,
  ToolExecutionRecord,
  ResourceUsage,
  SandboxOptions,
  ToolExecutionOptions,
  ToolExecutionResult,
  SandboxStats,
  SandboxManagerConfig,
} from './SandboxManager';

// ============================================================================
// Thread Manager
// ============================================================================

export {
  ThreadManager,
  getGlobalThreadManager,
  resetGlobalThreadManager,
} from './ThreadManager';

export type {
  Thread,
  ThreadMessage,
  ThreadCreateOptions,
  ThreadHistoryOptions,
  ThreadStats,
  ThreadEvent,
} from './ThreadManager';

// ============================================================================
// Group Coordinator
// ============================================================================

export {
  GroupCoordinator,
  getGlobalGroupCoordinator,
  resetGlobalGroupCoordinator,
} from './GroupCoordinator';

export type {
  AgentGroup,
  GroupAgent,
  GroupRole,
  AgentPreferences,
  GroupConfig,
  ThreadPermissions,
  GroupCreateOptions,
  MentionRoutingResult,
  CoordinationTask,
  GroupEvent,
} from './GroupCoordinator';

// ============================================================================
// Channel Configuration
// ============================================================================

export {
  ChannelFactory,
  ChannelUtils,
  DEFAULT_CAPABILITIES,
  DEFAULT_CONSTRAINTS,
  PREDEFINED_CHANNELS,
} from './ChannelConfig';

export type {
  ChannelConfig,
  ChannelType,
  ChannelPriority,
  ChannelStatus,
  ChannelCapabilities,
  ChannelConstraints,
} from './ChannelConfig';

// ============================================================================
// Response Aggregation
// ============================================================================

export {
  ResponseAggregator,
  ContentAnalyzer,
  ConflictResolver,
  LatencyOptimizer,
  DEFAULT_AGGREGATION_CONFIG,
} from './ResponseAggregator';

export type {
  AggregatedResponse,
  ChannelResponse,
  ResponseAttachment,
  Conflict,
  ResolutionStrategy,
  AggregationConfig,
} from './ResponseAggregator';

// ============================================================================
// Channel Router
// ============================================================================

export {
  ChannelRouter,
  DEFAULT_ROUTER_CONFIG,
  ChannelUtils as ChannelRouterUtils,
  ChannelFactory as ChannelRouterFactory,
  LatencyOptimizer as ChannelLatencyOptimizer,
  ConflictResolver as ChannelConflictResolver,
} from './ChannelRouter';

export type {
  RouteRequest,
  RouteResult,
  ChannelResult,
  ChannelError,
  RouteMetrics,
  RoutingRule,
  RouteCondition,
  RouteAction,
  RouterConfig,
  SendOptions,
  SendResult,
  RouterStats,
} from './ChannelRouter';

// ============================================================================
// Learning Engine (Phase 4B)
// ============================================================================

export {
  LearningEngine,
  getLearningEngine,
  resetLearningEngine,
} from './LearningEngine';

export type {
  ImprovementRecord,
  StrategyStats,
  PatternMatch,
  ABTest,
  ABTestResults,
  LearningConfig,
  StrategyRecommendation,
} from './LearningEngine';

// ============================================================================
// Improvement Store (Phase 4B)
// ============================================================================

export {
  ImprovementStore,
  getImprovementStore,
  resetImprovementStore,
} from './ImprovementStore';

export type {
  ImprovementEntry,
  ImprovementMetrics,
  ImprovementContext,
  StrategyEffectiveness,
  OptimizationPattern,
  TimeSeriesData,
  QueryFilter,
  AggregatedStats,
  StoreConfig,
} from './ImprovementStore';

// ============================================================================
// Gateway Client
// ============================================================================

export {
  GatewayClient,
  createGatewayClient,
  connectToGateway,
} from './GatewayClient';

export type {
  GatewayClientOptions,
  ConnectionState,
  GatewayStats,
} from './types';

// Export error types from types.ts
export {
  GatewayError,
  ConnectionError,
  TimeoutError,
  DEFAULT_GATEWAY_CONFIG,
  DEFAULT_GATEWAY_OPTIONS,
} from './types';

export type {
  GatewayConfig,
  GatewayErrorCode,
  GatewayClientOptions as GatewayClientOptionsType,
} from './types';

// ============================================================================
// Session Manager
// ============================================================================

export {
  SessionManager,
  getGlobalSessionManager,
  resetGlobalSessionManager,
} from './SessionManager';

export type {
  SessionInfo,
  SessionsListParams,
  SessionsSpawnParams,
  SessionsSpawnResponse,
  SessionsSendParams,
  SessionsSendResponse,
  SessionsHistoryResponse,
  Message,
  Attachment,
  ToolCall,
} from './SessionManager';

// ============================================================================
// Agent Executor
// ============================================================================

export {
  AgentExecutor,
  createAgentExecutor,
} from './AgentExecutor';

export type {
  AgentExecution,
  AgentResult,
  TaskDispatchOptions,
  ExecutorConfig,
} from './AgentExecutor';

// ============================================================================
// ClawHub Types
// ============================================================================

export {
  DEFAULT_CLAWHUB_CONFIG,
  ClawhubError,
  SkillNotFoundError,
  SkillAlreadyInstalledError,
  VersionNotFoundError,
  DependencyError,
} from './ClawHubTypes';

export type {
  SkillMetadata,
  ParsedSkill,
  SkillDependency,
  ConfigSchema,
  SkillSearchParams,
  SkillSearchResult,
  SkillInstallOptions,
  SkillInstallResult,
  LockfileEntry,
  ClawhubLockfile,
  SkillActivationResult,
  SkillActivationState,
  InstalledSkill,
  ClawhubClientConfig,
  ClawhubErrorCode,
} from './ClawHubTypes';

// ============================================================================
// ClawHub Client
// ============================================================================

export {
  ClawHubClient,
  getGlobalClawHubClient,
  resetGlobalClawHubClient,
} from './ClawHubClient';

// ============================================================================
// Skill Installer
// ============================================================================

export {
  SkillInstaller,
  getGlobalSkillInstaller,
  resetGlobalSkillInstaller,
} from './SkillInstaller';

// ============================================================================
// Budget Tracker
// ============================================================================

export {
  BudgetTracker,
  BudgetError,
  BudgetExceededError,
  getBudgetTracker,
  resetBudgetTracker,
} from './BudgetTracker';

export type {
  BudgetConfig,
  BudgetStatus,
  BudgetAlert,
  AgentBudgetRecord,
  TeamBudgetSummary,
  SessionHistoryEntry,
} from './BudgetTracker';

// ============================================================================
// Usage Calculator
// ============================================================================

export {
  UsageCalculator,
  MODEL_PRICING,
  TOOL_COSTS,
  getUsageCalculator,
  resetUsageCalculator,
} from './UsageCalculator';

export type {
  TokenBreakdown,
  ToolUsage,
  UsageMetrics,
  ModelPricing,
  ToolCost,
  CostEstimate,
} from './UsageCalculator';

// ============================================================================
// Tool Executor
// ============================================================================

export {
  OpenClawToolExecutor,
  createToolExecutor,
  GatewayClient as ToolExecutorGatewayClient,
} from './ToolExecutor';

export type {
  ToolExecutorConfig,
  ReadOptions,
  WriteOptions,
  EditOptions,
} from './ToolExecutor';

// ============================================================================
// Tool Result
// ============================================================================

export {
  createSuccessResult,
  createErrorResult,
  isSuccessResult,
  isErrorResult,
  LargeOutputManager,
  ErrorCapture,
  ResultFormatter,
  DEFAULT_STREAM_THRESHOLD,
} from './ToolResult';

export type {
  ToolResult,
  ToolSuccessResult,
  ToolErrorResult,
  ExecResult,
  ExecOptions,
  BrowserAction,
  BrowserResult,
  CanvasAction,
  CanvasResult,
  NodeAction,
  NodeResult,
} from './ToolResult';

// ============================================================================
// OpenClaw Adapter
// ============================================================================

export {
  OpenClawAdapter,
  getOpenClawAdapter,
  resetOpenClawAdapter,
  isOpenClawAdapterInitialized,
} from './adapter';

export type {
  OpenClawAdapterConfig,
  SpawnAgentOptions,
  SpawnAgentResult,
  AgentStatus,
  ActiveAgent,
} from './adapter';

// ============================================================================
// Event Bridge
// ============================================================================

export {
  OpenClawEventBridge,
  getOpenClawEventBridge,
  resetOpenClawEventBridge,
  isOpenClawEventBridgeInitialized,
} from './event-bridge';

export type {
  EventBridgeConfig,
  BridgedEvent,
  EventBridgeStats,
} from './event-bridge';

// ============================================================================
// Event Types and Transformers
// ============================================================================

export {
  DefaultEventTransformer,
  EventTransformerRegistry,
  getEventTransformerRegistry,
  resetEventTransformerRegistry,
} from './types';

export type {
  OpenClawEvent,
  GodelEvent,
  EventTransformer,
} from './types';

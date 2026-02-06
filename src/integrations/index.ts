/**
 * @fileoverview Integrations Module
 *
 * External service integrations for Godel, providing connectivity to
 * third-party tools, services, and APIs.
 *
 * Integrations:
 * - Pi: Multi-model agent orchestration CLI integration
 * - Codex: OpenAI Codex CLI integration
 * - Kimi: Moonshot AI Kimi CLI integration
 * - OpenClaw: Real-time session streaming and management
 *
 * @module @godel/integrations
 * @version 1.0.0
 * @license MIT
 *
 * @example
 * ```typescript
 * import { PiRegistry, KimiClient, CodexClient } from '@godel/integrations';
 *
 * // Use Pi integration
 * const piRegistry = getGlobalPiRegistry(config);
 * const instance = piRegistry.selectInstance({ preferredProvider: 'anthropic' });
 *
 * // Use Kimi integration
 * const kimi = new KimiClient({ apiKey: process.env.KIMI_API_KEY });
 * await kimi.complete({ prompt: 'Hello!' });
 *
 * // Use Codex integration
 * const codex = new CodexClient({ apiKey: process.env.OPENAI_API_KEY });
 * await codex.complete({ prompt: 'Write a function' });
 * ```
 */

// =============================================================================
// Pi Integration
// =============================================================================

/**
 * Pi Integration - Multi-model agent orchestration
 *
 * Provides integration with Pi CLI for managing multiple LLM providers
 * and routing tasks to optimal instances.
 */
export {
  // Core classes
  PiRegistry,
  PiSessionManager,
  ModelRouter,
  HybridStateSynchronizer,
  ToolInterceptor,
  PiClient,

  // Tree management
  SessionTreeManager,
  calculateTokenCount,

  // Tools
  readTool,
  writeTool,
  editTool,
  bashTool,
  todoWriteTool,
  treeNavigateTool,
  BUILTIN_TOOLS,
  BUILTIN_TOOL_NAMES,
  DEFAULT_POLICIES,
  createDefaultToolInterceptor,
  createReadOnlyToolInterceptor,
  resolveInWorktree,
  executeBash,
  applyEdits,
  generateDiff,

  // Router strategies
  costOptimizedStrategy,
  capabilityStrategy,
  latencyStrategy,
  fallbackStrategy,
  estimateCost,
  scoreCapabilityMatch,
  classifyError,
  getRetryDelay,

  // Singleton functions
  getGlobalPiRegistry,
  resetGlobalPiRegistry,
  hasGlobalPiRegistry,
  getGlobalPiSessionManager,
  resetGlobalPiSessionManager,
  hasGlobalPiSessionManager,

  // Client types
  PiClientConfig,
} from './pi';

// Export Pi types separately to avoid naming conflicts
export type {
  // Core types
  PiInstance,
  HealthStatus as PiHealthStatus,
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
  InstanceNotFoundError as PiInstanceNotFoundError,
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
  PiSessionToolCall,
  PiSessionToolResult,
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
  StorageAdapter as PiStorageAdapter,
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

  // Router types
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

  // Tool types
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

  // Tree types
  MessageRole,
  BranchStatus,
  MessageNode,
  Branch,
  TreeMetadata,
  NodeOptions,
  TreeSessionConfig,
  TreePiSession,
  CompactionReport,
  MessageForLLM,
  TreeVisualization,
  VisualNode,
  VisualConnection,
  VisualBranch,
  BranchVisualization,
  TreeStorageAdapter,
} from './pi';

// =============================================================================
// Constants
// =============================================================================

/** Integration module version */
export const INTEGRATIONS_VERSION = '1.0.0';

/** Supported integrations */
export const SUPPORTED_INTEGRATIONS = [
  'pi',
  'kimi',
  'codex',
  'openclaw',
] as const;

/** Integration status */
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

/** Integration info */
export interface IntegrationInfo {
  name: string;
  version: string;
  status: IntegrationStatus;
  capabilities: string[];
}

/**
 * Get information about available integrations
 *
 * @returns Array of integration info objects
 */
export function getIntegrationsInfo(): IntegrationInfo[] {
  return [
    {
      name: 'Pi',
      version: '1.0.0',
      status: 'connected',
      capabilities: ['multi-model', 'routing', 'session-management', 'tree-navigation']
    },
    {
      name: 'Kimi',
      version: '1.0.0',
      status: 'connected',
      capabilities: ['chat', 'code-generation']
    },
    {
      name: 'Codex',
      version: '1.0.0',
      status: 'connected',
      capabilities: ['code-generation', 'code-review']
    },
    {
      name: 'OpenClaw',
      version: '1.0.0',
      status: 'connected',
      capabilities: ['real-time-streaming', 'session-management']
    }
  ];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an integration is supported
 *
 * @param name - Integration name
 * @returns True if the integration is supported
 */
export function isIntegrationSupported(name: string): boolean {
  return SUPPORTED_INTEGRATIONS.includes(name as typeof SUPPORTED_INTEGRATIONS[number]);
}

/**
 * Validate integration configuration
 *
 * @param integration - Integration name
 * @param config - Configuration object
 * @returns Validation result
 */
export function validateIntegrationConfig(
  integration: string,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (integration) {
    case 'pi':
      if (!config["discoveryStrategies"] || !Array.isArray(config["discoveryStrategies"])) {
        errors.push('discoveryStrategies must be an array');
      }
      break;
    default:
      // No specific validation for other integrations
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Default export - PiRegistry as the primary integration
export { PiRegistry as default } from './pi';

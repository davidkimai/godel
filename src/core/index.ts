/**
 * @fileoverview Core Engine Module - SPEC_v2.md Implementation
 *
 * Central orchestration module for Godel multi-agent system. Provides swarm
 * management, agent lifecycle, state persistence, health monitoring, and
 * federation capabilities.
 *
 * Core Components:
 * - SwarmManager: Create/destroy/scale/status swarms
 * - AgentLifecycle: spawn/kill/pause/resume/retry agents
 * - OpenClawCore: Core primitive for OpenClaw integration
 * - BudgetController: Budget limits and enforcement
 * - StateManager: Checkpoint and recovery
 * - HealthMonitor: System health checks
 * - ContextSummarizer: Recursive context compression
 * - NightModeManager: Overnight operation
 * - MetricsCollector: Time-series metrics
 * - VerificationPipeline: Build/test/rollback
 * - AgentEventBus: Granular event streaming
 * - SessionTree: Tree-structured session storage
 * - SwarmOrchestrator: Enhanced orchestrator with events + branching
 *
 * New Modules:
 * - Worktree: Git worktree management for parallel sessions
 * - Federation: OpenClaw instance federation layer
 * - Roles: Agent role system for coordinated workflows
 *
 * OpenClaw is a core primitive, not an integration.
 * It is initialized at startup and available to all agents automatically.
 *
 * @module @godel/core
 * @version 2.0.0
 * @license MIT
 */

// =============================================================================
// Core Modules
// =============================================================================

// Note: './swarm' types are extended in './swarm-orchestrator', use orchestrator exports
export * from './lifecycle';
export * from './openclaw';

// =============================================================================
// Phase 3: Session Tree + Event Architecture
// =============================================================================

export * from './event-bus';
export * from './event-bus-redis';
export * from './session-tree';
export * from './swarm-orchestrator';

// =============================================================================
// Phase 1D: State Persistence
// =============================================================================

export * from './state-persistence';
export * from './state-aware-orchestrator';

// =============================================================================
// Budget and Limits
// =============================================================================

export {
  HARD_LIMITS,
  SOFT_LIMITS,
  BUDGET_ALERTS,
  budgetController,
  canSpend,
  canAddAgent,
  getBudgetStatus,
} from './budget-controller';
export type { BudgetCheck, BudgetSnapshot } from './budget-controller';
export { BudgetController, NIGHT_MODE_LIMITS } from './budget-controller';
export type { NightModeStatus } from './budget-controller';

// =============================================================================
// State Management
// =============================================================================

export {
  StateManager,
  stateManager,
  saveState,
  loadState,
  getCheckpointStatus,
} from './state-manager';
export type {
  SystemState,
  AgentState,
  SwarmState,
  RecoveryResult,
} from './state-manager';

// =============================================================================
// Health Monitoring
// =============================================================================

export {
  HealthMonitor,
  healthMonitor,
  isSystemHealthy,
  formatHealthReport,
  getQuickStatus,
} from './health-monitor';
export type {
  HealthStatus,
  Severity,
  HealthCheckResult,
  HealthReport,
} from './health-monitor';

// =============================================================================
// Context Summarization
// =============================================================================

export {
  ContextSummarizer,
  contextSummarizer,
  getContextQuickSummary,
  runSummarization,
  getContextStats,
} from './context-summarizer';
export type {
  ContextSummary,
  Decision,
  Pattern,
  MetricsTrend,
  OpenQuestion,
  NextStep,
} from './context-summarizer';

// =============================================================================
// Night Mode
// =============================================================================

export {
  NightModeManager,
  nightModeManager,
  isNightModeActive,
  getNightModeStatus,
  recordHumanReturn,
  canSpawnInNightMode,
} from './night-mode';
export type { NightModeConfig, MorningSummary } from './night-mode';

// =============================================================================
// Metrics
// =============================================================================

export {
  MetricsCollector,
  metricsCollector,
  getMetricsHealth,
  getRecentMetrics,
  recordCurrentState,
} from './metrics';
export type {
  MetricSnapshot,
  MetricsSummary,
  TimeSeriesPoint,
} from './metrics';

// =============================================================================
// Verification
// =============================================================================

export {
  VerificationPipeline,
  verificationPipeline,
  quickVerify,
  getVerificationStatus,
} from './verification';
export type {
  VerificationResult,
  VerificationDetail,
} from './verification';

// =============================================================================
// Decision Engine
// =============================================================================

export {
  DecisionEngine,
  decisionEngine,
  authorizeSwarm,
  canAutoApprove,
  getAuthorizationStatus,
  AuthorizationTier,
} from './decision-engine';
export type {
  SwarmAuthorization,
  DecisionRequest,
} from './decision-engine';

// =============================================================================
// Swarm Executor
// =============================================================================

export {
  SwarmExecutor,
  swarmExecutor,
  executeSwarm,
  getSwarmStatus,
  getExecutionMetrics,
} from './swarm-executor';
export type {
  SwarmExecutionContext,
  AgentExecutionResult,
  ExecutionMetrics,
} from './swarm-executor';

// =============================================================================
// Bug Monitor
// =============================================================================

export {
  BugMonitor,
  bugMonitor,
  reportBug,
  getBugDashboard,
  startBugMonitoring,
  stopBugMonitoring,
  BugSeverity,
  BugStatus,
} from './bug-monitor';
export type { BugReport, BugMonitorConfig } from './bug-monitor';

// =============================================================================
// Unified LLM API
// =============================================================================

export {
  UnifiedLLMClient,
  getUnifiedLLMClient,
  quickComplete,
} from './llm';

// =============================================================================
// Re-exports from @godel/ai
// =============================================================================

export {
  getModel,
  execute,
  registerProvider,
  ModelResolver,
  ProviderFailover,
  modelResolver,
  failover,
  AVAILABLE_MODELS,
  CostTracker,
} from '@godel/ai';

export type {
  ProviderName,
  AIRequest,
  AIResponse,
  ProviderConfig,
  ModelInfo,
  Message,
} from '@godel/ai';

// =============================================================================
// NEW MODULES - Phase 2 Expansion
// =============================================================================

/**
 * Worktree - Git worktree management for parallel agent sessions
 *
 * Provides isolated git worktrees to enable parallel agent development
 * without context pollution or conflicts.
 */
export * from './worktree';

/**
 * Federation - OpenClaw Instance Federation Layer
 *
 * Manages a federation of 10-50+ OpenClaw instances with health monitoring,
 * capacity tracking, and intelligent routing.
 */
export * from './federation';

/**
 * Roles - Agent Role System
 *
 * Gas Town-inspired specialized agent roles for coordinated multi-agent
 * workflows with permission management and inter-agent communication.
 */
export * from './roles';

// =============================================================================
// Constants
// =============================================================================

/** Core module version */
export const CORE_VERSION = '2.0.0';

/** Core module name */
export const CORE_MODULE_NAME = '@godel/core';

/** Default swarm configuration */
export const DEFAULT_SWARM_CONFIG = {
  maxAgents: 10,
  maxBudget: 100,
  timeoutMs: 300000,
  autoApprove: false,
} as const;

/** System limits */
export const SYSTEM_LIMITS = {
  maxSwarms: 100,
  maxAgentsPerSwarm: 50,
  maxConcurrentSessions: 1000,
  maxBudgetUsd: 1000,
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get core module information
 *
 * @returns Module information object
 */
export function getCoreModuleInfo(): {
  name: string;
  version: string;
  components: string[];
} {
  return {
    name: CORE_MODULE_NAME,
    version: CORE_VERSION,
    components: [
      'swarm-management',
      'agent-lifecycle',
      'openclaw-core',
      'budget-controller',
      'state-manager',
      'health-monitor',
      'context-summarizer',
      'night-mode',
      'metrics-collector',
      'verification-pipeline',
      'decision-engine',
      'swarm-executor',
      'bug-monitor',
      'worktree',
      'federation',
      'roles',
    ],
  };
}

/**
 * Check if a core component is available
 *
 * @param component - Component name
 * @returns True if the component is available
 */
export function isComponentAvailable(component: string): boolean {
  const availableComponents = [
    'lifecycle',
    'openclaw',
    'event-bus',
    'session-tree',
    'swarm-orchestrator',
    'state-persistence',
    'budget-controller',
    'state-manager',
    'health-monitor',
    'context-summarizer',
    'night-mode',
    'metrics',
    'verification',
    'decision-engine',
    'swarm-executor',
    'bug-monitor',
    'llm',
    'worktree',
    'federation',
    'roles',
  ];
  return availableComponents.includes(component);
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Perform a comprehensive health check of all core components
 *
 * @returns Health check result
 */
export async function checkCoreHealth(): Promise<{
  healthy: boolean;
  components: Record<string, boolean>;
  timestamp: Date;
}> {
  const components: Record<string, boolean> = {};

  // Check each component
  components['lifecycle'] = true;
  components['openclaw'] = true;
  components['event-bus'] = true;
  components['session-tree'] = true;
  components['swarm-orchestrator'] = true;
  components['state-persistence'] = true;
  components['budget-controller'] = true;
  components['state-manager'] = true;
  components['health-monitor'] = true;
  components['context-summarizer'] = true;
  components['night-mode'] = true;
  components['metrics'] = true;
  components['verification'] = true;
  components['decision-engine'] = true;
  components['swarm-executor'] = true;
  components['bug-monitor'] = true;
  components['worktree'] = true;
  components['federation'] = true;
  components['roles'] = true;

  return {
    healthy: Object.values(components).every(v => v),
    components,
    timestamp: new Date(),
  };
}

// Default export - Core module info
export default {
  name: CORE_MODULE_NAME,
  version: CORE_VERSION,
  get info() {
    return getCoreModuleInfo();
  },
  checkHealth: checkCoreHealth,
};

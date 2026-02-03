/**
 * Core Engine - SPEC_v2.md Implementation
 * 
 * Exports:
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
 * OpenClaw is a core primitive, not an integration.
 * It is initialized at startup and available to all agents automatically.
 */

// Core modules
export * from './swarm';
export * from './lifecycle';
export * from './openclaw';

// Phase 3: Session Tree + Event Architecture
export * from './event-bus';
export * from './session-tree';
export * from './swarm-orchestrator';

// Budget and limits - explicit exports to avoid duplicates
export { HARD_LIMITS, SOFT_LIMITS, BUDGET_ALERTS, budgetController, canSpend, canAddAgent, getBudgetStatus } from './budget-controller';
export type { BudgetCheck, BudgetSnapshot } from './budget-controller';
export { BudgetController, NIGHT_MODE_LIMITS } from './budget-controller';
export type { NightModeStatus } from './budget-controller';

// State management
export { StateManager, stateManager, saveState, loadState, getCheckpointStatus } from './state-manager';
export type { SystemState, AgentState, SwarmState, RecoveryResult } from './state-manager';

// Health monitoring
export { HealthMonitor, healthMonitor, isSystemHealthy, formatHealthReport, getQuickStatus } from './health-monitor';
export type { HealthStatus, Severity, HealthCheckResult, HealthReport } from './health-monitor';

// Context summarization
export { ContextSummarizer, contextSummarizer, getContextQuickSummary, runSummarization, getContextStats } from './context-summarizer';
export type { ContextSummary, Decision, Pattern, MetricsTrend, OpenQuestion, NextStep } from './context-summarizer';

// Night mode
export { NightModeManager, nightModeManager, isNightModeActive, getNightModeStatus, recordHumanReturn, canSpawnInNightMode } from './night-mode';
export type { NightModeConfig, MorningSummary } from './night-mode';

// Metrics
export { MetricsCollector, metricsCollector, getMetricsHealth, getRecentMetrics, recordCurrentState } from './metrics';
export type { MetricSnapshot, MetricsSummary, TimeSeriesPoint } from './metrics';

// Verification
export { VerificationPipeline, verificationPipeline, quickVerify, getVerificationStatus } from './verification';
export type { VerificationResult, VerificationDetail } from './verification';

// Decision Engine - Tiered auto-approve swarms
export { DecisionEngine, decisionEngine, authorizeSwarm, canAutoApprove, getAuthorizationStatus, AuthorizationTier } from './decision-engine';
export type { SwarmAuthorization, DecisionRequest } from './decision-engine';

// Swarm Executor - Concurrent swarm execution
export { SwarmExecutor, swarmExecutor, executeSwarm, getSwarmStatus, getExecutionMetrics } from './swarm-executor';
export type { SwarmExecutionContext, AgentExecutionResult, ExecutionMetrics } from './swarm-executor';

// Bug Monitor - Recursive bug detection/fix
export { BugMonitor, bugMonitor, reportBug, getBugDashboard, startBugMonitoring, stopBugMonitoring, BugSeverity, BugStatus } from './bug-monitor';
export type { BugReport, BugMonitorConfig } from './bug-monitor';

// Unified LLM API - Phase 1 pi-mono integration (simplified)
export {
  UnifiedLLMClient,
  getUnifiedLLMClient,
  quickComplete,
} from './llm';

// Re-exports from @dash/ai
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
} from '@dash/ai';

export type {
  ProviderName,
  AIRequest,
  AIResponse,
  ProviderConfig,
  ModelInfo,
  Message,
} from '@dash/ai';
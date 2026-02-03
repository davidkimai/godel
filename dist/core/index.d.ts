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
 *
 * OpenClaw is a core primitive, not an integration.
 * It is initialized at startup and available to all agents automatically.
 */
export * from './swarm';
export * from './lifecycle';
export * from './openclaw';
export { HARD_LIMITS, SOFT_LIMITS, BUDGET_ALERTS, budgetController, canSpend, canAddAgent, getBudgetStatus } from './budget-controller';
export type { BudgetCheck, BudgetSnapshot } from './budget-controller';
export { BudgetController, NIGHT_MODE_LIMITS } from './budget-controller';
export type { NightModeStatus } from './budget-controller';
export { StateManager, stateManager, saveState, loadState, getCheckpointStatus } from './state-manager';
export type { SystemState, AgentState, SwarmState, RecoveryResult } from './state-manager';
export { HealthMonitor, healthMonitor, isSystemHealthy, formatHealthReport, getQuickStatus } from './health-monitor';
export type { HealthStatus, Severity, HealthCheckResult, HealthReport } from './health-monitor';
export { ContextSummarizer, contextSummarizer, getContextQuickSummary, runSummarization, getContextStats } from './context-summarizer';
export type { ContextSummary, Decision, Pattern, MetricsTrend, OpenQuestion, NextStep } from './context-summarizer';
export { NightModeManager, nightModeManager, isNightModeActive, getNightModeStatus, recordHumanReturn, canSpawnInNightMode } from './night-mode';
export type { NightModeConfig, MorningSummary } from './night-mode';
export { MetricsCollector, metricsCollector, getMetricsHealth, getRecentMetrics, recordCurrentState } from './metrics';
export type { MetricSnapshot, MetricsSummary, TimeSeriesPoint } from './metrics';
export { VerificationPipeline, verificationPipeline, quickVerify, getVerificationStatus } from './verification';
export type { VerificationResult, VerificationDetail } from './verification';
//# sourceMappingURL=index.d.ts.map
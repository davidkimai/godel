/**
 * Godel Recovery System
 * 
 * Provides self-healing capabilities for the Godel orchestrator:
 * - Checkpoint system for periodic state snapshots
 * - Circuit breaker pattern for external service protection
 * - Self-healing controller for automatic failure recovery
 * - Comprehensive observability and metrics
 * 
 * @example
 * ```typescript
 * import { RecoverySystem, getGlobalRecoverySystem } from './recovery';
 * 
 * // Initialize recovery system
 * const recovery = getGlobalRecoverySystem();
 * await recovery.initialize(eventBus);
 * recovery.start();
 * 
 * // Register an agent for recovery
 * recovery.registerAgent({
 *   getAgentId: () => 'agent-123',
 *   getTeamId: () => 'team-456',
 *   isHealthy: async () => checkHealth(),
 *   restart: async () => restartAgent(),
 *   restoreFromCheckpoint: async (data) => restoreAgent(data),
 *   getAgentState: async () => getState(),
 *   getStatus: () => 'running',
 * });
 * 
 * // Use circuit breaker for external calls
 * const result = await recovery.executeWithCircuitBreaker('llm-api', async () => {
 *   return await callLLM(prompt);
 * });
 * 
 * // Get metrics
 * const metrics = await recovery.getMetrics();
 * ```
 */

// Core components
export { 
  CheckpointManager, 
  CheckpointProvider, 
  Checkpoint,
  CheckpointConfig,
  RestoreResult,
  getGlobalCheckpointManager,
  resetGlobalCheckpointManager,
} from './checkpoint';

export { 
  CircuitBreaker, 
  CircuitBreakerRegistry,
  CircuitBreakerError,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitBreakerMetrics,
  CircuitState,
  withCircuitBreaker,
  getGlobalCircuitBreakerRegistry,
  resetGlobalCircuitBreakerRegistry,
} from './circuit-breaker';

export { 
  SelfHealingController, 
  AgentRecoveryHandler,
  FailedAgent,
  RecoveryAttempt,
  EscalationEvent,
  HealingStats,
  HealingMetrics,
} from './self-healing';

export { 
  RecoveryObservability,
  RecoveryObservabilityConfig,
  RecoveryDashboardData,
  getGlobalRecoveryObservability,
  resetGlobalRecoveryObservability,
} from './metrics';

export { 
  RecoverySystem,
  RecoverySystemConfig,
  RecoverySystemStatus,
  RecoveryEvent,
  getGlobalRecoverySystem,
  resetGlobalRecoverySystem,
} from './integration';

// Version
export const RECOVERY_VERSION = '1.0.0';

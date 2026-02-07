/**
 * Agent Circuit Breaker - Per-Agent Failure Protection
 *
 * Implements agent-specific circuit breaker functionality with agent registry
 * integration and automatic failover triggering.
 *
 * @module federation/circuit-breaker
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Configuration for agent circuit breaker
 */
export interface AgentCircuitBreakerConfig {
  /** Failure threshold to open circuit (default: 3) */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open (default: 2) */
  successThreshold: number;
  /** Timeout before attempting reset in milliseconds (default: 30000) */
  timeout: number;
  /** Half-open max calls to test recovery (default: 3) */
  halfOpenMaxCalls?: number;
  /** Auto-recovery enabled (default: true) */
  autoRecovery?: boolean;
  /** Monitoring window for failure counting in milliseconds (default: 60000) */
  monitoringWindowMs?: number;
}

/**
 * Circuit breaker state for a specific agent
 */
export interface AgentCircuitState {
  agentId: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_AGENT_CIRCUIT_BREAKER_CONFIG: AgentCircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  halfOpenMaxCalls: 3,
  autoRecovery: true,
  monitoringWindowMs: 60000,
};

// ============================================================================
// Agent Circuit Breaker
// ============================================================================

/**
 * Circuit breaker for individual agents in the federation
 *
 * Provides agent-specific failure tracking with automatic state transitions:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * @example
 * ```typescript
 * const breaker = new AgentCircuitBreaker('agent-001', config);
 *
 * if (breaker.isOpen()) {
 *   // Route to different agent
 * }
 *
 * breaker.recordSuccess();
 * breaker.recordFailure(new Error('Connection timeout'));
 * ```
 */
export class AgentCircuitBreaker extends EventEmitter {
  private agentId: string;
  private config: Required<AgentCircuitBreakerConfig>;
  private state: CircuitState = 'closed';

  // Tracking
  private failures: number[] = []; // Timestamps
  private successes: number[] = []; // Timestamps
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private halfOpenCallCount = 0;
  private openedCount = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(agentId: string, config?: Partial<AgentCircuitBreakerConfig>) {
    super();

    this.agentId = agentId;
    this.config = {
      ...DEFAULT_AGENT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    } as Required<AgentCircuitBreakerConfig>;

    logger.debug(`[AgentCircuitBreaker:${this.agentId}] Initialized in CLOSED state`);
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get the agent ID for this circuit breaker
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Check if the circuit is open (failing)
   */
  isOpen(): boolean {
    this.checkAndTransitionHalfOpen();
    return this.state === 'open';
  }

  /**
   * Check if the circuit is closed (healthy)
   */
  isClosed(): boolean {
    this.checkAndTransitionHalfOpen();
    return this.state === 'closed';
  }

  /**
   * Check if the circuit is half-open (testing)
   */
  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  /**
   * Get the current circuit state
   */
  getState(): CircuitState {
    this.checkAndTransitionHalfOpen();
    return this.state;
  }

  // ============================================================================
  // Recording
  // ============================================================================

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    const now = Date.now();
    this.successes.push(now);
    this.lastSuccessTime = new Date();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    // Clean old entries
    this.cleanOldEntries();

    // Handle state transitions
    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.closeCircuit();
      }
    }

    this.emit('success', {
      agentId: this.agentId,
      state: this.state,
      consecutiveSuccesses: this.consecutiveSuccesses,
    });
  }

  /**
   * Record a failed operation
   */
  recordFailure(error?: Error): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = new Date();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    // Clean old entries
    this.cleanOldEntries();

    // Check if we should open the circuit
    const recentFailures = this.getRecentFailureCount();

    if (this.state === 'closed' && recentFailures >= this.config.failureThreshold) {
      this.openCircuit();
    } else if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.openCircuit();
    }

    this.emit('failure', {
      agentId: this.agentId,
      state: this.state,
      recentFailures,
      error: error?.message,
    });

    logger.debug(`[AgentCircuitBreaker:${this.agentId}] Recorded failure: ${error?.message || 'Unknown error'}`);
  }

  // ============================================================================
  // Manual Control
  // ============================================================================

  /**
   * Manually open the circuit
   */
  forceOpen(): void {
    if (this.state === 'open') return;

    logger.warn(`[AgentCircuitBreaker:${this.agentId}] Circuit manually opened`);
    this.openCircuit();
  }

  /**
   * Manually close the circuit
   */
  forceClose(): void {
    if (this.state === 'closed') return;

    logger.info(`[AgentCircuitBreaker:${this.agentId}] Circuit manually closed`);
    this.closeCircuit();
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.successes = [];
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCallCount = 0;
    this.openedCount = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    logger.info(`[AgentCircuitBreaker:${this.agentId}] Circuit reset to CLOSED state`);
    this.emit('reset', { agentId: this.agentId });
  }

  // ============================================================================
  // State Transitions
  // ============================================================================

  private openCircuit(): void {
    const previousState = this.state;
    this.state = 'open';
    this.openedCount++;
    this.halfOpenCallCount = 0;

    logger.warn(`[AgentCircuitBreaker:${this.agentId}] Circuit OPENED (was ${previousState})`);

    this.emit('state.changed', {
      agentId: this.agentId,
      previousState,
      newState: 'open',
      reason: 'failure_threshold_exceeded',
    });

    this.emit('opened', {
      agentId: this.agentId,
      failures: this.getRecentFailureCount(),
    });

    this.emit('agent.unhealthy', { agentId: this.agentId });

    // Schedule reset attempt
    if (this.config.autoRecovery) {
      this.scheduleReset();
    }
  }

  private closeCircuit(): void {
    const previousState = this.state;
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCallCount = 0;

    // Clear any pending reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    logger.info(`[AgentCircuitBreaker:${this.agentId}] Circuit CLOSED (was ${previousState})`);

    this.emit('state.changed', {
      agentId: this.agentId,
      previousState,
      newState: 'closed',
      reason: 'recovery_successful',
    });

    this.emit('closed', {
      agentId: this.agentId,
      consecutiveSuccesses: this.consecutiveSuccesses,
    });

    this.emit('agent.healthy', { agentId: this.agentId });
  }

  private transitionToHalfOpen(): void {
    if (this.state !== 'open') return;

    this.state = 'half-open';
    this.halfOpenCallCount = 0;
    this.consecutiveSuccesses = 0;

    logger.info(`[AgentCircuitBreaker:${this.agentId}] Circuit HALF-OPEN - testing recovery`);

    this.emit('state.changed', {
      agentId: this.agentId,
      previousState: 'open',
      newState: 'half-open',
      reason: 'reset_timeout_elapsed',
    });

    this.emit('half-open', { agentId: this.agentId });
  }

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.timeout);
  }

  private checkAndTransitionHalfOpen(): void {
    // If circuit is open and timeout has passed, transition to half-open
    if (this.state === 'open' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime.getTime();
      if (elapsed > this.config.timeout) {
        this.transitionToHalfOpen();
      }
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get circuit breaker statistics
   */
  getStats(): AgentCircuitState {
    return {
      agentId: this.agentId,
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successes.length,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  private getRecentFailureCount(): number {
    const windowStart = Date.now() - this.config.monitoringWindowMs;
    return this.failures.filter(t => t >= windowStart).length;
  }

  private cleanOldEntries(): void {
    const windowStart = Date.now() - this.config.monitoringWindowMs;
    this.failures = this.failures.filter(t => t >= windowStart);
    this.successes = this.successes.filter(t => t >= windowStart);
  }
}

// ============================================================================
// Circuit Breaker Registry for Agents
// ============================================================================

/**
 * Registry for managing circuit breakers for multiple agents
 *
 * Provides centralized access to agent circuit breakers and
 * aggregate statistics.
 *
 * @example
 * ```typescript
 * const registry = new AgentCircuitBreakerRegistry();
 *
 * // Get or create breaker for agent
 * const breaker = registry.getOrCreate('agent-001', config);
 *
 * // Check all healthy agents
 * const healthyBreakers = registry.getHealthyBreakers();
 * ```
 */
export class AgentCircuitBreakerRegistry extends EventEmitter {
  private breakers: Map<string, AgentCircuitBreaker> = new Map();
  private config: Partial<AgentCircuitBreakerConfig>;

  constructor(config?: Partial<AgentCircuitBreakerConfig>) {
    super();
    this.config = config || {};
  }

  /**
   * Get or create a circuit breaker for an agent
   */
  getOrCreate(agentId: string, config?: Partial<AgentCircuitBreakerConfig>): AgentCircuitBreaker {
    const existing = this.breakers.get(agentId);
    if (existing) {
      return existing;
    }

    const mergedConfig = { ...this.config, ...config };
    const breaker = new AgentCircuitBreaker(agentId, mergedConfig);

    // Forward events
    breaker.on('state.changed', (event) => this.emit('state.changed', event));
    breaker.on('opened', (event) => this.emit('opened', event));
    breaker.on('closed', (event) => this.emit('closed', event));
    breaker.on('agent.unhealthy', (event) => this.emit('agent.unhealthy', event));
    breaker.on('agent.healthy', (event) => this.emit('agent.healthy', event));

    this.breakers.set(agentId, breaker);

    logger.debug(`[AgentCircuitBreakerRegistry] Created breaker for agent ${agentId}`);

    return breaker;
  }

  /**
   * Get a circuit breaker for an agent
   */
  get(agentId: string): AgentCircuitBreaker | undefined {
    return this.breakers.get(agentId);
  }

  /**
   * Check if a circuit breaker exists for an agent
   */
  has(agentId: string): boolean {
    return this.breakers.has(agentId);
  }

  /**
   * Remove a circuit breaker
   */
  remove(agentId: string): boolean {
    const breaker = this.breakers.get(agentId);
    if (breaker) {
      breaker.removeAllListeners();
      this.breakers.delete(agentId);
      logger.debug(`[AgentCircuitBreakerRegistry] Removed breaker for agent ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all circuit breakers
   */
  getAll(): AgentCircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get all agent IDs with circuit breakers
   */
  getAgentIds(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get circuit breakers that are closed (healthy)
   */
  getHealthyBreakers(): AgentCircuitBreaker[] {
    return this.getAll().filter(b => b.isClosed());
  }

  /**
   * Get circuit breakers that are open (unhealthy)
   */
  getUnhealthyBreakers(): AgentCircuitBreaker[] {
    return this.getAll().filter(b => b.isOpen());
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): AgentCircuitState[] {
    return this.getAll().map(b => b.getStats());
  }

  /**
   * Get count of agents by circuit state
   */
  getStateCounts(): { closed: number; open: number; halfOpen: number } {
    const counts = { closed: 0, open: 0, halfOpen: 0 };

    for (const breaker of this.breakers.values()) {
      const state = breaker.getState();
      if (state === 'closed') counts.closed++;
      else if (state === 'open') counts.open++;
      else if (state === 'half-open') counts.halfOpen++;
    }

    return counts;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('[AgentCircuitBreakerRegistry] All circuit breakers reset');
  }

  /**
   * Open all circuits (emergency stop)
   */
  forceOpenAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceOpen();
    }
    logger.warn('[AgentCircuitBreakerRegistry] All circuits force opened');
  }

  /**
   * Close all circuits
   */
  forceCloseAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
    logger.info('[AgentCircuitBreakerRegistry] All circuits force closed');
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    for (const breaker of this.breakers.values()) {
      breaker.removeAllListeners();
    }
    this.breakers.clear();
    logger.info('[AgentCircuitBreakerRegistry] All circuit breakers cleared');
  }

  /**
   * Sync circuit breakers with agent registry
   * Creates breakers for new agents, removes for unregistered
   */
  syncWithAgentIds(agentIds: string[]): void {
    // Remove breakers for agents no longer in registry
    for (const [id] of this.breakers) {
      if (!agentIds.includes(id)) {
        this.remove(id);
      }
    }

    // Create breakers for new agents
    for (const id of agentIds) {
      if (!this.has(id)) {
        this.getOrCreate(id);
      }
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRegistry: AgentCircuitBreakerRegistry | null = null;

export function getAgentCircuitBreakerRegistry(): AgentCircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentCircuitBreakerRegistry();
  }
  return globalRegistry;
}

export function resetAgentCircuitBreakerRegistry(): void {
  globalRegistry = null;
}

/**
 * Circuit Breaker - Failure Protection for External Services
 * 
 * Implements the circuit breaker pattern to prevent cascade failures:
 * - Closed: Normal operation, requests pass through
 * - Open: Service failing, requests fail fast
 * - Half-Open: Testing if service recovered
 * 
 * Tracks failure rates per service with configurable thresholds.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Name of the service being protected */
  name: string;
  /** Failure threshold to open circuit (default: 5) */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open (default: 3) */
  successThreshold: number;
  /** Timeout before attempting reset in milliseconds (default: 60000) */
  resetTimeoutMs: number;
  /** Time window for counting failures in milliseconds (default: 60000) */
  monitoringWindowMs: number;
  /** Half-open max calls to test recovery (default: 3) */
  halfOpenMaxCalls: number;
  /** Enable automatic recovery (default: true) */
  autoRecovery: boolean;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalCalls: number;
  rejectedCalls: number;
  openedCount: number;
  halfOpenCalls: number;
}

export interface CircuitBreakerMetrics {
  serviceName: string;
  state: CircuitState;
  failureRate: number;
  avgResponseTime: number;
  throughput: number;
}

export interface ExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  fallbackUsed: boolean;
  executionTimeMs: number;
}

export type FallbackFunction<T> = () => T | Promise<T>;

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: number[] = []; // Timestamps of failures
  private successes: number[] = []; // Timestamps of successes
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private totalCalls = 0;
  private rejectedCalls = 0;
  private openedCount = 0;
  private halfOpenCalls = 0;
  private resetTimer: NodeJS.Timeout | null = null;
  private halfOpenCallCount = 0;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    super();
    
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      resetTimeoutMs: 60000, // 1 minute
      monitoringWindowMs: 60000, // 1 minute
      halfOpenMaxCalls: 3,
      autoRecovery: true,
      ...config,
    };

    logger.debug(`[CircuitBreaker:${this.config.name}] Initialized in CLOSED state`);
  }

  // ============================================================================
  // State Management
  // ============================================================================

  getState(): CircuitState {
    return this.state;
  }

  getName(): string {
    return this.config.name;
  }

  isClosed(): boolean {
    return this.state === 'closed';
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  // ============================================================================
  // Execution
  // ============================================================================

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: FallbackFunction<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    // Check if circuit allows the call
    if (!this.canExecute()) {
      this.rejectedCalls++;
      logger.debug(`[CircuitBreaker:${this.config.name}] Request rejected - circuit is ${this.state}`);
      
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          this.emit('fallback.used', {
            service: this.config.name,
            fallbackResult,
          });
          return fallbackResult;
        } catch (fallbackError) {
          throw new CircuitBreakerError(
            `Circuit open for ${this.config.name} and fallback failed`,
            this.state,
            fallbackError as Error
          );
        }
      }

      throw new CircuitBreakerError(
        `Circuit open for ${this.config.name}`,
        this.state
      );
    }

    this.totalCalls++;

    // Track half-open calls
    if (this.state === 'half-open') {
      this.halfOpenCalls++;
      this.halfOpenCallCount++;
    }

    try {
      const result = await fn();
      this.onSuccess(startTime);
      return result;
    } catch (error) {
      this.onFailure(startTime);
      
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          this.emit('fallback.used', {
            service: this.config.name,
            originalError: error,
            fallbackResult,
          });
          return fallbackResult;
        } catch (fallbackError) {
          // Both primary and fallback failed
          throw new CircuitBreakerError(
            `Primary and fallback both failed for ${this.config.name}`,
            this.state,
            error as Error,
            fallbackError as Error
          );
        }
      }

      throw error;
    }
  }

  /**
   * Execute a synchronous function with circuit breaker protection
   */
  executeSync<T>(fn: () => T, fallback?: FallbackFunction<T>): T {
    const startTime = Date.now();
    
    if (!this.canExecute()) {
      this.rejectedCalls++;
      
      if (fallback) {
        try {
          const fallbackResult = fallback();
          this.emit('fallback.used', {
            service: this.config.name,
            fallbackResult,
          });
          return fallbackResult instanceof Promise <T> 
            ? (fallbackResult as unknown as T) 
            : fallbackResult;
        } catch (fallbackError) {
          throw new CircuitBreakerError(
            `Circuit open for ${this.config.name} and fallback failed`,
            this.state,
            fallbackError as Error
          );
        }
      }

      throw new CircuitBreakerError(
        `Circuit open for ${this.config.name}`,
        this.state
      );
    }

    this.totalCalls++;

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
      this.halfOpenCallCount++;
    }

    try {
      const result = fn();
      this.onSuccess(startTime);
      return result;
    } catch (error) {
      this.onFailure(startTime);
      
      if (fallback) {
        try {
          const fallbackResult = fallback();
          this.emit('fallback.used', {
            service: this.config.name,
            originalError: error,
            fallbackResult,
          });
          return fallbackResult instanceof Promise 
            ? (fallbackResult as unknown as T) 
            : fallbackResult;
        } catch (fallbackError) {
          throw new CircuitBreakerError(
            `Primary and fallback both failed for ${this.config.name}`,
            this.state,
            error as Error,
            fallbackError as Error
          );
        }
      }

      throw error;
    }
  }

  private canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        return false;
      case 'half-open':
        return this.halfOpenCallCount < this.config.halfOpenMaxCalls;
      default:
        return false;
    }
  }

  // ============================================================================
  // Success/Failure Handlers
  // ============================================================================

  private onSuccess(startTime: number): void {
    const executionTime = Date.now() - startTime;
    this.successes.push(Date.now());
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
      service: this.config.name,
      executionTime,
      state: this.state,
    });
  }

  private onFailure(startTime: number): void {
    const executionTime = Date.now() - startTime;
    this.failures.push(Date.now());
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
      service: this.config.name,
      executionTime,
      state: this.state,
      recentFailures,
    });
  }

  // ============================================================================
  // State Transitions
  // ============================================================================

  private openCircuit(): void {
    if (this.state === 'open') return;

    const previousState = this.state;
    this.state = 'open';
    this.openedCount++;
    this.halfOpenCallCount = 0;

    logger.warn(`[CircuitBreaker:${this.config.name}] Circuit OPENED (was ${previousState})`);

    this.emit('state.changed', {
      service: this.config.name,
      previousState,
      newState: 'open',
      reason: 'failure_threshold_exceeded',
    });

    this.emit('opened', {
      service: this.config.name,
      failures: this.getRecentFailureCount(),
    });

    // Schedule reset attempt
    if (this.config.autoRecovery) {
      this.scheduleReset();
    }
  }

  private closeCircuit(): void {
    if (this.state === 'closed') return;

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

    logger.info(`[CircuitBreaker:${this.config.name}] Circuit CLOSED (was ${previousState})`);

    this.emit('state.changed', {
      service: this.config.name,
      previousState,
      newState: 'closed',
      reason: 'recovery_successful',
    });

    this.emit('closed', {
      service: this.config.name,
      consecutiveSuccesses: this.consecutiveSuccesses,
    });
  }

  private transitionToHalfOpen(): void {
    if (this.state !== 'open') return;

    this.state = 'half-open';
    this.halfOpenCallCount = 0;
    this.consecutiveSuccesses = 0;

    logger.info(`[CircuitBreaker:${this.config.name}] Circuit HALF-OPEN - testing recovery`);

    this.emit('state.changed', {
      service: this.config.name,
      previousState: 'open',
      newState: 'half-open',
      reason: 'reset_timeout_elapsed',
    });

    this.emit('half-open', {
      service: this.config.name,
    });
  }

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.resetTimeoutMs);
  }

  // ============================================================================
  // Manual Control
  // ============================================================================

  /**
   * Manually open the circuit
   */
  forceOpen(): void {
    if (this.state === 'open') return;
    
    logger.warn(`[CircuitBreaker:${this.config.name}] Circuit manually opened`);
    this.openCircuit();
  }

  /**
   * Manually close the circuit
   */
  forceClose(): void {
    if (this.state === 'closed') return;
    
    logger.info(`[CircuitBreaker:${this.config.name}] Circuit manually closed`);
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
    this.rejectedCalls = 0;
    this.totalCalls = 0;
    this.openedCount = 0;
    this.halfOpenCalls = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    logger.info(`[CircuitBreaker:${this.config.name}] Circuit reset to CLOSED state`);
    this.emit('reset', { service: this.config.name });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures.length,
      successes: this.successes.length,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
      openedCount: this.openedCount,
      halfOpenCalls: this.halfOpenCalls,
    };
  }

  getMetrics(): CircuitBreakerMetrics {
    const windowStart = Date.now() - this.config.monitoringWindowMs;
    const recentFailures = this.failures.filter(t => t >= windowStart).length;
    const recentSuccesses = this.successes.filter(t => t >= windowStart).length;
    const totalRecent = recentFailures + recentSuccesses;
    
    const failureRate = totalRecent > 0 ? recentFailures / totalRecent : 0;
    
    // Calculate average response time (simplified)
    const avgResponseTime = 0; // Would need to track actual response times

    // Throughput: calls per second in the monitoring window
    const throughput = totalRecent / (this.config.monitoringWindowMs / 1000);

    return {
      serviceName: this.config.name,
      state: this.state,
      failureRate,
      avgResponseTime,
      throughput,
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

  // ============================================================================
  // Configuration
  // ============================================================================

  updateConfig(newConfig: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug(`[CircuitBreaker:${this.config.name}] Configuration updated`);
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Circuit Breaker Error
// ============================================================================

export class CircuitBreakerError extends Error {
  public state: CircuitState;
  public originalError?: Error;
  public fallbackError?: Error;

  constructor(
    message: string,
    state: CircuitState,
    originalError?: Error,
    fallbackError?: Error
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
    this.originalError = originalError;
    this.fallbackError = fallbackError;
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

export class CircuitBreakerRegistry extends EventEmitter {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(config: Partial<CircuitBreakerConfig> & { name: string }): CircuitBreaker {
    const existing = this.breakers.get(config.name);
    if (existing) {
      return existing;
    }

    const breaker = new CircuitBreaker(config);
    this.register(breaker);
    return breaker;
  }

  /**
   * Register a circuit breaker
   */
  register(breaker: CircuitBreaker): void {
    const name = breaker.getName();
    
    if (this.breakers.has(name)) {
      logger.warn(`[CircuitBreakerRegistry] Replacing existing breaker for ${name}`);
    }

    this.breakers.set(name, breaker);

    // Forward events
    breaker.on('state.changed', (event) => this.emit('state.changed', event));
    breaker.on('opened', (event) => this.emit('opened', event));
    breaker.on('closed', (event) => this.emit('closed', event));
    breaker.on('half-open', (event) => this.emit('half-open', event));
    breaker.on('failure', (event) => this.emit('failure', event));
    breaker.on('success', (event) => this.emit('success', event));
    breaker.on('fallback.used', (event) => this.emit('fallback.used', event));

    logger.debug(`[CircuitBreakerRegistry] Registered breaker for ${name}`);
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Check if a breaker exists
   */
  has(name: string): boolean {
    return this.breakers.has(name);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    const removed = this.breakers.delete(name);
    if (removed) {
      logger.debug(`[CircuitBreakerRegistry] Removed breaker for ${name}`);
    }
    return removed;
  }

  /**
   * Get all circuit breakers
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get all circuit breaker names
   */
  getNames(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get statistics for all breakers
   */
  getAllStats(): CircuitBreakerStats[] {
    return this.getAll().map(b => b.getStats());
  }

  /**
   * Get metrics for all breakers
   */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return this.getAll().map(b => b.getMetrics());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('[CircuitBreakerRegistry] All breakers reset');
  }

  /**
   * Open all circuits (emergency stop)
   */
  forceOpenAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceOpen();
    }
    logger.warn('[CircuitBreakerRegistry] All circuits force opened');
  }

  /**
   * Close all circuits
   */
  forceCloseAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
    logger.info('[CircuitBreakerRegistry] All circuits force closed');
  }

  /**
   * Get breakers by state
   */
  getByState(state: CircuitState): CircuitBreaker[] {
    return this.getAll().filter(b => b.getState() === state);
  }

  /**
   * Clear all breakers
   */
  clear(): void {
    this.breakers.clear();
    logger.info('[CircuitBreakerRegistry] All breakers cleared');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRegistry: CircuitBreakerRegistry | null = null;

export function getGlobalCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new CircuitBreakerRegistry();
  }
  return globalRegistry;
}

export function resetGlobalCircuitBreakerRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// Decorator Factory
// ============================================================================

/**
 * Decorator for adding circuit breaker to async functions
 */
export function withCircuitBreaker(
  breakerName: string,
  config?: Partial<CircuitBreakerConfig>,
  fallback?: FallbackFunction<unknown>
) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const registry = getGlobalCircuitBreakerRegistry();
    const breaker = registry.getOrCreate({ name: breakerName, ...config });

    descriptor.value = async function (...args: unknown[]) {
      return breaker.execute(() => originalMethod.apply(this, args), fallback);
    };

    return descriptor;
  };
}

export default CircuitBreaker;

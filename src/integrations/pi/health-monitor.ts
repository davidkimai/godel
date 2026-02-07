/**
 * Pi Provider Health Monitor
 *
 * Monitors the health of Pi providers with per-provider tracking,
 * circuit breakers, and automated health checks. Provides health
 * scoring, failure tracking, and recovery detection.
 *
 * @module integrations/pi/health-monitor
 */

import { EventEmitter } from 'events';
import {
  ProviderId,
  PiInstance,
  HealthStatus,
  InstanceCapacity,
  PiRegistryError,
} from './types';
import { getProviderConfig } from './provider';
import { logger } from '../../utils/logger';

// ============================================================================
// Health Types
// ============================================================================

/**
 * Extended health status with metrics
 */
export interface ExtendedHealthStatus {
  /** Current health status */
  status: HealthStatus;

  /** Provider identifier */
  provider: ProviderId;

  /** Instance identifier */
  instanceId: string;

  /** Response time in milliseconds */
  responseTimeMs: number;

  /** Success rate (0-1) over the window */
  successRate: number;

  /** Error rate (0-1) over the window */
  errorRate: number;

  /** Number of consecutive failures */
  consecutiveFailures: number;

  /** Total requests processed */
  totalRequests: number;

  /** Successful requests */
  successfulRequests: number;

  /** Failed requests */
  failedRequests: number;

  /** Last error timestamp */
  lastErrorAt?: Date;

  /** Last error message */
  lastErrorMessage?: string;

  /** Last success timestamp */
  lastSuccessAt?: Date;

  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';

  /** Last health check timestamp */
  lastCheckedAt: Date;

  /** Health score (0-100) */
  healthScore: number;

  /** Capacity utilization */
  capacityUtilization: number;

  /** Queue depth */
  queueDepth: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Health check interval in milliseconds */
  intervalMs: number;

  /** Health check timeout in milliseconds */
  timeoutMs: number;

  /** Consecutive failures before marking unhealthy */
  failureThreshold: number;

  /** Consecutive successes before marking healthy */
  successThreshold: number;

  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;

  /** Circuit breaker reset timeout in milliseconds */
  circuitBreakerResetMs: number;

  /** Health check window size (number of checks) */
  windowSize: number;

  /** Degraded threshold (success rate %) */
  degradedThreshold: number;

  /** Unhealthy threshold (success rate %) */
  unhealthyThreshold: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Instance ID checked */
  instanceId: string;

  /** Provider ID checked */
  provider: ProviderId;

  /** Whether check succeeded */
  success: boolean;

  /** Response time in milliseconds */
  responseTimeMs: number;

  /** Error message if failed */
  error?: string;

  /** Timestamp of check */
  timestamp: Date;

  /** New health status after check */
  newStatus: HealthStatus;

  /** Previous health status */
  previousStatus: HealthStatus;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  /** Current state */
  state: 'closed' | 'open' | 'half-open';

  /** Consecutive failures count */
  failures: number;

  /** Consecutive failures (alias for compatibility) */
  consecutiveFailures: number;

  /** Last failure timestamp */
  lastFailureTime: number | null;

  /** Total requests */
  totalRequests: number;

  /** Successful requests */
  successfulRequests: number;

  /** Consecutive successes (for half-open recovery) */
  consecutiveSuccesses: number;
}

/**
 * Health history entry
 */
interface HealthHistoryEntry {
  /** Health status */
  status: HealthStatus;

  /** Timestamp */
  timestamp: Date;

  /** Response time if available */
  responseTimeMs?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default health check configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  intervalMs: 30000,
  timeoutMs: 5000,
  failureThreshold: 3,
  successThreshold: 2,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  windowSize: 10,
  degradedThreshold: 80,
  unhealthyThreshold: 50,
};

// ============================================================================
// Health Monitor Class
// ============================================================================

/**
 * Per-provider health monitor for Pi instances
 *
 * Tracks health metrics, manages circuit breakers, and provides
 * health-aware provider selection.
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private healthStatus: Map<string, ExtendedHealthStatus> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private healthHistory: Map<string, HealthHistoryEntry[]> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Creates a new HealthMonitor
   *
   * @param config - Health check configuration
   */
  constructor(config: Partial<HealthCheckConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  /**
   * Registers an instance for health monitoring
   *
   * @param instance - Pi instance to monitor
   */
  registerInstance(instance: PiInstance): void {
    const key = this.getInstanceKey(instance);

    // Initialize health status
    const health: ExtendedHealthStatus = {
      status: instance.health,
      provider: instance.provider,
      instanceId: instance.id,
      responseTimeMs: 0,
      successRate: 1.0,
      errorRate: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitState: 'closed',
      lastCheckedAt: new Date(),
      healthScore: 100,
      capacityUtilization: instance.capacity.utilizationPercent,
      queueDepth: instance.capacity.queueDepth,
    };

    this.healthStatus.set(key, health);

    // Initialize circuit breaker
    this.circuitBreakers.set(key, {
      state: 'closed',
      failures: 0,
      consecutiveFailures: 0,
      lastFailureTime: null,
      totalRequests: 0,
      successfulRequests: 0,
      consecutiveSuccesses: 0,
    });

    // Initialize history
    this.healthHistory.set(key, []);

    this.emit('instance.registered', instance.id, health);
  }

  /**
   * Unregisters an instance from health monitoring
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   */
  unregisterInstance(instanceId: string, provider: ProviderId): void {
    const key = `${provider}-${instanceId}`;

    // Stop monitoring interval
    const interval = this.checkIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(key);
    }

    // Remove tracking data
    this.healthStatus.delete(key);
    this.circuitBreakers.delete(key);
    this.healthHistory.delete(key);

    this.emit('instance.unregistered', instanceId);
  }

  /**
   * Performs a health check on an instance
   *
   * @param instance - Pi instance to check
   * @returns Health check result
   */
  async checkHealth(instance: PiInstance): Promise<HealthCheckResult> {
    const key = this.getInstanceKey(instance);
    const startTime = Date.now();

    const previousStatus = this.getHealthStatus(instance.id, instance.provider)?.status ??
      instance.health;

    try {
      // Perform actual health check
      const result = await this.performHealthCheck(instance);
      const responseTimeMs = Date.now() - startTime;

      // Update health based on result
      const newStatus = result.success
        ? this.handleSuccess(key, responseTimeMs)
        : this.handleFailure(key, result.error);

      const checkResult: HealthCheckResult = {
        instanceId: instance.id,
        provider: instance.provider,
        success: result.success,
        responseTimeMs,
        error: result.error,
        timestamp: new Date(),
        newStatus,
        previousStatus,
      };

      this.emit('health.checked', checkResult);

      if (previousStatus !== newStatus) {
        this.emit('health.changed', instance.id, previousStatus, newStatus);
      }

      return checkResult;
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const newStatus = this.handleFailure(
        key,
        error instanceof Error ? error.message : String(error)
      );

      const checkResult: HealthCheckResult = {
        instanceId: instance.id,
        provider: instance.provider,
        success: false,
        responseTimeMs,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        newStatus,
        previousStatus,
      };

      this.emit('health.checked', checkResult);
      this.emit('health.failed', instance.id, error);

      return checkResult;
    }
  }

  /**
   * Starts automatic health monitoring for an instance
   *
   * @param instance - Pi instance to monitor
   */
  startMonitoring(instance: PiInstance): void {
    const key = this.getInstanceKey(instance);

    // Stop existing monitoring
    this.stopMonitoring(instance.id, instance.provider);

    // Register if not already registered
    if (!this.healthStatus.has(key)) {
      this.registerInstance(instance);
    }

    // Start periodic checks
    const interval = setInterval(async () => {
      try {
        await this.checkHealth(instance);
      } catch (error) {
        logger.error('[HealthMonitor] Health check failed for %s: %s', key, error);
      }
    }, this.config.intervalMs);

    this.checkIntervals.set(key, interval);

    this.emit('monitoring.started', instance.id);
  }

  /**
   * Stops automatic health monitoring for an instance
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   */
  stopMonitoring(instanceId: string, provider: ProviderId): void {
    const key = `${provider}-${instanceId}`;
    const interval = this.checkIntervals.get(key);

    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(key);
      this.emit('monitoring.stopped', instanceId);
    }
  }

  /**
   * Gets the health status for an instance
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   * @returns Health status or undefined
   */
  getHealthStatus(instanceId: string, provider: ProviderId): ExtendedHealthStatus | undefined {
    const key = `${provider}-${instanceId}`;
    return this.healthStatus.get(key);
  }

  /**
   * Gets all health statuses
   *
   * @returns Map of instance keys to health statuses
   */
  getAllHealthStatuses(): Map<string, ExtendedHealthStatus> {
    return new Map(this.healthStatus);
  }

  /**
   * Gets health statuses for a provider
   *
   * @param provider - Provider identifier
   * @returns Array of health statuses
   */
  getProviderHealthStatuses(provider: ProviderId): ExtendedHealthStatus[] {
    const statuses: ExtendedHealthStatus[] = [];

    for (const [key, status] of this.healthStatus) {
      if (key.startsWith(`${provider}-`)) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Checks if a provider is healthy
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   * @returns True if healthy
   */
  isHealthy(instanceId: string, provider: ProviderId): boolean {
    const status = this.getHealthStatus(instanceId, provider);
    return status ? status.status === 'healthy' || status.status === 'degraded' : false;
  }

  /**
   * Checks if circuit breaker allows requests
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   * @returns True if requests allowed
   */
  canRoute(instanceId: string, provider: ProviderId): boolean {
    const key = `${provider}-${instanceId}`;
    const cb = this.circuitBreakers.get(key);

    if (!cb) {
      return true;
    }

    if (cb.state === 'open') {
      // Check if should transition to half-open
      if (
        cb.lastFailureTime &&
        Date.now() - cb.lastFailureTime > this.config.circuitBreakerResetMs
      ) {
        cb.state = 'half-open';
        cb.consecutiveSuccesses = 0;
        this.emit('circuit.half-open', instanceId, provider);
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Gets the healthiest instance for a provider
   *
   * @param provider - Provider identifier
   * @returns Healthiest instance status or undefined
   */
  getHealthiestInstance(provider: ProviderId): ExtendedHealthStatus | undefined {
    const statuses = this.getProviderHealthStatuses(provider);

    if (statuses.length === 0) {
      return undefined;
    }

    // Sort by health score descending
    statuses.sort((a, b) => b.healthScore - a.healthScore);

    // Return first healthy or degraded instance
    return statuses.find((s) => s.status === 'healthy' || s.status === 'degraded');
  }

  /**
   * Gets aggregate health for a provider across all instances
   *
   * @param provider - Provider identifier
   * @returns Aggregate health status
   */
  getProviderAggregateHealth(provider: ProviderId): {
    status: HealthStatus;
    healthScore: number;
    successRate: number;
    totalInstances: number;
    healthyInstances: number;
  } {
    const statuses = this.getProviderHealthStatuses(provider);

    if (statuses.length === 0) {
      return {
        status: 'unknown',
        healthScore: 0,
        successRate: 0,
        totalInstances: 0,
        healthyInstances: 0,
      };
    }

    const totalInstances = statuses.length;
    const healthyInstances = statuses.filter(
      (s) => s.status === 'healthy' || s.status === 'degraded'
    ).length;

    const avgHealthScore =
      statuses.reduce((sum, s) => sum + s.healthScore, 0) / totalInstances;

    const avgSuccessRate =
      statuses.reduce((sum, s) => sum + s.successRate, 0) / totalInstances;

    // Determine aggregate status
    let status: HealthStatus;
    if (healthyInstances === totalInstances) {
      status = 'healthy';
    } else if (healthyInstances > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      healthScore: avgHealthScore,
      successRate: avgSuccessRate,
      totalInstances,
      healthyInstances,
    };
  }

  /**
   * Records a manual success for circuit breaker
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   */
  recordSuccess(instanceId: string, provider: ProviderId): void {
    const key = `${provider}-${instanceId}`;
    this.handleSuccess(key, 0);
  }

  /**
   * Records a manual failure for circuit breaker
   *
   * @param instanceId - Instance identifier
   * @param provider - Provider identifier
   * @param error - Error message
   */
  recordFailure(instanceId: string, provider: ProviderId, error?: string): void {
    const key = `${provider}-${instanceId}`;
    this.handleFailure(key, error);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Gets the key for an instance
   *
   * @param instance - Pi instance
   * @returns Instance key
   */
  private getInstanceKey(instance: PiInstance): string {
    return `${instance.provider}-${instance.id}`;
  }

  /**
   * Performs the actual health check
   *
   * @param instance - Instance to check
   * @returns Health check result
   */
  private async performHealthCheck(
    instance: PiInstance
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Health check timeout' });
      }, this.config.timeoutMs);

      // Simulate health check based on instance health
      const shouldSucceed = instance.health !== 'unhealthy';

      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ success: shouldSucceed });
      }, Math.random() * 100);
    });
  }

  /**
   * Handles a successful health check
   *
   * @param key - Instance key
   * @param responseTimeMs - Response time in milliseconds
   * @returns New health status
   */
  private handleSuccess(key: string, responseTimeMs: number): HealthStatus {
    const health = this.healthStatus.get(key);
    const cb = this.circuitBreakers.get(key);

    if (!health || !cb) {
      return 'unknown';
    }

    // Update health metrics
    health.totalRequests++;
    health.successfulRequests++;
    health.successRate = health.successfulRequests / health.totalRequests;
    health.errorRate = health.failedRequests / health.totalRequests;
    health.responseTimeMs = responseTimeMs;
    health.lastSuccessAt = new Date();
    health.lastCheckedAt = new Date();

    // Update circuit breaker
    cb.totalRequests++;
    cb.successfulRequests++;

    if (cb.state === 'half-open') {
      cb.consecutiveSuccesses++;

      if (cb.consecutiveSuccesses >= this.config.successThreshold) {
        // Reset circuit breaker
        cb.state = 'closed';
        cb.failures = 0;
        cb.lastFailureTime = null;
        this.emit('circuit.closed', key);
      }
    } else if (cb.state === 'closed') {
      cb.consecutiveFailures = Math.max(0, cb.consecutiveFailures - 1);
    }

    // Determine new status
    let newStatus: HealthStatus;
    if (health.successRate >= this.config.degradedThreshold / 100) {
      newStatus = 'healthy';
    } else if (health.successRate >= this.config.unhealthyThreshold / 100) {
      newStatus = 'degraded';
    } else {
      newStatus = 'unhealthy';
    }

    health.status = newStatus;
    health.healthScore = this.calculateHealthScore(health);
    health.circuitState = cb.state;

    return newStatus;
  }

  /**
   * Handles a failed health check
   *
   * @param key - Instance key
   * @param error - Error message
   * @returns New health status
   */
  private handleFailure(key: string, error?: string): HealthStatus {
    const health = this.healthStatus.get(key);
    const cb = this.circuitBreakers.get(key);

    if (!health || !cb) {
      return 'unknown';
    }

    // Update health metrics
    health.totalRequests++;
    health.failedRequests++;
    health.successRate = health.successfulRequests / health.totalRequests;
    health.errorRate = health.failedRequests / health.totalRequests;
    health.consecutiveFailures++;
    health.lastErrorAt = new Date();
    health.lastErrorMessage = error;
    health.lastCheckedAt = new Date();

    // Update circuit breaker
    cb.totalRequests++;
    cb.failures++;
    cb.consecutiveFailures++;
    cb.lastFailureTime = Date.now();
    cb.consecutiveSuccesses = 0;

    if (cb.state === 'half-open') {
      // Go back to open
      cb.state = 'open';
      this.emit('circuit.open', key);
    } else if (cb.state === 'closed' && cb.failures >= this.config.circuitBreakerThreshold) {
      // Open circuit
      cb.state = 'open';
      this.emit('circuit.open', key);
    }

    // Determine new status
    let newStatus: HealthStatus;
    if (health.consecutiveFailures >= this.config.failureThreshold) {
      newStatus = 'unhealthy';
    } else if (health.successRate < this.config.unhealthyThreshold / 100) {
      newStatus = 'unhealthy';
    } else if (health.successRate < this.config.degradedThreshold / 100) {
      newStatus = 'degraded';
    } else {
      newStatus = 'healthy';
    }

    health.status = newStatus;
    health.healthScore = this.calculateHealthScore(health);
    health.circuitState = cb.state;

    return newStatus;
  }

  /**
   * Calculates health score (0-100)
   *
   * @param health - Health status
   * @returns Health score
   */
  private calculateHealthScore(health: ExtendedHealthStatus): number {
    // Base score from success rate (60%)
    let score = health.successRate * 60;

    // Circuit breaker bonus (20%)
    if (health.circuitState === 'closed') {
      score += 20;
    } else if (health.circuitState === 'half-open') {
      score += 10;
    }

    // Capacity utilization (20%)
    const capacityScore = Math.max(0, 100 - health.capacityUtilization) * 0.2;
    score += capacityScore;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config.updated', this.config);
  }

  /**
   * Gets current configuration
   *
   * @returns Current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Disposes the monitor and cleans up
   */
  dispose(): void {
    // Stop all monitoring intervals
    for (const [key, interval] of this.checkIntervals) {
      clearInterval(interval);
      this.emit('monitoring.stopped', key);
    }

    this.checkIntervals.clear();
    this.healthStatus.clear();
    this.circuitBreakers.clear();
    this.healthHistory.clear();

    this.emit('disposed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalHealthMonitor: HealthMonitor | null = null;

/**
 * Gets the global HealthMonitor instance
 *
 * @returns Global HealthMonitor
 */
export function getGlobalHealthMonitor(): HealthMonitor {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new HealthMonitor();
  }
  return globalHealthMonitor;
}

/**
 * Resets the global HealthMonitor (for testing)
 */
export function resetGlobalHealthMonitor(): void {
  globalHealthMonitor = null;
}

// Default export
export default HealthMonitor;

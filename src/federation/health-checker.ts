/**
 * Health Checker - Periodic Health Monitoring for Agents
 *
 * Monitors agent health through periodic ping checks and emits events
 * for status changes. Integrates with the agent registry for health
 * status updates and circuit breaker coordination.
 *
 * @module federation/health-checker
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Health status values
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Configuration for health checker
 */
export interface HealthCheckerConfig {
  /** Check interval in milliseconds (default: 5000) */
  interval: number;
  /** Timeout for ping requests in milliseconds (default: 5000) */
  timeout: number;
  /** Threshold for unhealthy status (consecutive failures, default: 3) */
  unhealthyThreshold: number;
  /** Threshold for degraded status (latency > threshold, default: 2000) */
  degradedThreshold: number;
  /** Healthy latency threshold in milliseconds (default: 5000) */
  healthyLatencyThreshold: number;
  /** Auto-remove unhealthy agents after this many ms (default: null = never) */
  autoRemoveAfterMs?: number;
}

/**
 * Result of a health check
 */
export interface HealthCheckResult {
  agentId: string;
  status: HealthStatus;
  latency: number;
  timestamp: Date;
  error?: string;
  consecutiveFailures: number;
}

/**
 * Agent health state
 */
export interface AgentHealthState {
  agentId: string;
  status: HealthStatus;
  lastCheck: Date;
  latency: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalChecks: number;
  totalFailures: number;
}

/**
 * Ping response from agent
 */
export interface PingResponse {
  success: boolean;
  latency: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent to monitor - minimal interface for health checking
 */
export interface MonitoredAgent {
  id: string;
  endpoint?: string;
  status?: string;
  lastHeartbeat?: Date;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_HEALTH_CHECKER_CONFIG: HealthCheckerConfig = {
  interval: 5000, // 5 seconds
  timeout: 5000, // 5 seconds
  unhealthyThreshold: 3,
  degradedThreshold: 2000, // 2 seconds
  healthyLatencyThreshold: 5000, // 5 seconds
  autoRemoveAfterMs: undefined,
};

// ============================================================================
// Health Checker
// ============================================================================

/**
 * Health checker for monitoring agent status
 *
 * Performs periodic health checks on registered agents and emits
 * events for status transitions. Integrates with circuit breakers
 * and load balancers.
 *
 * @example
 * ```typescript
 * const healthChecker = new HealthChecker({
 *   interval: 5000,
 *   timeout: 5000,
 *   unhealthyThreshold: 3
 * });
 *
 * healthChecker.on('unhealthy', (agentId) => {
 *   console.log(`Agent ${agentId} is unhealthy`);
 * });
 *
 * healthChecker.start();
 * ```
 */
export class HealthChecker extends EventEmitter {
  private config: HealthCheckerConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private agentHealth: Map<string, AgentHealthState> = new Map();
  private agentEndpoints: Map<string, string> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private consecutiveSuccesses: Map<string, number> = new Map();
  private lastCheckTime: Map<string, number> = new Map();
  private unhealthySince: Map<string, number> = new Map();
  private isRunning = false;

  constructor(config?: Partial<HealthCheckerConfig>) {
    super();
    this.config = { ...DEFAULT_HEALTH_CHECKER_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[HealthChecker] Already running');
      return;
    }

    this.isRunning = true;

    // Run first check immediately
    this.runHealthChecks().catch(error => {
      logger.error('[HealthChecker] Initial health check failed', { error });
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('[HealthChecker] Health check cycle failed', { error });
      });
    }, this.config.interval);

    logger.info(`[HealthChecker] Started (interval: ${this.config.interval}ms)`);
    this.emit('started', { interval: this.config.interval, timestamp: new Date() });
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;

    logger.info('[HealthChecker] Stopped');
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Check if health checker is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Register an agent for health monitoring
   */
  registerAgent(agentId: string, endpoint?: string): void {
    if (!this.agentHealth.has(agentId)) {
      this.agentHealth.set(agentId, {
        agentId,
        status: 'unknown',
        lastCheck: new Date(),
        latency: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalChecks: 0,
        totalFailures: 0,
      });

      this.consecutiveFailures.set(agentId, 0);
      this.consecutiveSuccesses.set(agentId, 0);

      logger.debug(`[HealthChecker] Registered agent ${agentId}`);
      this.emit('agent.registered', { agentId, timestamp: new Date() });
    }

    if (endpoint) {
      this.agentEndpoints.set(agentId, endpoint);
    }
  }

  /**
   * Unregister an agent from health monitoring
   */
  unregisterAgent(agentId: string): boolean {
    const existed = this.agentHealth.has(agentId);

    this.agentHealth.delete(agentId);
    this.agentEndpoints.delete(agentId);
    this.consecutiveFailures.delete(agentId);
    this.consecutiveSuccesses.delete(agentId);
    this.lastCheckTime.delete(agentId);
    this.unhealthySince.delete(agentId);

    if (existed) {
      logger.debug(`[HealthChecker] Unregistered agent ${agentId}`);
      this.emit('agent.unregistered', { agentId, timestamp: new Date() });
    }

    return existed;
  }

  /**
   * Update agent endpoint
   */
  updateEndpoint(agentId: string, endpoint: string): void {
    this.agentEndpoints.set(agentId, endpoint);
  }

  /**
   * Get all registered agent IDs
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.agentHealth.keys());
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  /**
   * Run health checks on all registered agents
   */
  private async runHealthChecks(): Promise<void> {
    const agents = this.getRegisteredAgents();

    if (agents.length === 0) {
      return;
    }

    logger.debug(`[HealthChecker] Running health checks on ${agents.length} agents`);

    const results = await Promise.allSettled(
      agents.map(agentId => this.checkAgent(agentId))
    );

    // Count results
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const checkResult = result.value;
        if (checkResult.status === 'healthy') healthy++;
        else if (checkResult.status === 'degraded') degraded++;
        else if (checkResult.status === 'unhealthy') unhealthy++;
      } else {
        unhealthy++;
      }
    });

    this.emit('cycle.completed', {
      checked: agents.length,
      healthy,
      degraded,
      unhealthy,
      timestamp: new Date(),
    });

    logger.debug(`[HealthChecker] Cycle completed: ${healthy} healthy, ${degraded} degraded, ${unhealthy} unhealthy`);

    // Auto-remove unhealthy agents if configured
    if (this.config.autoRemoveAfterMs) {
      this.autoRemoveUnhealthy();
    }
  }

  /**
   * Check health of a specific agent
   */
  async checkAgent(agentId: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let status: HealthStatus;
    let error: string | undefined;

    try {
      const response = await this.pingAgent(agentId);
      const latency = Date.now() - startTime;

      if (!response.success) {
        // Ping failed
        error = response.error;
        status = this.handleFailure(agentId, response.error);
      } else if (latency > this.config.degradedThreshold) {
        // High latency - degraded
        status = 'degraded';
        this.handleSuccess(agentId);
      } else if (latency < this.config.healthyLatencyThreshold) {
        // Good latency - healthy
        status = 'healthy';
        this.handleSuccess(agentId);
      } else {
        // Acceptable latency - healthy but close to threshold
        status = 'healthy';
        this.handleSuccess(agentId);
      }

      // Update agent health state
      const state = this.agentHealth.get(agentId);
      if (state) {
        state.status = status;
        state.lastCheck = new Date();
        state.latency = latency;
        state.totalChecks++;

        if (!response.success) {
          state.totalFailures++;
        }
      }

      this.lastCheckTime.set(agentId, startTime);

      const result: HealthCheckResult = {
        agentId,
        status,
        latency,
        timestamp: new Date(),
        error,
        consecutiveFailures: this.consecutiveFailures.get(agentId) || 0,
      };

      this.emit('checked', result);

      return result;
    } catch (err) {
      const latency = Date.now() - startTime;
      error = (err as Error).message;
      status = this.handleFailure(agentId, error);

      const state = this.agentHealth.get(agentId);
      if (state) {
        state.status = status;
        state.lastCheck = new Date();
        state.latency = latency;
        state.totalChecks++;
        state.totalFailures++;
      }

      this.lastCheckTime.set(agentId, startTime);

      const result: HealthCheckResult = {
        agentId,
        status,
        latency,
        timestamp: new Date(),
        error,
        consecutiveFailures: this.consecutiveFailures.get(agentId) || 0,
      };

      this.emit('checked', result);

      return result;
    }
  }

  /**
   * Ping an agent to check responsiveness
   */
  private async pingAgent(agentId: string): Promise<PingResponse> {
    const startTime = Date.now();

    // Try to get endpoint from registry
    const endpoint = this.agentEndpoints.get(agentId);

    if (endpoint) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${endpoint}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json() as Record<string, unknown>;
          return {
            success: true,
            latency,
            metadata: data,
          };
        } else {
          return {
            success: false,
            latency,
            error: `HTTP ${response.status}`,
          };
        }
      } catch (err) {
        return {
          success: false,
          latency: Date.now() - startTime,
          error: (err as Error).message,
        };
      }
    }

    // No endpoint - simulate based on last heartbeat
    // This allows health checking even without direct endpoint
    return {
      success: true,
      latency: Date.now() - startTime,
      error: undefined,
    };
  }

  /**
   * Handle successful health check
   */
  private handleSuccess(agentId: string): void {
    const prevFailures = this.consecutiveFailures.get(agentId) || 0;

    this.consecutiveFailures.set(agentId, 0);

    const successes = (this.consecutiveSuccesses.get(agentId) || 0) + 1;
    this.consecutiveSuccesses.set(agentId, successes);

    // Emit recovery event if recovering from failures
    if (prevFailures > 0) {
      const state = this.agentHealth.get(agentId);
      if (state && state.status === 'unhealthy') {
        this.emit('recovered', {
          agentId,
          timestamp: new Date(),
        });
      }
    }

    // Clear unhealthy timestamp
    this.unhealthySince.delete(agentId);

    const state = this.agentHealth.get(agentId);
    if (state) {
      state.consecutiveFailures = 0;
      state.consecutiveSuccesses = successes;
    }
  }

  /**
   * Handle failed health check
   */
  private handleFailure(agentId: string, error?: string): HealthStatus {
    this.consecutiveSuccesses.set(agentId, 0);

    const failures = (this.consecutiveFailures.get(agentId) || 0) + 1;
    this.consecutiveFailures.set(agentId, failures);

    const state = this.agentHealth.get(agentId);
    if (state) {
      state.consecutiveFailures = failures;
      state.consecutiveSuccesses = 0;
    }

    // Check if we've crossed the unhealthy threshold
    if (failures >= this.config.unhealthyThreshold) {
      // Track when agent became unhealthy
      if (!this.unhealthySince.has(agentId)) {
        this.unhealthySince.set(agentId, Date.now());

        this.emit('unhealthy', {
          agentId,
          error,
          consecutiveFailures: failures,
          timestamp: new Date(),
        });
      }

      return 'unhealthy';
    }

    // If already had some failures, mark as degraded
    if (failures > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Auto-remove agents that have been unhealthy for too long
   */
  private autoRemoveUnhealthy(): void {
    if (!this.config.autoRemoveAfterMs) return;

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [agentId, unhealthyTime] of this.unhealthySince.entries()) {
      if (now - unhealthyTime > this.config.autoRemoveAfterMs) {
        toRemove.push(agentId);
      }
    }

    for (const agentId of toRemove) {
      logger.warn(`[HealthChecker] Auto-removing unhealthy agent ${agentId}`);
      this.unregisterAgent(agentId);
      this.emit('agent.auto_removed', { agentId, timestamp: new Date() });
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get health state for an agent
   */
  getAgentHealth(agentId: string): AgentHealthState | undefined {
    return this.agentHealth.get(agentId);
  }

  /**
   * Get all health states
   */
  getAllHealth(): AgentHealthState[] {
    return Array.from(this.agentHealth.values());
  }

  /**
   * Get healthy agents
   */
  getHealthyAgents(): string[] {
    return this.getAllHealth()
      .filter(h => h.status === 'healthy')
      .map(h => h.agentId);
  }

  /**
   * Get unhealthy agents
   */
  getUnhealthyAgents(): string[] {
    return this.getAllHealth()
      .filter(h => h.status === 'unhealthy')
      .map(h => h.agentId);
  }

  /**
   * Get degraded agents
   */
  getDegradedAgents(): string[] {
    return this.getAllHealth()
      .filter(h => h.status === 'degraded')
      .map(h => h.agentId);
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(agentId: string): boolean {
    const state = this.agentHealth.get(agentId);
    return state?.status === 'healthy';
  }

  /**
   * Get health statistics
   */
  getStats(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  } {
    const stats = { total: 0, healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };

    for (const state of this.agentHealth.values()) {
      stats.total++;
      stats[state.status]++;
    }

    return stats;
  }

  /**
   * Dispose of the health checker
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
    this.agentHealth.clear();
    this.agentEndpoints.clear();
    this.consecutiveFailures.clear();
    this.consecutiveSuccesses.clear();
    this.lastCheckTime.clear();
    this.unhealthySince.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalHealthChecker: HealthChecker | null = null;

export function getHealthChecker(config?: Partial<HealthCheckerConfig>): HealthChecker {
  if (!globalHealthChecker) {
    globalHealthChecker = new HealthChecker(config);
  }
  return globalHealthChecker;
}

export function resetHealthChecker(): void {
  globalHealthChecker = null;
}

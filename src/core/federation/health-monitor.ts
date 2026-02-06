/**
 * Federation Health Monitor - Distributed Health Checking for OpenClaw Federation
 * 
 * Monitors the health of all OpenClaw instances in the federation through
 * periodic HTTP probes. Tracks health history, detects degradation patterns,
 * and emits events for health state changes.
 * 
 * Health Check Protocol:
 * - HTTP GET to {instance.endpoint}/health
 * - Success: 200 OK with optional health data
 * - Degraded: 200 with degraded status in body
 * - Unhealthy: Non-200 status or timeout
 * 
 * @module federation/health-monitor
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import type { FederationRegistry } from './registry';
import type {
  OpenClawInstance,
  HealthStatus,
  HealthCheckResult,
  ProbeResult,
  HealthCheckHistory,
} from './types';

// ============================================================================
// HEALTH MONITOR
// ============================================================================

/**
 * Events emitted by the HealthMonitor
 */
export interface HealthMonitorEvents {
  /** Emitted when an instance health check completes */
  'health.checked': { 
    instanceId: string; 
    status: HealthStatus; 
    latency: number;
    timestamp: Date;
  };
  
  /** Emitted when instance health degrades */
  'health.degraded': { 
    instanceId: string; 
    previousStatus: HealthStatus;
    latency: number;
    error?: string;
    timestamp: Date;
  };
  
  /** Emitted when instance becomes unhealthy */
  'health.unhealthy': { 
    instanceId: string; 
    previousStatus: HealthStatus;
    error: string;
    consecutiveFailures: number;
    timestamp: Date;
  };
  
  /** Emitted when instance recovers to healthy */
  'health.recovered': { 
    instanceId: string; 
    latency: number;
    timestamp: Date;
  };
  
  /** Emitted when health check cycle completes */
  'cycle.completed': {
    checked: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    totalLatency: number;
    timestamp: Date;
  };
}

/**
 * HealthMonitor performs distributed health checks on OpenClaw instances.
 * 
 * Features:
 * - Periodic HTTP health probes
 * - Configurable check intervals and timeouts
 * - Health history tracking
 * - Automatic degradation detection
 * - Event-driven health state changes
 * 
 * @example
 * ```typescript
 * const monitor = new HealthMonitor(registry, 30000, 5000);
 * monitor.start();
 * 
 * monitor.on('health.degraded', ({ instanceId }) => {
 *   console.warn(`Instance ${instanceId} is degraded`);
 * });
 * ```
 */
export class HealthMonitor extends EventEmitter {
  /** Reference to the federation registry */
  private registry: FederationRegistry;
  
  /** Health check interval in milliseconds */
  private checkInterval: number;
  
  /** Health check timeout in milliseconds */
  private timeout: number;
  
  /** Timer for periodic checks */
  private timer?: NodeJS.Timeout;
  
  /** Whether monitoring is currently running */
  private isRunning = false;
  
  /** Health check history per instance */
  private history: Map<string, HealthCheckHistory> = new Map();
  
  /** Consecutive failure counts per instance */
  private failureCounts: Map<string, number> = new Map();
  
  /** Threshold for marking instance unhealthy */
  private unhealthyThreshold = 3;
  
  /** Track last known status for change detection */
  private lastStatus: Map<string, HealthStatus> = new Map();

  /**
   * Create a new HealthMonitor
   * 
   * @param registry - Federation registry containing instances
   * @param checkInterval - Health check interval in milliseconds (default: 30000)
   * @param timeout - Health check timeout in milliseconds (default: 5000)
   */
  constructor(
    registry: FederationRegistry,
    checkInterval: number = 30000,
    timeout: number = 5000
  ) {
    super();
    this.registry = registry;
    this.checkInterval = checkInterval;
    this.timeout = timeout;
  }

  /**
   * Start periodic health monitoring
   * Begins immediately with first check, then schedules periodic checks
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('federation-health-monitor', 'Health monitoring already running');
      return;
    }

    this.isRunning = true;
    logger.info('federation-health-monitor', 
      `Starting health monitoring (interval: ${this.checkInterval}ms, timeout: ${this.timeout}ms)`
    );

    // Run first check immediately
    this.runCheckCycle().catch(error => {
      logger.error('federation-health-monitor', 'Initial health check failed', { error });
    });

    // Schedule periodic checks
    this.timer = setInterval(() => {
      this.runCheckCycle().catch(error => {
        logger.error('federation-health-monitor', 'Health check cycle failed', { error });
      });
    }, this.checkInterval);
  }

  /**
   * Stop periodic health monitoring
   * Clears the timer and stops all checks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    logger.info('federation-health-monitor', 'Stopped health monitoring');
  }

  /**
   * Check if monitoring is currently running
   * 
   * @returns True if monitoring is active
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Perform a single health check on a specific instance
   * Updates instance status in registry and emits events
   * 
   * @param instance - Instance to check
   * @returns Health check result with status and details
   * 
   * @example
   * ```typescript
   * const instance = registry.getInstance('instance-id');
   * if (instance) {
   *   const result = await monitor.checkInstance(instance);
   *   console.log(`${instance.id}: ${result.status} (${result.latency}ms)`);
   * }
   * ```
   */
  async checkInstance(instance: OpenClawInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      // Perform the probe
      const probeResult = await this.probeEndpoint(instance.endpoint);
      const latency = Date.now() - startTime;

      // Determine health status from probe
      const status = this.determineHealthStatus([probeResult]);

      // Build result
      const result: HealthCheckResult = {
        instanceId: instance.id,
        status,
        latency,
        details: probeResult.data ? {
          cpu: typeof probeResult.data['cpuPercent'] === 'number' ? probeResult.data['cpuPercent'] : undefined,
          memory: typeof probeResult.data['memoryPercent'] === 'number' ? probeResult.data['memoryPercent'] : undefined,
          activeSessions: typeof probeResult.data['currentSessions'] === 'number' ? probeResult.data['currentSessions'] : undefined,
          version: typeof probeResult.data['version'] === 'string' ? probeResult.data['version'] : undefined,
          uptime: typeof probeResult.data['uptime'] === 'number' ? probeResult.data['uptime'] : undefined,
        } : undefined,
        timestamp,
      };

      // Update history
      this.updateHistory(instance.id, result);

      // Handle status changes
      await this.handleStatusChange(instance, status, latency, probeResult.error);

      // Emit check event
      this.emit('health.checked', {
        instanceId: instance.id,
        status,
        latency,
        timestamp,
      });

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Build failure result
      const result: HealthCheckResult = {
        instanceId: instance.id,
        status: 'unhealthy',
        latency,
        error: errorMessage,
        timestamp,
      };

      // Update history
      this.updateHistory(instance.id, result);

      // Handle failure
      await this.handleStatusChange(instance, 'unhealthy', latency, errorMessage);

      // Emit check event
      this.emit('health.checked', {
        instanceId: instance.id,
        status: 'unhealthy',
        latency,
        timestamp,
      });

      return result;
    }
  }

  /**
   * Get health check history for an instance
   * 
   * @param instanceId - Instance ID
   * @returns Health check history or undefined
   */
  getHistory(instanceId: string): HealthCheckHistory | undefined {
    return this.history.get(instanceId);
  }

  /**
   * Get failure count for an instance
   * 
   * @param instanceId - Instance ID
   * @returns Number of consecutive failures
   */
  getFailureCount(instanceId: string): number {
    return this.failureCounts.get(instanceId) || 0;
  }

  /**
   * Clear history for an instance
   * Called when instance is unregistered
   * 
   * @param instanceId - Instance ID
   */
  clearHistory(instanceId: string): void {
    this.history.delete(instanceId);
    this.failureCounts.delete(instanceId);
    this.lastStatus.delete(instanceId);
  }

  /**
   * Get health statistics across all monitored instances
   * 
   * @returns Health statistics
   */
  getStats(): {
    isRunning: boolean;
    checkInterval: number;
    timeout: number;
    instancesMonitored: number;
    totalChecks: number;
  } {
    const totalChecks = Array.from(this.history.values())
      .reduce((sum, h) => sum + h.checks.length, 0);

    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      timeout: this.timeout,
      instancesMonitored: this.history.size,
      totalChecks,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Run a complete health check cycle on all active instances
   */
  private async runCheckCycle(): Promise<void> {
    const startTime = Date.now();
    const instances = this.registry.getAllInstances().filter(i => i.isActive);

    if (instances.length === 0) {
      return;
    }

    logger.debug('federation-health-monitor', `Running health checks on ${instances.length} instances`);

    const results = await Promise.allSettled(
      instances.map(instance => this.checkInstance(instance))
    );

    // Aggregate results
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let totalLatency = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        totalLatency += result.value.latency;
        switch (result.value.status) {
          case 'healthy':
            healthy++;
            break;
          case 'degraded':
            degraded++;
            break;
          case 'unhealthy':
            unhealthy++;
            break;
        }
      } else {
        unhealthy++;
      }
    });

    const avgLatency = results.length > 0 ? totalLatency / results.length : 0;

    // Emit cycle completion
    this.emit('cycle.completed', {
      checked: instances.length,
      healthy,
      degraded,
      unhealthy,
      totalLatency: avgLatency,
      timestamp: new Date(),
    });

    const duration = Date.now() - startTime;
    logger.info('federation-health-monitor', 
      `Health check cycle: ${healthy} healthy, ${degraded} degraded, ${unhealthy} unhealthy ` +
      `(avg latency: ${avgLatency.toFixed(0)}ms, duration: ${duration}ms)`
    );
  }

  /**
   * Probe an endpoint's health endpoint
   * 
   * @param endpoint - Base endpoint URL
   * @returns Probe result with status and data
   */
  private async probeEndpoint(endpoint: string): Promise<ProbeResult> {
    const startTime = Date.now();
    const url = `${endpoint}/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;
      
      let data: Record<string, unknown> | undefined;
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        // Ignore JSON parse errors
      }

      return {
        success: response.ok,
        statusCode: response.status,
        latency,
        data,
        timestamp: new Date(),
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Check if it was a timeout
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          statusCode: 0,
          latency,
          error: 'Request timeout',
          timestamp: new Date(),
        };
      }

      return {
        success: false,
        statusCode: 0,
        latency,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Determine health status from probe results
   * 
   * @param results - Array of probe results
   * @returns Determined health status
   */
  private determineHealthStatus(results: ProbeResult[]): HealthStatus {
    if (results.length === 0) {
      return 'unknown';
    }

    const result = results[0];

    // Check for explicit failure
    if (!result.success) {
      return 'unhealthy';
    }

    // Check response data for status indication
    if (result.data) {
      const statusFromResponse = result.data['status'] as string | undefined;
      
      if (statusFromResponse === 'degraded') {
        return 'degraded';
      }
      
      if (statusFromResponse === 'unhealthy') {
        return 'unhealthy';
      }

      // Check resource metrics for implicit degradation
      const cpuPercent = typeof result.data['cpuPercent'] === 'number' ? result.data['cpuPercent'] : undefined;
      const memoryPercent = typeof result.data['memoryPercent'] === 'number' ? result.data['memoryPercent'] : undefined;
      
      if ((cpuPercent !== undefined && cpuPercent > 90) ||
          (memoryPercent !== undefined && memoryPercent > 90)) {
        return 'degraded';
      }
    }

    return 'healthy';
  }

  /**
   * Handle health status changes and emit appropriate events
   * 
   * @param instance - The instance being checked
   * @param newStatus - New health status
   * @param latency - Check latency
   * @param error - Error message if check failed
   */
  private async handleStatusChange(
    instance: OpenClawInstance,
    newStatus: HealthStatus,
    latency: number,
    error?: string
  ): Promise<void> {
    const previousStatus = this.lastStatus.get(instance.id) || 'unknown';
    
    // Get current failure count
    let failureCount = this.failureCounts.get(instance.id) || 0;

    // Update failure count
    if (newStatus === 'unhealthy') {
      failureCount++;
    } else if (newStatus === 'healthy') {
      failureCount = 0;
    }
    
    this.failureCounts.set(instance.id, failureCount);

    // Only process changes if status actually changed
    if (newStatus !== previousStatus) {
      logger.info('federation-health-monitor', 
        `Instance ${instance.id} health changed: ${previousStatus} -> ${newStatus}`
      );

      // Update registry
      try {
        await this.registry.update(instance.id, {
          healthStatus: newStatus,
          lastHealthCheck: new Date(),
        });
      } catch (err) {
        logger.error('federation-health-monitor', 
          `Failed to update registry for ${instance.id}`, { error: err }
        );
      }

      // Emit appropriate events
      switch (newStatus) {
        case 'healthy':
          this.emit('health.recovered', {
            instanceId: instance.id,
            latency,
            timestamp: new Date(),
          });
          break;
          
        case 'degraded':
          this.emit('health.degraded', {
            instanceId: instance.id,
            previousStatus,
            latency,
            error,
            timestamp: new Date(),
          });
          break;
          
        case 'unhealthy':
          this.emit('health.unhealthy', {
            instanceId: instance.id,
            previousStatus,
            error: error || 'Health check failed',
            consecutiveFailures: failureCount,
            timestamp: new Date(),
          });
          break;
      }

      // Update last known status
      this.lastStatus.set(instance.id, newStatus);
    }
  }

  /**
   * Update health check history for an instance
   * 
   * @param instanceId - Instance ID
   * @param result - Health check result
   */
  private updateHistory(instanceId: string, result: HealthCheckResult): void {
    let history = this.history.get(instanceId);
    
    if (!history) {
      history = {
        instanceId,
        checks: [],
        failureCount: 0,
      };
      this.history.set(instanceId, history);
    }

    // Add check to history
    history.checks.push(result);
    
    // Keep only last 100 checks
    if (history.checks.length > 100) {
      history.checks = history.checks.slice(-100);
    }

    // Update failure tracking
    if (result.status === 'unhealthy') {
      history.failureCount++;
      history.lastFailure = result.timestamp;
    } else {
      history.failureCount = 0;
      history.lastSuccess = result.timestamp;
    }
  }

  /**
   * Dispose of the health monitor and cleanup resources
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
    this.history.clear();
    this.failureCounts.clear();
    this.lastStatus.clear();
    logger.info('federation-health-monitor', 'Health monitor disposed');
  }
}

// Re-export types from types.ts
export type {
  HealthCheckResult,
  ProbeResult,
  HealthCheckHistory,
  HealthStatus,
} from './types';

// Export default
export default HealthMonitor;

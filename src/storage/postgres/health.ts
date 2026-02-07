/**
 * PostgreSQL Connection Pool Health Monitor
 * 
 * Provides comprehensive health monitoring for database connections.
 * Tracks pool metrics, connection health, and performance statistics.
 */

import { logger } from '../../utils/logger';
import type { PostgresPool } from './pool';

export interface PoolHealth {
  /** Total connections in pool */
  total: number;
  /** Idle connections available */
  idle: number;
  /** Waiting clients for connections */
  waiting: number;
  /** Whether pool is healthy */
  healthy: boolean;
  /** Connection utilization percentage (0-100) */
  utilizationPercent: number;
  /** Average wait time for connections (ms) */
  avgWaitTimeMs?: number;
  /** Timestamp of health check */
  timestamp: Date;
}

export interface PoolMetrics {
  /** Total queries executed */
  totalQueries: number;
  /** Failed queries */
  failedQueries: number;
  /** Average query time (ms) */
  avgQueryTimeMs: number;
  /** Connection acquire time (ms) */
  avgAcquireTimeMs: number;
  /** Pool utilization history */
  utilizationHistory: number[];
}

export interface HealthCheckResult {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Pool health metrics */
  pool: PoolHealth;
  /** Performance metrics */
  metrics?: PoolMetrics;
  /** Human-readable message */
  message: string;
  /** Recommendations if unhealthy */
  recommendations?: string[];
}

/**
 * Pool Health Monitor
 * Monitors connection pool health and provides diagnostics
 */
export class PoolHealthMonitor {
  private pool: PostgresPool;
  private checkInterval: NodeJS.Timeout | null = null;
  private metrics: PoolMetrics;
  private healthHistory: PoolHealth[] = [];
  private readonly maxHistorySize = 100;

  constructor(pool: PostgresPool) {
    this.pool = pool;
    this.metrics = {
      totalQueries: 0,
      failedQueries: 0,
      avgQueryTimeMs: 0,
      avgAcquireTimeMs: 0,
      utilizationHistory: [],
    };
  }

  /**
   * Get current pool health
   */
  async getHealth(): Promise<PoolHealth> {
    const stats = this.pool.getStats();
    const total = stats.total;
    const idle = stats.idle;
    const waiting = stats.waiting;
    
    // Calculate utilization
    const utilizationPercent = total > 0 
      ? Math.round(((total - idle) / total) * 100) 
      : 0;

    // Test connection health
    const healthCheck = await this.pool.healthCheck();
    
    const health: PoolHealth = {
      total,
      idle,
      waiting,
      healthy: healthCheck.healthy,
      utilizationPercent,
      timestamp: new Date(),
    };

    // Store history
    this.healthHistory.push(health);
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    // Update utilization history
    this.metrics.utilizationHistory.push(utilizationPercent);
    if (this.metrics.utilizationHistory.length > 60) {
      this.metrics.utilizationHistory.shift();
    }

    return health;
  }

  /**
   * Perform comprehensive health check with recommendations
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const health = await this.getHealth();
    const recommendations: string[] = [];
    
    // Determine status
    let status: HealthCheckResult['status'] = 'healthy';
    
    if (!health.healthy) {
      status = 'unhealthy';
      recommendations.push('Pool connection test failed - check database connectivity');
    } else if (health.utilizationPercent > 90) {
      status = 'degraded';
      recommendations.push('Pool utilization is critically high (>90%) - consider increasing max pool size');
    } else if (health.utilizationPercent > 75) {
      status = 'degraded';
      recommendations.push('Pool utilization is high (>75%) - monitor for connection exhaustion');
    }

    if (health.waiting > 10) {
      status = status === 'healthy' ? 'degraded' : status;
      recommendations.push(`Many clients waiting for connections (${health.waiting}) - consider increasing pool size`);
    }

    if (health.idle === 0 && health.total > 0) {
      status = status === 'healthy' ? 'degraded' : status;
      recommendations.push('No idle connections available - pool may be under-provisioned');
    }

    // Calculate average utilization trend
    const avgUtilization = this.metrics.utilizationHistory.length > 0
      ? this.metrics.utilizationHistory.reduce((a, b) => a + b, 0) / this.metrics.utilizationHistory.length
      : 0;

    if (avgUtilization > 80) {
      recommendations.push(`Average utilization over last ${this.metrics.utilizationHistory.length} checks is ${avgUtilization.toFixed(1)}%`);
    }

    const message = this.generateHealthMessage(health, status);

    return {
      status,
      pool: health,
      metrics: this.metrics,
      message,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      return;
    }

    logger.info(`Starting pool health monitoring (interval: ${intervalMs}ms)`);
    
    this.checkInterval = setInterval(async () => {
      try {
        const health = await this.getHealth();
        
        // Log warnings for concerning states
        if (!health.healthy) {
          logger.error('Pool health check failed - connections may be compromised');
        } else if (health.utilizationPercent > 90) {
          logger.warn(`Pool utilization critical: ${health.utilizationPercent}% (${health.total - health.idle}/${health.total} connections in use)`);
        } else if (health.waiting > 5) {
          logger.warn(`${health.waiting} clients waiting for database connections`);
        }
      } catch (error) {
        logger.error('Error during pool health monitoring:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic health monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Pool health monitoring stopped');
    }
  }

  /**
   * Get health history
   */
  getHealthHistory(): PoolHealth[] {
    return [...this.healthHistory];
  }

  /**
   * Update query metrics
   */
  recordQuery(durationMs: number, failed: boolean = false): void {
    this.metrics.totalQueries++;
    if (failed) {
      this.metrics.failedQueries++;
    }
    
    // Exponential moving average for query time
    const alpha = 0.1;
    this.metrics.avgQueryTimeMs = 
      (alpha * durationMs) + ((1 - alpha) * this.metrics.avgQueryTimeMs);
  }

  /**
   * Record connection acquire time
   */
  recordAcquireTime(durationMs: number): void {
    const alpha = 0.1;
    this.metrics.avgAcquireTimeMs = 
      (alpha * durationMs) + ((1 - alpha) * this.metrics.avgAcquireTimeMs);
  }

  /**
   * Generate human-readable health message
   */
  private generateHealthMessage(health: PoolHealth, status: string): string {
    const parts: string[] = [
      `Pool ${status}`,
      `${health.total} total (${health.idle} idle, ${health.total - health.idle} active)`,
      `${health.waiting} waiting`,
      `${health.utilizationPercent}% utilization`,
    ];
    
    return parts.join(' | ');
  }
}

/**
 * Create a health monitor for a pool
 */
export function createHealthMonitor(pool: PostgresPool): PoolHealthMonitor {
  return new PoolHealthMonitor(pool);
}

export default PoolHealthMonitor;

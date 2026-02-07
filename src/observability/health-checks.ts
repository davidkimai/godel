/**
 * Health Check Registry and Endpoints for Godel
 * 
 * Provides comprehensive health checks for the Godel orchestration platform,
 * including database connectivity, Redis, disk space, and memory usage.
 * 
 * Endpoints:
 * - GET /health - Full health check with detailed report
 * - GET /health/ready - Readiness probe (returns 503 if not ready)
 * - GET /health/live - Liveness probe (returns 200 if process is alive)
 */

import { logger } from '../integrations/utils/logger';
import { Request, Response, Router } from 'express';
import { promises as fs } from 'fs';
import { hostname } from 'os';

// ============================================================================
// HEALTH CHECK TYPES
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  responseTime: number; // milliseconds
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptime: number;
  hostname: string;
  service: string;
  checks: HealthCheckResult[];
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
    total: number;
  };
}

export interface HealthCheckConfig {
  version: string;
  serviceName?: string;
  database?: {
    check: () => Promise<boolean>;
    name?: string;
  };
  redis?: {
    check: () => Promise<boolean>;
    name?: string;
  };
  diskThresholds?: {
    warningPercent: number;
    criticalPercent: number;
  };
  memoryThresholds?: {
    warningPercent: number;
    criticalPercent: number;
  };
  customChecks?: HealthCheckFunction[];
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

// ============================================================================
// DEFAULT THRESHOLDS
// ============================================================================

const DEFAULT_DISK_THRESHOLDS = {
  warningPercent: 85,
  criticalPercent: 95,
};

const DEFAULT_MEMORY_THRESHOLDS = {
  warningPercent: 80,
  criticalPercent: 95,
};

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

/**
 * Check system memory usage
 */
async function checkMemory(thresholds = DEFAULT_MEMORY_THRESHOLDS): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const memUsage = process.memoryUsage();
    const totalSystem = require('os').totalmem();
    const freeSystem = require('os').freemem();
    const usedSystemPercent = ((totalSystem - freeSystem) / totalSystem) * 100;
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status: HealthStatus = 'healthy';
    let message: string;

    if (usedSystemPercent >= thresholds.criticalPercent) {
      status = 'unhealthy';
      message = `System memory critical: ${usedSystemPercent.toFixed(1)}% used`;
    } else if (usedSystemPercent >= thresholds.warningPercent) {
      status = 'degraded';
      message = `System memory high: ${usedSystemPercent.toFixed(1)}% used`;
    } else {
      message = `System memory healthy: ${usedSystemPercent.toFixed(1)}% used`;
    }

    return {
      name: 'memory',
      status,
      message,
      responseTime: Date.now() - start,
      details: {
        systemUsedPercent: usedSystemPercent.toFixed(2),
        systemFreeBytes: freeSystem,
        systemTotalBytes: totalSystem,
        heapUsedBytes: memUsage.heapUsed,
        heapTotalBytes: memUsage.heapTotal,
        heapUsedPercent: heapUsedPercent.toFixed(2),
        rssBytes: memUsage.rss,
        externalBytes: memUsage.external,
      },
    };
  } catch (error) {
    return {
      name: 'memory',
      status: 'unknown',
      message: 'Failed to check memory usage',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check disk space
 */
async function checkDisk(thresholds = DEFAULT_DISK_THRESHOLDS): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const stats = await fs.statfs(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const usedPercent = (usedBytes / totalBytes) * 100;

    let status: HealthStatus = 'healthy';
    let message: string;

    if (usedPercent >= thresholds.criticalPercent) {
      status = 'unhealthy';
      message = `Disk space critical: ${usedPercent.toFixed(1)}% used`;
    } else if (usedPercent >= thresholds.warningPercent) {
      status = 'degraded';
      message = `Disk space warning: ${usedPercent.toFixed(1)}% used`;
    } else {
      message = `Disk space healthy: ${usedPercent.toFixed(1)}% used`;
    }

    return {
      name: 'disk',
      status,
      message,
      responseTime: Date.now() - start,
      details: {
        totalBytes,
        freeBytes,
        usedBytes,
        usedPercent: usedPercent.toFixed(2),
        path: process.cwd(),
      },
    };
  } catch (error) {
    return {
      name: 'disk',
      status: 'unknown',
      message: 'Failed to check disk space',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check database connectivity
 */
async function checkDatabase(checkFn: () => Promise<boolean>, name = 'database'): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const isConnected = await checkFn();
    
    if (isConnected) {
      return {
        name,
        status: 'healthy',
        message: `${name} connection successful`,
        responseTime: Date.now() - start,
      };
    } else {
      return {
        name,
        status: 'unhealthy',
        message: `${name} connection failed`,
        responseTime: Date.now() - start,
      };
    }
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      message: `${name} connection error`,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(checkFn: () => Promise<boolean>, name = 'redis'): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const isConnected = await checkFn();
    
    if (isConnected) {
      return {
        name,
        status: 'healthy',
        message: `${name} connection successful`,
        responseTime: Date.now() - start,
      };
    } else {
      return {
        name,
        status: 'unhealthy',
        message: `${name} connection failed`,
        responseTime: Date.now() - start,
      };
    }
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      message: `${name} connection error`,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check process health
 */
async function checkProcess(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    // Check for memory leaks (if heap has grown significantly)
    const heapGrowth = memUsage.heapUsed / memUsage.heapTotal;
    
    let status: HealthStatus = 'healthy';
    let message = `Process healthy (uptime: ${Math.floor(uptime)}s)`;
    
    if (heapGrowth > 0.95) {
      status = 'degraded';
      message = `Process degraded: heap nearly full (${(heapGrowth * 100).toFixed(1)}%)`;
    }

    return {
      name: 'process',
      status,
      message,
      responseTime: Date.now() - start,
      details: {
        uptime,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        heapGrowth: heapGrowth.toFixed(2),
      },
    };
  } catch (error) {
    return {
      name: 'process',
      status: 'unknown',
      message: 'Failed to check process health',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check event bus health
 */
async function checkEventBus(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Import dynamically to avoid circular dependencies
    const { getGlobalEventBus } = await import('../core/event-bus');
    const eventBus = getGlobalEventBus();
    const metrics = eventBus.getMetrics();

    let status: HealthStatus = 'healthy';
    let message = 'Event bus operational';

    // Degraded if too many events relative to deliveries (backlog)
    if (metrics.eventsEmitted > metrics.eventsDelivered * 1.5) {
      status = 'degraded';
      message = 'Event bus backlog detected';
    }

    return {
      name: 'eventbus',
      status,
      message,
      responseTime: Date.now() - start,
      details: {
        eventsEmitted: metrics.eventsEmitted,
        eventsDelivered: metrics.eventsDelivered,
        subscriptionsCreated: metrics.subscriptionsCreated,
        subscriptionsRemoved: metrics.subscriptionsRemoved,
      },
    };
  } catch (error) {
    return {
      name: 'eventbus',
      status: 'unknown',
      message: 'Failed to check event bus',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HEALTH CHECK MANAGER
// ============================================================================

export class HealthCheckManager {
  private config: HealthCheckConfig;
  private lastReport: HealthReport | null = null;

  constructor(config: HealthCheckConfig) {
    this.config = config;
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<HealthReport> {
    const start = Date.now();
    const checks: HealthCheckResult[] = [];

    // Always run these checks
    checks.push(await checkMemory(this.config.memoryThresholds));
    checks.push(await checkDisk(this.config.diskThresholds));
    checks.push(await checkProcess());
    
    // Event bus check (optional, don't fail if not available)
    try {
      checks.push(await checkEventBus());
    } catch {
      // Event bus not available, skip
    }

    // Database check if configured
    if (this.config.database) {
      checks.push(await checkDatabase(
        this.config.database.check,
        this.config.database.name
      ));
    }

    // Redis check if configured
    if (this.config.redis) {
      checks.push(await checkRedis(
        this.config.redis.check,
        this.config.redis.name
      ));
    }

    // Custom checks
    if (this.config.customChecks) {
      for (const checkFn of this.config.customChecks) {
        checks.push(await checkFn());
      }
    }

    // Calculate summary
    const summary = {
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      unknown: checks.filter(c => c.status === 'unknown').length,
      total: checks.length,
    };

    // Determine overall status
    let status: HealthStatus;
    if (summary.unhealthy > 0) {
      status = 'unhealthy';
    } else if (summary.degraded > 0) {
      status = 'degraded';
    } else if (summary.unknown === summary.total) {
      status = 'unknown';
    } else {
      status = 'healthy';
    }

    const report: HealthReport = {
      status,
      timestamp: new Date().toISOString(),
      version: this.config.version,
      service: this.config.serviceName || 'godel',
      uptime: process.uptime(),
      hostname: hostname(),
      checks,
      summary,
    };

    this.lastReport = report;
    logger.debug(`[HealthCheck] Completed in ${Date.now() - start}ms, status: ${status}`);
    return report;
  }

  /**
   * Get the last health report
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }
}

// ============================================================================
// EXPRESS ROUTER
// ============================================================================

export function createHealthRouter(config: HealthCheckConfig): Router {
  const router = Router();
  const manager = new HealthCheckManager(config);

  /**
   * GET /health - Full health check
   * 
   * Returns comprehensive health report including:
   * - System status (healthy/degraded/unhealthy)
   * - Individual check results with details
   * - Summary statistics
   * - Service metadata (version, uptime, hostname)
   * 
   * HTTP Status Codes:
   * - 200: Service is healthy or degraded
   * - 503: Service is unhealthy
   * - 500: Error running health checks
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const report = await manager.runChecks();
      
      // Set status code based on health status
      const statusCode = report.status === 'healthy' ? 200 
        : report.status === 'degraded' ? 200 
        : 503;
      
      res.status(statusCode).json(report);
    } catch (error) {
      logger.error('[HealthCheck] Failed to run health checks', { error });
      res.status(500).json({
        status: 'error',
        message: 'Failed to run health checks',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/ready - Readiness probe
   * 
   * Kubernetes-style readiness probe. Returns 200 if the service is ready
   * to receive traffic, 503 otherwise.
   * 
   * Use this for:
   * - Kubernetes readiness probes
   * - Load balancer health checks
   * - Determining if service can handle requests
   */
  router.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      const report = await manager.runChecks();
      
      // Service is ready if not unhealthy
      if (report.status === 'unhealthy') {
        res.status(503).json({
          ready: false,
          status: report.status,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(200).json({
          ready: true,
          status: report.status,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/live - Liveness probe
   * 
   * Kubernetes-style liveness probe. Returns 200 if the process is running.
   * This is a lightweight check that only verifies the process is alive.
   * 
   * Use this for:
   * - Kubernetes liveness probes
   * - Basic process monitoring
   * - Quick health checks (lightweight)
   */
  router.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      alive: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      pid: process.pid,
    });
  });

  return router;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalHealthManager: HealthCheckManager | null = null;

export function getGlobalHealthManager(config?: HealthCheckConfig): HealthCheckManager {
  if (!globalHealthManager && config) {
    globalHealthManager = new HealthCheckManager(config);
  }
  if (!globalHealthManager) {
    throw new Error('HealthCheckManager not initialized');
  }
  return globalHealthManager;
}

export function resetGlobalHealthManager(): void {
  globalHealthManager = null;
}

export default HealthCheckManager;

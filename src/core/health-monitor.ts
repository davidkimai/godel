import { logger } from '../utils/logger';

// ============================================================================
// INTERFACES
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type Severity = 'critical' | 'warning' | 'info';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  duration: number; // milliseconds
}

export interface HealthReport {
  overall: HealthStatus;
  checks: HealthCheckResult[];
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
  timestamp: Date;
  duration: number;
}

export interface HealthCheck {
  name: string;
  severity: Severity;
  check: () => Promise<HealthCheckResult>;
  enabled: boolean;
}

// ============================================================================
// BUILT-IN HEALTH CHECKS
// ============================================================================

/**
 * Check API health by hitting localhost:7373/health
 */
async function checkApiHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch('http://localhost:7373/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        name: 'api_health',
        status: 'unhealthy',
        severity: 'critical',
        message: `API returned status ${response.status}`,
        timestamp: new Date(),
        duration: Date.now() - start,
      };
    }

    const data = await response.json();
    return {
      name: 'api_health',
      status: 'healthy',
      severity: 'critical',
      message: `API running (version: ${data.version || 'unknown'})`,
      timestamp: new Date(),
      duration: Date.now() - start,
      details: data,
    };
  } catch (error) {
    return {
      name: 'api_health',
      status: 'unhealthy',
      severity: 'critical',
      message: `Failed to connect to API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check OpenClaw gateway connection
 */
async function checkOpenClawGateway(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Import GatewayClient dynamically to avoid circular deps
    const { GatewayClient } = await import('../integrations/openclaw/GatewayClient');
    const client = new GatewayClient();

    if (!client.connected) {
      return {
        name: 'openclaw_gateway',
        status: 'unhealthy',
        severity: 'critical',
        message: 'OpenClaw gateway not connected',
        timestamp: new Date(),
        duration: Date.now() - start,
      };
    }

    return {
      name: 'openclaw_gateway',
      status: 'healthy',
      severity: 'critical',
      message: 'OpenClaw gateway connected',
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'openclaw_gateway',
      status: 'degraded',
      severity: 'warning',
      message: `Could not verify gateway connection: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check agent pool size
 */
async function checkAgentPool(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Import AgentLifecycle dynamically
    const { getGlobalLifecycle } = await import('./lifecycle');
    const lifecycle = getGlobalLifecycle();
    const agents = lifecycle.getAllStates();

    const runningAgents = agents.filter(a => a.status === 'running');
    const count = runningAgents.length;

    let status: HealthStatus;
    let severity: Severity;
    let message: string;

    if (count >= 10) {
      status = 'healthy';
      severity = 'info';
      message = `Agent pool healthy: ${count} running agents`;
    } else if (count >= 5) {
      status = 'degraded';
      severity = 'warning';
      message = `Agent pool low: ${count} running agents (target: 10)`;
    } else {
      status = 'unhealthy';
      severity = 'warning';
      message = `Agent pool critical: ${count} running agents (target: 10)`;
    }

    return {
      name: 'agent_pool',
      status,
      severity,
      message,
      timestamp: new Date(),
      duration: Date.now() - start,
      details: { count, target: 10 },
    };
  } catch (error) {
    return {
      name: 'agent_pool',
      status: 'unknown',
      severity: 'warning',
      message: `Could not check agent pool: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check budget status
 */
async function checkBudgetStatus(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { budgetController, HARD_LIMITS } = await import('./budget-controller');
    const status = budgetController.getStatus();

    const percentUsed = status.percentUsed;
    let statusHealth: HealthStatus;
    let severity: Severity;
    let message: string;

    if (percentUsed >= 100) {
      statusHealth = 'unhealthy';
      severity = 'critical';
      message = `Budget exhausted: ${percentUsed.toFixed(1)}% used`;
    } else if (percentUsed >= 90) {
      statusHealth = 'unhealthy';
      severity = 'critical';
      message = `Budget critical: ${percentUsed.toFixed(1)}% used`;
    } else if (percentUsed >= 75) {
      statusHealth = 'degraded';
      severity = 'warning';
      message = `Budget warning: ${percentUsed.toFixed(1)}% used`;
    } else {
      statusHealth = 'healthy';
      severity = 'info';
      message = `Budget healthy: ${percentUsed.toFixed(1)}% used`;
    }

    return {
      name: 'budget_status',
      status: statusHealth,
      severity,
      message,
      timestamp: new Date(),
      duration: Date.now() - start,
      details: {
        totalSpend: status.totalSpend,
        dailyBudget: status.dailyBudget,
        remainingBudget: status.remainingBudget,
      },
    };
  } catch (error) {
    return {
      name: 'budget_status',
      status: 'unknown',
      severity: 'info',
      message: `Could not check budget: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check disk space
 */
async function checkDiskSpace(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { promises: fs } = await import('fs');
    const stats = await fs.statfs(process.cwd());

    const freeGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    const totalGB = (stats.blocks * stats.bsize) / (1024 ** 3);
    const percentFree = (freeGB / totalGB) * 100;

    let status: HealthStatus;
    let severity: Severity;
    let message: string;

    if (percentFree < 5) {
      status = 'unhealthy';
      severity = 'critical';
      message = `Disk space critical: ${percentFree.toFixed(1)}% free`;
    } else if (percentFree < 10) {
      status = 'degraded';
      severity = 'warning';
      message = `Disk space low: ${percentFree.toFixed(1)}% free`;
    } else {
      status = 'healthy';
      severity = 'info';
      message = `Disk space healthy: ${percentFree.toFixed(1)}% free`;
    }

    return {
      name: 'disk_space',
      status,
      severity,
      message,
      timestamp: new Date(),
      duration: Date.now() - start,
      details: { freeGB: freeGB.toFixed(2), totalGB: totalGB.toFixed(2) },
    };
  } catch (error) {
    return {
      name: 'disk_space',
      status: 'unknown',
      severity: 'info',
      message: `Could not check disk space: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check memory usage
 */
async function checkMemoryUsage(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const used = process.memoryUsage();
    const totalMB = used.heapUsed / (1024 ** 2);
    const limitMB = 2048; // 2GB limit

    let status: HealthStatus;
    let severity: Severity;
    let message: string;

    if (totalMB > limitMB * 0.9) {
      status = 'unhealthy';
      severity = 'critical';
      message = `Memory critical: ${totalMB.toFixed(0)}MB used`;
    } else if (totalMB > limitMB * 0.75) {
      status = 'degraded';
      severity = 'warning';
      message = `Memory high: ${totalMB.toFixed(0)}MB used`;
    } else {
      status = 'healthy';
      severity = 'info';
      message = `Memory healthy: ${totalMB.toFixed(0)}MB used`;
    }

    return {
      name: 'memory_usage',
      status,
      severity,
      message,
      timestamp: new Date(),
      duration: Date.now() - start,
      details: {
        heapUsed: totalMB.toFixed(0),
        heapTotal: (used.heapTotal / (1024 ** 2)).toFixed(0),
        external: (used.external / (1024 ** 2)).toFixed(0),
      },
    };
  } catch (error) {
    return {
      name: 'memory_usage',
      status: 'unknown',
      severity: 'info',
      message: `Could not check memory: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// DEFAULT HEALTH CHECKS
// ============================================================================
export const DEFAULT_HEALTH_CHECKS: HealthCheck[] = [
  {
    name: 'api_health',
    severity: 'critical',
    check: checkApiHealth,
    enabled: true,
  },
  {
    name: 'openclaw_gateway',
    severity: 'critical',
    check: checkOpenClawGateway,
    enabled: true,
  },
  {
    name: 'agent_pool',
    severity: 'warning',
    check: checkAgentPool,
    enabled: true,
  },
  {
    name: 'budget_status',
    severity: 'warning',
    check: checkBudgetStatus,
    enabled: true,
  },
  {
    name: 'disk_space',
    severity: 'warning',
    check: checkDiskSpace,
    enabled: true,
  },
  {
    name: 'memory_usage',
    severity: 'info',
    check: checkMemoryUsage,
    enabled: true,
  },
];

// ============================================================================
// HEALTH MONITOR
// ============================================================================
export class HealthMonitor {
  private checks: Map<string, HealthCheck> = new Map();
  private lastReport: HealthReport | null = null;

  constructor(customChecks: HealthCheck[] = []) {
    // Register default checks
    for (const check of DEFAULT_HEALTH_CHECKS) {
      this.registerCheck(check);
    }

    // Register custom checks
    for (const check of customChecks) {
      this.registerCheck(check);
    }
  }

  /**
   * Register a health check
   */
  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    logger.info('health-monitor', `Registered health check: ${check.name}`);
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async runChecks(names?: string[]): Promise<HealthReport> {
    const start = Date.now();
    const checksToRun = names
      ? names.map(n => this.checks.get(n)).filter((c): c is HealthCheck => c !== undefined)
      : Array.from(this.checks.values()).filter(c => c.enabled);

    const results: HealthCheckResult[] = await Promise.all(
      checksToRun.map(async check => {
        try {
          return await check.check();
        } catch (error) {
          return {
            name: check.name,
            status: 'unknown' as HealthStatus,
            severity: check.severity,
            message: `Check failed: ${error instanceof Error ? error.message : 'Unknown'}`,
            timestamp: new Date(),
            duration: 0,
          };
        }
      })
    );

    // Calculate summary
    const summary = {
      healthy: results.filter(r => r.status === 'healthy').length,
      degraded: results.filter(r => r.status === 'degraded').length,
      unhealthy: results.filter(r => r.status === 'unhealthy').length,
      unknown: results.filter(r => r.status === 'unknown').length,
    };

    // Determine overall status
    let overall: HealthStatus;
    if (summary.unhealthy > 0) {
      overall = 'unhealthy';
    } else if (summary.degraded > 0) {
      overall = 'degraded';
    } else if (summary.unknown === results.length) {
      overall = 'unknown';
    } else {
      overall = 'healthy';
    }

    const report: HealthReport = {
      overall,
      checks: results,
      summary,
      timestamp: new Date(),
      duration: Date.now() - start,
    };

    this.lastReport = report;

    // Log unhealthy checks
    for (const result of results) {
      if (result.status === 'unhealthy') {
        logger.error('health-monitor', `Unhealthy check: ${result.name}`, {
          message: result.message,
          severity: result.severity,
        });
      } else if (result.status === 'degraded') {
        logger.warn('health-monitor', `Degraded check: ${result.name}`, {
          message: result.message,
        });
      }
    }

    return report;
  }

  /**
   * Run single health check
   */
  async runCheck(name: string): Promise<HealthCheckResult | null> {
    const check = this.checks.get(name);
    if (!check) {
      logger.warn('health-monitor', `Unknown health check: ${name}`);
      return null;
    }

    try {
      return await check.check();
    } catch (error) {
      return {
        name: check.name,
        status: 'unknown' as HealthStatus,
        severity: check.severity,
        message: `Check failed: ${error instanceof Error ? error.message : 'Unknown'}`,
        timestamp: new Date(),
        duration: 0,
      };
    }
  }

  /**
   * Get last report
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  /**
   * Get list of registered checks
   */
  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * Check if system is healthy (quick check for critical items)
   */
  async isHealthy(): Promise<boolean> {
    const report = await this.runChecks();

    // Only check critical items
    const criticalChecks = report.checks.filter(c => c.severity === 'critical');
    const criticalHealthy = criticalChecks.every(c => c.status === 'healthy');

    return criticalHealthy;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const healthMonitor = new HealthMonitor();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick health check - returns true if all critical systems healthy
 */
export async function isSystemHealthy(): Promise<boolean> {
  return healthMonitor.isHealthy();
}

/**
 * Get formatted health summary
 */
export function formatHealthReport(report: HealthReport): string {
  const statusEmoji = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '❌',
    unknown: '❓',
  };

  const lines = [
    `${statusEmoji[report.overall]} Overall: ${report.overall.toUpperCase()}`,
    `${statusEmoji.healthy} Healthy: ${report.summary.healthy}`,
    `${statusEmoji.degraded} Degraded: ${report.summary.degraded}`,
    `${statusEmoji.unhealthy} Unhealthy: ${report.summary.unhealthy}`,
    `${statusEmoji.unknown} Unknown: ${report.summary.unknown}`,
    `Duration: ${report.duration}ms`,
    '',
    'Checks:',
  ];

  for (const check of report.checks) {
    lines.push(`${statusEmoji[check.status]} ${check.name}: ${check.message}`);
  }

  return lines.join('\n');
}

/**
 * Get quick status line
 */
export function getQuickStatus(): string {
  const report = healthMonitor.getLastReport();
  if (!report) return '❓ No health data';

  const statusEmoji = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '❌',
    unknown: '❓',
  };

  return `${statusEmoji[report.overall]} Godel ${report.overall} (${report.checks.length} checks, ${report.duration}ms)`;
}

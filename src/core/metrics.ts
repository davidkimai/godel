import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================
const METRICS_DIR = '~/.config/godel/metrics';
const RETENTION_DAYS = 7;

// ============================================================================
// INTERFACES
// ============================================================================

export interface MetricSnapshot {
  timestamp: Date;
  
  // Test metrics
  testPassRate: number;
  testTotal: number;
  testPassed: number;
  testFailed: number;
  
  // Build metrics
  buildDuration: number; // milliseconds
  buildSuccess: boolean;
  buildErrors: number;
  
  // System metrics
  errorCount: number;
  agentCount: number;
  activeTeams: number;
  
  // Budget metrics
  totalSpend: number;
  hourlySpend: number;
  
  // Performance metrics
  apiResponseTime: number;
  memoryUsageMb: number;
}

export interface MetricsSummary {
  period: string;
  startTime: Date;
  endTime: Date;
  
  // Aggregates
  avgTestPassRate: number;
  avgBuildDuration: number;
  avgErrorCount: number;
  avgAgentCount: number;
  avgTotalSpend: number;
  
  // Trends
  testPassRateTrend: 'improving' | 'stable' | 'declining';
  buildDurationTrend: 'improving' | 'stable' | 'declining';
  errorCountTrend: 'improving' | 'stable' | 'declining';
  
  // Counts
  totalBuilds: number;
  successfulBuilds: number;
  totalErrors: number;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================
export class MetricsCollector {
  private metricsDir: string;

  constructor() {
    this.metricsDir = METRICS_DIR.replace('~', process.env['HOME'] || '');
  }

  // --------------------------------------------------------------------------
  // RECORD METRICS
  // --------------------------------------------------------------------------

  /**
   * Record a new metrics snapshot
   */
  async record(metrics: Partial<MetricSnapshot>): Promise<void> {
    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      testPassRate: metrics.testPassRate ?? 0,
      testTotal: metrics.testTotal ?? 0,
      testPassed: metrics.testPassed ?? 0,
      testFailed: metrics.testFailed ?? 0,
      buildDuration: metrics.buildDuration ?? 0,
      buildSuccess: metrics.buildSuccess ?? true,
      buildErrors: metrics.buildErrors ?? 0,
      errorCount: metrics.errorCount ?? 0,
      agentCount: metrics.agentCount ?? 0,
      activeTeams: metrics.activeTeams ?? 0,
      totalSpend: metrics.totalSpend ?? 0,
      hourlySpend: metrics.hourlySpend ?? 0,
      apiResponseTime: metrics.apiResponseTime ?? 0,
      memoryUsageMb: metrics.memoryUsageMb ?? 0,
    };

    await this.ensureDirectory(this.metricsDir);

    const filename = `metrics_${Date.now()}.json`;
    const filepath = join(this.metricsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));

    logger.debug('metrics', 'Metrics recorded', { snapshot });

    // Prune old metrics
    await this.pruneOldMetrics();
  }

  /**
   * Record test results
   */
  async recordTestResults(passed: number, failed: number): Promise<void> {
    const total = passed + failed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    await this.record({
      testPassRate: passRate,
      testTotal: total,
      testPassed: passed,
      testFailed: failed,
    });
  }

  /**
   * Record build result
   */
  async recordBuild(success: boolean, duration: number, errors: number): Promise<void> {
    await this.record({
      buildSuccess: success,
      buildDuration: duration,
      buildErrors: errors,
    });
  }

  /**
   * Record system state
   */
  async recordSystemState(agentCount: number, activeTeams: number, errorCount: number): Promise<void> {
    await this.record({
      agentCount,
      activeTeams,
      errorCount,
    });
  }

  // --------------------------------------------------------------------------
  // RETRIEVE METRICS
  // --------------------------------------------------------------------------

  /**
   * Get all metrics in time range
   */
  async getMetrics(startTime: Date, endTime: Date): Promise<MetricSnapshot[]> {
    const files = await this.listMetricFiles();
    const metrics: MetricSnapshot[] = [];

    for (const file of files) {
      const filepath = join(this.metricsDir, file);
      const content = await fs.readFile(filepath, 'utf8');
      const snapshot = JSON.parse(content, this.dateReviver);

      const timestamp = new Date(snapshot.timestamp);
      if (timestamp >= startTime && timestamp <= endTime) {
        metrics.push(snapshot);
      }
    }

    return metrics.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get latest metrics snapshot
   */
  async getLatest(): Promise<MetricSnapshot | null> {
    const files = await this.listMetricFiles();
    if (files.length === 0) return null;

    const latestFile = files.sort((a, b) => b.localeCompare(a))[0];
    const filepath = join(this.metricsDir, latestFile);

    const content = await fs.readFile(filepath, 'utf8');
    return JSON.parse(content, this.dateReviver);
  }

  /**
   * Get time series for a specific metric
   */
  async getTimeSeries(
    metric: keyof MetricSnapshot,
    hours: number = 24
  ): Promise<TimeSeriesPoint[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const endTime = new Date();
    const metrics = await this.getMetrics(startTime, endTime);

    return metrics.map(m => ({
      timestamp: new Date(m.timestamp),
      value: m[metric] as number,
    }));
  }

  // --------------------------------------------------------------------------
  // AGGREGATIONS
  // --------------------------------------------------------------------------

  /**
   * Get summary statistics for a time period
   */
  async getSummary(hours: number = 24): Promise<MetricsSummary> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const endTime = new Date();
    const metrics = await this.getMetrics(startTime, endTime);

    if (metrics.length === 0) {
      return {
        period: `${hours}h`,
        startTime,
        endTime,
        avgTestPassRate: 0,
        avgBuildDuration: 0,
        avgErrorCount: 0,
        avgAgentCount: 0,
        avgTotalSpend: 0,
        testPassRateTrend: 'stable',
        buildDurationTrend: 'stable',
        errorCountTrend: 'stable',
        totalBuilds: 0,
        successfulBuilds: 0,
        totalErrors: 0,
      };
    }

    // Calculate averages
    const avgTestPassRate = this.average(metrics.map(m => m.testPassRate));
    const avgBuildDuration = this.average(metrics.map(m => m.buildDuration));
    const avgErrorCount = this.average(metrics.map(m => m.errorCount));
    const avgAgentCount = this.average(metrics.map(m => m.agentCount));
    const avgTotalSpend = this.average(metrics.map(m => m.totalSpend));

    // Calculate trends (compare first half vs second half)
    const midPoint = Math.floor(metrics.length / 2);
    const firstHalf = metrics.slice(0, midPoint);
    const secondHalf = metrics.slice(midPoint);

    const testPassRateTrend = this.calculateTrend(
      firstHalf.map(m => m.testPassRate),
      secondHalf.map(m => m.testPassRate)
    );
    const buildDurationTrend = this.calculateTrend(
      firstHalf.map(m => m.buildDuration),
      secondHalf.map(m => m.buildDuration)
    );
    const errorCountTrend = this.calculateTrend(
      firstHalf.map(m => m.errorCount),
      secondHalf.map(m => m.errorCount)
    );

    // Count builds
    const totalBuilds = metrics.length;
    const successfulBuilds = metrics.filter(m => m.buildSuccess).length;
    const totalErrors = metrics.reduce((sum, m) => sum + m.buildErrors, 0);

    return {
      period: `${hours}h`,
      startTime,
      endTime,
      avgTestPassRate,
      avgBuildDuration,
      avgErrorCount,
      avgAgentCount,
      avgTotalSpend,
      testPassRateTrend,
      buildDurationTrend,
      errorCountTrend,
      totalBuilds,
      successfulBuilds,
      totalErrors,
    };
  }

  /**
   * Get quick health indicator
   */
  async getHealthIndicator(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number; // 0-100
    details: string[];
  }> {
    const summary = await this.getSummary(1); // Last hour
    const latest = await this.getLatest();

    const details: string[] = [];
    let score = 100;

    // Check test pass rate
    if (summary.avgTestPassRate < 90) {
      score -= 20;
      details.push(`Test pass rate: ${summary.avgTestPassRate.toFixed(1)}%`);
    }

    // Check build success
    if (summary.totalBuilds > 0 && summary.successfulBuilds < summary.totalBuilds) {
      score -= 15;
      details.push(`Builds: ${summary.successfulBuilds}/${summary.totalBuilds} successful`);
    }

    // Check errors
    if (latest && latest.errorCount > 5) {
      score -= 10;
      details.push(`Errors: ${latest.errorCount}`);
    }

    // Check spend
    if (summary.avgTotalSpend > 50) {
      score -= 5;
      details.push(`Spend: $${summary.avgTotalSpend.toFixed(2)}`);
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 80) status = 'healthy';
    else if (score >= 50) status = 'degraded';
    else status = 'unhealthy';

    return { status, score, details };
  }

  // --------------------------------------------------------------------------
  // PRIVATE METHODS
  // --------------------------------------------------------------------------

  private async listMetricFiles(): Promise<string[]> {
    try {
      await this.ensureDirectory(this.metricsDir);
      const files = await fs.readdir(this.metricsDir);
      return files.filter(f => f.startsWith('metrics_') && f.endsWith('.json'));
    } catch {
      return [];
    }
  }

  private async pruneOldMetrics(): Promise<void> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = await this.listMetricFiles();

    let deleted = 0;
    for (const file of files) {
      const filepath = join(this.metricsDir, file);
      const stats = await fs.stat(filepath);
      if (stats.mtimeMs < cutoff) {
        await fs.unlink(filepath);
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.info('metrics', 'Pruned old metrics', { deleted, remaining: files.length - deleted });
    }
  }

  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateTrend(firstHalf: number[], secondHalf: number[]): 'improving' | 'stable' | 'declining' {
    const firstAvg = this.average(firstHalf);
    const secondAvg = this.average(secondHalf);

    if (firstAvg === 0) return 'stable';

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'declining'; // e.g., errors increased
    if (change < -5) return 'improving'; // e.g., errors decreased
    return 'stable';
  }

  private dateReviver(key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime()) && (key.toLowerCase().includes('at') || key.toLowerCase().includes('time'))) {
        return date;
      }
    }
    return value;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const metricsCollector = new MetricsCollector();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick health check
 */
export async function getMetricsHealth(): Promise<string> {
  const health = await metricsCollector.getHealthIndicator();
  const emoji = { healthy: '✅', degraded: '⚠️', unhealthy: '❌' };
  return `${emoji[health.status]} Health Score: ${health.score}/100`;
}

/**
 * Get recent metrics summary
 */
export async function getRecentMetrics(): Promise<string> {
  const summary = await metricsCollector.getSummary(24);
  return `24h Summary:
- Test Pass Rate: ${summary.avgTestPassRate.toFixed(1)}% (${summary.testPassRateTrend})
- Avg Build Time: ${(summary.avgBuildDuration / 1000).toFixed(1)}s
- Avg Agents: ${summary.avgAgentCount.toFixed(0)}
- Total Spend: $${summary.avgTotalSpend.toFixed(2)}
- Builds: ${summary.successfulBuilds}/${summary.totalBuilds} successful`;
}

/**
 * Record current system state
 */
export async function recordCurrentState(agentCount: number, activeTeams: number): Promise<void> {
  await metricsCollector.recordSystemState(agentCount, activeTeams, 0);
}

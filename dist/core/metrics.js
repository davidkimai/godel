"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsCollector = exports.MetricsCollector = void 0;
exports.getMetricsHealth = getMetricsHealth;
exports.getRecentMetrics = getRecentMetrics;
exports.recordCurrentState = recordCurrentState;
const fs_1 = require("fs");
const path_1 = require("path");
const logger_1 = require("../utils/logger");
// ============================================================================
// CONFIGURATION
// ============================================================================
const METRICS_DIR = '~/.config/dash/metrics';
const RETENTION_DAYS = 7;
// ============================================================================
// METRICS COLLECTOR
// ============================================================================
class MetricsCollector {
    constructor() {
        this.metricsDir = METRICS_DIR.replace('~', process.env['HOME'] || '');
    }
    // --------------------------------------------------------------------------
    // RECORD METRICS
    // --------------------------------------------------------------------------
    /**
     * Record a new metrics snapshot
     */
    async record(metrics) {
        const snapshot = {
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
            activeSwarms: metrics.activeSwarms ?? 0,
            totalSpend: metrics.totalSpend ?? 0,
            hourlySpend: metrics.hourlySpend ?? 0,
            apiResponseTime: metrics.apiResponseTime ?? 0,
            memoryUsageMb: metrics.memoryUsageMb ?? 0,
        };
        await this.ensureDirectory(this.metricsDir);
        const filename = `metrics_${Date.now()}.json`;
        const filepath = (0, path_1.join)(this.metricsDir, filename);
        await fs_1.promises.writeFile(filepath, JSON.stringify(snapshot, null, 2));
        logger_1.logger.debug('metrics', 'Metrics recorded', { snapshot });
        // Prune old metrics
        await this.pruneOldMetrics();
    }
    /**
     * Record test results
     */
    async recordTestResults(passed, failed) {
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
    async recordBuild(success, duration, errors) {
        await this.record({
            buildSuccess: success,
            buildDuration: duration,
            buildErrors: errors,
        });
    }
    /**
     * Record system state
     */
    async recordSystemState(agentCount, activeSwarms, errorCount) {
        await this.record({
            agentCount,
            activeSwarms,
            errorCount,
        });
    }
    // --------------------------------------------------------------------------
    // RETRIEVE METRICS
    // --------------------------------------------------------------------------
    /**
     * Get all metrics in time range
     */
    async getMetrics(startTime, endTime) {
        const files = await this.listMetricFiles();
        const metrics = [];
        for (const file of files) {
            const filepath = (0, path_1.join)(this.metricsDir, file);
            const content = await fs_1.promises.readFile(filepath, 'utf8');
            const snapshot = JSON.parse(content, this.dateReviver);
            const timestamp = new Date(snapshot.timestamp);
            if (timestamp >= startTime && timestamp <= endTime) {
                metrics.push(snapshot);
            }
        }
        return metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    /**
     * Get latest metrics snapshot
     */
    async getLatest() {
        const files = await this.listMetricFiles();
        if (files.length === 0)
            return null;
        const latestFile = files.sort((a, b) => b.localeCompare(a))[0];
        const filepath = (0, path_1.join)(this.metricsDir, latestFile);
        const content = await fs_1.promises.readFile(filepath, 'utf8');
        return JSON.parse(content, this.dateReviver);
    }
    /**
     * Get time series for a specific metric
     */
    async getTimeSeries(metric, hours = 24) {
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        const endTime = new Date();
        const metrics = await this.getMetrics(startTime, endTime);
        return metrics.map(m => ({
            timestamp: new Date(m.timestamp),
            value: m[metric],
        }));
    }
    // --------------------------------------------------------------------------
    // AGGREGATIONS
    // --------------------------------------------------------------------------
    /**
     * Get summary statistics for a time period
     */
    async getSummary(hours = 24) {
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
        const testPassRateTrend = this.calculateTrend(firstHalf.map(m => m.testPassRate), secondHalf.map(m => m.testPassRate));
        const buildDurationTrend = this.calculateTrend(firstHalf.map(m => m.buildDuration), secondHalf.map(m => m.buildDuration));
        const errorCountTrend = this.calculateTrend(firstHalf.map(m => m.errorCount), secondHalf.map(m => m.errorCount));
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
    async getHealthIndicator() {
        const summary = await this.getSummary(1); // Last hour
        const latest = await this.getLatest();
        const details = [];
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
        let status;
        if (score >= 80)
            status = 'healthy';
        else if (score >= 50)
            status = 'degraded';
        else
            status = 'unhealthy';
        return { status, score, details };
    }
    // --------------------------------------------------------------------------
    // PRIVATE METHODS
    // --------------------------------------------------------------------------
    async listMetricFiles() {
        try {
            await this.ensureDirectory(this.metricsDir);
            const files = await fs_1.promises.readdir(this.metricsDir);
            return files.filter(f => f.startsWith('metrics_') && f.endsWith('.json'));
        }
        catch {
            return [];
        }
    }
    async pruneOldMetrics() {
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const files = await this.listMetricFiles();
        let deleted = 0;
        for (const file of files) {
            const filepath = (0, path_1.join)(this.metricsDir, file);
            const stats = await fs_1.promises.stat(filepath);
            if (stats.mtimeMs < cutoff) {
                await fs_1.promises.unlink(filepath);
                deleted++;
            }
        }
        if (deleted > 0) {
            logger_1.logger.info('metrics', 'Pruned old metrics', { deleted, remaining: files.length - deleted });
        }
    }
    async ensureDirectory(dir) {
        try {
            await fs_1.promises.mkdir(dir, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    average(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
    calculateTrend(firstHalf, secondHalf) {
        const firstAvg = this.average(firstHalf);
        const secondAvg = this.average(secondHalf);
        if (firstAvg === 0)
            return 'stable';
        const change = ((secondAvg - firstAvg) / firstAvg) * 100;
        if (change > 5)
            return 'declining'; // e.g., errors increased
        if (change < -5)
            return 'improving'; // e.g., errors decreased
        return 'stable';
    }
    dateReviver(key, value) {
        if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime()) && (key.toLowerCase().includes('at') || key.toLowerCase().includes('time'))) {
                return date;
            }
        }
        return value;
    }
}
exports.MetricsCollector = MetricsCollector;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
exports.metricsCollector = new MetricsCollector();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick health check
 */
async function getMetricsHealth() {
    const health = await exports.metricsCollector.getHealthIndicator();
    const emoji = { healthy: '✅', degraded: '⚠️', unhealthy: '❌' };
    return `${emoji[health.status]} Health Score: ${health.score}/100`;
}
/**
 * Get recent metrics summary
 */
async function getRecentMetrics() {
    const summary = await exports.metricsCollector.getSummary(24);
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
async function recordCurrentState(agentCount, activeSwarms) {
    await exports.metricsCollector.recordSystemState(agentCount, activeSwarms, 0);
}
//# sourceMappingURL=metrics.js.map
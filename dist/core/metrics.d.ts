export interface MetricSnapshot {
    timestamp: Date;
    testPassRate: number;
    testTotal: number;
    testPassed: number;
    testFailed: number;
    buildDuration: number;
    buildSuccess: boolean;
    buildErrors: number;
    errorCount: number;
    agentCount: number;
    activeSwarms: number;
    totalSpend: number;
    hourlySpend: number;
    apiResponseTime: number;
    memoryUsageMb: number;
}
export interface MetricsSummary {
    period: string;
    startTime: Date;
    endTime: Date;
    avgTestPassRate: number;
    avgBuildDuration: number;
    avgErrorCount: number;
    avgAgentCount: number;
    avgTotalSpend: number;
    testPassRateTrend: 'improving' | 'stable' | 'declining';
    buildDurationTrend: 'improving' | 'stable' | 'declining';
    errorCountTrend: 'improving' | 'stable' | 'declining';
    totalBuilds: number;
    successfulBuilds: number;
    totalErrors: number;
}
export interface TimeSeriesPoint {
    timestamp: Date;
    value: number;
}
export declare class MetricsCollector {
    private metricsDir;
    constructor();
    /**
     * Record a new metrics snapshot
     */
    record(metrics: Partial<MetricSnapshot>): Promise<void>;
    /**
     * Record test results
     */
    recordTestResults(passed: number, failed: number): Promise<void>;
    /**
     * Record build result
     */
    recordBuild(success: boolean, duration: number, errors: number): Promise<void>;
    /**
     * Record system state
     */
    recordSystemState(agentCount: number, activeSwarms: number, errorCount: number): Promise<void>;
    /**
     * Get all metrics in time range
     */
    getMetrics(startTime: Date, endTime: Date): Promise<MetricSnapshot[]>;
    /**
     * Get latest metrics snapshot
     */
    getLatest(): Promise<MetricSnapshot | null>;
    /**
     * Get time series for a specific metric
     */
    getTimeSeries(metric: keyof MetricSnapshot, hours?: number): Promise<TimeSeriesPoint[]>;
    /**
     * Get summary statistics for a time period
     */
    getSummary(hours?: number): Promise<MetricsSummary>;
    /**
     * Get quick health indicator
     */
    getHealthIndicator(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        score: number;
        details: string[];
    }>;
    private listMetricFiles;
    private pruneOldMetrics;
    private ensureDirectory;
    private average;
    private calculateTrend;
    private dateReviver;
}
export declare const metricsCollector: MetricsCollector;
/**
 * Quick health check
 */
export declare function getMetricsHealth(): Promise<string>;
/**
 * Get recent metrics summary
 */
export declare function getRecentMetrics(): Promise<string>;
/**
 * Record current system state
 */
export declare function recordCurrentState(agentCount: number, activeSwarms: number): Promise<void>;
//# sourceMappingURL=metrics.d.ts.map
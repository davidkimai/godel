export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type Severity = 'critical' | 'warning' | 'info';
export interface HealthCheckResult {
    name: string;
    status: HealthStatus;
    severity: Severity;
    message: string;
    details?: Record<string, unknown>;
    timestamp: Date;
    duration: number;
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
export declare const DEFAULT_HEALTH_CHECKS: HealthCheck[];
export declare class HealthMonitor {
    private checks;
    private lastReport;
    constructor(customChecks?: HealthCheck[]);
    /**
     * Register a health check
     */
    registerCheck(check: HealthCheck): void;
    /**
     * Unregister a health check
     */
    unregisterCheck(name: string): boolean;
    /**
     * Run all health checks
     */
    runChecks(names?: string[]): Promise<HealthReport>;
    /**
     * Run single health check
     */
    runCheck(name: string): Promise<HealthCheckResult | null>;
    /**
     * Get last report
     */
    getLastReport(): HealthReport | null;
    /**
     * Get list of registered checks
     */
    getRegisteredChecks(): string[];
    /**
     * Check if system is healthy (quick check for critical items)
     */
    isHealthy(): Promise<boolean>;
}
export declare const healthMonitor: HealthMonitor;
/**
 * Quick health check - returns true if all critical systems healthy
 */
export declare function isSystemHealthy(): Promise<boolean>;
/**
 * Get formatted health summary
 */
export declare function formatHealthReport(report: HealthReport): string;
/**
 * Get quick status line
 */
export declare function getQuickStatus(): string;
//# sourceMappingURL=health-monitor.d.ts.map
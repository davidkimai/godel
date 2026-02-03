import { EventEmitter } from 'events';
export declare enum BugSeverity {
    CRITICAL = "CRITICAL",// Production down, data loss
    HIGH = "HIGH",// Major feature broken
    MEDIUM = "MEDIUM",// Feature impaired
    LOW = "LOW",// Minor issue, cosmetic
    INFO = "INFO"
}
export declare enum BugStatus {
    DETECTED = "DETECTED",
    ANALYZING = "ANALYZING",
    AUTO_FIXING = "AUTO_FIXING",
    AWAITING_REVIEW = "AWAITING_REVIEW",
    FIXED = "FIXED",
    IGNORED = "IGNORED"
}
export interface BugReport {
    id: string;
    timestamp: Date;
    severity: BugSeverity;
    status: BugStatus;
    source: 'test_failure' | 'runtime_error' | 'build_error' | 'log_analysis' | 'manual';
    title: string;
    description: string;
    stackTrace?: string;
    filePath?: string;
    lineNumber?: number;
    suggestedFix?: string;
    autoFixAttempted: boolean;
    autoFixSuccess?: boolean;
    swarmId?: string;
    retryCount: number;
}
export interface BugMonitorConfig {
    enabled: boolean;
    autoFixEnabled: boolean;
    autoFixMaxCost: number;
    autoFixMaxRetries: number;
    monitorLogFiles: string[];
    monitorTestResults: boolean;
    monitorBuildStatus: boolean;
    severityThreshold: BugSeverity;
}
export declare class BugMonitor extends EventEmitter {
    private config;
    private activeBugs;
    private bugHistory;
    private monitorInterval?;
    private isMonitoring;
    constructor();
    /**
     * Start monitoring for bugs
     */
    startMonitoring(): void;
    /**
     * Stop monitoring
     */
    stopMonitoring(): void;
    /**
     * Report a bug
     */
    reportBug(source: BugReport['source'], title: string, description: string, options?: Partial<BugReport>): Promise<BugReport>;
    /**
     * Attempt to auto-fix a bug using a swarm
     */
    attemptAutoFix(bug: BugReport): Promise<boolean>;
    /**
     * Get all active bugs
     */
    getActiveBugs(): BugReport[];
    /**
     * Get bug by ID
     */
    getBug(bugId: string): BugReport | undefined;
    /**
     * Get bug statistics
     */
    getBugStats(): {
        total: number;
        active: number;
        fixed: number;
        bySeverity: Record<BugSeverity, number>;
        bySource: Record<string, number>;
        autoFixRate: number;
    };
    /**
     * Ignore a bug (mark as won't fix)
     */
    ignoreBug(bugId: string, reason: string): boolean;
    /**
     * Manually trigger a check
     */
    performChecks(): Promise<void>;
    private setupEventListeners;
    private checkTestResults;
    private checkBuildStatus;
    private checkLogFiles;
    private retryFailedAutoFixes;
    private shouldAutoFix;
    private inferSeverity;
    private generateBugId;
    private simulateFix;
}
export declare const bugMonitor: BugMonitor;
/**
 * Quick bug report
 */
export declare function reportBug(source: BugReport['source'], title: string, description: string, options?: Partial<BugReport>): Promise<BugReport>;
/**
 * Get bug status dashboard
 */
export declare function getBugDashboard(): ReturnType<typeof bugMonitor.getBugStats> & {
    activeBugs: BugReport[];
};
/**
 * Start bug monitoring
 */
export declare function startBugMonitoring(): void;
/**
 * Stop bug monitoring
 */
export declare function stopBugMonitoring(): void;
//# sourceMappingURL=bug-monitor.d.ts.map
export interface ContextSummary {
    id: string;
    timestamp: Date;
    cycle: number;
    decisions: Decision[];
    patterns: Pattern[];
    metricsTrends: MetricsTrend[];
    openQuestions: OpenQuestion[];
    nextSteps: NextStep[];
    compressedFrom: string;
    sizeBytes: number;
}
export interface Decision {
    id: string;
    timestamp: Date;
    topic: string;
    decision: string;
    rationale: string;
    impact: 'high' | 'medium' | 'low';
    status: 'active' | 'superseded' | 'reverted';
}
export interface Pattern {
    id: string;
    name: string;
    description: string;
    firstSeen: Date;
    lastSeen: Date;
    frequency: number;
    severity: 'high' | 'medium' | 'low';
}
export interface MetricsTrend {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    fromValue: number;
    toValue: number;
    changePercent: number;
    period: string;
}
export interface OpenQuestion {
    id: string;
    question: string;
    priority: 'high' | 'medium' | 'low';
    createdAt: Date;
    context: string;
    attempts: number;
}
export interface NextStep {
    id: string;
    action: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    createdAt: Date;
    assignedTo?: string;
    status: 'pending' | 'in_progress' | 'completed';
}
export declare class ContextSummarizer {
    private summariesDir;
    private currentCycle;
    constructor();
    /**
     * Create a new summary by compressing previous context
     */
    summarize(options?: {
        decisions?: Decision[];
        patterns?: Pattern[];
        metricsTrends?: MetricsTrend[];
        openQuestions?: OpenQuestion[];
        nextSteps?: NextStep[];
    }): Promise<ContextSummary>;
    /**
     * Quick summary for self-interview input
     */
    getQuickSummary(): Promise<string>;
    private mergeDecisions;
    private mergePatterns;
    private mergeOpenQuestions;
    private mergeNextSteps;
    private saveSummary;
    loadLatestSummary(): Promise<ContextSummary | null>;
    loadSummaryByCycle(cycle: number): Promise<ContextSummary | null>;
    private pruneOldSummaries;
    private ensureDirectory;
    private dateReviver;
    getCurrentCycle(): number;
    getStats(): Promise<{
        currentCycle: number;
        summaryCount: number;
        totalSizeBytes: number;
        latestSummary?: ContextSummary;
    }>;
}
export declare const contextSummarizer: ContextSummarizer;
/**
 * Quick summary for cron jobs
 */
export declare function getContextQuickSummary(): Promise<string>;
/**
 * Run a summarization cycle
 */
export declare function runSummarization(options?: {
    decisions?: Decision[];
    patterns?: Pattern[];
    metricsTrends?: MetricsTrend[];
    openQuestions?: OpenQuestion[];
    nextSteps?: NextStep[];
}): Promise<ContextSummary>;
/**
 * Get context stats
 */
export declare function getContextStats(): Promise<{
    cycle: number;
    count: number;
    size: string;
}>;
//# sourceMappingURL=context-summarizer.d.ts.map
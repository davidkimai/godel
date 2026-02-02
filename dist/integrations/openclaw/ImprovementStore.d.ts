/**
 * Improvement Store for Dash Self-Improvement
 *
 * Stores improvement history, tracks strategy effectiveness,
 * and provides query optimization for learning patterns.
 *
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section F4.3 Learning Loop
 */
import { SQLiteStorage } from '../../storage/sqlite';
export interface ImprovementEntry {
    id: string;
    timestamp: Date;
    area: string;
    strategy: string;
    success: boolean;
    confidence: number;
    budgetUsed: number;
    durationMs: number;
    changes: number;
    metrics: ImprovementMetrics;
    context: ImprovementContext;
    errorDetails?: string;
    tags: string[];
}
export interface ImprovementMetrics {
    testCoverageDelta?: number;
    bugsFixed?: number;
    performanceImprovement?: number;
    codeQualityScore?: number;
    documentationCoverage?: number;
    linesAdded?: number;
    linesRemoved?: number;
    filesChanged?: number;
}
export interface ImprovementContext {
    swarmId: string;
    agentCount: number;
    modelUsed: string;
    toolsUsed: string[];
    filesAffected?: string[];
    commitHash?: string;
}
export interface StrategyEffectiveness {
    strategy: string;
    area: string;
    totalAttempts: number;
    successes: number;
    failures: number;
    successRate: number;
    avgBudgetUsed: number;
    avgDurationMs: number;
    avgChanges: number;
    costPerSuccess: number;
    timePerSuccess: number;
    firstUsed: Date;
    lastUsed: Date;
    effectivenessScore: number;
}
export interface OptimizationPattern {
    patternId: string;
    name: string;
    description: string;
    query: string;
    parameters: string[];
    sampleResults: unknown[];
    avgExecutionTimeMs: number;
    usageCount: number;
    lastUsed: Date;
}
export interface TimeSeriesData {
    timestamp: Date;
    value: number;
    label: string;
}
export interface QueryFilter {
    areas?: string[];
    strategies?: string[];
    startDate?: Date;
    endDate?: Date;
    successOnly?: boolean;
    minConfidence?: number;
    maxBudget?: number;
    tags?: string[];
}
export interface AggregatedStats {
    period: string;
    totalImprovements: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    totalBudget: number;
    avgBudget: number;
    totalDuration: number;
    avgDuration: number;
    totalChanges: number;
}
export interface StoreConfig {
    enableCaching: boolean;
    cacheTTLMs: number;
    maxHistorySize: number;
    compressionEnabled: boolean;
}
export declare class ImprovementStore {
    private storage;
    private config;
    private queryCache;
    private optimizationPatterns;
    private readonly DEFAULT_CONFIG;
    constructor(storage: SQLiteStorage, config?: Partial<StoreConfig>);
    initialize(): Promise<void>;
    private initializeTables;
    private registerOptimizationPatterns;
    /**
     * Store a new improvement entry
     */
    store(entry: Omit<ImprovementEntry, 'id'>): Promise<string>;
    private updateStrategyEffectiveness;
    private calculateEffectivenessScore;
    /**
     * Query improvements with filters
     */
    query(filters: QueryFilter, limit?: number, offset?: number): Promise<ImprovementEntry[]>;
    /**
     * Get strategy effectiveness data
     */
    getStrategyEffectiveness(area?: string, minAttempts?: number): Promise<StrategyEffectiveness[]>;
    /**
     * Get aggregated statistics over time
     */
    getTimeSeries(period: 'hour' | 'day' | 'week' | 'month', area?: string, limit?: number): Promise<AggregatedStats[]>;
    /**
     * Execute an optimized query pattern
     */
    executePattern(patternId: string, parameters: Record<string, unknown>): Promise<unknown[]>;
    /**
     * Get the most effective strategies for an area
     */
    getMostEffectiveStrategies(area: string, limit?: number): Promise<StrategyEffectiveness[]>;
    /**
     * Get comparison between two strategies
     */
    compareStrategies(strategyA: string, strategyB: string): Promise<{
        strategyA: StrategyEffectiveness | null;
        strategyB: StrategyEffectiveness | null;
        winner: string | null;
        confidence: number;
    }>;
    /**
     * Get comprehensive analytics summary
     */
    getAnalytics(): Promise<{
        totalImprovements: number;
        overallSuccessRate: number;
        totalBudgetSpent: number;
        uniqueStrategies: number;
        uniqueAreas: number;
        avgImprovementDuration: number;
        topStrategy: string | null;
        bestArea: string | null;
    }>;
    /**
     * Export data for analysis
     */
    exportData(filters?: QueryFilter): Promise<ImprovementEntry[]>;
    private getCacheKey;
    private getCached;
    private setCached;
    private invalidateCache;
    private rowToEntry;
    private rowToEffectiveness;
    /**
     * Get store statistics
     */
    getStoreStats(): Promise<{
        totalEntries: number;
        totalStrategies: number;
        storageSizeEstimate: number;
        cacheHitRate: number;
    }>;
    /**
     * Reset store data (use with caution)
     */
    reset(): Promise<void>;
    /**
     * Clean old data beyond max history size
     */
    cleanup(): Promise<number>;
}
export declare function getImprovementStore(storage?: SQLiteStorage, config?: Partial<StoreConfig>): ImprovementStore;
export declare function resetImprovementStore(): void;
//# sourceMappingURL=ImprovementStore.d.ts.map
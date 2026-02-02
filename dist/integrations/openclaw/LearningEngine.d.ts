/**
 * Learning Engine for Dash Self-Improvement
 *
 * Tracks improvement effectiveness, identifies patterns in successful
 * improvements, prioritizes strategies, and manages A/B testing.
 *
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section F4.3 Learning Loop
 */
import { SQLiteStorage } from '../../storage/sqlite';
export interface ImprovementRecord {
    id: string;
    timestamp: Date;
    area: string;
    strategy: string;
    success: boolean;
    confidence: number;
    budgetUsed: number;
    durationMs: number;
    changes: number;
    metrics: {
        testCoverageDelta?: number;
        bugsFixed?: number;
        performanceImprovement?: number;
        codeQualityScore?: number;
        documentationCoverage?: number;
    };
    context: {
        swarmId: string;
        agentCount: number;
        modelUsed: string;
        toolsUsed: string[];
    };
    errorDetails?: string;
}
export interface StrategyStats {
    strategy: string;
    area: string;
    totalAttempts: number;
    successes: number;
    failures: number;
    successRate: number;
    avgBudgetUsed: number;
    avgDurationMs: number;
    avgChanges: number;
    confidenceScore: number;
    lastUsed: Date;
    trend: 'improving' | 'stable' | 'declining';
}
export interface PatternMatch {
    patternId: string;
    pattern: string;
    description: string;
    confidence: number;
    matches: ImprovementRecord[];
    successRate: number;
}
export interface ABTest {
    id: string;
    name: string;
    hypothesis: string;
    variantA: string;
    variantB: string;
    area: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'cancelled';
    resultsA: ABTestResults;
    resultsB: ABTestResults;
    winner?: 'A' | 'B' | 'tie' | 'inconclusive';
    confidence: number;
}
export interface ABTestResults {
    attempts: number;
    successes: number;
    failures: number;
    successRate: number;
    avgBudgetUsed: number;
    avgDurationMs: number;
}
export interface LearningConfig {
    minSampleSize: number;
    confidenceThreshold: number;
    patternWindowSize: number;
    abTestMinDurationMs: number;
    abTestMinSamples: number;
    strategyDecayFactor: number;
}
export interface StrategyRecommendation {
    strategy: string;
    area: string;
    confidence: number;
    predictedSuccessRate: number;
    estimatedBudget: number;
    estimatedDurationMs: number;
    reasoning: string;
}
export declare class LearningEngine {
    private storage;
    private config;
    private strategyCache;
    private patternCache;
    private activeABTests;
    private readonly DEFAULT_CONFIG;
    constructor(storage: SQLiteStorage, config?: Partial<LearningConfig>);
    initialize(): Promise<void>;
    private initializeTables;
    private loadStrategyCache;
    private loadActiveABTests;
    /**
     * Record an improvement attempt and its outcome
     */
    recordImprovement(record: Omit<ImprovementRecord, 'id'>): Promise<string>;
    private updateStrategyStats;
    /**
     * Identify patterns in successful improvements
     */
    identifyPatterns(area?: string): Promise<PatternMatch[]>;
    private findHighConfidenceStrategies;
    private findBudgetEfficientStrategies;
    private findFastStrategies;
    private findModelPatterns;
    private calculatePatternConfidence;
    /**
     * Get recommended strategies for a given area
     */
    recommendStrategies(area: string, limit?: number): Promise<StrategyRecommendation[]>;
    /**
     * Get the best strategy for an area with no prior knowledge
     */
    getExplorationStrategy(area: string): Promise<string | null>;
    /**
     * Start an A/B test between two strategies
     */
    startABTest(name: string, hypothesis: string, variantA: string, variantB: string, area: string): Promise<string>;
    /**
     * Record a result for an A/B test
     */
    recordABTestResult(testId: string, variant: 'A' | 'B', record: ImprovementRecord): Promise<void>;
    private updateABTests;
    private checkABTestCompletion;
    private findABTestForStrategy;
    /**
     * Get active A/B tests
     */
    getActiveABTests(): ABTest[];
    /**
     * Cancel an A/B test
     */
    cancelABTest(testId: string): Promise<void>;
    /**
     * Get learning metrics summary
     */
    getMetrics(): Promise<{
        totalImprovements: number;
        overallSuccessRate: number;
        totalBudgetSpent: number;
        avgDurationMs: number;
        topStrategies: StrategyStats[];
        activeTests: number;
        patternsIdentified: number;
    }>;
    /**
     * Get learning report for dashboard display
     */
    getLearningReport(): Promise<string>;
    private rowToRecord;
    /**
     * Get all strategies for an area
     */
    getStrategiesForArea(area: string): StrategyStats[];
    /**
     * Get improvement history
     */
    getHistory(limit?: number): Promise<ImprovementRecord[]>;
    /**
     * Reset learning data (use with caution)
     */
    reset(): Promise<void>;
}
export declare function getLearningEngine(storage?: SQLiteStorage, config?: Partial<LearningConfig>): LearningEngine;
export declare function resetLearningEngine(): void;
//# sourceMappingURL=LearningEngine.d.ts.map
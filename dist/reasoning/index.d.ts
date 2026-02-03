/**
 * Reasoning Module
 *
 * Complete reasoning module for Dash - Phase 3: Reasoning Features
 *
 * @module reasoning
 */
export * from './types';
export { recordTrace, getTraceById, getTracesByAgent, getTracesByTask, getTracesByType, queryTraces, deleteTrace, getTraceStats, clearTraces } from './traces';
export { logDecision, getDecisionById, getDecisionsByAgent, getDecisionsByTask, queryDecisions, deleteDecision, compareDecisions, analyzeDecisionQuality, clearDecisions } from './decisions';
export { trackConfidence, getConfidenceByAgent, getConfidenceHistory, warnLowConfidence, getConfidenceStats } from './decisions';
/**
 * Initialize reasoning for an agent
 */
export declare function initReasoning(_agentId: string): void;
/**
 * Get complete reasoning report for an agent
 */
export declare function getReasoningReport(agentId: string, taskId?: string): {
    traceStats: {
        totalTraces: number;
        byType: Record<import("./types").ReasoningType, number>;
        averageConfidence: number;
        latestTrace: import("./types").ReasoningTrace | null;
    };
    confidenceStats: {
        current: number;
        average: number;
        min: number;
        max: number;
        trend: "up" | "down" | "stable";
        warningCount: number;
    };
    decisions: import("./types").DecisionLog[];
    lowConfidenceWarnings: string[];
};
//# sourceMappingURL=index.d.ts.map
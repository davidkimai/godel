/**
 * Reasoning Decisions Module
 *
 * Decision logging with alternatives and confidence tracking.
 * Phase 3: Reasoning Features
 */
import type { DecisionLog, ConfidenceTracking, DecisionQuery } from './types';
/**
 * Clear all decisions and confidence data - used for testing
 */
export declare function clearDecisions(): void;
/**
 * Log a decision made by an agent
 */
export declare function logDecision(agentId: string, decision: string, alternatives: string[], rationale: string, selected: string, confidence?: number, taskId?: string, metadata?: Record<string, unknown>): DecisionLog;
/**
 * Get decision by ID
 */
export declare function getDecisionById(id: string): DecisionLog | undefined;
/**
 * Get all decisions for an agent
 */
export declare function getDecisionsByAgent(agentId: string, limit?: number): DecisionLog[];
/**
 * Get all decisions for a task
 */
export declare function getDecisionsByTask(taskId: string, limit?: number): DecisionLog[];
/**
 * Query decisions with filters
 */
export declare function queryDecisions(query: DecisionQuery): DecisionLog[];
/**
 * Delete a decision
 */
export declare function deleteDecision(id: string): boolean;
/**
 * Compare two decisions
 */
export declare function compareDecisions(decisionId1: string, decisionId2: string): {
    decision1: DecisionLog | undefined;
    decision2: DecisionLog | undefined;
    comparison: {
        confidenceDiff: number;
        alternativeCountDiff: number;
        rationaleSimilarity: 'high' | 'medium' | 'low' | 'unknown';
    };
};
/**
 * Analyze decision quality
 */
export declare function analyzeDecisionQuality(decisionId: string): {
    decision: DecisionLog | undefined;
    quality: 'high' | 'medium' | 'low';
    score: number;
    factors: {
        confidenceScore: number;
        alternativeScore: number;
        rationaleScore: number;
    };
    suggestions: string[];
};
/**
 * Track confidence for an agent
 */
export declare function trackConfidence(agentId: string, confidence: number, taskId?: string): ConfidenceTracking;
/**
 * Get confidence tracking for an agent
 */
export declare function getConfidenceByAgent(agentId: string): ConfidenceTracking | undefined;
/**
 * Get confidence history for an agent
 */
export declare function getConfidenceHistory(agentId: string, limit?: number): ConfidenceTracking['history'];
/**
 * Get warnings for low confidence
 */
export declare function warnLowConfidence(agentId: string, threshold?: number): string[];
/**
 * Get confidence statistics for an agent
 */
export declare function getConfidenceStats(agentId: string): {
    current: number;
    average: number;
    min: number;
    max: number;
    trend: 'up' | 'down' | 'stable';
    warningCount: number;
};
//# sourceMappingURL=decisions.d.ts.map
/**
 * Context Optimization Module
 * Optimize context usage with actionable recommendations
 */
import type { Recommendation } from './analyze';
export interface OptimizationResult {
    agentId: string;
    applied: boolean;
    changes: OptimizationChange[];
    originalSize: number;
    newSize: number;
    savings: number;
    recommendations: Recommendation[];
}
export interface OptimizationChange {
    type: 'removed' | 'archived' | 'consolidated';
    filePath: string;
    size: number;
    reason: string;
}
/**
 * Analyze and generate optimization plan for an agent
 */
export declare function planOptimization(agentId: string, inputContext: string[], outputContext: string[], sharedContext: string[], reasoningContext?: string[], aggressive?: boolean): OptimizationResult;
/**
 * Apply optimizations to context
 */
export declare function applyOptimization(agentId: string, inputContext: string[], outputContext: string[], sharedContext: string[], reasoningContext?: string[], aggressive?: boolean): OptimizationResult;
/**
 * Format optimization result as JSON
 */
export declare function formatOptimizationAsJson(result: OptimizationResult): string;
/**
 * Format optimization result as human-readable string
 */
export declare function formatOptimizationAsString(result: OptimizationResult, showChanges?: boolean): string;
//# sourceMappingURL=optimize.d.ts.map
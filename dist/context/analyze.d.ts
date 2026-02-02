/**
 * Context Analysis Module
 * Enhanced context analysis with detailed metrics and actionable recommendations
 */
export interface ContextAnalysisResult {
    agentId: string;
    cacheKey?: string;
    contextSize: number;
    contextWindow: number;
    usagePercent: number;
    files: {
        input: number;
        output: number;
        shared: number;
        reasoning: number;
    };
    recommendations: Recommendation[];
    analyzedAt: number;
}
export interface Recommendation {
    type: 'compress' | 'remove' | 'split' | 'consolidate' | 'archive';
    description: string;
    savings: string;
    files?: string[];
}
/**
 * Get cached analysis result
 */
export declare function getCachedAnalysis(agentId: string): ContextAnalysisResult | null;
/**
 * Clear cached analysis for an agent
 */
export declare function clearAnalysisCache(agentId: string): void;
/**
 * Analyze context for an agent with detailed metrics
 */
export declare function analyzeContext(agentId: string, inputContext: string[], outputContext: string[], sharedContext: string[], reasoningContext?: string[], options?: {
    formatSize?: boolean;
    useCache?: boolean;
}): ContextAnalysisResult;
/**
 * Format analysis result as JSON
 */
export declare function formatAnalysisAsJson(result: ContextAnalysisResult): string;
/**
 * Format analysis result as human-readable string
 */
export declare function formatAnalysisAsString(result: ContextAnalysisResult): string;
//# sourceMappingURL=analyze.d.ts.map
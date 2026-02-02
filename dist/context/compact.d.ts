/**
 * Context Consolidation Module
 * Automatically consolidate related files in context
 */
export interface ConsolidationResult {
    originalCount: number;
    consolidatedCount: number;
    savings: number;
    groups: ConsolidationGroup[];
}
export interface ConsolidationGroup {
    files: string[];
    consolidatedPath: string;
    reason: string;
    estimatedSavings: number;
}
/**
 * Find consolidation opportunities in context
 */
export declare function findConsolidationOpportunities(inputContext: string[], outputContext: string[], sharedContext: string[]): ConsolidationGroup[];
/**
 * Apply consolidations to context
 */
export declare function applyConsolidation(inputContext: string[], outputContext: string[], sharedContext: string[], groups: ConsolidationGroup[]): {
    inputContext: string[];
    outputContext: string[];
    sharedContext: string[];
    consolidatedFiles: string[];
};
/**
 * Format consolidation result as string
 */
export declare function formatConsolidationAsString(result: ConsolidationResult, showDetails?: boolean): string;
/**
 * Format consolidation result as JSON
 */
export declare function formatConsolidationAsJson(result: ConsolidationResult): string;
//# sourceMappingURL=compact.d.ts.map
/**
 * Context Size Module
 * Tracks context size, calculates token/char counts, and provides optimization suggestions
 */
import type { ContextFile, ContextType, ContextLimits, OptimizationSuggestion, ValidationResult } from './types';
export declare const DEFAULT_CONTEXT_LIMITS: ContextLimits;
/**
 * ContextSizeCalculator - Calculate and track context sizes
 */
export declare class ContextSizeCalculator {
    private limits;
    constructor(limits?: Partial<ContextLimits>);
    /**
     * Estimate tokens from character count
     */
    estimateTokensFromChars(charCount: number): number;
    /**
     * Estimate tokens from word count
     */
    estimateTokensFromWords(wordCount: number): number;
    /**
     * Estimate characters from token count
     */
    estimateCharsFromTokens(tokenCount: number): number;
    /**
     * Estimate words from character count
     */
    estimateWordsFromChars(charCount: number): number;
    /**
     * Get file size in bytes
     */
    getFileSize(file: ContextFile): number;
    /**
     * Calculate total size for a list of files
     */
    calculateTotalSize(files: ContextFile[]): number;
    /**
     * Calculate size breakdown by context type
     */
    calculateSizeByType(files: ContextFile[]): Record<ContextType, number>;
    /**
     * Calculate context usage percentage
     */
    calculateUsagePercentage(files: ContextFile[]): number;
    /**
     * Estimate tokens for a list of files
     */
    estimateTokens(files: ContextFile[]): number;
    /**
     * Check if context is within limits
     */
    validate(files: ContextFile[]): ValidationResult;
    /**
     * Count files by context type
     */
    countByType(files: ContextFile[]): Record<ContextType, number>;
    /**
     * Generate optimization suggestions
     */
    generateOptimizationSuggestions(files: ContextFile[]): OptimizationSuggestion[];
    /**
     * Get size summary for display
     */
    getSizeSummary(files: ContextFile[]): object;
    /**
     * Format bytes to human-readable string
     */
    formatSize(bytes: number): string;
    /**
     * Update context limits
     */
    updateLimits(newLimits: Partial<ContextLimits>): void;
    /**
     * Get current limits
     */
    getLimits(): ContextLimits;
    private groupByDirectory;
}
/**
 * Calculate context statistics
 */
export declare function calculateContextStats(files: ContextFile[]): object;
//# sourceMappingURL=size.d.ts.map
"use strict";
/**
 * Context Size Module
 * Tracks context size, calculates token/char counts, and provides optimization suggestions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextSizeCalculator = exports.DEFAULT_CONTEXT_LIMITS = void 0;
exports.calculateContextStats = calculateContextStats;
// Default context limits based on common model constraints
exports.DEFAULT_CONTEXT_LIMITS = {
    maxContextSize: 10 * 1024 * 1024, // 10 MB
    maxContextWindow: 128000, // 128K tokens (typical for Claude/Kimi)
    maxFilesPerType: 50,
    warningThreshold: 0.8, // 80%
};
// Token estimation constants
const TOKENS_PER_WORD = 0.75; // Average tokens per word
const TOKENS_PER_CHAR = 0.25; // Approximate tokens per character
const AVERAGE_WORD_LENGTH = 5; // Average characters per word
/**
 * ContextSizeCalculator - Calculate and track context sizes
 */
class ContextSizeCalculator {
    constructor(limits) {
        this.limits = { ...exports.DEFAULT_CONTEXT_LIMITS, ...limits };
    }
    /**
     * Estimate tokens from character count
     */
    estimateTokensFromChars(charCount) {
        return Math.ceil(charCount * TOKENS_PER_CHAR);
    }
    /**
     * Estimate tokens from word count
     */
    estimateTokensFromWords(wordCount) {
        return Math.ceil(wordCount * TOKENS_PER_WORD);
    }
    /**
     * Estimate characters from token count
     */
    estimateCharsFromTokens(tokenCount) {
        return Math.ceil(tokenCount / TOKENS_PER_CHAR);
    }
    /**
     * Estimate words from character count
     */
    estimateWordsFromChars(charCount) {
        return Math.ceil(charCount / AVERAGE_WORD_LENGTH);
    }
    /**
     * Get file size in bytes
     */
    getFileSize(file) {
        return file.size;
    }
    /**
     * Calculate total size for a list of files
     */
    calculateTotalSize(files) {
        return files.reduce((total, file) => total + file.size, 0);
    }
    /**
     * Calculate size breakdown by context type
     */
    calculateSizeByType(files) {
        const breakdown = {
            input: 0,
            output: 0,
            shared: 0,
            reasoning: 0,
        };
        for (const file of files) {
            breakdown[file.type] += file.size;
        }
        return breakdown;
    }
    /**
     * Calculate context usage percentage
     */
    calculateUsagePercentage(files) {
        const totalSize = this.calculateTotalSize(files);
        return Math.min(totalSize / this.limits.maxContextSize, 1);
    }
    /**
     * Estimate tokens for a list of files
     */
    estimateTokens(files) {
        const totalChars = this.calculateTotalSize(files);
        return this.estimateTokensFromChars(totalChars);
    }
    /**
     * Check if context is within limits
     */
    validate(files) {
        const errors = [];
        const warnings = [];
        const totalSize = this.calculateTotalSize(files);
        const usagePercentage = this.calculateUsagePercentage(files);
        const totalTokens = this.estimateTokens(files);
        // Check total size
        if (totalSize > this.limits.maxContextSize) {
            errors.push(`Context size (${this.formatSize(totalSize)}) exceeds limit (${this.formatSize(this.limits.maxContextSize)})`);
        }
        // Check token limit
        if (totalTokens > this.limits.maxContextWindow) {
            errors.push(`Token count (${totalTokens}) exceeds limit (${this.limits.maxContextWindow})`);
        }
        // Check warning threshold
        if (usagePercentage > this.limits.warningThreshold) {
            warnings.push(`Context usage at ${Math.round(usagePercentage * 100)}%, consider optimizing`);
        }
        // Check file count per type
        const countByType = this.countByType(files);
        for (const [type, count] of Object.entries(countByType)) {
            if (count > this.limits.maxFilesPerType) {
                warnings.push(`${type} context has ${count} files, max is ${this.limits.maxFilesPerType}`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    /**
     * Count files by context type
     */
    countByType(files) {
        const counts = {
            input: 0,
            output: 0,
            shared: 0,
            reasoning: 0,
        };
        for (const file of files) {
            counts[file.type]++;
        }
        return counts;
    }
    /**
     * Generate optimization suggestions
     */
    generateOptimizationSuggestions(files) {
        const suggestions = [];
        const usagePercentage = this.calculateUsagePercentage(files);
        const totalTokens = this.estimateTokens(files);
        // Suggest removing large files if over limit
        if (usagePercentage > this.limits.warningThreshold) {
            const sortedFiles = [...files].sort((a, b) => b.size - a.size);
            for (const file of sortedFiles.slice(0, 5)) {
                if (file.size > 100 * 1024) { // > 100KB
                    suggestions.push({
                        type: 'remove',
                        filePath: file.path,
                        reason: `Large file (${this.formatSize(file.size)}) contributing to context limit`,
                        estimatedSavings: file.size,
                    });
                }
            }
        }
        // Suggest consolidating similar files
        const groupedByDir = this.groupByDirectory(files);
        for (const [dir, dirFiles] of Object.entries(groupedByDir)) {
            if (dirFiles.length > 10) {
                suggestions.push({
                    type: 'consolidate',
                    filePath: dir,
                    reason: `Directory has ${dirFiles.length} files, consider consolidating or using wildcards`,
                    estimatedSavings: dirFiles.reduce((sum, f) => sum + f.size * 0.1, 0), // Est. 10% savings
                });
            }
        }
        // Suggest splitting if token count is high
        if (totalTokens > this.limits.maxContextWindow * 0.9) {
            suggestions.push({
                type: 'split',
                filePath: 'context',
                reason: `Near token limit (${totalTokens}/${this.limits.maxContextWindow}), consider splitting into smaller contexts`,
                estimatedSavings: Math.floor(totalTokens * 0.1),
            });
        }
        return suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
    }
    /**
     * Get size summary for display
     */
    getSizeSummary(files) {
        const totalSize = this.calculateTotalSize(files);
        const totalTokens = this.estimateTokens(files);
        const sizeByType = this.calculateSizeByType(files);
        const usagePercentage = this.calculateUsagePercentage(files);
        const countByType = this.countByType(files);
        return {
            totalSize,
            totalSizeFormatted: this.formatSize(totalSize),
            totalTokens,
            usagePercentage,
            usagePercentageFormatted: `${Math.round(usagePercentage * 100)}%`,
            limit: this.limits.maxContextSize,
            limitFormatted: this.formatSize(this.limits.maxContextSize),
            tokenLimit: this.limits.maxContextWindow,
            sizeByType: Object.fromEntries(Object.entries(sizeByType).map(([k, v]) => [k, { bytes: v, formatted: this.formatSize(v) }])),
            countByType,
            withinLimits: totalSize <= this.limits.maxContextSize && totalTokens <= this.limits.maxContextWindow,
        };
    }
    /**
     * Format bytes to human-readable string
     */
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let size = bytes;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
    /**
     * Update context limits
     */
    updateLimits(newLimits) {
        this.limits = { ...this.limits, ...newLimits };
    }
    /**
     * Get current limits
     */
    getLimits() {
        return { ...this.limits };
    }
    groupByDirectory(files) {
        const grouped = {};
        for (const file of files) {
            const dir = file.path.split('/').slice(0, -1).join('/') || '/';
            if (!grouped[dir]) {
                grouped[dir] = [];
            }
            grouped[dir].push(file);
        }
        return grouped;
    }
}
exports.ContextSizeCalculator = ContextSizeCalculator;
/**
 * Calculate context statistics
 */
function calculateContextStats(files) {
    const calculator = new ContextSizeCalculator();
    return calculator.getSizeSummary(files);
}
//# sourceMappingURL=size.js.map
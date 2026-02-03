"use strict";
/**
 * Context Analysis Module
 * Enhanced context analysis with detailed metrics and actionable recommendations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedAnalysis = getCachedAnalysis;
exports.clearAnalysisCache = clearAnalysisCache;
exports.analyzeContext = analyzeContext;
exports.formatAnalysisAsJson = formatAnalysisAsJson;
exports.formatAnalysisAsString = formatAnalysisAsString;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const size_1 = require("./size");
const storage_1 = require("../storage");
// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/**
 * Generate cache key for context analysis
 */
function getCacheKey(agentId) {
    return `context:analysis:${agentId}`;
}
/**
 * Get cached analysis result
 */
function getCachedAnalysis(agentId) {
    try {
        const rawMetadata = storage_1.memoryStore.metadata.get('contextAnalysisCache');
        if (!rawMetadata)
            return null;
        const metadata = rawMetadata;
        const entry = metadata[getCacheKey(agentId)];
        if (!entry)
            return null;
        // Check TTL
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            // Expired, remove from cache
            delete metadata[getCacheKey(agentId)];
            storage_1.memoryStore.metadata.set('contextAnalysisCache', metadata);
            return null;
        }
        return entry.result;
    }
    catch {
        return null;
    }
}
/**
 * Store analysis result in cache
 */
function setCachedAnalysis(agentId, result) {
    try {
        const metadata = (storage_1.memoryStore.metadata.get('contextAnalysisCache') || {});
        metadata[getCacheKey(agentId)] = {
            result,
            timestamp: Date.now(),
        };
        storage_1.memoryStore.metadata.set('contextAnalysisCache', metadata);
    }
    catch {
        // Cache write failed, continue without caching
    }
}
/**
 * Clear cached analysis for an agent
 */
function clearAnalysisCache(agentId) {
    try {
        const metadata = (storage_1.memoryStore.metadata.get('contextAnalysisCache') || {});
        delete metadata[getCacheKey(agentId)];
        storage_1.memoryStore.metadata.set('contextAnalysisCache', metadata);
    }
    catch {
        // Cache clear failed
    }
}
/**
 * Analyze context for an agent with detailed metrics
 */
function analyzeContext(agentId, inputContext, outputContext, sharedContext, reasoningContext = [], options) {
    // Check cache first if useCache is not explicitly false
    if (options?.useCache !== false) {
        const cached = getCachedAnalysis(agentId);
        if (cached) {
            return { ...cached, cacheKey: getCacheKey(agentId) };
        }
    }
    const calculator = new size_1.ContextSizeCalculator();
    const limits = calculator.getLimits();
    // Collect all files with their types
    const allFiles = [
        ...inputContext.map((p) => createContextFile(p, 'input')),
        ...outputContext.map((p) => createContextFile(p, 'output')),
        ...sharedContext.map((p) => createContextFile(p, 'shared')),
        ...reasoningContext.map((p) => createContextFile(p, 'reasoning')),
    ];
    // Calculate total context size
    const contextSize = calculator.calculateTotalSize(allFiles);
    const contextWindow = limits.maxContextWindow;
    const usagePercent = (contextSize / limits.maxContextSize) * 100;
    // Count files by type
    const files = {
        input: inputContext.length,
        output: outputContext.length,
        shared: sharedContext.length,
        reasoning: reasoningContext.length,
    };
    // Generate recommendations
    const recommendations = generateRecommendations(allFiles, contextSize, usagePercent, calculator);
    const result = {
        agentId,
        cacheKey: getCacheKey(agentId),
        contextSize,
        contextWindow,
        usagePercent: Math.round(usagePercent * 100) / 100,
        files,
        recommendations,
        analyzedAt: Date.now(),
    };
    // Store in cache
    setCachedAnalysis(agentId, result);
    return result;
}
/**
 * Create a context file entry from a path
 */
function createContextFile(filePath, type) {
    let size = 0;
    let lastModified;
    try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
            size = stats.size;
            lastModified = stats.mtime;
        }
    }
    catch {
        // File might not exist, use 0 size
    }
    return {
        path: filePath,
        type,
        addedAt: new Date(),
        size,
        lastModified,
    };
}
/**
 * Generate actionable recommendations based on context analysis
 */
function generateRecommendations(files, contextSize, usagePercent, calculator) {
    const recommendations = [];
    const limits = calculator.getLimits();
    // Sort files by size for analysis
    const sortedFiles = [...files].sort((a, b) => b.size - a.size);
    // Recommendation 1: Large files (> 100KB)
    const largeFiles = sortedFiles.filter((f) => f.size > 100 * 1024);
    if (largeFiles.length > 0) {
        const totalLargeSize = largeFiles.reduce((sum, f) => sum + f.size, 0);
        const savingsPercent = Math.round((totalLargeSize / contextSize) * 100);
        recommendations.push({
            type: 'compress',
            description: `Archive or compress ${largeFiles.length} large files (>100KB each)`,
            savings: `${savingsPercent}% context reduction`,
            files: largeFiles.slice(0, 5).map((f) => f.path),
        });
    }
    // Recommendation 2: Old/unused files (not modified in 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldFiles = sortedFiles.filter((f) => f.lastModified && f.lastModified < sevenDaysAgo);
    if (oldFiles.length > 0) {
        const totalOldSize = oldFiles.reduce((sum, f) => sum + f.size, 0);
        const savingsPercent = Math.round((totalOldSize / contextSize) * 100);
        recommendations.push({
            type: 'archive',
            description: `Archive ${oldFiles.length} files not modified in 7 days`,
            savings: `${savingsPercent}% context reduction`,
            files: oldFiles.slice(0, 5).map((f) => f.path),
        });
    }
    // Recommendation 3: Unused test files (if context is over limit)
    if (usagePercent > 80) {
        const testFiles = files.filter((f) => f.path.includes('test') ||
            f.path.includes('__tests__') ||
            f.path.includes('.test.') ||
            f.path.includes('.spec.'));
        if (testFiles.length > 0) {
            const totalTestSize = testFiles.reduce((sum, f) => sum + f.size, 0);
            const savingsPercent = Math.round((totalTestSize / contextSize) * 100);
            recommendations.push({
                type: 'remove',
                description: `Remove ${testFiles.length} test files from context`,
                savings: `${savingsPercent}% context reduction`,
                files: testFiles.slice(0, 5).map((f) => f.path),
            });
        }
    }
    // Recommendation 4: Too many files in input context
    const inputFiles = files.filter((f) => f.type === 'input');
    if (inputFiles.length > 20) {
        recommendations.push({
            type: 'split',
            description: `Input context has ${inputFiles.length} files, consider splitting into focused contexts`,
            savings: 'Reduce cognitive load, improve performance',
        });
    }
    // Recommendation 5: Output context files (candidates for removal)
    const outputFiles = files.filter((f) => f.type === 'output');
    if (outputFiles.length > 0 && usagePercent > 70) {
        const totalOutputSize = outputFiles.reduce((sum, f) => sum + f.size, 0);
        const savingsPercent = Math.round((totalOutputSize / contextSize) * 100);
        recommendations.push({
            type: 'remove',
            description: `Remove ${outputFiles.length} output files (likely generated artifacts)`,
            savings: `${savingsPercent}% context reduction`,
            files: outputFiles.slice(0, 5).map((f) => f.path),
        });
    }
    // Recommendation 6: Consolidate similar files
    const groupedByDir = groupByDirectory(files);
    for (const [dir, dirFiles] of Object.entries(groupedByDir)) {
        if (dirFiles.length > 10) {
            recommendations.push({
                type: 'consolidate',
                description: `Directory '${dir}' has ${dirFiles.length} files, consider consolidating`,
                savings: '10-20% context reduction from reduced redundancy',
            });
            break; // Only suggest one consolidation
        }
    }
    // Recommendation 7: Near token limit warning
    const totalTokens = calculator.estimateTokens(files);
    if (totalTokens > limits.maxContextWindow * 0.9) {
        recommendations.push({
            type: 'split',
            description: `Near token limit (${totalTokens}/${limits.maxContextWindow}), consider splitting context`,
            savings: 'Prevent context overflow',
        });
    }
    // Recommendation 8: Empty context
    if (files.length === 0) {
        recommendations.push({
            type: 'split',
            description: 'No context files, consider adding relevant files for better performance',
            savings: 'N/A - context needs files',
        });
    }
    return recommendations;
}
/**
 * Group files by directory
 */
function groupByDirectory(files) {
    const grouped = {};
    for (const file of files) {
        const dir = path.dirname(file.path);
        if (!grouped[dir]) {
            grouped[dir] = [];
        }
        grouped[dir].push(file);
    }
    return grouped;
}
/**
 * Format analysis result as JSON
 */
function formatAnalysisAsJson(result) {
    return JSON.stringify(result, null, 2);
}
/**
 * Format analysis result as human-readable string
 */
function formatAnalysisAsString(result) {
    const lines = [];
    lines.push(`Context Analysis for ${result.agentId}:`);
    lines.push(`  Context Size:  ${formatBytes(result.contextSize)}`);
    lines.push(`  Context Window: ${result.contextWindow.toLocaleString()} tokens`);
    lines.push(`  Usage:         ${result.usagePercent.toFixed(1)}%`);
    lines.push('');
    lines.push('  Files:');
    lines.push(`    Input:     ${result.files.input}`);
    lines.push(`    Output:    ${result.files.output}`);
    lines.push(`    Shared:    ${result.files.shared}`);
    lines.push(`    Reasoning: ${result.files.reasoning}`);
    lines.push('');
    if (result.recommendations.length > 0) {
        lines.push('  Recommendations:');
        result.recommendations.forEach((rec, i) => {
            lines.push(`    ${i + 1}. [${rec.type.toUpperCase()}] ${rec.description}`);
            lines.push(`       Savings: ${rec.savings}`);
            if (rec.files && rec.files.length > 0) {
                lines.push(`       Files: ${rec.files.join(', ')}`);
            }
        });
    }
    else {
        lines.push('  ✓ No optimization recommendations');
    }
    return lines.join('\n');
}
/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
//# sourceMappingURL=analyze.js.map
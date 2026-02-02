"use strict";
/**
 * Context Optimization Module
 * Optimize context usage with actionable recommendations
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
exports.planOptimization = planOptimization;
exports.applyOptimization = applyOptimization;
exports.formatOptimizationAsJson = formatOptimizationAsJson;
exports.formatOptimizationAsString = formatOptimizationAsString;
const fs = __importStar(require("fs"));
const analyze_1 = require("./analyze");
const size_1 = require("./size");
/**
 * Analyze and generate optimization plan for an agent
 */
function planOptimization(agentId, inputContext, outputContext, sharedContext, reasoningContext = [], aggressive = false) {
    // Run analysis first
    const analysis = (0, analyze_1.analyzeContext)(agentId, inputContext, outputContext, sharedContext, reasoningContext);
    // Calculate original size
    const calculator = new size_1.ContextSizeCalculator();
    const allFiles = [
        ...inputContext.map((p) => createContextFile(p, 'input')),
        ...outputContext.map((p) => createContextFile(p, 'output')),
        ...sharedContext.map((p) => createContextFile(p, 'shared')),
        ...reasoningContext.map((p) => createContextFile(p, 'reasoning')),
    ];
    const originalSize = calculator.calculateTotalSize(allFiles);
    // Generate proposed changes
    const changes = generateOptimizationChanges(allFiles, analysis, aggressive);
    // Calculate new size (simulated)
    let newSize = originalSize;
    for (const change of changes) {
        newSize -= change.size;
    }
    return {
        agentId,
        applied: false,
        changes,
        originalSize,
        newSize,
        savings: originalSize - newSize,
        recommendations: analysis.recommendations,
    };
}
/**
 * Apply optimizations to context
 */
function applyOptimization(agentId, inputContext, outputContext, sharedContext, reasoningContext = [], aggressive = false) {
    const plan = planOptimization(agentId, inputContext, outputContext, sharedContext, reasoningContext, aggressive);
    // Apply changes
    const changes = [];
    // Remove output context files (aggressive mode)
    if (aggressive) {
        for (const filePath of outputContext) {
            const fileSize = getFileSize(filePath);
            changes.push({
                type: 'removed',
                filePath,
                size: fileSize,
                reason: 'Output context cleared (aggressive mode)',
            });
        }
        outputContext.length = 0; // Clear array
    }
    // Remove large files (> 500KB) if aggressive
    if (aggressive) {
        const allContexts = [inputContext, outputContext, sharedContext, reasoningContext];
        for (const ctx of allContexts) {
            for (let i = ctx.length - 1; i >= 0; i--) {
                const filePath = ctx[i];
                if (getFileSize(filePath) > 500 * 1024) {
                    const fileSize = getFileSize(filePath);
                    changes.push({
                        type: 'removed',
                        filePath,
                        size: fileSize,
                        reason: 'Large file removed (aggressive mode)',
                    });
                    ctx.splice(i, 1);
                }
            }
        }
    }
    // Remove test files if context is over 80% usage
    const calculator = new size_1.ContextSizeCalculator();
    const allFiles = [
        ...inputContext.map((p) => createContextFile(p, 'input')),
        ...sharedContext.map((p) => createContextFile(p, 'shared')),
    ];
    const usagePercent = (calculator.calculateTotalSize(allFiles) / calculator.getLimits().maxContextSize) * 100;
    if (usagePercent > 80) {
        const testPatterns = ['test', '__tests__', '.test.', '.spec.'];
        const contexts = [inputContext, sharedContext];
        for (const ctx of contexts) {
            for (let i = ctx.length - 1; i >= 0; i--) {
                const filePath = ctx[i];
                if (testPatterns.some((p) => filePath.includes(p))) {
                    const fileSize = getFileSize(filePath);
                    changes.push({
                        type: 'removed',
                        filePath,
                        size: fileSize,
                        reason: 'Test file removed (high usage)',
                    });
                    ctx.splice(i, 1);
                }
            }
        }
    }
    // Remove old files (> 30 days) if aggressive
    if (aggressive) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const allContexts = [inputContext, sharedContext];
        for (const ctx of allContexts) {
            for (let i = ctx.length - 1; i >= 0; i--) {
                const filePath = ctx[i];
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.mtime < thirtyDaysAgo) {
                        const fileSize = stats.size;
                        changes.push({
                            type: 'archived',
                            filePath,
                            size: fileSize,
                            reason: 'Old file archived (aggressive mode)',
                        });
                        ctx.splice(i, 1);
                    }
                }
                catch {
                    // File doesn't exist, skip
                }
            }
        }
    }
    // Remove duplicates
    removeDuplicates(inputContext);
    removeDuplicates(outputContext);
    removeDuplicates(sharedContext);
    // Calculate new size
    const updatedAllFiles = [
        ...inputContext.map((p) => createContextFile(p, 'input')),
        ...outputContext.map((p) => createContextFile(p, 'output')),
        ...sharedContext.map((p) => createContextFile(p, 'shared')),
        ...reasoningContext.map((p) => createContextFile(p, 'reasoning')),
    ];
    const newSize = calculator.calculateTotalSize(updatedAllFiles);
    return {
        agentId,
        applied: true,
        changes,
        originalSize: plan.originalSize,
        newSize,
        savings: plan.originalSize - newSize,
        recommendations: plan.recommendations,
    };
}
/**
 * Generate optimization changes without applying them
 */
function generateOptimizationChanges(files, analysis, aggressive) {
    const changes = [];
    new size_1.ContextSizeCalculator();
    // Sort files by size
    const sortedFiles = [...files].sort((a, b) => b.size - a.size);
    // Identify files to remove based on recommendations
    for (const rec of analysis.recommendations) {
        if (rec.type === 'remove' && rec.files) {
            for (const filePath of rec.files) {
                const file = files.find((f) => f.path === filePath);
                if (file) {
                    changes.push({
                        type: 'removed',
                        filePath: file.path,
                        size: file.size,
                        reason: rec.description,
                    });
                }
            }
        }
        if (rec.type === 'archive' && rec.files) {
            for (const filePath of rec.files) {
                const file = files.find((f) => f.path === filePath);
                if (file) {
                    changes.push({
                        type: 'archived',
                        filePath: file.path,
                        size: file.size,
                        reason: rec.description,
                    });
                }
            }
        }
    }
    // Aggressive: remove all output context
    if (aggressive) {
        const outputFiles = files.filter((f) => f.type === 'output');
        for (const file of outputFiles) {
            if (!changes.find((c) => c.filePath === file.path)) {
                changes.push({
                    type: 'removed',
                    filePath: file.path,
                    size: file.size,
                    reason: 'Output context cleared (aggressive mode)',
                });
            }
        }
    }
    // Aggressive: remove very large files
    if (aggressive) {
        for (const file of sortedFiles) {
            if (file.size > 500 * 1024) { // > 500KB
                if (!changes.find((c) => c.filePath === file.path)) {
                    changes.push({
                        type: 'removed',
                        filePath: file.path,
                        size: file.size,
                        reason: 'Large file removed (aggressive mode)',
                    });
                }
            }
        }
    }
    return changes;
}
/**
 * Remove duplicates from a context array
 */
function removeDuplicates(context) {
    const seen = new Set();
    for (let i = context.length - 1; i >= 0; i--) {
        if (seen.has(context[i])) {
            context.splice(i, 1);
        }
        else {
            seen.add(context[i]);
        }
    }
}
/**
 * Get file size
 */
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile() ? stats.size : 0;
    }
    catch {
        return 0;
    }
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
        // File might not exist
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
 * Format optimization result as JSON
 */
function formatOptimizationAsJson(result) {
    return JSON.stringify(result, null, 2);
}
/**
 * Format optimization result as human-readable string
 */
function formatOptimizationAsString(result, showChanges = true) {
    const lines = [];
    lines.push(`Optimization ${result.applied ? 'Applied' : 'Plan'} for ${result.agentId}:`);
    lines.push(`  Original Size: ${formatBytes(result.originalSize)}`);
    lines.push(`  New Size:      ${formatBytes(result.newSize)}`);
    lines.push(`  Savings:       ${formatBytes(result.savings)} (${result.savings > 0 ? '+' : ''}${Math.round((result.savings / result.originalSize) * 100)}%)`);
    lines.push('');
    if (showChanges && result.changes.length > 0) {
        lines.push('  Changes:');
        for (const change of result.changes) {
            lines.push(`    [${change.type.toUpperCase()}] ${change.filePath}`);
            lines.push(`      Size: ${formatBytes(change.size)}`);
            lines.push(`      Reason: ${change.reason}`);
        }
        lines.push('');
    }
    if (result.recommendations.length > 0) {
        lines.push('  Recommendations:');
        result.recommendations.forEach((rec, i) => {
            lines.push(`    ${i + 1}. ${rec.description}`);
            lines.push(`       Savings: ${rec.savings}`);
        });
    }
    else {
        lines.push('  ✓ No additional recommendations');
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
//# sourceMappingURL=optimize.js.map
"use strict";
/**
 * Context Consolidation Module
 * Automatically consolidate related files in context
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
exports.findConsolidationOpportunities = findConsolidationOpportunities;
exports.applyConsolidation = applyConsolidation;
exports.formatConsolidationAsString = formatConsolidationAsString;
exports.formatConsolidationAsJson = formatConsolidationAsJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Find consolidation opportunities in context
 */
function findConsolidationOpportunities(inputContext, outputContext, sharedContext) {
    const groups = [];
    // Collect all files with their types
    const allFiles = [
        ...inputContext.map((p) => createContextFile(p, 'input')),
        ...outputContext.map((p) => createContextFile(p, 'output')),
        ...sharedContext.map((p) => createContextFile(p, 'shared')),
    ];
    // Group 1: Files in the same directory with similar names
    const dirGroups = groupByDirectory(allFiles);
    for (const [dir, files] of Object.entries(dirGroups)) {
        if (files.length >= 3) {
            // Check if files have similar naming patterns
            const patterns = groupByNamePattern(files);
            for (const [pattern, patternFiles] of Object.entries(patterns)) {
                if (patternFiles.length >= 3) {
                    const totalSize = patternFiles.reduce((sum, f) => sum + f.size, 0);
                    const estimatedSavings = Math.round(totalSize * 0.15); // ~15% savings from reduced metadata
                    groups.push({
                        files: patternFiles.map((f) => f.path),
                        consolidatedPath: path.join(dir, `${pattern}_consolidated.md`),
                        reason: `Consolidate ${patternFiles.length} related files (${pattern}*)`,
                        estimatedSavings,
                    });
                }
            }
        }
    }
    // Group 2: Files with similar extensions in same directory
    const extGroups = groupByExtension(allFiles);
    for (const [dir, extFiles] of Object.entries(extGroups)) {
        for (const [ext, files] of Object.entries(extFiles)) {
            if (files.length >= 5 && ext !== '.ts' && ext !== '.js') {
                const totalSize = files.reduce((sum, f) => sum + f.size, 0);
                const estimatedSavings = Math.round(totalSize * 0.1);
                groups.push({
                    files: files.map((f) => f.path),
                    consolidatedPath: path.join(dir, `consolidated_${ext.slice(1)}.md`),
                    reason: `Consolidate ${files.length} ${ext} files`,
                    estimatedSavings,
                });
            }
        }
    }
    // Group 3: Configuration files
    const configFiles = allFiles.filter((f) => {
        const name = path.basename(f.path);
        return (name.startsWith('.') ||
            name.includes('config') ||
            name.includes('settings') ||
            name.endsWith('.json') ||
            name.endsWith('.yaml') ||
            name.endsWith('.yml'));
    });
    if (configFiles.length >= 3) {
        const totalSize = configFiles.reduce((sum, f) => sum + f.size, 0);
        const estimatedSavings = Math.round(totalSize * 0.2);
        const firstFile = configFiles[0];
        if (firstFile) {
            groups.push({
                files: configFiles.map((f) => f.path),
                consolidatedPath: path.join(path.dirname(firstFile.path), '.consolidated_config.md'),
                reason: `Consolidate ${configFiles.length} configuration files`,
                estimatedSavings,
            });
        }
    }
    return groups;
}
/**
 * Apply consolidations to context
 */
function applyConsolidation(inputContext, outputContext, sharedContext, groups) {
    const consolidatedFiles = [];
    for (const group of groups) {
        // Read all files in the group
        const contents = [];
        for (const filePath of group.files) {
            try {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    contents.push(`\n## ${path.basename(filePath)}\n\n${content}`);
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        // Create consolidated file
        const consolidatedContent = `# Consolidated Context\n\n${contents.join('\n---\n')}\n`;
        try {
            fs.writeFileSync(group.consolidatedPath, consolidatedContent);
            consolidatedFiles.push(group.consolidatedPath);
            // Remove original files from context arrays
            removeFromContext(inputContext, group.files);
            removeFromContext(outputContext, group.files);
            removeFromContext(sharedContext, group.files);
            // Add consolidated file to shared context
            if (!sharedContext.includes(group.consolidatedPath)) {
                sharedContext.push(group.consolidatedPath);
            }
        }
        catch (error) {
            // Skip if we can't write the consolidated file
        }
    }
    return { inputContext, outputContext, sharedContext, consolidatedFiles };
}
/**
 * Remove files from a context array
 */
function removeFromContext(context, filesToRemove) {
    for (const file of filesToRemove) {
        const idx = context.indexOf(file);
        if (idx > -1) {
            context.splice(idx, 1);
        }
    }
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
 * Group files by name pattern
 */
function groupByNamePattern(files) {
    const grouped = {};
    for (const file of files) {
        const name = path.basename(file.path);
        // Extract common prefix pattern
        const match = name.match(/^([a-zA-Z_]+)[-_]/);
        const pattern = match ? match[1] ?? name.split('.')[0] : name.split('.')[0];
        if (!grouped[pattern]) {
            grouped[pattern] = [];
        }
        grouped[pattern].push(file);
    }
    return grouped;
}
/**
 * Group files by extension within directories
 */
function groupByExtension(files) {
    const grouped = {};
    for (const file of files) {
        const dir = path.dirname(file.path);
        const ext = path.extname(file.path);
        if (!grouped[dir]) {
            grouped[dir] = {};
        }
        if (!grouped[dir][ext]) {
            grouped[dir][ext] = [];
        }
        grouped[dir][ext].push(file);
    }
    return grouped;
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
 * Format consolidation result as string
 */
function formatConsolidationAsString(result, showDetails = true) {
    const lines = [];
    lines.push(`Consolidation Analysis:`);
    lines.push(`  Original files:  ${result.originalCount}`);
    lines.push(`  After consolidation: ${result.consolidatedCount}`);
    lines.push(`  Estimated savings: ${formatBytes(result.savings)}`);
    lines.push('');
    if (showDetails && result.groups.length > 0) {
        lines.push('  Consolidation Groups:');
        result.groups.forEach((group, i) => {
            lines.push(`    Group ${i + 1}:`);
            lines.push(`      Reason: ${group.reason}`);
            lines.push(`      Files: ${group.files.length}`);
            lines.push(`      Savings: ${formatBytes(group.estimatedSavings)}`);
            if (group.files.length <= 3) {
                lines.push(`      File list: ${group.files.join(', ')}`);
            }
        });
    }
    else if (result.groups.length === 0) {
        lines.push('  ✓ No consolidation opportunities found');
    }
    return lines.join('\n');
}
/**
 * Format consolidation result as JSON
 */
function formatConsolidationAsJson(result) {
    return JSON.stringify(result, null, 2);
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
//# sourceMappingURL=compact.js.map
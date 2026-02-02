/**
 * Context Optimization Module
 * Optimize context usage with actionable recommendations
 */

import * as fs from 'fs';

import { analyzeContext } from './analyze';
import { ContextSizeCalculator } from './size';

import type { Recommendation, ContextAnalysisResult } from './analyze';
import type { ContextFile, ContextType } from './types';

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
export function planOptimization(
  agentId: string,
  inputContext: string[],
  outputContext: string[],
  sharedContext: string[],
  reasoningContext: string[] = [],
  aggressive: boolean = false
): OptimizationResult {
  // Run analysis first
  const analysis = analyzeContext(
    agentId,
    inputContext,
    outputContext,
    sharedContext,
    reasoningContext
  );

  // Calculate original size
  const calculator = new ContextSizeCalculator();
  const allFiles = [
    ...inputContext.map((p) => createContextFile(p, 'input')),
    ...outputContext.map((p) => createContextFile(p, 'output')),
    ...sharedContext.map((p) => createContextFile(p, 'shared')),
    ...reasoningContext.map((p) => createContextFile(p, 'reasoning')),
  ];
  const originalSize = calculator.calculateTotalSize(allFiles);

  // Generate proposed changes
  const changes = generateOptimizationChanges(
    allFiles,
    analysis,
    aggressive
  );

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
export function applyOptimization(
  agentId: string,
  inputContext: string[],
  outputContext: string[],
  sharedContext: string[],
  reasoningContext: string[] = [],
  aggressive: boolean = false
): OptimizationResult {
  const plan = planOptimization(
    agentId,
    inputContext,
    outputContext,
    sharedContext,
    reasoningContext,
    aggressive
  );

  // Apply changes
  const changes: OptimizationChange[] = [];

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
  const calculator = new ContextSizeCalculator();
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
        } catch {
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
function generateOptimizationChanges(
  files: ContextFile[],
  analysis: ContextAnalysisResult,
  aggressive: boolean
): OptimizationChange[] {
  const changes: OptimizationChange[] = [];
  new ContextSizeCalculator();

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
function removeDuplicates(context: string[]): void {
  const seen = new Set<string>();
  for (let i = context.length - 1; i >= 0; i--) {
    if (seen.has(context[i])) {
      context.splice(i, 1);
    } else {
      seen.add(context[i]);
    }
  }
}

/**
 * Get file size
 */
function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Create a context file entry from a path
 */
function createContextFile(filePath: string, type: ContextType): ContextFile {
  let size = 0;
  let lastModified: Date | undefined;

  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      size = stats.size;
      lastModified = stats.mtime;
    }
  } catch {
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
export function formatOptimizationAsJson(result: OptimizationResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format optimization result as human-readable string
 */
export function formatOptimizationAsString(
  result: OptimizationResult,
  showChanges: boolean = true
): string {
  const lines: string[] = [];

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
  } else {
    lines.push('  ✓ No additional recommendations');
  }

  return lines.join('\n');
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

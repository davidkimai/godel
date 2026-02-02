/**
 * Context Analysis Module
 * Enhanced context analysis with detailed metrics and actionable recommendations
 */

import * as fs from 'fs';
import * as path from 'path';

import { ContextSizeCalculator } from './size';
import { memoryStore } from '../storage';

import type { ContextFile, ContextType} from './types';

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

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key for context analysis
 */
function getCacheKey(agentId: string): string {
  return `context:analysis:${agentId}`;
}

/**
 * Get cached analysis result
 */
export function getCachedAnalysis(agentId: string): ContextAnalysisResult | null {
  try {
    const rawMetadata = memoryStore.metadata.get('contextAnalysisCache');
    if (!rawMetadata) return null;
    
    const metadata = rawMetadata as Record<string, { result: ContextAnalysisResult; timestamp: number }>;

    const entry = metadata[getCacheKey(agentId)];
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      // Expired, remove from cache
      delete metadata[getCacheKey(agentId)];
      memoryStore.metadata.set('contextAnalysisCache', metadata);
      return null;
    }

    return entry.result;
  } catch {
    return null;
  }
}

/**
 * Store analysis result in cache
 */
function setCachedAnalysis(agentId: string, result: ContextAnalysisResult): void {
  try {
    const metadata = (memoryStore.metadata.get('contextAnalysisCache') || {}) as Record<string, unknown>;
    metadata[getCacheKey(agentId)] = {
      result,
      timestamp: Date.now(),
    };
    memoryStore.metadata.set('contextAnalysisCache', metadata);
  } catch {
    // Cache write failed, continue without caching
  }
}

/**
 * Clear cached analysis for an agent
 */
export function clearAnalysisCache(agentId: string): void {
  try {
    const metadata = (memoryStore.metadata.get('contextAnalysisCache') || {}) as Record<string, unknown>;
    delete metadata[getCacheKey(agentId)];
    memoryStore.metadata.set('contextAnalysisCache', metadata);
  } catch {
    // Cache clear failed
  }
}

/**
 * Analyze context for an agent with detailed metrics
 */
export function analyzeContext(
  agentId: string,
  inputContext: string[],
  outputContext: string[],
  sharedContext: string[],
  reasoningContext: string[] = [],
  options?: { formatSize?: boolean; useCache?: boolean }
): ContextAnalysisResult {
  // Check cache first if useCache is not explicitly false
  if (options?.useCache !== false) {
    const cached = getCachedAnalysis(agentId);
    if (cached) {
      return { ...cached, cacheKey: getCacheKey(agentId) };
    }
  }

  const calculator = new ContextSizeCalculator();
  const limits = calculator.getLimits();

  // Collect all files with their types
  const allFiles: ContextFile[] = [
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
  const recommendations = generateRecommendations(
    allFiles,
    contextSize,
    usagePercent,
    calculator
  );

  const result: ContextAnalysisResult = {
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
function generateRecommendations(
  files: ContextFile[],
  contextSize: number,
  usagePercent: number,
  calculator: ContextSizeCalculator
): Recommendation[] {
  const recommendations: Recommendation[] = [];
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
  const oldFiles = sortedFiles.filter(
    (f) => f.lastModified && f.lastModified < sevenDaysAgo
  );
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
    const testFiles = files.filter(
      (f) =>
        f.path.includes('test') ||
        f.path.includes('__tests__') ||
        f.path.includes('.test.') ||
        f.path.includes('.spec.')
    );
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
function groupByDirectory(files: ContextFile[]): Record<string, ContextFile[]> {
  const grouped: Record<string, ContextFile[]> = {};

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
export function formatAnalysisAsJson(result: ContextAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format analysis result as human-readable string
 */
export function formatAnalysisAsString(result: ContextAnalysisResult): string {
  const lines: string[] = [];

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
  } else {
    lines.push('  ✓ No optimization recommendations');
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

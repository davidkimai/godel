/**
 * Context Consolidation Module
 * Automatically consolidate related files in context
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ContextFile, ContextType } from './types';

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
export function findConsolidationOpportunities(
  inputContext: string[],
  outputContext: string[],
  sharedContext: string[]
): ConsolidationGroup[] {
  const groups: ConsolidationGroup[] = [];

  // Collect all files with their types
  const allFiles: ContextFile[] = [
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
    return (
      name.startsWith('.') ||
      name.includes('config') ||
      name.includes('settings') ||
      name.endsWith('.json') ||
      name.endsWith('.yaml') ||
      name.endsWith('.yml')
    );
  });

  if (configFiles.length >= 3) {
    const totalSize = configFiles.reduce((sum, f) => sum + f.size, 0);
    const estimatedSavings = Math.round(totalSize * 0.2);
    const firstFile = configFiles[0];

    if (firstFile) {
      groups.push({
        files: configFiles.map((f) => f.path),
        consolidatedPath: path.join(
          path.dirname(firstFile.path),
          '.consolidated_config.md'
        ),
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
export function applyConsolidation(
  inputContext: string[],
  outputContext: string[],
  sharedContext: string[],
  groups: ConsolidationGroup[]
): { inputContext: string[]; outputContext: string[]; sharedContext: string[]; consolidatedFiles: string[] } {
  const consolidatedFiles: string[] = [];

  for (const group of groups) {
    // Read all files in the group
    const contents: string[] = [];
    for (const filePath of group.files) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          contents.push(`\n## ${path.basename(filePath)}\n\n${content}`);
        }
      } catch {
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
    } catch (error) {
      // Skip if we can't write the consolidated file
    }
  }

  return { inputContext, outputContext, sharedContext, consolidatedFiles };
}

/**
 * Remove files from a context array
 */
function removeFromContext(context: string[], filesToRemove: string[]): void {
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
 * Group files by name pattern
 */
function groupByNamePattern(files: ContextFile[]): Record<string, ContextFile[]> {
  const grouped: Record<string, ContextFile[]> = {};

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
function groupByExtension(files: ContextFile[]): Record<string, Record<string, ContextFile[]>> {
  const grouped: Record<string, Record<string, ContextFile[]>> = {};

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
 * Format consolidation result as string
 */
export function formatConsolidationAsString(result: ConsolidationResult, showDetails: boolean = true): string {
  const lines: string[] = [];

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
  } else if (result.groups.length === 0) {
    lines.push('  ✓ No consolidation opportunities found');
  }

  return lines.join('\n');
}

/**
 * Format consolidation result as JSON
 */
export function formatConsolidationAsJson(result: ConsolidationResult): string {
  return JSON.stringify(result, null, 2);
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

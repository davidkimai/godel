/**
 * @fileoverview Complexity Analyzer - Code metrics analysis for intent targets
 * 
 * This module analyzes code complexity to inform team sizing and configuration.
 * 
 * @module @godel/intent/complexity-analyzer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  ComplexityMetrics,
  TeamComplexity,
  FileMetrics,
  CodeAnalyzer,
  GitAnalyzer,
} from './types';
import { createLogger } from '../utils/logger';

/**
 * Module logger
 */
const log = createLogger('complexity-analyzer');

// ============================================================================
// AST UTILITIES
// ============================================================================

interface ASTNode {
  type: string;
  body?: ASTNode | ASTNode[];
  consequent?: ASTNode;
  alternate?: ASTNode;
  cases?: Array<{ consequent: ASTNode | ASTNode[] }>;
  left?: ASTNode;
  right?: ASTNode;
  operator?: string;
}

/**
 * Simple AST traversal for TypeScript/JavaScript files.
 * In production, this would use @babel/parser or similar.
 */
function traverseAST(node: ASTNode, visitor: (node: ASTNode) => void): void {
  if (!node) return;
  
  visitor(node);
  
  // Traverse children
  if (node.body) {
    if (Array.isArray(node.body)) {
      node.body.forEach(child => traverseAST(child, visitor));
    } else {
      traverseAST(node.body, visitor);
    }
  }
  
  if (node.consequent) {
    traverseAST(node.consequent, visitor);
  }
  
  if (node.alternate) {
    traverseAST(node.alternate, visitor);
  }
  
  if (node.cases) {
    node.cases.forEach(c => {
      if (Array.isArray(c.consequent)) {
        c.consequent.forEach(child => traverseAST(child, visitor));
      } else {
        traverseAST(c.consequent, visitor);
      }
    });
  }
  
  if (node.left) {
    traverseAST(node.left, visitor);
  }
  
  if (node.right) {
    traverseAST(node.right, visitor);
  }
}

/**
 * Parse TypeScript/JavaScript content to simple AST.
 * This is a simplified parser for demonstration.
 */
function parseAST(content: string): ASTNode {
  // Simple regex-based parser for decision points
  // In production, use @babel/parser
  const lines = content.split('\n');
  const root: ASTNode = { type: 'Program', body: [] };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect control flow statements (simplified)
    if (/^if\s*\(/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'IfStatement' });
    } else if (/^switch\s*\(/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'SwitchStatement' });
    } else if (/^for\s*\(/.test(trimmed) || /^for\s+\(/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'ForStatement' });
    } else if (/^while\s*\(/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'WhileStatement' });
    } else if (/^catch\s*\(/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'CatchClause' });
    } else if (trimmed.includes('?') && trimmed.includes(':')) {
      (root.body as ASTNode[]).push({ type: 'ConditionalExpression' });
    } else if (/\|\||&&/.test(trimmed)) {
      (root.body as ASTNode[]).push({ type: 'LogicalExpression' });
    }
  }
  
  return root;
}

// ============================================================================
// COMPLEXITY ANALYZER CLASS
// ============================================================================

export class ComplexityAnalyzer {
  private codeAnalyzer: CodeAnalyzer;
  private gitAnalyzer: GitAnalyzer | undefined;

  constructor(
    codeAnalyzer?: CodeAnalyzer,
    gitAnalyzer?: GitAnalyzer
  ) {
    this.codeAnalyzer = codeAnalyzer || new DefaultCodeAnalyzer();
    this.gitAnalyzer = gitAnalyzer;
  }

  /**
   * Analyze complexity of a target.
   * 
   * @param target - Target path or identifier
   * @param targetType - Type of target
   * @returns Team complexity assessment
   */
  async analyze(target: string, targetType: string): Promise<TeamComplexity> {
    const files = await this.resolveTarget(target, targetType);
    
    const metrics: ComplexityMetrics = {
      linesOfCode: 0,
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      dependencies: 0,
      testCoverage: 0,
      changeFrequency: 0,
      fileCount: files.length,
      estimatedHours: 0,
    };

    // Analyze each file
    for (const file of files) {
      try {
        const fileMetrics = await this.analyzeFile(file);
        metrics.linesOfCode += fileMetrics.linesOfCode;
        metrics.cyclomaticComplexity += fileMetrics.cyclomaticComplexity;
        metrics.cognitiveComplexity += fileMetrics.cognitiveComplexity;
        metrics.dependencies += fileMetrics.dependencies;
      } catch (error) {
        // Skip files that can't be analyzed
        log.warn('Failed to analyze file', { file, error: (error as Error).message });
      }
    }

    // Get test coverage if available
    metrics.testCoverage = await this.getTestCoverage(files);

    // Get change frequency from git
    if (this.gitAnalyzer) {
      try {
        metrics.changeFrequency = await this.gitAnalyzer.getChangeFrequency(files);
      } catch {
        metrics.changeFrequency = 0;
      }
    }

    // Estimate human hours
    metrics.estimatedHours = this.estimateHours(metrics);

    // Calculate overall score
    const score = this.calculateScore(metrics);
    const level = this.scoreToLevel(score);

    return { level, score, metrics };
  }

  /**
   * Resolve target to list of files.
   */
  private async resolveTarget(target: string, targetType: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      // Check if target is a file path
      const stats = await fs.stat(target).catch(() => null);
      
      if (stats) {
        if (stats.isFile()) {
          return [target];
        } else if (stats.isDirectory()) {
          // Find all source files in directory
          const patterns = [
            '**/*.ts',
            '**/*.tsx',
            '**/*.js',
            '**/*.jsx',
            '**/*.py',
            '**/*.java',
            '**/*.go',
          ];
          
          for (const pattern of patterns) {
            const matches = await glob(pattern, { 
              cwd: target, 
              absolute: true,
              ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
            });
            files.push(...matches);
          }
          
          return files.slice(0, 50); // Limit to 50 files
        }
      }
      
      // Target might be a module name or pattern
      // Try to find matching files
      const searchPatterns = [
        `**/${target}/**/*.ts`,
        `**/${target}/**/*.tsx`,
        `**/${target}/**/*.js`,
        `**/${target}*.ts`,
        `**/${target}*.tsx`,
      ];
      
      for (const pattern of searchPatterns) {
        const matches = await glob(pattern, { 
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        });
        files.push(...matches);
      }
      
      if (files.length > 0) {
        const uniqueFiles = Array.from(new Set(files));
        return uniqueFiles.slice(0, 50);
      }
      
      // Fallback: return empty list
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Analyze a single file.
   */
  private async analyzeFile(file: string): Promise<FileMetrics> {
    const content = await fs.readFile(file, 'utf-8');
    
    // Skip binary or very large files
    if (content.length > 500000) {
      return {
        linesOfCode: content.split('\n').length,
        cyclomaticComplexity: 1,
        cognitiveComplexity: 1,
        dependencies: 0,
      };
    }
    
    const ast = parseAST(content);
    
    return {
      linesOfCode: content.split('\n').length,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(ast),
      cognitiveComplexity: this.calculateCognitiveComplexity(ast),
      dependencies: this.countDependencies(content),
    };
  }

  /**
   * Calculate cyclomatic complexity.
   */
  private calculateCyclomaticComplexity(ast: ASTNode): number {
    let complexity = 1; // Base complexity
    
    traverseAST(ast, (node) => {
      if (['IfStatement', 'SwitchCase', 'ForStatement', 
           'WhileStatement', 'CatchClause', 'ConditionalExpression'].includes(node.type)) {
        complexity++;
      }
      if (node.type === 'LogicalExpression') {
        complexity++;
      }
    });
    
    return complexity;
  }

  /**
   * Calculate cognitive complexity.
   */
  private calculateCognitiveComplexity(ast: ASTNode): number {
    let complexity = 0;
    let nestingLevel = 0;
    
    const visitor = (node: ASTNode, level: number) => {
      if (['IfStatement', 'ForStatement', 'WhileStatement', 
           'SwitchStatement', 'CatchClause'].includes(node.type)) {
        complexity += 1 + level;
      }
    };
    
    // Simplified: just use cyclomatic as base
    complexity = this.calculateCyclomaticComplexity(ast);
    
    return complexity;
  }

  /**
   * Count dependencies in file content.
   */
  private countDependencies(content: string): number {
    let count = 0;
    
    // Count import statements
    const importMatches = content.match(/^import\s+.+/gm);
    if (importMatches) {
      count += importMatches.length;
    }
    
    // Count require statements
    const requireMatches = content.match(/require\s*\(/g);
    if (requireMatches) {
      count += requireMatches.length;
    }
    
    return count;
  }

  /**
   * Get test coverage from coverage reports.
   */
  private async getTestCoverage(files: string[]): Promise<number> {
    try {
      // Try to read lcov.info or coverage-summary.json
      const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      const coverageData = await fs.readFile(coveragePath, 'utf-8');
      const coverage = JSON.parse(coverageData);
      
      // Calculate average coverage for the files
      let totalCoverage = 0;
      let fileCount = 0;
      
      for (const file of files) {
        const relativePath = path.relative(process.cwd(), file);
        if (coverage[relativePath]) {
          totalCoverage += coverage[relativePath].statements.pct;
          fileCount++;
        }
      }
      
      return fileCount > 0 ? totalCoverage / fileCount : 0;
    } catch {
      // No coverage data available
      return 0;
    }
  }

  /**
   * Estimate human-equivalent hours.
   */
  private estimateHours(metrics: ComplexityMetrics): number {
    // Base hours: 100 LOC per hour
    const baseHours = metrics.linesOfCode / 100;
    
    // Complexity multiplier
    const complexityMultiplier = 1 + (metrics.cyclomaticComplexity / 50);
    
    // Coverage penalty (low coverage = more testing needed)
    const coveragePenalty = metrics.testCoverage < 70 ? 1.5 : 1;
    
    // Change frequency adjustment (high frequency = more context needed)
    const changeMultiplier = metrics.changeFrequency > 5 ? 1.3 : 1;
    
    return Math.round(baseHours * complexityMultiplier * coveragePenalty * changeMultiplier * 10) / 10;
  }

  /**
   * Calculate overall complexity score (0-100).
   */
  private calculateScore(metrics: ComplexityMetrics): number {
    let score = 0;
    
    // LOC contribution (max 30)
    score += Math.min(30, metrics.linesOfCode / 100);
    
    // Complexity contribution (max 30)
    score += Math.min(30, metrics.cyclomaticComplexity / 2);
    
    // Dependencies contribution (max 20)
    score += Math.min(20, metrics.dependencies);
    
    // File count contribution (max 10)
    score += Math.min(10, metrics.fileCount / 2);
    
    // Coverage penalty (max -20)
    score -= (100 - metrics.testCoverage) * 0.2;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Convert score to complexity level.
   */
  private scoreToLevel(score: number): TeamComplexity['level'] {
    if (score < 25) return 'low';
    if (score < 50) return 'medium';
    if (score < 75) return 'high';
    return 'very-high';
  }
}

// ============================================================================
// DEFAULT CODE ANALYZER
// ============================================================================

class DefaultCodeAnalyzer implements CodeAnalyzer {
  async analyze(file: string): Promise<FileMetrics> {
    const content = await fs.readFile(file, 'utf-8');
    const ast = parseAST(content);
    
    return {
      linesOfCode: content.split('\n').length,
      cyclomaticComplexity: 1, // Simplified
      cognitiveComplexity: 1,
      dependencies: (content.match(/import|require/g) || []).length,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Analyze complexity of a target.
 */
export async function analyzeComplexity(
  target: string, 
  targetType: string
): Promise<TeamComplexity> {
  const analyzer = new ComplexityAnalyzer();
  return analyzer.analyze(target, targetType);
}

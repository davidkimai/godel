/**
 * Quality Gate Evaluation Module
 * 
 * Implements quality gate evaluation, score calculation (0-1),
 * and pass/fail determination based on SPEC_V3.md Part IV.
 */

import {
  LintResult,
  LintSummary,
  QualityCriterion,
  QualityGate,
  GateEvaluationResult,
  SeverityLevel
} from './types';

// ============================================================================
// Score Calculation
// ============================================================================

export interface ScoreInput {
  lintResults?: LintResult[];
  typeErrors?: number;
  typeWarnings?: number;
  testCoverage?: number;
  testPassRate?: number;
  securityVulnerabilities?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  customScores?: {
    dimension: string;
    score: number; // 0-1
  }[];
}

/**
 * Calculate quality score from various inputs
 * Returns a score between 0 and 1
 */
export function calculateScore(input: ScoreInput): number {
  const scores: number[] = [];
  const weights: number[] = [];
  
  // Lint score (30% weight)
  if (input.lintResults && input.lintResults.length > 0) {
    const lintScore = calculateLintScore(input.lintResults);
    scores.push(lintScore);
    weights.push(0.30);
  }
  
  // Type safety score (20% weight)
  if (input.typeErrors !== undefined || input.typeWarnings !== undefined) {
    const typeScore = calculateTypeScore(input.typeErrors ?? 0, input.typeWarnings ?? 0);
    scores.push(typeScore);
    weights.push(0.20);
  }
  
  // Test coverage score (20% weight)
  if (input.testCoverage !== undefined) {
    const coverageScore = calculateCoverageScore(input.testCoverage);
    scores.push(coverageScore);
    weights.push(0.20);
  }
  
  // Test pass rate score (15% weight)
  if (input.testPassRate !== undefined) {
    const passRateScore = calculatePassRateScore(input.testPassRate);
    scores.push(passRateScore);
    weights.push(0.15);
  }
  
  // Security score (15% weight)
  if (input.securityVulnerabilities) {
    const securityScore = calculateSecurityScore(input.securityVulnerabilities);
    scores.push(securityScore);
    weights.push(0.15);
  }
  
  // Custom scores
  if (input.customScores && input.customScores.length > 0) {
    for (const custom of input.customScores) {
      scores.push(Math.max(0, Math.min(1, custom.score)));
      weights.push(0.10); // Default weight for custom criteria
    }
  }
  
  // If no scores, return 1.0 (no data means no issues)
  if (scores.length === 0) return 1.0;
  
  // Calculate weighted average
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 1.0;
  
  const weightedSum = scores.reduce((sum, s, i) => sum + s * weights[i], 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Calculate lint score from lint results
 * Based on error/warning counts with severity weighting
 */
export function calculateLintScore(results: LintResult[]): number {
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFiles = 0;
  
  for (const result of results) {
    totalErrors += result.summary.errors;
    totalWarnings += result.summary.warnings;
    if (result.issues.length > 0) {
      totalFiles += new Set(result.issues.map(i => i.file)).size;
    }
  }
  
  // Base penalty for errors (severe)
  const errorPenalty = totalErrors * 0.15;
  
  // Smaller penalty for warnings
  const warningPenalty = totalWarnings * 0.02;
  
  // Calculate score
  const score = Math.max(0, 1 - errorPenalty - warningPenalty);
  return Math.round(score * 100) / 100;
}

/**
 * Calculate type checking score
 */
export function calculateTypeScore(errors: number, warnings: number): number {
  // Errors are severe - each error costs 0.1
  // Warnings are less severe - each warning costs 0.02
  const errorPenalty = errors * 0.1;
  const warningPenalty = warnings * 0.02;
  
  const score = Math.max(0, 1 - errorPenalty - warningPenalty);
  return Math.round(score * 100) / 100;
}

/**
 * Calculate test coverage score
 * Target is 80% coverage for full score
 */
export function calculateCoverageScore(coverage: number): number {
  if (coverage >= 80) return 1.0;
  if (coverage >= 60) return 0.6 + (coverage - 60) * 0.02;
  if (coverage >= 40) return 0.4 + (coverage - 40) * 0.01;
  return coverage / 100 * 0.4;
}

/**
 * Calculate test pass rate score
 */
export function calculatePassRateScore(passRate: number): number {
  // Pass rate is already a percentage (0-100)
  return Math.min(1, passRate / 100);
}

/**
 * Calculate security score based on vulnerabilities
 */
export function calculateSecurityScore(vulns: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): number {
  // Critical vulnerabilities are blocking
  if (vulns.critical > 0) return 0.0;
  
  // High vulnerabilities cost 0.2 each
  const highPenalty = vulns.high * 0.2;
  
  // Medium vulnerabilities cost 0.05 each
  const mediumPenalty = vulns.medium * 0.05;
  
  // Low vulnerabilities cost 0.01 each
  const lowPenalty = vulns.low * 0.01;
  
  const score = Math.max(0, 1 - highPenalty - mediumPenalty - lowPenalty);
  return Math.round(score * 100) / 100;
}

// ============================================================================
// Quality Gate Evaluation
// ============================================================================

export interface GateEvaluationInput {
  gate: QualityGate;
  lintResults?: LintResult[];
  typeErrors?: number;
  typeWarnings?: number;
  testCoverage?: number;
  testPassRate?: number;
  securityVulnerabilities?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Evaluate a quality gate against provided results
 */
export function evaluateQualityGate(input: GateEvaluationInput): GateEvaluationResult {
  const { gate, lintResults, typeErrors, typeWarnings, testCoverage, testPassRate, securityVulnerabilities } = input;
  
  const criterionScores: GateEvaluationResult['criterionScores'] = [];
  const failedCriteria: string[] = [];
  const recommendations: string[] = [];
  
  // Evaluate each criterion
  for (const criterion of gate.criteria) {
    let score = 0;
    let passed = false;
    
    switch (criterion.dimension) {
      case 'correctness':
        // Based on lint errors and type errors
        const errorCount = lintResults?.reduce((sum, r) => sum + r.summary.errors, 0) ?? 0;
        score = errorCount === 0 ? 1.0 : Math.max(0, 1 - errorCount * 0.1);
        break;
        
      case 'completeness':
        // Based on test coverage and pass rate
        const coverage = testCoverage ?? 0;
        const passRate = testPassRate ?? 0;
        score = (coverage / 100 * 0.6 + passRate / 100 * 0.4);
        break;
        
      case 'consistency':
        // Based on lint warnings
        const warningCount = lintResults?.reduce((sum, r) => sum + r.summary.warnings, 0) ?? 0;
        score = Math.max(0, 1 - warningCount * 0.02);
        break;
        
      case 'clarity':
        // Based on style warnings and info messages
        const infoCount = lintResults?.reduce((sum, r) => sum + r.summary.info, 0) ?? 0;
        score = Math.max(0, 1 - infoCount * 0.01);
        break;
        
      case 'performance':
        // Based on performance-related lint issues
        const perfIssues = lintResults?.flatMap(r => 
          r.issues.filter(i => i.category === 'performance')
        ).length ?? 0;
        score = Math.max(0, 1 - perfIssues * 0.1);
        break;
        
      case 'security':
        // Based on security vulnerabilities
        const secVulns = securityVulnerabilities;
        if (secVulns) {
          score = calculateSecurityScore(secVulns);
        } else {
          const secIssues = lintResults?.flatMap(r => 
            r.issues.filter(i => i.category === 'security')
          ).length ?? 0;
          score = Math.max(0, 1 - secIssues * 0.15);
        }
        break;
        
      case 'style':
        // Based on style warnings
        const styleWarnings = lintResults?.reduce((sum, r) => {
          return sum + r.issues.filter(i => i.category === 'style' && i.severity === 'warning').length;
        }, 0) ?? 0;
        score = Math.max(0, 1 - styleWarnings * 0.02);
        break;
        
      case 'type_safety':
        // Based on type errors
        const typeErr = typeErrors ?? 0;
        const typeWarn = typeWarnings ?? 0;
        score = calculateTypeScore(typeErr, typeWarn);
        break;
        
      case 'test_coverage':
        // Based on test coverage
        score = calculateCoverageScore(testCoverage ?? 0);
        break;
    }
    
    passed = score >= criterion.threshold;
    
    criterionScores.push({
      dimension: criterion.dimension,
      weight: criterion.weight,
      threshold: criterion.threshold,
      score: Math.round(score * 100) / 100,
      passed
    });
    
    if (!passed) {
      failedCriteria.push(criterion.dimension);
      recommendations.push(`Improve ${criterion.dimension} score (currently ${(score * 100).toFixed(1)}%, required ${(criterion.threshold * 100).toFixed(1)}%)`);
    }
  }
  
  // Calculate overall weighted score
  const overallScore = calculateOverallScore(criterionScores);
  const passed = overallScore >= gate.passingThreshold;
  
  // Generate additional recommendations
  if (!passed && recommendations.length === 0) {
    recommendations.push('Review all quality criteria and improve scores');
  }
  
  return {
    gate,
    passed,
    score: Math.round(overallScore * 100) / 100,
    criterionScores,
    failedCriteria,
    recommendations,
    evaluatedAt: new Date()
  };
}

/**
 * Calculate overall weighted score from criterion scores
 */
function calculateOverallScore(criterionScores: GateEvaluationResult['criterionScores']): number {
  if (criterionScores.length === 0) return 1.0;
  
  const totalWeight = criterionScores.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return 1.0;
  
  const weightedSum = criterionScores.reduce((sum, c) => sum + c.score * c.weight, 0);
  return weightedSum / totalWeight;
}

// ============================================================================
// Lint Summary Generation
// ============================================================================

/**
 * Generate a summary from multiple lint results
 */
export function generateLintSummary(results: LintResult[]): LintSummary {
  const aggregate = {
    errors: 0,
    warnings: 0,
    hints: 0,
    info: 0,
    total: 0,
    filesWithIssues: new Set<string>()
  };
  
  for (const result of results) {
    aggregate.errors += result.summary.errors;
    aggregate.warnings += result.summary.warnings;
    aggregate.hints += result.summary.hints;
    aggregate.info += result.summary.info;
    aggregate.total += result.summary.total;
    
    for (const issue of result.issues) {
      aggregate.filesWithIssues.add(issue.file);
    }
  }
  
  // Calculate overall score
  const score = calculateLintScore(results);
  
  // Determine if passed (no errors = pass)
  const passed = aggregate.errors === 0;
  
  return {
    results,
    aggregate: {
      ...aggregate,
      filesWithIssues: aggregate.filesWithIssues
    },
    score,
    passed
  };
}

// ============================================================================
// Default Quality Gates
// ============================================================================

export const DEFAULT_GATES: Record<string, QualityGate> = {
  lint: {
    type: 'lint',
    criteria: [
      { dimension: 'correctness', weight: 0.5, threshold: 0.8 },
      { dimension: 'style', weight: 0.3, threshold: 0.7 },
      { dimension: 'security', weight: 0.2, threshold: 0.9 }
    ],
    passingThreshold: 0.8,
    maxIterations: 3,
    autoRetry: true
  },
  
  types: {
    type: 'types',
    criteria: [
      { dimension: 'type_safety', weight: 0.7, threshold: 0.95 },
      { dimension: 'correctness', weight: 0.3, threshold: 0.9 }
    ],
    passingThreshold: 0.9,
    maxIterations: 3,
    autoRetry: true
  },
  
  security: {
    type: 'security',
    criteria: [
      { dimension: 'security', weight: 0.8, threshold: 1.0 },
      { dimension: 'correctness', weight: 0.2, threshold: 0.8 }
    ],
    passingThreshold: 0.95,
    maxIterations: 5,
    autoRetry: false
  },
  
  full: {
    type: 'multi',
    criteria: [
      { dimension: 'correctness', weight: 0.25, threshold: 0.85 },
      { dimension: 'type_safety', weight: 0.20, threshold: 0.9 },
      { dimension: 'test_coverage', weight: 0.15, threshold: 0.8 },
      { dimension: 'security', weight: 0.20, threshold: 0.95 },
      { dimension: 'style', weight: 0.10, threshold: 0.7 },
      { dimension: 'performance', weight: 0.10, threshold: 0.8 }
    ],
    passingThreshold: 0.85,
    maxIterations: 5,
    autoRetry: true
  }
};

/**
 * Parse criteria JSON string into QualityCriterion array
 */
export function parseCriteriaJson(criteriaJson: string): QualityCriterion[] {
  try {
    const parsed = JSON.parse(criteriaJson);
    if (Array.isArray(parsed)) {
      return parsed.map(c => ({
        dimension: c.dimension,
        weight: c.weight ?? 0.1,
        threshold: c.threshold ?? 0.7
      }));
    } else if (typeof parsed === 'object') {
      // Parse "dimension:weight,dimension:weight" format
      return Object.entries(parsed).map(([dimension, values]) => ({
        dimension: dimension as QualityCriterion['dimension'],
        weight: (values as any).weight ?? 0.1,
        threshold: (values as any).threshold ?? 0.7
      }));
    }
    return [];
  } catch {
    // Try parsing "dimension:weight,dimension:weight" format
    return criteriaJson.split(',').map(pair => {
      const [dimension, weight, threshold] = pair.split(':');
      return {
        dimension: dimension.trim() as QualityCriterion['dimension'],
        weight: parseFloat(weight?.trim() || '0.1'),
        threshold: parseFloat(threshold?.trim() || '0.7')
      };
    });
  }
}

/**
 * Create a quality gate from criteria JSON
 */
export function createGateFromCriteria(
  criteriaJson: string,
  options: Partial<Omit<QualityGate, 'criteria'>> = {}
): QualityGate {
  const criteria = parseCriteriaJson(criteriaJson);
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  
  // Normalize weights if they don't sum to 1
  if (totalWeight > 0 && totalWeight !== 1) {
    criteria.forEach(c => {
      c.weight = c.weight / totalWeight;
    });
  }
  
  return {
    type: 'manual',
    criteria,
    passingThreshold: options.passingThreshold ?? 0.8,
    maxIterations: options.maxIterations ?? 3,
    autoRetry: options.autoRetry ?? true,
    name: options.name
  };
}

// ============================================================================
// Gate Report Formatting
// ============================================================================

export interface GateReportOptions {
  format: 'json' | 'table' | 'summary';
  verbose?: boolean;
}

/**
 * Format gate evaluation result for display
 */
export function formatGateResult(result: GateEvaluationResult, options: GateReportOptions): string {
  if (options.format === 'json') {
    return JSON.stringify(result, null, 2);
  }
  
  if (options.format === 'table') {
    let output = `\n=== Quality Gate Evaluation ===\n`;
    output += `Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
    output += `Overall Score: ${(result.score * 100).toFixed(1)}% (threshold: ${(result.gate.passingThreshold * 100).toFixed(1)}%)\n\n`;
    
    output += `Criteria Breakdown:\n`;
    output += `| Dimension       | Weight | Score  | Threshold | Status |\n`;
    output += `|-----------------|--------|--------|-----------|--------|\n`;
    
    for (const criterion of result.criterionScores) {
      const status = criterion.passed ? '✅' : '❌';
      output += `| ${criterion.dimension.padEnd(15)} | ${(criterion.weight * 100).toFixed(0).padEnd(6)}% | ${(criterion.score * 100).toFixed(1)}% | ${(criterion.threshold * 100).toFixed(1)}% | ${status} |\n`;
    }
    
    if (result.recommendations.length > 0) {
      output += `\nRecommendations:\n`;
      result.recommendations.forEach((rec, i) => {
        output += `${i + 1}. ${rec}\n`;
      });
    }
    
    return output;
  }
  
  // Summary format
  const status = result.passed ? 'PASSED' : 'FAILED';
  return `Quality Gate: ${status} | Score: ${(result.score * 100).toFixed(1)}% | Criteria: ${result.criterionScores.filter(c => c.passed).length}/${result.criterionScores.length}`;
}

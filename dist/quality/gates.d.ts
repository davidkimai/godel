/**
 * Quality Gate Evaluation Module
 *
 * Implements quality gate evaluation, score calculation (0-1),
 * and pass/fail determination based on SPEC_V3.md Part IV.
 */
import type { LintResult, LintSummary, QualityCriterion, QualityGate, GateEvaluationResult } from './types';
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
        score: number;
    }[];
}
/**
 * Calculate quality score from various inputs
 * Returns a score between 0 and 1
 */
export declare function calculateScore(input: ScoreInput): number;
/**
 * Calculate lint score from lint results
 * Based on error/warning counts with severity weighting
 */
export declare function calculateLintScore(results: LintResult[]): number;
/**
 * Calculate type checking score
 */
export declare function calculateTypeScore(errors: number, warnings: number): number;
/**
 * Calculate test coverage score
 * Target is 80% coverage for full score
 */
export declare function calculateCoverageScore(coverage: number): number;
/**
 * Calculate test pass rate score
 */
export declare function calculatePassRateScore(passRate: number): number;
/**
 * Calculate security score based on vulnerabilities
 */
export declare function calculateSecurityScore(vulns: {
    critical: number;
    high: number;
    medium: number;
    low: number;
}): number;
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
export declare function evaluateQualityGate(input: GateEvaluationInput): GateEvaluationResult;
/**
 * Generate a summary from multiple lint results
 */
export declare function generateLintSummary(results: LintResult[]): LintSummary;
export declare const DEFAULT_GATES: Record<string, QualityGate>;
export declare function parseCriteriaJson(criteriaJson: string): QualityCriterion[];
/**
 * Create a quality gate from criteria JSON
 */
export declare function createGateFromCriteria(criteriaJson: string, options?: Partial<Omit<QualityGate, 'criteria'>>): QualityGate;
export interface GateReportOptions {
    format: 'json' | 'table' | 'summary';
    verbose?: boolean;
}
/**
 * Format gate evaluation result for display
 */
export declare function formatGateResult(result: GateEvaluationResult, options: GateReportOptions): string;
//# sourceMappingURL=gates.d.ts.map
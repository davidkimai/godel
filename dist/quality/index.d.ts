/**
 * Quality Gate Framework - Main Export
 *
 * Unified module for linting, type checking, security scanning,
 * and quality gate evaluation.
 *
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
 */
export * from './types';
export { runESLint, runPrettier, runPylint, runMyPy, runRustfmt, runCargoCheck, runGolangciLint, runTypeScriptCheck, runSecurityScan, runLinters, lintAgentCodebase, type LinterRunnerOptions, type AgentLintOptions } from './linter';
export { calculateScore, calculateLintScore, calculateTypeScore, calculateCoverageScore, calculatePassRateScore, calculateSecurityScore, evaluateQualityGate, generateLintSummary, DEFAULT_GATES, parseCriteriaJson, createGateFromCriteria, formatGateResult, type GateEvaluationInput, type GateReportOptions } from './gates';
import type { LinterRunnerOptions } from './linter';
import type { LintResult } from './types';
/**
 * Quick lint function for a project
 */
export declare function quickLint(cwd: string, language?: LinterRunnerOptions['language']): Promise<{
    results: LintResult[];
    summary: {
        errors: number;
        warnings: number;
        score: number;
        passed: boolean;
    };
}>;
/**
 * Check if a project passes the default lint gate
 */
export declare function passesLintGate(cwd: string, language?: LinterRunnerOptions['language']): Promise<boolean>;
//# sourceMappingURL=index.d.ts.map
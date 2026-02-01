/**
 * Quality Gate Framework - Main Export
 * 
 * Unified module for linting, type checking, security scanning,
 * and quality gate evaluation.
 * 
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
 */

// Types
export * from './types';

// Linter Integration
export {
  runESLint,
  runPrettier,
  runPylint,
  runMyPy,
  runRustfmt,
  runCargoCheck,
  runGolangciLint,
  runTypeScriptCheck,
  runSecurityScan,
  runLinters,
  lintAgentCodebase,
  type LinterRunnerOptions,
  type AgentLintOptions
} from './linter';

// Quality Gates
export {
  calculateScore,
  calculateLintScore,
  calculateTypeScore,
  calculateCoverageScore,
  calculatePassRateScore,
  calculateSecurityScore,
  evaluateQualityGate,
  generateLintSummary,
  DEFAULT_GATES,
  parseCriteriaJson,
  createGateFromCriteria,
  formatGateResult,
  type GateEvaluationInput,
  type GateReportOptions
} from './gates';

// ============================================================================
// Convenience Functions
// ============================================================================

import { LintResult } from './types';
import { calculateLintScore, generateLintSummary } from './gates';
import { runLinters, LinterRunnerOptions } from './linter';

/**
 * Quick lint function for a project
 */
export async function quickLint(
  cwd: string,
  language: LinterRunnerOptions['language'] = 'all'
): Promise<{
  results: LintResult[];
  summary: {
    errors: number;
    warnings: number;
    score: number;
    passed: boolean;
  };
}> {
  const results = await runLinters({ cwd, language, includePrettier: true, includeTypes: true });
  const summary = generateLintSummary(results);
  
  return {
    results,
    summary: {
      errors: summary.aggregate.errors,
      warnings: summary.aggregate.warnings,
      score: summary.score,
      passed: summary.passed
    }
  };
}

/**
 * Check if a project passes the default lint gate
 */
export async function passesLintGate(
  cwd: string,
  language: LinterRunnerOptions['language'] = 'all'
): Promise<boolean> {
  const { summary } = await quickLint(cwd, language);
  return summary.passed;
}

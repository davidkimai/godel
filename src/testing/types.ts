/**
 * Test Types
 * 
 * Type definitions for test execution, results, and coverage.
 */

// Test framework type
export type TestFramework = 'jest' | 'vitest' | 'pytest' | 'unittest' | 'cargo' | 'go';

/**
 * Test configuration
 */
export interface TestConfig {
  framework: TestFramework;
  pattern: string;
  coverage?: boolean;
  incremental?: boolean;
  timeout?: number;
}

/**
 * Test discovery result
 */
export interface TestDiscoveryResult {
  files: TestFile[];
  totalCount: number;
}

/**
 * Test file discovered by the runner
 */
export interface TestFile {
  path: string;
  framework: TestFramework;
  testCount?: number;
  relativePath?: string;
  size?: number;
  modifiedAt?: Date;
}

/**
 * Test result from execution
 */
export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  file: string;
  error?: string;
}

/**
 * Test suite
 */
export interface TestSuite {
  name: string;
  file: string;
  tests: TestResult[];
  duration: number;
  timestamp: Date;
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
  success: boolean;
  summary: TestSummary;
  suites: TestSuite[];
  duration: number;
  exitCode: number;
}

/**
 * Test summary
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  duration: number;
}

/**
 * Test error
 */
export interface TestError {
  message: string;
  stack?: string;
  file?: string;
  line?: number;
}

/**
 * Coverage report
 */
export interface CoverageReport {
  path: string;
  framework: TestFramework;
  metrics: CoverageMetrics;
  files: FileCoverage[];
  timestamp: Date;
}

/**
 * File coverage data
 */
export interface FileCoverage {
  path: string;
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
}

/**
 * Coverage metric
 */
export interface CoverageMetric {
  covered: number;
  total: number;
  percentage: number;
}

/**
 * Coverage metrics aggregate
 */
export interface CoverageMetrics {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
}

/**
 * Spawn options for test processes
 */
export interface SpawnOptions {
  cwd: string;
  env?: Record<string, string>;
  stdio?: 'pipe' | 'inherit' | 'ignore';
  timeout?: number;
}

/**
 * Pattern match options
 */
export interface PatternMatchOptions {
  cwd?: string;
  ignore?: string[];
  absolute?: boolean;
}

/**
 * Changed file information
 */
export interface ChangedFile {
  path: string;
  changedAt: Date;
  type: 'added' | 'modified' | 'deleted';
}

/**
 * Incremental test result
 */
export interface IncrementalResult {
  changedFiles: ChangedFile[];
  affectedTests: TestFile[];
  totalTests: number;
  skippedTests: number;
}

/**
 * CLI options for test commands
 */
export interface TestCLIOptions {
  pattern?: string;
  coverage?: boolean;
  framework?: string;
  incremental?: boolean;
  timeout?: number;
  format?: 'json' | 'table';
  output?: string;
}

/**
 * Test template configuration
 */
export interface TestTemplate {
  name: string;
  description: string;
  framework: string;
  content: string;
  fileName?: string;
}

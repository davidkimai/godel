/**
 * Test Runner
 *
 * Test discovery, execution, and result parsing for multiple frameworks
 * Supports Jest, Vitest, pytest, unittest, cargo test, and go test
 */
import type { TestFramework, TestConfig, TestDiscoveryResult, TestFile, TestExecutionResult, ChangedFile } from './types';
/**
 * Detect the test framework based on project files
 */
export declare function detectFramework(cwd: string): TestFramework | null;
/**
 * Discover test files using glob patterns
 */
export declare function discoverTests(cwd: string, pattern?: string, ignorePatterns?: string[]): Promise<TestDiscoveryResult>;
/**
 * Execute tests and return results
 */
export declare function runTests(config: TestConfig, eventEmitter?: NodeJS.EventEmitter): Promise<TestExecutionResult>;
/**
 * Get changed files since a given time
 */
export declare function getChangedFiles(cwd: string, since: Date): Promise<ChangedFile[]>;
/**
 * Find tests affected by changed files
 */
export declare function findAffectedTests(cwd: string, changedFiles: ChangedFile[]): Promise<TestFile[]>;
/**
 * Run incremental tests (only changed/affected tests)
 */
export declare function runIncrementalTests(config: TestConfig, since: Date, eventEmitter?: NodeJS.EventEmitter): Promise<TestExecutionResult>;
//# sourceMappingURL=runner.d.ts.map
/**
 * Coverage Analyzer
 *
 * Parse coverage reports and calculate coverage metrics
 * Supports Istanbul, coverage.py, gcov, and Jacoco formats
 */
import type { CoverageReport, CoverageMetrics, TestFramework } from './types';
/**
 * Detect coverage format based on files
 */
export declare function detectCoverageFormat(cwd: string): 'istanbul' | 'coverage.py' | 'gcov' | 'jacoco' | null;
/**
 * Parse coverage report based on format
 */
export declare function parseCoverage(cwd: string, framework: TestFramework): Promise<CoverageReport>;
/**
 * Check coverage against thresholds
 */
export declare function checkCoverageThresholds(metrics: CoverageMetrics, thresholds: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
}): {
    passed: boolean;
    failures: string[];
};
/**
 * Generate coverage summary report
 */
export declare function formatCoverageSummary(metrics: CoverageMetrics): string;
/**
 * Generate coverage badge URL (for shields.io style badges)
 */
export declare function generateCoverageBadge(metrics: CoverageMetrics, type?: 'statements' | 'branches' | 'functions' | 'lines'): string;
//# sourceMappingURL=coverage.d.ts.map
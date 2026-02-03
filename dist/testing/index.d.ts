/**
 * Testing Module
 *
 * Test execution and coverage reporting for Dash
 */
export * from './types';
export { detectFramework, discoverTests, getChangedFiles, findAffectedTests, runTests, runIncrementalTests } from './runner';
export { detectCoverageFormat, parseCoverage, checkCoverageThresholds, formatCoverageSummary, generateCoverageBadge } from './coverage';
export { testsCommand } from './cli/commands/tests';
export { TEST_TEMPLATES, getTemplates, getTemplate, listTemplateNames, generateTest, GenerateTestResult } from './templates';
//# sourceMappingURL=index.d.ts.map
/**
 * Testing Module
 * 
 * Test execution and coverage reporting for Godel
 */

// Re-export types
export * from './types';

// Runner exports
export {
  detectFramework,
  discoverTests,
  getChangedFiles,
  findAffectedTests,
  runTests,
  runIncrementalTests
} from './runner';

// Coverage exports
export {
  detectCoverageFormat,
  parseCoverage,
  checkCoverageThresholds,
  formatCoverageSummary,
  generateCoverageBadge
} from './coverage';

// CLI Command
export { testsCommand } from './cli/commands/tests';

// Templates exports
export {
  TEST_TEMPLATES,
  getTemplates,
  getTemplate,
  listTemplateNames,
  generateTest,
  GenerateTestResult
} from './templates';

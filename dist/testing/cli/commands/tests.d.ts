/**
 * Tests CLI Command
 *
 * Commands for running and managing tests
 *
 * Usage:
 *   dash tests run <agent-id> [--pattern <glob>] [--coverage]
 *   dash tests generate <agent-id> --template <name>
 *   dash tests watch <agent-id>
 */
import { Command } from 'commander';
import type { TestFramework, TestExecutionResult } from '../../types';
/**
 * Get framework-specific test patterns
 */
export declare function getDefaultPatterns(framework: TestFramework | null): string[];
/**
 * Format test summary for display
 */
export declare function formatTestSummary(result: TestExecutionResult): string;
/**
 * List available test templates
 */
export declare function listTestTemplates(): Record<string, string>;
/**
 * Generate test template
 */
export declare function generateTestTemplate(options: {
    template: string;
    framework: TestFramework | null;
    outputDir: string;
    agentTask?: string;
}): {
    success: boolean;
    files: string[];
    error?: string;
};
/**
 * Get the tests command
 */
export declare function testsCommand(): Command;
export default testsCommand;
//# sourceMappingURL=tests.d.ts.map
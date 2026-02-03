"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultPatterns = getDefaultPatterns;
exports.formatTestSummary = formatTestSummary;
exports.listTestTemplates = listTestTemplates;
exports.generateTestTemplate = generateTestTemplate;
exports.testsCommand = testsCommand;
const path_1 = require("path");
const commander_1 = require("commander");
const index_1 = require("../../../storage/index");
const utils_1 = require("../../../utils");
const coverage_1 = require("../../coverage");
const runner_1 = require("../../runner");
/**
 * Get framework-specific test patterns
 */
function getDefaultPatterns(framework) {
    const patterns = {
        jest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
        vitest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
        pytest: ['**/test_*.py', '**/*_test.py'],
        unittest: ['**/test_*.py', '**/*_test.py'],
        cargo: ['**/tests/**/*.rs'],
        go: ['**/*_test.go']
    };
    return framework ? patterns[framework] : ['**/*.test.{ts,js,py,go,rs}'];
}
/**
 * Format test summary for display
 */
function formatTestSummary(result) {
    const lines = [];
    lines.push('Test Summary:');
    lines.push('='.repeat(50));
    lines.push(`Total: ${result.summary?.total || 0}`);
    lines.push(`Passed: ${result.summary?.passed || 0}`);
    lines.push(`Failed: ${result.summary?.failed || 0}`);
    lines.push(`Skipped: ${result.summary?.skipped || 0}`);
    lines.push(`Duration: ${result.duration || 0}ms`);
    return lines.join('\n');
}
/**
 * Find and parse coverage report
 */
async function findAndParseCoverage(cwd, format) {
    try {
        const detectedFormat = format === 'auto' ? undefined : format;
        return await (0, coverage_1.parseCoverage)(cwd, detectedFormat || 'jest');
    }
    catch {
        return null;
    }
}
/**
 * List available test templates
 */
function listTestTemplates() {
    return {
        'unit': 'Unit test template',
        'integration': 'Integration test template',
        'api': 'API endpoint test template',
        'component': 'React/Vue component test template',
        'python-unit': 'Python pytest unit test',
        'python-integration': 'Python pytest integration test',
        'rust-unit': 'Rust cargo unit test',
        'rust-integration': 'Rust cargo integration test',
        'go-unit': 'Go unit test',
        'go-integration': 'Go integration test'
    };
}
/**
 * Generate test template
 */
function generateTestTemplate(options) {
    const templates = {
        'unit': {
            jest: `import { describe, it, expect } from '@testing-library/react';
import { {{className}} } from './{{filename}}';

describe('{{className}}', () => {
  it('should render correctly', () => {
    // TODO: Implement test
    expect(true).toBe(true);
  });
});`,
            vitest: `import { describe, it, expect } from 'vitest';
import { {{className}} } from './{{filename}}';

describe('{{className}}', () => {
  it('should render correctly', () => {
    expect(true).toBe(true);
  });
});`,
            pytest: `import pytest
from {{filename}} import {{className}}


def test_{{className.lower()}}_creation():
    """Test {{className}} creation."""
    instance = {{className}}()
    assert instance is not None


class Test{{className}}:
    """Test cases for {{className}}."""

    def setup_method(self):
        """Set up test fixtures."""
        self.instance = {{className}}()

    def test_example(self):
        """Test example."""
        assert True
`,
            unittest: `import unittest
from {{filename}} import {{className}}


class Test{{className}}(unittest.TestCase):
    """Test cases for {{className}}."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.instance = {{className}}()
    
    def test_creation(self):
        """Test creation."""
        self.assertIsNotNone(self.instance)
`,
            cargo: `#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_{{name}}_creation() {
        let instance = {{ClassName}}::new();
        assert!(instance.is_ok());
    }
    
    #[test]
    fn test_{{name}}_basic_operation() {
        // TODO: Add test implementation
        assert!(true);
    }
}
`,
            go: `package main

import "testing"

func Test{{ClassName}}(t *testing.T) {
    // TODO: Implement test
    if true != true {
        t.Error("Test failed")
    }
}

func Test{{ClassName}}WithSetup(t *testing.T) {
    // TODO: Add setup and test
    t.Skip("Skipped test")
}
`
        }
    };
    const framework = options.framework || 'jest';
    const template = templates[options.template]?.[framework];
    if (!template) {
        return { success: false, files: [], error: `Template '${options.template}' not found for framework '${framework}'` };
    }
    return { success: true, files: [(0, path_1.join)(options.outputDir, `${options.template}_test.ts`)] };
}
/**
 * Get the tests command
 */
function testsCommand() {
    const program = new commander_1.Command('tests');
    program
        .description('Run tests and manage test coverage')
        .alias('test');
    // tests run
    program
        .command('run <agent-id>')
        .description('Run tests for an agent')
        .option('--pattern <glob>', 'Pattern to match test files (e.g., "**/*.test.ts")')
        .option('--coverage', 'Include coverage report')
        .option('--coverage-tool <tool>', 'Coverage tool (istanbul, coverage.py, gcov, auto)')
        .option('--changed-since <time>', 'Only run tests for changed files since time')
        .option('--args <args>', 'Additional arguments for test runner', (v) => v.split(','))
        .action(async (agentId, options) => {
        try {
            const agent = index_1.memoryStore.agents.get(agentId);
            if (!agent) {
                throw new Error(`Agent not found: ${agentId}`);
            }
            utils_1.logger.info(`Running tests for agent: ${agentId}`);
            utils_1.logger.info(`Task: ${agent.task}`);
            utils_1.logger.debug('─'.repeat(50));
            // Get working directory (agent's code directory)
            const workingDir = process.cwd();
            // Detect framework
            const detectedFramework = (0, runner_1.detectFramework)(workingDir);
            const framework = options.framework || detectedFramework || 'jest';
            // Show patterns being used
            const patterns = getDefaultPatterns(framework);
            if (options.pattern) {
                utils_1.logger.info(`Pattern: ${options.pattern}`);
            }
            else {
                utils_1.logger.info('Default patterns:');
                patterns.forEach(p => utils_1.logger.info(`  - ${p}`));
            }
            utils_1.logger.debug('');
            // Run tests
            const result = await (0, runner_1.runTests)({
                pattern: options.pattern || patterns[0],
                coverage: options.coverage,
                framework
            });
            // Display results
            utils_1.logger.info(formatTestSummary(result));
            // Emit test completion event
            const { createEvent } = await Promise.resolve().then(() => __importStar(require('../../../models/event')));
            const event = createEvent({
                type: 'test.completed',
                entityType: 'agent',
                entityId: agentId,
                payload: {
                    framework,
                    total: result.summary?.total || 0,
                    passed: result.summary?.passed || 0,
                    failed: result.summary?.failed || 0,
                    duration: result.duration
                }
            });
            index_1.memoryStore.events.create(event);
            // Exit with error code if tests failed
            if (!result.success) {
                process.exit(1);
            }
        }
        catch (error) {
            utils_1.logger.error('Error running tests:', { error });
            process.exit(1);
        }
    });
    // tests generate
    program
        .command('generate <agent-id>')
        .description('Generate test templates for an agent')
        .option('--template <name>', 'Template name (unit, integration, e2e, api)')
        .option('--output <path>', 'Output directory for generated tests')
        .option('--list', 'List available templates')
        .action(async (agentId, options) => {
        try {
            const agent = index_1.memoryStore.agents.get(agentId);
            if (options.list) {
                const templates = listTestTemplates();
                utils_1.logger.info('Available Test Templates:');
                utils_1.logger.debug('─'.repeat(40));
                for (const [name, desc] of Object.entries(templates)) {
                    utils_1.logger.info(`  ${name.padEnd(20)} - ${desc}`);
                }
                return;
            }
            if (!options.template) {
                throw new Error('Template name is required. Use --list to see available templates.');
            }
            const workingDir = process.cwd();
            const framework = (0, runner_1.detectFramework)(workingDir);
            const outputDir = options.output || (0, path_1.join)(workingDir, 'tests');
            utils_1.logger.info(`Generating test template for agent: ${agentId}`);
            utils_1.logger.info(`Framework: ${framework || 'unknown'}`);
            utils_1.logger.info(`Template: ${options.template}`);
            utils_1.logger.info(`Output: ${outputDir}`);
            utils_1.logger.debug('─'.repeat(50));
            const generated = generateTestTemplate({
                template: options.template,
                framework,
                outputDir,
                agentTask: agent?.task
            });
            if (!generated.success) {
                throw new Error(generated.error);
            }
            utils_1.logger.info(`Generated ${generated.files.length} file(s):`);
            for (const file of generated.files) {
                utils_1.logger.info(`  ✓ ${file}`);
            }
            utils_1.logger.info('Test template generated successfully!');
        }
        catch (error) {
            utils_1.logger.error('Error generating test:', { error });
            process.exit(1);
        }
    });
    // tests watch
    program
        .command('watch <agent-id>')
        .description('Watch for file changes and run tests')
        .option('--pattern <glob>', 'Pattern to match test files')
        .option('--coverage', 'Include coverage')
        .action(async (agentId) => {
        try {
            const agent = index_1.memoryStore.agents.get(agentId);
            if (!agent) {
                throw new Error(`Agent not found: ${agentId}`);
            }
            utils_1.logger.info(`Watch mode for agent: ${agentId}`);
            utils_1.logger.info('Press Ctrl+C to stop watching.');
            utils_1.logger.debug('─'.repeat(50));
            utils_1.logger.info('Note: File watching requires additional setup (chokidar or similar)');
            utils_1.logger.info('This is a placeholder for the watch functionality.');
            // In a full implementation, this would use chokidar or similar
            // to watch for file changes and re-run tests automatically
        }
        catch (error) {
            utils_1.logger.error('Error in watch mode:', { error });
            process.exit(1);
        }
    });
    // tests coverage
    program
        .command('coverage <agent-id>')
        .description('Show coverage report for an agent')
        .option('--format <istanbul|coverage.py|gcov|auto>', 'Coverage format', 'auto')
        .option('--threshold <value>', 'Coverage threshold percentage')
        .action(async (agentId, options) => {
        try {
            const agent = index_1.memoryStore.agents.get(agentId);
            if (!agent) {
                throw new Error(`Agent not found: ${agentId}`);
            }
            const workingDir = process.cwd();
            utils_1.logger.info(`Coverage report for agent: ${agentId}`);
            utils_1.logger.debug('─'.repeat(50));
            const coverage = await findAndParseCoverage(workingDir, options.format);
            if (!coverage) {
                utils_1.logger.info('No coverage report found.');
                utils_1.logger.info('Run tests with --coverage flag first.');
                return;
            }
            utils_1.logger.info((0, coverage_1.formatCoverageSummary)(coverage.metrics));
            if (options.threshold) {
                const result = (0, coverage_1.checkCoverageThresholds)(coverage.metrics, { statements: options.threshold });
                utils_1.logger.info(`Threshold Check: ${options.threshold}%`);
                utils_1.logger.debug('─'.repeat(40));
                if (result.passed) {
                    utils_1.logger.info('✓ Coverage meets threshold!');
                }
                else {
                    utils_1.logger.error('Coverage below threshold:');
                    for (const failure of result.failures) {
                        utils_1.logger.error(`  - ${failure}`);
                    }
                    process.exit(1);
                }
            }
        }
        catch (error) {
            utils_1.logger.error('Error showing coverage:', { error });
            process.exit(1);
        }
    });
    // tests list
    program
        .command('list')
        .description('List test files for the current project')
        .option('--framework <framework>', 'Filter by framework')
        .action(async (options) => {
        try {
            const workingDir = process.cwd();
            let framework = options.framework || null;
            if (!framework) {
                framework = (0, runner_1.detectFramework)(workingDir);
            }
            const patterns = getDefaultPatterns(framework);
            utils_1.logger.info(`Test files for framework: ${framework || 'auto-detected'}`);
            utils_1.logger.debug('─'.repeat(50));
            const files = await (0, runner_1.discoverTests)(workingDir, patterns[0]);
            if (files.files.length === 0) {
                utils_1.logger.info('No test files found.');
            }
            else {
                for (const file of files.files) {
                    utils_1.logger.info(`  ${file.path}`);
                }
            }
            utils_1.logger.info(`Total: ${files.totalCount} test file(s)`);
        }
        catch (error) {
            utils_1.logger.error('Error listing tests:', { error });
            process.exit(1);
        }
    });
    return program;
}
exports.default = testsCommand;
//# sourceMappingURL=tests.js.map
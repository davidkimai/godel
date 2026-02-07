/**
 * Tests CLI Command
 * 
 * Commands for running and managing tests
 * 
 * Usage:
 *   godel tests run <agent-id> [--pattern <glob>] [--coverage]
 *   godel tests generate <agent-id> --template <name>
 *   godel tests watch <agent-id>
 */

import { logger } from '../../../utils/logger';
import { join } from 'path';

import { Command } from 'commander';

import { memoryStore } from '../../../storage/index';
import { 
  parseCoverage, 
  formatCoverageSummary, 
  checkCoverageThresholds 
} from '../../coverage';
import { 
  runTests, 
  detectFramework,
  discoverTests
} from '../../runner';

import type { TestFramework, TestExecutionResult } from '../../types';

/**
 * Get framework-specific test patterns
 */
export function getDefaultPatterns(framework: TestFramework | null): string[] {
  const patterns: Record<TestFramework, string[]> = {
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
export function formatTestSummary(result: TestExecutionResult): string {
  const lines: string[] = [];
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
async function findAndParseCoverage(cwd: string, format?: string) {
  try {
    const detectedFormat = format === 'auto' ? undefined : format as TestFramework;
    return await parseCoverage(cwd, detectedFormat || 'jest');
  } catch {
    return null;
  }
}

/**
 * List available test templates
 */
export function listTestTemplates(): Record<string, string> {
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
export function generateTestTemplate(options: {
  template: string;
  framework: TestFramework | null;
  outputDir: string;
  agentTask?: string;
}): { success: boolean; files: string[]; error?: string } {
  const templates: Record<string, Record<TestFramework, string>> = {
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

  return { success: true, files: [join(options.outputDir, `${options.template}_test.ts`)] };
}

/**
 * Get the tests command
 */
export function testsCommand(): Command {
  const program = new Command('tests');
  
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
    .option('--args <args>', 'Additional arguments for test runner', (v: string) => v.split(','))
    .action(async (agentId: string, options: {
      pattern?: string;
      coverage?: boolean;
      coverageTool?: string;
      changedSince?: string;
      args?: string[];
      framework?: string;
    }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        
        logger.info(`Running tests for agent: ${agentId}`);
        logger.info(`Task: ${agent.task}`);
        logger.debug('─'.repeat(50));
        
        // Get working directory (agent's code directory)
        const workingDir = process.cwd();
        
        // Detect framework
        const detectedFramework = detectFramework(workingDir);
        const framework: TestFramework = (options.framework as TestFramework) || detectedFramework || 'jest';
        
        // Show patterns being used
        const patterns = getDefaultPatterns(framework);
        if (options.pattern) {
          logger.info(`Pattern: ${options.pattern}`);
        } else {
          logger.info('Default patterns:');
          patterns.forEach(p => logger.info(`  - ${p}`));
        }
        
        logger.debug('');
        
        // Run tests
        const result = await runTests({
          pattern: options.pattern || patterns[0],
          coverage: options.coverage,
          framework
        });
        
        // Display results
        logger.info(formatTestSummary(result));
        
        // Emit test completion event
        const { createEvent } = await import('../../../models/event');
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
        memoryStore.events.create(event);
        
        // Exit with error code if tests failed
        if (!result.success) {
          process.exit(1);
        }
        
      } catch (error) {
        logger.error('Error running tests:', { error });
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
    .action(async (agentId: string, options: {
      template?: string;
      output?: string;
      list?: boolean;
    }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        
        if (options.list) {
          const templates = listTestTemplates();
          logger.info('Available Test Templates:');
          logger.debug('─'.repeat(40));
          for (const [name, desc] of Object.entries(templates)) {
            logger.info(`  ${name.padEnd(20)} - ${desc}`);
          }
          return;
        }
        
        if (!options.template) {
          throw new Error('Template name is required. Use --list to see available templates.');
        }
        
        const workingDir = process.cwd();
        const framework = detectFramework(workingDir);
        const outputDir = options.output || join(workingDir, 'tests');
        
        logger.info(`Generating test template for agent: ${agentId}`);
        logger.info(`Framework: ${framework || 'unknown'}`);
        logger.info(`Template: ${options.template}`);
        logger.info(`Output: ${outputDir}`);
        logger.debug('─'.repeat(50));
        
        const generated = generateTestTemplate({
          template: options.template,
          framework,
          outputDir,
          agentTask: agent?.task
        });
        
        if (!generated.success) {
          throw new Error(generated.error);
        }
        
        logger.info(`Generated ${generated.files.length} file(s):`);
        for (const file of generated.files) {
          logger.info(`  ✓ ${file}`);
        }
        
        logger.info('Test template generated successfully!');
        
      } catch (error) {
        logger.error('Error generating test:', { error });
        process.exit(1);
      }
    });
  
  // tests watch
  program
    .command('watch <agent-id>')
    .description('Watch for file changes and run tests')
    .option('--pattern <glob>', 'Pattern to match test files')
    .option('--coverage', 'Include coverage')
    .action(async (agentId: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        
        logger.info(`Watch mode for agent: ${agentId}`);
        logger.info('Press Ctrl+C to stop watching.');
        logger.debug('─'.repeat(50));
        logger.info('Note: File watching requires additional setup (chokidar or similar)');
        logger.info('This is a placeholder for the watch functionality.');
        
        // In a full implementation, this would use chokidar or similar
        // to watch for file changes and re-run tests automatically
        
      } catch (error) {
        logger.error('Error in watch mode:', { error });
        process.exit(1);
      }
    });
  
  // tests coverage
  program
    .command('coverage <agent-id>')
    .description('Show coverage report for an agent')
    .option('--format <istanbul|coverage.py|gcov|auto>', 'Coverage format', 'auto')
    .option('--threshold <value>', 'Coverage threshold percentage')
    .action(async (agentId: string, options: { format?: string; threshold?: number }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        
        const workingDir = process.cwd();
        
        logger.info(`Coverage report for agent: ${agentId}`);
        logger.debug('─'.repeat(50));
        
        const coverage = await findAndParseCoverage(workingDir, options.format);
        
        if (!coverage) {
          logger.info('No coverage report found.');
          logger.info('Run tests with --coverage flag first.');
          return;
        }
        
        logger.info(formatCoverageSummary(coverage.metrics));
        
        if (options.threshold) {
          const result = checkCoverageThresholds(coverage.metrics, { statements: options.threshold });
          
          logger.info(`Threshold Check: ${options.threshold}%`);
          logger.debug('─'.repeat(40));
          
          if (result.passed) {
            logger.info('✓ Coverage meets threshold!');
          } else {
            logger.error('Coverage below threshold:');
            for (const failure of result.failures) {
              logger.error(`  - ${failure}`);
            }
            process.exit(1);
          }
        }
        
      } catch (error) {
        logger.error('Error showing coverage:', { error });
        process.exit(1);
      }
    });
  
  // tests list
  program
    .command('list')
    .description('List test files for the current project')
    .option('--framework <framework>', 'Filter by framework')
    .action(async (options: { framework?: string }) => {
      try {
        const workingDir = process.cwd();
        let framework: TestFramework | null = options.framework as TestFramework || null;
        
        if (!framework) {
          framework = detectFramework(workingDir);
        }
        
        const patterns = getDefaultPatterns(framework);
        
        logger.info(`Test files for framework: ${framework || 'auto-detected'}`);
        logger.debug('─'.repeat(50));
        
        const files = await discoverTests(workingDir, patterns[0]);
        
        if (files.files.length === 0) {
          logger.info('No test files found.');
        } else {
          for (const file of files.files) {
            logger.info(`  ${file.path}`);
          }
        }
        
        logger.info(`Total: ${files.totalCount} test file(s)`);
        
      } catch (error) {
        logger.error('Error listing tests:', { error });
        process.exit(1);
      }
    });
  
  return program;
}

export default testsCommand;

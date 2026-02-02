/**
 * Test Commands
 * 
 * CLI commands for test execution and coverage
 * 
 * Commands:
 * - run: Run tests for an agent's codebase
 * - generate: Generate test templates
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import {
  parseCoverage,
  formatCoverageSummary,
  checkCoverageThresholds
} from '../../testing/coverage';
import {
  discoverTests,
  runTests,
  runIncrementalTests,
  detectFramework
} from '../../testing/runner';
import { logger } from '../../utils/logger';
import { globalFormat, handleError, validateFormat } from '../main';

import type { TestConfig, TestFramework, TestTemplate } from '../../testing/types';

// Import fs at module level

export function testsCommand(): Command {
  const program = new Command('tests');
  
  program
    .description('Test execution and coverage commands')
    .alias('test');
  
  // tests run
  program
    .command('run <agent-id>')
    .description('Run tests for an agent\'s codebase')
    .option('--pattern <glob>', 'Test file pattern', '**/*.test.{ts,js,py,go,rs}')
    .option('--coverage', 'Include coverage analysis')
    .option('--changed-since <time>', 'Only run tests changed since time (e.g., "1h ago")')
    .option('--framework <jest|vitest|pytest|unittest|cargo|go>', 'Test framework to use')
    .action(async (agentId: string, options: {
      pattern?: string;
      coverage?: boolean;
      changedSince?: string;
      framework?: string;
      format?: string
    }) => {
      const format = validateFormat(globalFormat);
      
      try {
        // Find agent directory (in real implementation, would look up from storage)
        const agentDir = path.join(process.cwd(), 'agents', agentId);
        
        if (!fs.existsSync(agentDir)) {
          handleError(`Agent directory not found: ${agentDir}`);
        }
        
        // Detect or use specified framework
        let framework: TestFramework | undefined;
        if (options.framework) {
          framework = options.framework as TestFramework;
        } else {
          framework = detectFramework(agentDir) || 'jest';
        }
        
        const config: TestConfig = {
          framework,
          pattern: options.pattern || '**/*.test.{ts,js,py,go,rs}',
          coverage: options.coverage || false,
          incremental: !!options.changedSince
        };
        
        // Create event emitter for progress
        const eventEmitter = new EventEmitter();

        logger.info(`Running tests for agent ${agentId}...`);
        logger.info(`Framework: ${framework}`);
        logger.info(`Pattern: ${config.pattern}`);
        
        let result;
        if (options.changedSince) {
          // Parse time (simplified - would need more robust parsing in production)
          const sinceMatch = options.changedSince.match(/(\d+)([hm])/);
          const since = new Date();
          if (sinceMatch) {
            const valueStr = sinceMatch[1];
            const unit = sinceMatch[2];
            if (!valueStr || !unit) return;
            const value = parseInt(valueStr, 10);
            if (unit === 'h') {
              since.setHours(since.getHours() - value);
            } else if (unit === 'm') {
              since.setMinutes(since.getMinutes() - value);
            }
          }
          result = await runIncrementalTests(config, since, eventEmitter);
        } else {
          result = await runTests(config, eventEmitter);
        }
        
        // Output results
        if (format === 'json') {
          logger.info(JSON.stringify(result, null, 2));
        } else {
          logger.info('\n' + '='.repeat(50));
          logger.info('Test Results');
          logger.info('='.repeat(50));
          logger.info(`Total: ${result.summary.total}`);
          logger.info(`Passed: ${result.summary.passed}`);
          logger.info(`Failed: ${result.summary.failed}`);
          logger.info(`Skipped: ${result.summary.skipped}`);
          logger.info(`Duration: ${result.summary.duration}ms`);
          logger.info(`Exit Code: ${result.exitCode}`);

          if (result.summary.failed > 0) {
            logger.info('\nFailed Tests:');
            for (const suite of result.suites) {
              for (const test of suite.tests) {
                if (test.status === 'failed') {
                  logger.info(`  - ${test.name} (${suite.name})`);
                  if (test.error) {
                    logger.info(`    Error: ${test.error}`);
                  }
                }
              }
            }
          }
        }

        // Run coverage if requested
        if (options.coverage) {
          logger.info('\n' + '='.repeat(50));
          logger.info('Coverage Analysis');
          logger.info('='.repeat(50));

          const coverageReport = await parseCoverage(agentDir, framework);

          if (format === 'json') {
            logger.info(JSON.stringify(coverageReport, null, 2));
          } else {
            logger.info(formatCoverageSummary(coverageReport.metrics));
          }
        }
        
        process.exit(result.success ? 0 : 1);
      } catch (error) {
        handleError(error);
      }
    });
  
  // tests generate
  program
    .command('generate <agent-id>')
    .description('Generate test templates for an agent')
    .option('--template <name>', 'Template name to generate', 'basic')
    .option('--output <path>', 'Output file path')
    .option('--framework <jest|vitest|pytest|unittest|cargo|go>', 'Test framework')
    .action(async (agentId: string, options: {
      template?: string;
      output?: string;
      framework?: string;
      format?: string
    }) => {
      const format = validateFormat(globalFormat);
      
      try {
        const agentDir = path.join(process.cwd(), 'agents', agentId);
        
        if (!fs.existsSync(agentDir)) {
          handleError(`Agent directory not found: ${agentDir}`);
        }
        
        // Detect framework
        const framework = (options.framework as TestFramework) || detectFramework(agentDir) || 'jest';
        
        const template = generateTestTemplate(framework, options.template || 'basic');
        const outputPath = options.output || path.join(agentDir, `test_${agentId}.${getExtension(framework)}`);

        await fs.promises.writeFile(outputPath, template.content);

        if (format === 'json') {
          logger.info(JSON.stringify({ template, outputPath }, null, 2));
        } else {
          logger.info(`Generated test template: ${template.name}`);
          logger.info(`Framework: ${framework}`);
          logger.info(`Output: ${outputPath}`);
          logger.info(`\nDescription: ${template.description}`);
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // tests discover
  program
    .command('discover <agent-id>')
    .description('Discover test files for an agent')
    .option('--pattern <glob>', 'Test file pattern', '**/*.test.{ts,js,py,go,rs}')
    .action(async (agentId: string, options: { pattern?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        const agentDir = path.join(process.cwd(), 'agents', agentId);
        
        if (!fs.existsSync(agentDir)) {
          handleError(`Agent directory not found: ${agentDir}`);
        }
        
        const result = await discoverTests(agentDir, options.pattern);

        if (format === 'json') {
          logger.info(JSON.stringify(result, null, 2));
        } else {
          logger.info(`Discovered ${result.totalCount} test file(s):`);
          for (const file of result.files) {
            logger.info(`  - ${file.path} (${file.framework}, ~${file.testCount || '?'} tests)`);
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // tests coverage
  program
    .command('coverage <agent-id>')
    .description('Show coverage report for an agent')
    .option('--threshold <json>', 'Coverage thresholds JSON')
    .action(async (agentId: string, options: { threshold?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        const agentDir = path.join(process.cwd(), 'agents', agentId);
        
        if (!fs.existsSync(agentDir)) {
          handleError(`Agent directory not found: ${agentDir}`);
        }
        
        const framework = detectFramework(agentDir) || 'jest';
        const report = await parseCoverage(agentDir, framework);
        
        if (format === 'json') {
          logger.info(JSON.stringify(report, null, 2));
        } else {
          logger.info(formatCoverageSummary(report.metrics));

          if (options.threshold) {
            const thresholds = JSON.parse(options.threshold);
            const check = checkCoverageThresholds(report.metrics, thresholds);

            logger.info('\n' + '='.repeat(50));
            if (check.passed) {
              logger.info('✓ All coverage thresholds passed!');
            } else {
              logger.info('✗ Coverage thresholds failed:');
              for (const failure of check.failures) {
                logger.info(`  - ${failure}`);
              }
            }
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  return program;
}

/**
 * Get file extension for framework
 */
function getExtension(framework: TestFramework): string {
  const extensions: Record<TestFramework, string> = {
    jest: 'ts',
    vitest: 'ts',
    pytest: 'py',
    unittest: 'py',
    cargo: 'rs',
    go: 'go'
  };
  return extensions[framework] || 'ts';
}

/**
 * Generate a test template
 */
function generateTestTemplate(framework: TestFramework, templateName: string): TestTemplate {
  const templates: Record<TestFramework, Record<string, TestTemplate>> = {
    jest: {
      basic: {
        name: 'Jest Basic Test',
        framework: 'jest',
        description: 'Basic Jest test template',
        content: `/**
 * Basic Jest Test Template
 */

describe('${templateName}', () => {
  beforeAll(() => {
    // Setup before all tests
  });

  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  afterAll(() => {
    // Cleanup after all tests
  });

  test('should handle basic functionality', () => {
    // Test implementation
    expect(true).toBe(true);
  });

  test('should handle edge cases', () => {
    // Edge case test
    expect(() => {}).not.toThrow();
  });
});
`
      }
    },
    vitest: {
      basic: {
        name: 'Vitest Basic Test',
        framework: 'vitest',
        description: 'Basic Vitest test template',
        content: `/**
 * Basic Vitest Test Template
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

describe('${templateName}', () => {
  beforeAll(() => {
    // Setup before all tests
  });

  beforeEach(() => {
    // Setup before each test
  });

  it('should handle basic functionality', () => {
    // Test implementation
    expect(true).toBe(true);
  });

  it('should handle edge cases', () => {
    // Edge case test
    expect(() => {}).not.toThrow();
  });
});
`
      }
    },
    pytest: {
      basic: {
        name: 'Pytest Basic Test',
        framework: 'pytest',
        description: 'Basic pytest test template',
        content: `"""
Basic Pytest Test Template
"""
import pytest


class Test${templateName.replace(/\s+/g, '')}:
    """Test class for ${templateName}"""
    
    def setup_method(self):
        """Setup before each test"""
        pass
    
    def teardown_method(self):
        """Cleanup after each test"""
        pass
    
    def test_basic_functionality(self):
        """Test basic functionality"""
        assert True
    
    def test_edge_cases(self):
        """Test edge cases"""
        with pytest.raises(Exception):
            pass
`
      }
    },
    unittest: {
      basic: {
        name: 'Unittest Basic Test',
        framework: 'unittest',
        description: 'Basic unittest test template',
        content: `"""
Basic Unittest Test Template
"""
import unittest


class Test${templateName.replace(/\s+/g, '')}(unittest.TestCase):
    """Test class for ${templateName}"""
    
    def setUp(self):
        """Setup before each test"""
        pass
    
    def tearDown(self):
        """Cleanup after each test"""
        pass
    
    def test_basic_functionality(self):
        """Test basic functionality"""
        self.assertTrue(True)
    
    def test_edge_cases(self):
        """Test edge cases"""
        with self.assertRaises(Exception):
            pass
`
      }
    },
    cargo: {
      basic: {
        name: 'Cargo Basic Test',
        framework: 'cargo',
        description: 'Basic Rust cargo test template',
        content: `/**
 * Basic Cargo Test Template
 */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_functionality() {
        // Test implementation
        assert!(true);
    }

    #[test]
    fn test_edge_cases() {
        // Edge case test
        assert_ne!(1, 0);
    }

    #[test]
    #[should_panic(expected = "specific panic message")]
    fn test_should_panic() {
        // Test expected panic
        panic!("specific panic message");
    }

    #[test]
    fn test_with_result() -> Result<(), String> {
        // Test using Result type
        Ok(())
    }
}
`
      }
    },
    go: {
      basic: {
        name: 'Go Basic Test',
        framework: 'go',
        description: 'Basic Go test template',
        content: `package main

import (
	"testing"
)

// Test functions for ${templateName}

func TestBasicFunctionality(t *testing.T) {
	// Test implementation
	t.Log("Running basic functionality test")
	
	// Assertions
	if true != true {
		t.Error("Basic assertion failed")
	}
}

func TestEdgeCases(t *testing.T) {
	// Edge case test
	t.Log("Running edge cases test")
	
	// Test with subtests
	t.Run("subtest 1", func(t *testing.T) {
		t.Skip("Skipping subtest")
	})
}

func BenchmarkExample(b *testing.B) {
	// Benchmark function
	for i := 0; i < b.N; i++ {
		// Code to benchmark
		_ = i
	}
}
`
      }
    }
  };

  const template = templates[framework]?.[templateName];
  return template ?? templates.jest['basic'];
}

export default testsCommand;

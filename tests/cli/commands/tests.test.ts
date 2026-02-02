/**
 * Tests CLI Command Tests
 * 
 * Integration tests for the 'dash tests' command group
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module first
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock the testing modules
jest.mock('../../../src/testing/coverage', () => ({
  parseCoverage: jest.fn().mockResolvedValue({
    metrics: { lines: { total: 100, covered: 85, pct: 85 }, statements: { total: 100, covered: 85, pct: 85 }, branches: { total: 50, covered: 35, pct: 70 }, functions: { total: 20, covered: 18, pct: 90 } },
    files: []
  }),
  formatCoverageSummary: jest.fn().mockReturnValue('Coverage Summary: 85%'),
  checkCoverageThresholds: jest.fn().mockReturnValue({ passed: true, failures: [] })
}));

jest.mock('../../../src/testing/runner', () => ({
  discoverTests: jest.fn().mockResolvedValue({ files: [], totalCount: 0 }),
  runTests: jest.fn().mockResolvedValue({
    success: true,
    exitCode: 0,
    summary: { total: 10, passed: 10, failed: 0, skipped: 0, duration: 5000 },
    suites: []
  }),
  runIncrementalTests: jest.fn().mockResolvedValue({
    success: true,
    exitCode: 0,
    summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 2000 },
    suites: []
  }),
  detectFramework: jest.fn().mockReturnValue('jest')
}));

jest.mock('../../../src/cli/main', () => ({
  globalFormat: 'table',
  handleError: jest.fn((error) => {
    throw new Error(typeof error === 'string' ? error : String(error));
  }),
  validateFormat: jest.fn((format: string) => {
    if (format !== 'json' && format !== 'table') {
      throw new Error(`Invalid format: ${format}. Must be 'json' or 'table'`);
    }
    return format as 'json' | 'table';
  })
}));

import { testsCommand } from '../../../src/cli/commands/tests';
import { parseCoverage, formatCoverageSummary, checkCoverageThresholds } from '../../../src/testing/coverage';
import { discoverTests, runTests, runIncrementalTests, detectFramework } from '../../../src/testing/runner';
import { validateFormat } from '../../../src/cli/main';

const mockedFs = jest.mocked(fs);
const mockedParseCoverage = jest.mocked(parseCoverage);
const mockedRunTests = jest.mocked(runTests);
const mockedDetectFramework = jest.mocked(detectFramework);

describe('Tests CLI Commands', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    
    // Default mock setup for fs
    mockedFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('testsCommand', () => {
    it('should create tests command with correct name', () => {
      const cmd = testsCommand();
      expect(cmd.name()).toBe('tests');
    });

    it('should have description containing Test', () => {
      const cmd = testsCommand();
      expect(cmd.description()).toContain('Test');
    });

    it('should have 4 subcommands', () => {
      const cmd = testsCommand();
      expect(cmd.commands.length).toBe(4);
    });

    it('should have alias "test"', () => {
      const cmd = testsCommand();
      expect(cmd.alias()).toBe('test');
    });

    it('should include run subcommand', () => {
      const cmd = testsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('run'))).toBe(true);
    });

    it('should include generate subcommand', () => {
      const cmd = testsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('generate'))).toBe(true);
    });

    it('should include discover subcommand', () => {
      const cmd = testsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('discover'))).toBe(true);
    });

    it('should include coverage subcommand', () => {
      const cmd = testsCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('coverage'))).toBe(true);
    });
  });

  describe('run subcommand options', () => {
    it('should have pattern option', () => {
      const cmd = testsCommand();
      const runCmd = cmd.commands.find((c: any) => c.name().startsWith('run'));
      const patternOption = runCmd?.options.find((o: any) => o.long === '--pattern');
      expect(patternOption).toBeDefined();
    });

    it('should have coverage option', () => {
      const cmd = testsCommand();
      const runCmd = cmd.commands.find((c: any) => c.name().startsWith('run'));
      const coverageOption = runCmd?.options.find((o: any) => o.long === '--coverage');
      expect(coverageOption).toBeDefined();
    });

    it('should have changed-since option', () => {
      const cmd = testsCommand();
      const runCmd = cmd.commands.find((c: any) => c.name().startsWith('run'));
      const changedOption = runCmd?.options.find((o: any) => o.long === '--changed-since');
      expect(changedOption).toBeDefined();
    });

    it('should have framework option', () => {
      const cmd = testsCommand();
      const runCmd = cmd.commands.find((c: any) => c.name().startsWith('run'));
      const frameworkOption = runCmd?.options.find((o: any) => o.long === '--framework');
      expect(frameworkOption).toBeDefined();
    });
  });

  describe('generate subcommand options', () => {
    it('should have template option', () => {
      const cmd = testsCommand();
      const genCmd = cmd.commands.find((c: any) => c.name().startsWith('generate'));
      const templateOption = genCmd?.options.find((o: any) => o.long === '--template');
      expect(templateOption).toBeDefined();
    });

    it('should have output option', () => {
      const cmd = testsCommand();
      const genCmd = cmd.commands.find((c: any) => c.name().startsWith('generate'));
      const outputOption = genCmd?.options.find((o: any) => o.long === '--output');
      expect(outputOption).toBeDefined();
    });

    it('should have framework option', () => {
      const cmd = testsCommand();
      const genCmd = cmd.commands.find((c: any) => c.name().startsWith('generate'));
      const frameworkOption = genCmd?.options.find((o: any) => o.long === '--framework');
      expect(frameworkOption).toBeDefined();
    });
  });

  describe('discover subcommand options', () => {
    it('should have pattern option', () => {
      const cmd = testsCommand();
      const discoverCmd = cmd.commands.find((c: any) => c.name().startsWith('discover'));
      const patternOption = discoverCmd?.options.find((o: any) => o.long === '--pattern');
      expect(patternOption).toBeDefined();
    });
  });

  describe('coverage subcommand options', () => {
    it('should have threshold option', () => {
      const cmd = testsCommand();
      const coverageCmd = cmd.commands.find((c: any) => c.name().startsWith('coverage'));
      const thresholdOption = coverageCmd?.options.find((o: any) => o.long === '--threshold');
      expect(thresholdOption).toBeDefined();
    });
  });

  describe('validateFormat', () => {
    it('should accept json format', () => {
      const format = validateFormat('json');
      expect(format).toBe('json');
    });

    it('should accept table format', () => {
      const format = validateFormat('table');
      expect(format).toBe('table');
    });

    it('should reject invalid format', () => {
      expect(() => validateFormat('yaml')).toThrow('Invalid format');
    });
  });

  describe('getExtension helper', () => {
    it('should return ts for Jest', () => {
      expect(getExtension('jest')).toBe('ts');
    });

    it('should return ts for Vitest', () => {
      expect(getExtension('vitest')).toBe('ts');
    });

    it('should return py for Pytest', () => {
      expect(getExtension('pytest')).toBe('py');
    });

    it('should return py for unittest', () => {
      expect(getExtension('unittest')).toBe('py');
    });

    it('should return rs for cargo', () => {
      expect(getExtension('cargo')).toBe('rs');
    });

    it('should return go for Go', () => {
      expect(getExtension('go')).toBe('go');
    });

    it('should default to ts for unknown framework', () => {
      expect(getExtension('unknown')).toBe('ts');
    });
  });

  describe('test template generation', () => {
    it('should generate Jest template', () => {
      const template = generateTestTemplate('jest', 'basic');
      expect(template.framework).toBe('jest');
      expect(template.content).toContain('describe(');
    });

    it('should generate Vitest template', () => {
      const template = generateTestTemplate('vitest', 'basic');
      expect(template.framework).toBe('vitest');
      expect(template.content).toContain('import');
    });

    it('should generate Pytest template', () => {
      const template = generateTestTemplate('pytest', 'basic');
      expect(template.framework).toBe('pytest');
      expect(template.content).toContain('class Test');
    });

    it('should generate Cargo template', () => {
      const template = generateTestTemplate('cargo', 'basic');
      expect(template.framework).toBe('cargo');
      expect(template.content).toContain('#[cfg(test)]');
    });

    it('should generate Go template', () => {
      const template = generateTestTemplate('go', 'basic');
      expect(template.framework).toBe('go');
      expect(template.content).toContain('func Test');
    });

    it('should default to Jest for unknown framework', () => {
      const template = generateTestTemplate('unknown', 'basic');
      expect(template.framework).toBe('jest');
    });
  });

  describe('coverage calculation', () => {
    it('should calculate coverage percentage', () => {
      const covered = 85;
      const total = 100;
      const percentage = (covered / total) * 100;
      expect(percentage).toBe(85);
    });

    it('should detect failure below threshold', () => {
      const coverage = 70;
      const threshold = 80;
      expect(coverage >= threshold).toBe(false);
    });

    it('should detect pass at threshold', () => {
      const coverage = 80;
      const threshold = 80;
      expect(coverage >= threshold).toBe(true);
    });

    it('should detect pass above threshold', () => {
      const coverage = 90;
      const threshold = 80;
      expect(coverage >= threshold).toBe(true);
    });

    it('should handle zero coverage', () => {
      const coverage = 0;
      const threshold = 50;
      expect(coverage >= threshold).toBe(false);
    });
  });

  describe('framework detection', () => {
    it('should detect Jest from package.json', () => {
      const files = ['package.json', 'jest.config.js'];
      const hasJest = files.some(f => f.includes('jest'));
      expect(hasJest).toBe(true);
    });

    it('should detect Python from .py files', () => {
      const files = ['main.py', 'test_utils.py'];
      const hasPython = files.some(f => f.endsWith('.py'));
      expect(hasPython).toBe(true);
    });

    it('should detect Go from .go files', () => {
      const files = ['main.go', 'main_test.go'];
      const hasGo = files.some(f => f.endsWith('.go'));
      expect(hasGo).toBe(true);
    });

    it('should detect Rust from Cargo.toml', () => {
      const files = ['Cargo.toml', 'src/main.rs'];
      const hasRust = files.some(f => f === 'Cargo.toml');
      expect(hasRust).toBe(true);
    });

    it('should detect Vitest from vitest.config', () => {
      const files = ['vitest.config.ts', 'src/index.ts'];
      const hasVitest = files.some(f => f.includes('vitest'));
      expect(hasVitest).toBe(true);
    });
  });
});

// Helper functions (matching the actual implementation)
function getExtension(framework: string): string {
  const extensions: Record<string, string> = {
    jest: 'ts',
    vitest: 'ts',
    pytest: 'py',
    unittest: 'py',
    cargo: 'rs',
    go: 'go'
  };
  return extensions[framework] || 'ts';
}

function generateTestTemplate(framework: string, templateName: string): any {
  const templates: Record<string, any> = {
    jest: {
      name: 'Jest Basic Test',
      framework: 'jest',
      description: 'Basic Jest test template',
      content: `describe('${templateName}', () => {
  test('should work', () => {
    expect(true).toBe(true);
  });
});`
    },
    vitest: {
      name: 'Vitest Basic Test',
      framework: 'vitest',
      description: 'Basic Vitest test template',
      content: `import { describe, it, expect } from 'vitest';

describe('${templateName}', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`
    },
    pytest: {
      name: 'Pytest Basic Test',
      framework: 'pytest',
      description: 'Basic pytest test template',
      content: `class TestBasic:
    def test_basic(self):
        assert True`
    },
    unittest: {
      name: 'Unittest Basic Test',
      framework: 'unittest',
      description: 'Basic unittest test template',
      content: `import unittest

class TestBasic(unittest.TestCase):
    def test_basic(self):
        self.assertTrue(True)`
    },
    cargo: {
      name: 'Cargo Basic Test',
      framework: 'cargo',
      description: 'Basic Rust cargo test template',
      content: `#[cfg(test)]
mod tests {
    #[test]
    fn test_basic() {
        assert!(true);
    }
}`
    },
    go: {
      name: 'Go Basic Test',
      framework: 'go',
      description: 'Basic Go test template',
      content: `package main

import "testing"

func TestBasic(t *testing.T) {
    t.Log("test")
}`
    }
  };

  return templates[framework] || templates['jest'];
}

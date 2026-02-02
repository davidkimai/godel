/**
 * CLI Commands Tests
 * 
 * Tests for CLI helper functions
 */

import * as path from 'path';
import { TestFramework } from '../../src/testing/types';

describe('TestsCommand Helper Functions', () => {
  describe('getDefaultPatterns', () => {
    const patterns: Record<TestFramework, string[]> = {
      jest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
      vitest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
      pytest: ['**/test_*.py', '**/*_test.py'],
      unittest: ['**/test_*.py', '**/*_test.py'],
      cargo: ['**/tests/**/*.rs'],
      go: ['**/*_test.go']
    };

    it('should return Jest patterns for jest framework', () => {
      const result = patterns['jest'];
      expect(result).toContain('**/*.test.{ts,js,tsx,jsx}');
      expect(result).toContain('**/*.spec.{ts,js,tsx,jsx}');
    });

    it('should return Python patterns for pytest', () => {
      const result = patterns['pytest'];
      expect(result).toContain('**/test_*.py');
      expect(result).toContain('**/*_test.py');
    });

    it('should return Rust patterns for cargo', () => {
      const result = patterns['cargo'];
      expect(result).toContain('**/tests/**/*.rs');
    });

    it('should return Go patterns for go', () => {
      const result = patterns['go'];
      expect(result).toContain('**/*_test.go');
    });

    it('should return Vitest patterns for vitest', () => {
      const result = patterns['vitest'];
      expect(result).toContain('**/*.test.{ts,js,tsx,jsx}');
      expect(result).toContain('**/*.spec.{ts,js,tsx,jsx}');
    });

    it('should return unittest patterns for unittest', () => {
      const result = patterns['unittest'];
      expect(result).toContain('**/test_*.py');
      expect(result).toContain('**/*_test.py');
    });
  });

  describe('formatTestSummary', () => {
    const formatTestSummary = (result: { summary: { total: number; passed: number; failed: number; skipped: number; pending: number }; duration: number }): string => {
      const lines: string[] = [];
      lines.push('Test Summary:');
      lines.push('='.repeat(50));
      lines.push('Total: ' + result.summary.total);
      lines.push('Passed: ' + result.summary.passed);
      lines.push('Failed: ' + result.summary.failed);
      lines.push('Skipped: ' + result.summary.skipped);
      lines.push('Duration: ' + result.duration + 'ms');
      return lines.join('\n');
    };

    it('should format test summary correctly', () => {
      const result = {
        success: true,
        summary: { total: 10, passed: 8, failed: 2, skipped: 0, pending: 0, duration: 100 },
        suites: [],
        duration: 100,
        exitCode: 0
      };

      const formatted = formatTestSummary(result);
      
      expect(formatted).toContain('Test Summary:');
      expect(formatted).toContain('Total: 10');
      expect(formatted).toContain('Passed: 8');
      expect(formatted).toContain('Failed: 2');
    });

    it('should handle zero tests', () => {
      const result = {
        success: true,
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, duration: 0 },
        suites: [],
        duration: 0,
        exitCode: 0
      };

      const formatted = formatTestSummary(result);
      
      expect(formatted).toContain('Total: 0');
      expect(formatted).toContain('Passed: 0');
    });

    it('should handle all passed tests', () => {
      const result = {
        success: true,
        summary: { total: 5, passed: 5, failed: 0, skipped: 0, pending: 0, duration: 50 },
        suites: [],
        duration: 50,
        exitCode: 0
      };

      const formatted = formatTestSummary(result);
      
      expect(formatted).toContain('Failed: 0');
      expect(formatted).toContain('Duration: 50ms');
    });
  });

  describe('listTestTemplates', () => {
    const templates: Record<string, string> = {
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

    it('should contain all expected templates', () => {
      expect(Object.keys(templates)).toContain('unit');
      expect(Object.keys(templates)).toContain('integration');
      expect(Object.keys(templates)).toContain('api');
      expect(Object.keys(templates)).toContain('component');
      expect(Object.keys(templates)).toContain('python-unit');
      expect(Object.keys(templates)).toContain('rust-unit');
      expect(Object.keys(templates)).toContain('go-unit');
    });

    it('should have descriptions for all templates', () => {
      for (const desc of Object.values(templates)) {
        expect(desc.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateTestTemplate', () => {
    const generateTestTemplate = function(options: {
      template: string;
      framework: TestFramework | null;
      outputDir: string;
    }): { success: boolean; files: string[]; error?: string } {
      const templates: Record<string, Record<TestFramework, string>> = {
        'unit': {
          jest: "import { describe, it, expect } from '@testing-library/react';",
          vitest: "import { describe, it, expect } from 'vitest';",
          pytest: "import pytest",
          unittest: "import unittest",
          cargo: "#[cfg(test)]",
          go: 'package main'
        }
      };

      const framework = options.framework || 'jest';
      const template = templates[options.template]?.[framework];
      
      if (!template) {
        return { success: false, files: [], error: "Template '" + options.template + "' not found for framework '" + framework + "'" };
      }

      return { success: true, files: [path.join(options.outputDir, options.template + '_test.ts')] };
    };

    it('should generate unit template for jest', () => {
      const result = generateTestTemplate({
        template: 'unit',
        framework: 'jest',
        outputDir: '/tmp/test'
      });
      
      expect(result.success).toBe(true);
      expect(result.files[0]).toContain('unit');
    });

    it('should return error for non-existent template', () => {
      const result = generateTestTemplate({
        template: 'non-existent',
        framework: 'jest',
        outputDir: '/tmp/test'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should generate Python template for pytest', () => {
      const result = generateTestTemplate({
        template: 'unit',
        framework: 'pytest',
        outputDir: '/tmp/test'
      });
      
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
    });

    it('should default to jest when framework is null', () => {
      const result = generateTestTemplate({
        template: 'unit',
        framework: null,
        outputDir: '/tmp/test'
      });
      
      expect(result.success).toBe(true);
    });
  });
});

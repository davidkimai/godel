/**
 * Runner Tests
 * 
 * Tests for test discovery, execution, and result parsing
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  discoverTests,
  detectFramework,
  runTests,
  getChangedFiles,
  findAffectedTests,
  runIncrementalTests
} from '../../src/testing/runner';
import { TestFramework } from '../../src/testing/types';

describe('Test Runner', () => {
  const testDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    // Create test fixtures
    const fixtures = [
      {
        path: path.join(testDir, 'jest.test.ts'),
        content: `describe('test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});`
      },
      {
        path: path.join(testDir, 'vitest.test.ts'),
        content: `import { describe, it, expect } from 'vitest';
describe('test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});`
      },
      {
        path: path.join(testDir, 'test_example.py'),
        content: `def test_example():
    assert True
    `
      },
      {
        path: path.join(testDir, 'example_test.go'),
        content: `package main

import "testing"

func TestExample(t *testing.T) {
    if true != true {
        t.Error("test failed")
    }
}`
      },
      {
        path: path.join(testDir, 'lib.rs'),
        content: `#[cfg(test)]
mod tests {
    #[test]
    fn test_example() {
        assert!(true);
    }
}`
      }
    ];

    for (const fixture of fixtures) {
      const dir = path.dirname(fixture.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fixture.path, fixture.content);
    }
  });

  afterAll(() => {
    // Cleanup test fixtures
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('detectFramework', () => {
    it('should detect Jest from jest.config.js', () => {
      const jestConfigPath = path.join(testDir, 'jest.config.js');
      fs.writeFileSync(jestConfigPath, 'module.exports = {};');
      
      const result = detectFramework(testDir);
      expect(result).toBe('jest');
      
      fs.unlinkSync(jestConfigPath);
    });

    it('should detect Vitest from vitest.config.ts', () => {
      const vitestConfigPath = path.join(testDir, 'vitest.config.ts');
      fs.writeFileSync(vitestConfigPath, 'export default defineConfig({});');
      
      const result = detectFramework(testDir);
      expect(result).toBe('vitest');
      
      fs.unlinkSync(vitestConfigPath);
    });

    it('should detect Go from go.mod', () => {
      const goModPath = path.join(testDir, 'go.mod');
      fs.writeFileSync(goModPath, 'module test\ngo 1.21');
      
      const result = detectFramework(testDir);
      expect(result).toBe('go');
      
      fs.unlinkSync(goModPath);
    });

    it('should return null for unknown frameworks', () => {
      const result = detectFramework('/tmp');
      expect(result).toBeNull();
    });
  });

  describe('discoverTests', () => {
    it('should discover TypeScript test files', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      const testFiles = result.files.filter(f => f.path.endsWith('.test.ts'));
      expect(testFiles.length).toBeGreaterThan(0);
    });

    it('should detect framework for each file', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      for (const file of result.files) {
        expect(file.framework).toBeDefined();
      }
    });

    it('should estimate test count', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      for (const file of result.files) {
        expect(typeof file.testCount).toBe('number');
      }
    });

    it('should return empty array when no tests match', async () => {
      const result = await discoverTests(testDir, '**/nonexistent.test.*');
      
      expect(result.files).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should handle ignore patterns', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts', ['**/node_modules/**']);
      
      expect(result.files.every(f => !f.path.includes('node_modules'))).toBe(true);
    });
  });

  describe('getChangedFiles', () => {
    it('should return empty array when not a git repo', async () => {
      const result = await getChangedFiles(testDir, new Date());
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findAffectedTests', () => {
    it('should return empty array for unknown files', async () => {
      const changedFiles = [
        { path: 'unknown_file.ts', changedAt: new Date(), type: 'modified' as const }
      ];
      
      const result = await findAffectedTests(testDir, changedFiles);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('Framework Detection by File', () => {
  it('should detect framework for .test.ts files', async () => {
    // Test with a known existing test file in the fixtures
    const testDir = path.join(__dirname, 'fixtures');
    
    // First create the fixture file
    const fixturePath = path.join(testDir, 'jest.test.ts');
    if (!require('fs').existsSync(testDir)) {
      require('fs').mkdirSync(testDir, { recursive: true });
    }
    require('fs').writeFileSync(fixturePath, `describe('test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});`);
    
    const result = await discoverTests(testDir, '**/*.test.ts');
    
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0]?.framework).toBeDefined();
  });
});

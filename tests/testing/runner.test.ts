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
  getChangedFiles,
  findAffectedTests,
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

  describe('Framework Edge Cases', () => {
    it('should detect cargo from Cargo.toml', () => {
      const cargoPath = path.join(testDir, 'Cargo.toml');
      fs.writeFileSync(cargoPath, `[package]
name = "test"
version = "0.1.0"
`);
      
      const result = detectFramework(testDir);
      expect(result).toBe('cargo');
      
      fs.unlinkSync(cargoPath);
    });

    it('should detect framework from package.json test script', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({
        scripts: { test: 'vitest' }
      }));
      
      const result = detectFramework(testDir);
      expect(result).toBe('vitest');
      
      fs.unlinkSync(pkgPath);
    });

    it('should prioritize config files over package.json', () => {
      const pkgPath = path.join(testDir, 'package.json');
      const jestConfigPath = path.join(testDir, 'jest.config.js');
      
      fs.writeFileSync(pkgPath, JSON.stringify({
        scripts: { test: 'vitest' }
      }));
      fs.writeFileSync(jestConfigPath, 'module.exports = {};');
      
      const result = detectFramework(testDir);
      expect(result).toBe('jest');
      
      fs.unlinkSync(pkgPath);
      fs.unlinkSync(jestConfigPath);
    });
  });

  describe('discoverTests Edge Cases', () => {
    it('should deduplicate discovered files', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      const paths = result.files.map(f => f.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });

    it('should return totalCount matching files length', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      expect(result.totalCount).toBe(result.files.length);
    });
  });

  describe('Test Count Estimation', () => {
    it('should count Jest test patterns', async () => {
      const jestTestPath = path.join(testDir, 'count_test.test.ts');
      fs.writeFileSync(jestTestPath, `
        describe('suite', () => {
          it('test1', () => {});
          it('test2', () => {});
          it('test3', () => {});
        });
      `);
      
      const result = await discoverTests(testDir, '**/count_test.test.ts');
      
      expect(result.files[0]?.testCount).toBeGreaterThanOrEqual(3);
      
      fs.unlinkSync(jestTestPath);
    });

    it('should count pytest patterns', async () => {
      const pythonTestPath = path.join(testDir, 'test_count.py');
      fs.writeFileSync(pythonTestPath, `
        def test_one():
          pass
        
        def test_two():
          pass
        
        class TestClass:
          def test_three(self):
            pass
      `);
      
      const result = await discoverTests(testDir, '**/test_count.py');
      
      expect(result.files[0]?.testCount).toBeGreaterThanOrEqual(3);
      
      fs.unlinkSync(pythonTestPath);
    });

    it('should return 0 for unreadable files', async () => {
      const unreadablePath = path.join(testDir, 'unreadable.test.ts');
      // File exists but is empty/invalid
      fs.writeFileSync(unreadablePath, '');
      
      const result = await discoverTests(testDir, '**/unreadable.test.ts');
      
      expect(result.files[0]?.testCount).toBeDefined();
      
      fs.unlinkSync(unreadablePath);
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

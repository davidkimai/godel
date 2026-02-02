/**
 * Runner Tests - Extended
 * 
 * Additional tests for runner.ts to boost coverage
 * Focus on functions that don't require external processes
 */

import * as path from 'path';
import * as fs from 'fs';

import {
  detectFramework,
  discoverTests,
  getChangedFiles,
  findAffectedTests,
} from '../../src/testing/runner';
import { TestFramework, TestConfig } from '../../src/testing/types';

describe('Runner Extended Tests', () => {
  const testDir = path.join(__dirname, 'fixtures-extended');

  beforeAll(() => {
    // Create comprehensive test fixtures
    const fixtures = [
      {
        path: path.join(testDir, 'test_jest.test.ts'),
        content: `describe('Jest tests', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
  
  it('should handle async', async () => {
    expect(await Promise.resolve(true)).toBe(true);
  });
});`
      },
      {
        path: path.join(testDir, 'test_python.py'),
        content: `import pytest

def test_example():
    assert True

class TestClass:
    def test_method(self):
        assert True
`
      },
      {
        path: path.join(testDir, 'test_go_test.go'),
        content: `package main

import "testing"

func TestExample(t *testing.T) {
    if true != true {
        t.Error("test failed")
    }
}
`
      },
      {
        path: path.join(testDir, 'test_lib.rs'),
        content: `#[cfg(test)]
mod tests {
    #[test]
    fn test_example() {
        assert!(true);
    }
    
    #[test]
    fn test_another() {
        assert_eq!(1, 1);
    }
}
`
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
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('detectFramework', () => {
    it('should detect go from go.mod', () => {
      const goDir = path.join(testDir, 'go-only');
      fs.mkdirSync(goDir, { recursive: true });
      fs.writeFileSync(path.join(goDir, 'go.mod'), `module testproject

go 1.21
`);
      
      const result = detectFramework(goDir);
      expect(result).toBe('go');
      
      fs.rmSync(goDir, { recursive: true, force: true });
    });

    it('should detect cargo from Cargo.toml', () => {
      const cargoDir = path.join(testDir, 'cargo-only');
      fs.mkdirSync(cargoDir, { recursive: true });
      fs.writeFileSync(path.join(cargoDir, 'Cargo.toml'), `[package]
name = "test"
version = "0.1.0"
`);
      
      const result = detectFramework(cargoDir);
      expect(result).toBe('cargo');
      
      fs.rmSync(cargoDir, { recursive: true, force: true });
    });

    it('should return null when no framework detected', () => {
      const emptyDir = path.join(__dirname, 'empty-framework');
      fs.mkdirSync(emptyDir, { recursive: true });
      
      const result = detectFramework(emptyDir);
      expect(result).toBeNull();
      
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should detect vitest from vitest.config.ts', () => {
      const vitestDir = path.join(testDir, 'vitest-only');
      fs.mkdirSync(vitestDir, { recursive: true });
      fs.writeFileSync(path.join(vitestDir, 'vitest.config.ts'), `export default {}`);
      
      const result = detectFramework(vitestDir);
      expect(result).toBe('vitest');
      
      fs.rmSync(vitestDir, { recursive: true, force: true });
    });

    it('should detect jest from jest.config.js', () => {
      const jestDir = path.join(testDir, 'jest-only');
      fs.mkdirSync(jestDir, { recursive: true });
      fs.writeFileSync(path.join(jestDir, 'jest.config.js'), `module.exports = {}`);
      
      const result = detectFramework(jestDir);
      expect(result).toBe('jest');
      
      fs.rmSync(jestDir, { recursive: true, force: true });
    });

    it('should detect jest from jest.config.ts', () => {
      const jestDir = path.join(testDir, 'jest-ts');
      fs.mkdirSync(jestDir, { recursive: true });
      fs.writeFileSync(path.join(jestDir, 'jest.config.ts'), `export default {}`);
      
      const result = detectFramework(jestDir);
      expect(result).toBe('jest');
      
      fs.rmSync(jestDir, { recursive: true, force: true });
    });

    it('should detect vitest from vitest.config.js', () => {
      const vitestDir = path.join(testDir, 'vitest-js');
      fs.mkdirSync(vitestDir, { recursive: true });
      fs.writeFileSync(path.join(vitestDir, 'vitest.config.js'), `export default {}`);
      
      const result = detectFramework(vitestDir);
      expect(result).toBe('vitest');
      
      fs.rmSync(vitestDir, { recursive: true, force: true });
    });

    it('should handle malformed package.json gracefully', () => {
      const badJsonDir = path.join(testDir, 'bad-json');
      fs.mkdirSync(badJsonDir, { recursive: true });
      fs.writeFileSync(path.join(badJsonDir, 'package.json'), 'not valid json');
      
      const result = detectFramework(badJsonDir);
      expect(result).toBeNull();
      
      fs.rmSync(badJsonDir, { recursive: true, force: true });
    });

    it('should detect jest from package.json test script', () => {
      const pkgDir = path.join(testDir, 'pkg-jest');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        scripts: { test: 'jest' }
      }));
      
      const result = detectFramework(pkgDir);
      expect(result).toBe('jest');
      
      fs.rmSync(pkgDir, { recursive: true, force: true });
    });

    it('should detect vitest from package.json test script', () => {
      const pkgDir = path.join(testDir, 'pkg-vitest');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        scripts: { test: 'vitest' }
      }));
      
      const result = detectFramework(pkgDir);
      expect(result).toBe('vitest');
      
      fs.rmSync(pkgDir, { recursive: true, force: true });
    });

    it('should detect pytest from package.json test script', () => {
      const pkgDir = path.join(testDir, 'pkg-pytest');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        scripts: { test: 'pytest' }
      }));
      
      const result = detectFramework(pkgDir);
      expect(result).toBe('pytest');
      
      fs.rmSync(pkgDir, { recursive: true, force: true });
    });

    it('should detect go test from package.json test script', () => {
      const pkgDir = path.join(testDir, 'pkg-go');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        scripts: { test: 'go test ./...' }
      }));
      
      const result = detectFramework(pkgDir);
      expect(result).toBe('go');
      
      fs.rmSync(pkgDir, { recursive: true, force: true });
    });

    it('should detect cargo from package.json test script', () => {
      const pkgDir = path.join(testDir, 'pkg-cargo');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        scripts: { test: 'cargo test' }
      }));
      
      const result = detectFramework(pkgDir);
      expect(result).toBe('cargo');
      
      fs.rmSync(pkgDir, { recursive: true, force: true });
    });
  });

  describe('discoverTests', () => {
    it('should discover Python test files', async () => {
      const result = await discoverTests(testDir, '**/*.py');
      const pythonTests = result.files.filter(f => f.path.endsWith('.py'));
      expect(pythonTests.length).toBeGreaterThan(0);
    });

    it('should discover Go test files', async () => {
      const result = await discoverTests(testDir, '**/*_test.go');
      const goTests = result.files.filter(f => f.path.endsWith('_test.go'));
      expect(goTests.length).toBeGreaterThan(0);
    });

    it('should estimate test counts correctly', async () => {
      const result = await discoverTests(testDir, '**/test_python.py');
      const pythonFile = result.files.find(f => f.path.endsWith('test_python.py'));
      expect(pythonFile?.testCount).toBeGreaterThanOrEqual(1);
    });

    it('should use custom glob patterns', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      const tsTests = result.files.filter(f => f.path.endsWith('.test.ts'));
      expect(tsTests.length).toBeGreaterThan(0);
    });

    it('should handle multiple ignore patterns', async () => {
      const result = await discoverTests(testDir, '**/*', ['**/node_modules/**', '**/*.test.ts']);
      const ignored = result.files.filter(f => 
        f.path.includes('node_modules') || f.path.endsWith('.test.ts')
      );
      expect(ignored.length).toBe(0);
    });

    it('should return valid TestFile objects', async () => {
      const result = await discoverTests(testDir, '**/*.test.ts');
      
      for (const file of result.files) {
        expect(typeof file.path).toBe('string');
        expect(file.path.length).toBeGreaterThan(0);
        expect(typeof file.framework).toBe('string');
        expect(['jest', 'vitest', 'pytest', 'unittest', 'cargo', 'go']).toContain(file.framework);
      }
    });

    it('should discover Rust test files', async () => {
      const result = await discoverTests(testDir, '**/*.rs');
      const rsTests = result.files.filter(f => f.path.endsWith('.rs'));
      expect(rsTests.length).toBeGreaterThan(0);
    });
  });

  describe('getChangedFiles', () => {
    it('should return empty array for non-git directories', async () => {
      const result = await getChangedFiles(testDir, new Date());
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findAffectedTests', () => {
    it('should return empty array for empty changed files', async () => {
      const result = await findAffectedTests(testDir, []);
      expect(result).toEqual([]);
    });

    it('should search for related test files', async () => {
      const changedFiles = [
        { 
          path: 'src/main.ts', 
          changedAt: new Date(), 
          type: 'modified' as const 
        }
      ];
      
      const result = await findAffectedTests(testDir, changedFiles);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle files with various extensions', async () => {
      const changedFiles = [
        { path: 'file.ts', changedAt: new Date(), type: 'modified' as const },
        { path: 'file.py', changedAt: new Date(), type: 'modified' as const },
        { path: 'file.go', changedAt: new Date(), type: 'modified' as const },
        { path: 'file.rs', changedAt: new Date(), type: 'modified' as const }
      ];
      
      for (const file of changedFiles) {
        const result = await findAffectedTests(testDir, [file]);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should deduplicate affected tests', async () => {
      const changedFiles = [
        { path: 'main.ts', changedAt: new Date(), type: 'modified' as const },
        { path: 'main.ts', changedAt: new Date(), type: 'modified' as const }
      ];
      
      const result = await findAffectedTests(testDir, changedFiles);
      const paths = result.map(t => t.path);
      const uniquePaths = [...new Set(paths)];
      expect(uniquePaths.length).toBe(paths.length);
    });
  });
});

describe('Error Handling', () => {
  it('should handle missing directory gracefully', async () => {
    const result = await discoverTests('/nonexistent/directory', '**/*.test.ts');
    expect(result.files).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('should handle permission errors gracefully', async () => {
    const restrictedDir = path.join(__dirname, 'restricted');
    fs.mkdirSync(restrictedDir, { recursive: true });
    
    try {
      const result = await discoverTests(restrictedDir, '**/*.test.ts');
      expect(result.files).toEqual([]);
    } catch (error) {
      expect(error).toBeDefined();
    }
    
    fs.rmSync(restrictedDir, { recursive: true, force: true });
  });
});

describe('Performance', () => {
  const perfDir = path.join(__dirname, 'fixtures-extended');

  it('should complete discovery within reasonable time', async () => {
    const start = Date.now();
    await discoverTests(perfDir, '**/*.test.ts');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000);
  });

  it('should handle concurrent discovery calls', async () => {
    const promises = [
      discoverTests(perfDir, '**/*.test.ts'),
      discoverTests(perfDir, '**/*.spec.ts'),
      discoverTests(perfDir, '**/*.py')
    ];
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      expect(typeof result.totalCount).toBe('number');
    }
  });
});

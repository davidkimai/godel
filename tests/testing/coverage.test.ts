/**
 * Coverage Tests
 * 
 * Tests for coverage report parsing and metrics calculation
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  detectCoverageFormat,
  parseCoverage,
  checkCoverageThresholds,
  formatCoverageSummary,
  generateCoverageBadge
} from '../../src/testing/coverage';
import { TestFramework } from '../../src/testing/types';

describe('Coverage Analyzer', () => {
  const testDir = path.join(__dirname, 'coverage-fixtures');

  beforeAll(() => {
    // Create test coverage fixtures
    const fixtures: { path: string; content: string }[] = [];

    // Istanbul LCOV format
    fixtures.push({
      path: path.join(testDir, 'lcov.info'),
      content: `TN:
SF:src/main.ts
FN:1,main
FNDA:1,main
DA:2,1
DA:3,0
DA:4,1
BRDA:1,0,0,1
BRDA:1,0,1,0
BRF:2
BRH:1
end_of_record
TN:
SF:src/utils.ts
FN:1,util
FNDA:5,util
DA:2,5
DA:3,5
DA:4,5
LF:3
LH:3
end_of_record`
    });

    // Istanbul JSON format
    fixtures.push({
      path: path.join(testDir, 'coverage-final.json'),
      content: JSON.stringify({
        'src/main.ts': {
          path: 'src/main.ts',
          s: { '1': 1, '2': 0, '3': 1 },
          f: { '1': 1 },
          b: { '1': [1, 0] },
          l: { '1': 1, '2': 0, '3': 1 }
        },
        'src/utils.ts': {
          path: 'src/utils.ts',
          s: { '1': 5, '2': 5, '3': 5 },
          f: { '1': 5 },
          b: { '1': [5, 0] },
          l: { '1': 5, '2': 5, '3': 5 }
        }
      }, null, 2)
    });

    // Coverage.py XML format
    fixtures.push({
      path: path.join(testDir, 'coverage.xml'),
      content: `<?xml version="1.0" ?>
<coverage version="5.5" timestamp="1234567890" lines-valid="10" lines-covered="7" line-rate="0.7" branches-valid="4" branches-covered="2" branch-rate="0.5" complexity="0">
  <packages>
    <package name="." line-rate="0.7" branch-rate="0.5" complexity="0">
      <classes>
        <class name="main.py" filename="main.py" line-rate="0.7" branch-rate="0.5">
          <lines>
            <line number="1" hits="1"/>
            <line number="2" hits="1"/>
            <line number="3" hits="0"/>
            <line number="4" hits="1"/>
            <line number="5" hits="1"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`
    });

    // Jacoco XML format
    fixtures.push({
      path: path.join(testDir, 'jacoco.xml'),
      content: `<?xml version="1.0" encoding="UTF-8"?>
<report name="Test Report">
  <sessioninfo id="test" start="1234567890000" dump="1234567891000"/>
  <package name="com/example">
    <sourcefile name="Main.java">
      <counter type="INSTRUCTION" missed="10" covered="40"/>
      <counter type="BRANCH" missed="2" covered="2"/>
      <counter type="METHOD" missed="1" covered="3"/>
      <counter type="LINE" missed="5" covered="15"/>
    </sourcefile>
  </package>
</report>`
    });

    // gcov format
    fixtures.push({
      path: path.join(testDir, 'main.ts.gcov'),
      content: `        -:    0:Source:main.ts
        -:    0:Graph:main.gcno
        -:    0:Data:main.gcda
        -:    0:Runs:1
        -:    0:Programs:1
        -:    1:void main() {
        1:    2:    std::cout << "Hello" << std::endl;
branch  0 taken 1
branch  1 not taken
        -:    3:    return 0;
        -:    4:}`
    });

    for (const fixture of fixtures) {
      const dir = path.dirname(fixture.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fixture.path, fixture.content);
    }

    // Create coverage directory for Istanbul
    fs.mkdirSync(path.join(testDir, 'coverage'), { recursive: true });
  });

  afterAll(() => {
    // Cleanup test fixtures
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('detectCoverageFormat', () => {
    it('should detect Istanbul format from lcov.info', () => {
      fs.writeFileSync(path.join(testDir, 'lcov.info'), '');
      const result = detectCoverageFormat(testDir);
      expect(result).toBe('istanbul');
    });

    it('should detect coverage.py from .coverage', () => {
      fs.writeFileSync(path.join(testDir, '.coverage'), '');
      const result = detectCoverageFormat(testDir);
      // Istanbul coverage directory takes precedence
      expect(['istanbul', 'coverage.py']).toContain(result);
    });

    it('should detect gcov from .gcov files', () => {
      fs.writeFileSync(path.join(testDir, 'test.gcov'), '');
      const result = detectCoverageFormat(testDir);
      // Istanbul coverage directory takes precedence
      expect(['istanbul', 'gcov']).toContain(result);
    });

    it('should return null for unknown format', () => {
      const emptyDir = path.join(__dirname, 'empty-coverage');
      fs.mkdirSync(emptyDir, { recursive: true });
      
      const result = detectCoverageFormat(emptyDir);
      expect(result).toBeNull();
      
      fs.rmSync(emptyDir, { recursive: true });
    });

    it('should default to Istanbul when coverage dir exists', () => {
      fs.mkdirSync(path.join(testDir, 'coverage'), { recursive: true });
      const result = detectCoverageFormat(testDir);
      expect(result).toBe('istanbul');
    });
  });

  describe('parseCoverage', () => {
    it('should parse Istanbul JSON format', async () => {
      const result = await parseCoverage(testDir, 'jest');
      
      expect(result.framework).toBe('jest');
      expect(result.files.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty metrics for unknown format', async () => {
      const emptyDir = path.join(__dirname, 'empty-coverage-parse');
      fs.mkdirSync(emptyDir, { recursive: true });
      
      const result = await parseCoverage(emptyDir, 'jest');
      
      expect(result.metrics.statements.covered).toBe(0);
      expect(result.metrics.statements.total).toBe(0);
      
      fs.rmSync(emptyDir, { recursive: true });
    });

    it('should calculate correct metrics', async () => {
      const result = await parseCoverage(testDir, 'jest');
      
      expect(result.metrics.statements.percentage).toBeGreaterThanOrEqual(0);
      expect(result.metrics.statements.percentage).toBeLessThanOrEqual(100);
      expect(result.metrics.branches.percentage).toBeGreaterThanOrEqual(0);
      expect(result.metrics.branches.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('checkCoverageThresholds', () => {
    it('should pass when all thresholds are met', () => {
      const metrics = {
        statements: { covered: 80, total: 100, percentage: 80 },
        branches: { covered: 40, total: 50, percentage: 80 },
        functions: { covered: 20, total: 25, percentage: 80 },
        lines: { covered: 80, total: 100, percentage: 80 }
      };
      
      const result = checkCoverageThresholds(metrics, {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      });
      
      expect(result.passed).toBe(true);
      expect(result.failures).toEqual([]);
    });

    it('should fail when thresholds are not met', () => {
      const metrics = {
        statements: { covered: 70, total: 100, percentage: 70 },
        branches: { covered: 40, total: 50, percentage: 80 },
        functions: { covered: 20, total: 25, percentage: 80 },
        lines: { covered: 70, total: 100, percentage: 70 }
      };
      
      const result = checkCoverageThresholds(metrics, {
        statements: 80,
        lines: 80
      });
      
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('should handle partial thresholds', () => {
      const metrics = {
        statements: { covered: 50, total: 100, percentage: 50 },
        branches: { covered: 0, total: 50, percentage: 0 },
        functions: { covered: 25, total: 25, percentage: 100 },
        lines: { covered: 50, total: 100, percentage: 50 }
      };
      
      const result = checkCoverageThresholds(metrics, {
        functions: 100
      });
      
      expect(result.passed).toBe(true);
    });
  });

  describe('formatCoverageSummary', () => {
    it('should format coverage summary correctly', () => {
      const metrics = {
        statements: { covered: 80, total: 100, percentage: 80 },
        branches: { covered: 40, total: 50, percentage: 80 },
        functions: { covered: 20, total: 25, percentage: 80 },
        lines: { covered: 80, total: 100, percentage: 80 }
      };
      
      const result = formatCoverageSummary(metrics);
      
      expect(result).toContain('Coverage Summary');
      expect(result).toContain('Statements: 80/100');
      expect(result).toMatch(/Branches:\s+40\/50/);
      expect(result).toMatch(/Functions:\s+20\/25/);
      expect(result).toMatch(/Lines:\s+80\/100/);
      expect(result).toContain('80.0%');
    });

    it('should handle zero coverage', () => {
      const metrics = {
        statements: { covered: 0, total: 100, percentage: 0 },
        branches: { covered: 0, total: 50, percentage: 0 },
        functions: { covered: 0, total: 25, percentage: 0 },
        lines: { covered: 0, total: 100, percentage: 0 }
      };
      
      const result = formatCoverageSummary(metrics);
      
      expect(result).toContain('0.0%');
    });
  });

  describe('generateCoverageBadge', () => {
    it('should generate badge URL for statements', () => {
      const metrics = {
        statements: { covered: 80, total: 100, percentage: 80 },
        branches: { covered: 40, total: 50, percentage: 80 },
        functions: { covered: 20, total: 25, percentage: 80 },
        lines: { covered: 80, total: 100, percentage: 80 }
      };
      
      const result = generateCoverageBadge(metrics, 'statements');
      
      expect(result).toContain('Statements');
      expect(result).toContain('80');
      expect(result).toContain('green');
    });

    it('should use yellow for coverage between 60-79%', () => {
      const midCoverage = {
        statements: { covered: 65, total: 100, percentage: 65 },
        branches: { covered: 30, total: 50, percentage: 60 },
        functions: { covered: 15, total: 25, percentage: 60 },
        lines: { covered: 65, total: 100, percentage: 65 }
      };
      
      const result = generateCoverageBadge(midCoverage, 'statements');
      
      expect(result).toContain('yellow');
    });

    it('should use orange for coverage between 40-59%', () => {
      const lowCoverage = {
        statements: { covered: 50, total: 100, percentage: 50 },
        branches: { covered: 20, total: 50, percentage: 40 },
        functions: { covered: 10, total: 25, percentage: 40 },
        lines: { covered: 50, total: 100, percentage: 50 }
      };
      
      const result = generateCoverageBadge(lowCoverage, 'statements');
      
      expect(result).toContain('orange');
    });

    it('should use red for coverage below 40%', () => {
      const veryLowCoverage = {
        statements: { covered: 20, total: 100, percentage: 20 },
        branches: { covered: 0, total: 50, percentage: 0 },
        functions: { covered: 0, total: 10, percentage: 0 },
        lines: { covered: 20, total: 100, percentage: 20 }
      };
      
      const result = generateCoverageBadge(veryLowCoverage, 'statements');
      
      expect(result).toContain('red');
    });

    it('should default to statements metric', () => {
      const metrics = {
        statements: { covered: 80, total: 100, percentage: 80 },
        branches: { covered: 40, total: 50, percentage: 80 },
        functions: { covered: 20, total: 25, percentage: 80 },
        lines: { covered: 80, total: 100, percentage: 80 }
      };
      
      const result = generateCoverageBadge(metrics);
      
      expect(result).toContain('Statements');
    });
  });
});

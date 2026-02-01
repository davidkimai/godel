/**
 * Quality Gates Module Tests
 */

import {
  calculateScore,
  calculateLintScore,
  calculateTypeScore,
  calculateCoverageScore,
  calculatePassRateScore,
  calculateSecurityScore,
  evaluateQualityGate,
  generateLintSummary,
  DEFAULT_GATES,
  parseCriteriaJson,
  createGateFromCriteria,
  formatGateResult,
  type GateEvaluationInput
} from '../../src/quality/gates';
import {
  LintSummary,
  LintResult,
  QualityGate,
  GateEvaluationResult,
  SeverityLevel
} from '../../src/quality/types';

describe('Quality Gates Module', () => {
  describe('Score Calculations', () => {
    describe('calculateLintScore', () => {
      it('should return 1.0 for no issues', () => {
        const results: LintResult[] = [{
          tool: 'eslint',
          exitCode: 0,
          success: true,
          issues: [],
          summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
          metadata: { startTime: new Date(), endTime: new Date(), duration: 100, filesScanned: 5 }
        }];
        const score = calculateLintScore(results);
        expect(score).toBe(1);
      });

      it('should reduce score based on errors', () => {
        const summary = createLintSummary(5, 0, 0);
        const score = calculateLintScore(summary.results);
        expect(score).toBeLessThan(1);
        expect(score).toBeGreaterThan(0.9);
      });

      it('should weight errors more than warnings', () => {
        const errorsOnly = createLintSummary(5, 0, 0);
        const warningsOnly = createLintSummary(0, 5, 0);
        
        const errorsScore = calculateLintScore(errorsOnly.results);
        const warningsScore = calculateLintScore(warningsOnly.results);
        
        expect(errorsScore).toBeLessThan(warningsScore);
      });

      it('should handle high issue density', () => {
        const summary = createLintSummary(50, 50, 50);
        const score = calculateLintScore(summary.results);
        expect(score).toBeLessThan(0.5);
      });

      it('should not go below 0', () => {
        const summary = createLintSummary(200, 200, 200);
        const score = calculateLintScore(summary.results);
        expect(score).toBeGreaterThanOrEqual(0);
      });
    });

    describe('calculateTypeScore', () => {
      it('should return 1.0 for no issues', () => {
        const score = calculateTypeScore(0, 0);
        expect(score).toBe(1);
      });

      it('should penalize errors heavily', () => {
        const score = calculateTypeScore(5, 0);
        expect(score).toBeLessThan(0.6);
      });

      it('should penalize warnings moderately', () => {
        const score = calculateTypeScore(0, 10);
        expect(score).toBeLessThan(1);
        expect(score).toBeGreaterThan(0.8);
      });

      it('should have minimum score of 0 for errors', () => {
        const score = calculateTypeScore(20, 0);
        expect(score).toBeGreaterThanOrEqual(0);
      });
    });

    describe('calculateSecurityScore', () => {
      it('should return 1.0 for no vulnerabilities', () => {
        const score = calculateSecurityScore({ critical: 0, high: 0, medium: 0, low: 0 });
        expect(score).toBe(1);
      });

      it('should penalize critical vulnerabilities heavily', () => {
        const score = calculateSecurityScore({ critical: 1, high: 1, medium: 0, low: 0 });
        expect(score).toBe(0);
      });

      it('should penalize high vulnerabilities heavily', () => {
        const score = calculateSecurityScore({ critical: 0, high: 5, medium: 0, low: 0 });
        expect(score).toBe(0);
      });

      it('should penalize medium vulnerabilities moderately', () => {
        const score = calculateSecurityScore({ critical: 0, high: 0, medium: 10, low: 0 });
        expect(score).toBe(0.5);
      });

      it('should penalize low vulnerabilities lightly', () => {
        const score = calculateSecurityScore({ critical: 0, high: 0, medium: 0, low: 100 });
        expect(score).toBe(0);
      });
    });

    describe('calculateCoverageScore', () => {
      it('should return 1.0 for 80%+ coverage', () => {
        expect(calculateCoverageScore(80)).toBe(1.0);
        expect(calculateCoverageScore(100)).toBe(1.0);
      });

      it('should score 60-80% coverage linearly', () => {
        expect(calculateCoverageScore(60)).toBe(0.6);
        expect(calculateCoverageScore(70)).toBe(0.8);
      });

      it('should score 40-60% coverage linearly', () => {
        expect(calculateCoverageScore(40)).toBe(0.4);
        expect(calculateCoverageScore(50)).toBe(0.5);
      });

      it('should score below 40% proportionally', () => {
        expect(calculateCoverageScore(20)).toBe(0.08);
        expect(calculateCoverageScore(0)).toBe(0);
      });
    });

    describe('calculatePassRateScore', () => {
      it('should return pass rate divided by 100', () => {
        expect(calculatePassRateScore(100)).toBe(1.0);
        expect(calculatePassRateScore(85)).toBe(0.85);
        expect(calculatePassRateScore(50)).toBe(0.5);
      });
    });

    describe('calculateScore (combined)', () => {
      it('should return 1.0 when all inputs are perfect', () => {
        const score = calculateScore({
          lintResults: [{
            tool: 'eslint',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 0,
          typeWarnings: 0,
          testCoverage: 90,
          testPassRate: 100,
          securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
        });
        expect(score).toBe(1.0);
      });

      it('should return lower score with issues', () => {
        const score = calculateScore({
          lintResults: [{
            tool: 'eslint',
            exitCode: 1,
            success: false,
            issues: [],
            summary: { errors: 3, warnings: 5, hints: 0, info: 0, total: 8 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 2,
          typeWarnings: 0,
          testCoverage: 60,
          testPassRate: 90,
          securityVulnerabilities: { critical: 0, high: 0, medium: 2, low: 0 }
        });
        expect(score).toBeLessThan(1.0);
      });
    });
  });

  describe('Gate Evaluation', () => {
    describe('evaluateQualityGate', () => {
      const defaultGate: QualityGate = {
        type: 'multi',
        criteria: [
          { dimension: 'correctness', weight: 0.3, threshold: 0.8 },
          { dimension: 'type_safety', weight: 0.2, threshold: 0.9 },
          { dimension: 'test_coverage', weight: 0.2, threshold: 0.8 },
          { dimension: 'security', weight: 0.3, threshold: 0.95 }
        ],
        passingThreshold: 0.85,
        maxIterations: 3,
        autoRetry: true
      };

      it('should pass when all criteria are met', () => {
        const result = evaluateQualityGate({
          gate: defaultGate,
          lintResults: [{
            tool: 'eslint',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 0,
          typeWarnings: 0,
          testCoverage: 90,
          testPassRate: 100,
          securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
        });

        expect(result.passed).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(defaultGate.passingThreshold);
      });

      it('should fail when score is below threshold', () => {
        const result = evaluateQualityGate({
          gate: defaultGate,
          lintResults: [{
            tool: 'eslint',
            exitCode: 1,
            success: false,
            issues: [],
            summary: { errors: 10, warnings: 0, hints: 0, info: 0, total: 10 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 5,
          typeWarnings: 0,
          testCoverage: 30,
          testPassRate: 50,
          securityVulnerabilities: { critical: 0, high: 5, medium: 0, low: 0 }
        });

        expect(result.passed).toBe(false);
      });

      it('should track failed criteria', () => {
        const result = evaluateQualityGate({
          gate: defaultGate,
          lintResults: [{
            tool: 'eslint',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 0,
          typeWarnings: 0,
          testCoverage: 50, // Below 80% threshold
          testPassRate: 100,
          securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
        });

        expect(result.failedCriteria).toContain('test_coverage');
      });

      it('should generate recommendations for failed criteria', () => {
        const result = evaluateQualityGate({
          gate: defaultGate,
          lintResults: [{
            tool: 'eslint',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }],
          typeErrors: 0,
          typeWarnings: 0,
          testCoverage: 50,
          testPassRate: 100,
          securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
        });

        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(result.recommendations[0]).toContain('test_coverage');
      });
    });
  });

  describe('Lint Summary', () => {
    describe('generateLintSummary', () => {
      it('should aggregate results from multiple linters', () => {
        const results: LintResult[] = [
          {
            tool: 'eslint',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 1, warnings: 2, hints: 0, info: 0, total: 3 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          },
          {
            tool: 'prettier',
            exitCode: 0,
            success: true,
            issues: [],
            summary: { errors: 0, warnings: 3, hints: 0, info: 0, total: 3 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }
        ];

        const summary = generateLintSummary(results);

        expect(summary.aggregate.errors).toBe(1);
        expect(summary.aggregate.warnings).toBe(5);
        expect(summary.passed).toBe(false); // Has errors
      });

      it('should track files with issues', () => {
        const results: LintResult[] = [
          {
            tool: 'eslint',
            exitCode: 1,
            success: false,
            issues: [
              { id: '1', rule: 'no-console', category: 'style', severity: 'warning', file: 'src/main.ts', line: 10, message: 'No console', source: 'eslint' },
              { id: '2', rule: 'no-any', category: 'type_safety', severity: 'error', file: 'src/utils.ts', line: 5, message: 'No any', source: 'eslint' }
            ],
            summary: { errors: 1, warnings: 1, hints: 0, info: 0, total: 2 },
            metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
          }
        ];

        const summary = generateLintSummary(results);

        expect(summary.aggregate.filesWithIssues.has('src/main.ts')).toBe(true);
        expect(summary.aggregate.filesWithIssues.has('src/utils.ts')).toBe(true);
        expect(summary.aggregate.filesWithIssues.size).toBe(2);
      });
    });
  });

  describe('Default Gates', () => {
    it('should have lint gate', () => {
      expect(DEFAULT_GATES.lint).toBeDefined();
      expect(DEFAULT_GATES.lint.type).toBe('lint');
      expect(DEFAULT_GATES.lint.criteria.length).toBeGreaterThan(0);
    });

    it('should have types gate', () => {
      expect(DEFAULT_GATES.types).toBeDefined();
      expect(DEFAULT_GATES.types.type).toBe('types');
    });

    it('should have security gate', () => {
      expect(DEFAULT_GATES.security).toBeDefined();
      expect(DEFAULT_GATES.security.type).toBe('security');
      expect(DEFAULT_GATES.security.autoRetry).toBe(false);
    });

    it('should have full gate', () => {
      expect(DEFAULT_GATES.full).toBeDefined();
      expect(DEFAULT_GATES.full.type).toBe('multi');
      expect(DEFAULT_GATES.full.criteria.length).toBeGreaterThan(3);
    });
  });

  describe('Criteria Parsing', () => {
    describe('parseCriteriaJson', () => {
      it('should parse array format', () => {
        const json = '[{"dimension":"correctness","weight":0.3,"threshold":0.8},{"dimension":"security","weight":0.7,"threshold":0.9}]';
        const criteria = parseCriteriaJson(json);

        expect(criteria.length).toBe(2);
        expect(criteria[0].dimension).toBe('correctness');
        expect(criteria[0].weight).toBe(0.3);
        expect(criteria[1].dimension).toBe('security');
        expect(criteria[1].weight).toBe(0.7);
      });

      it('should parse object format', () => {
        const json = '{"correctness":{"weight":0.5,"threshold":0.8},"security":{"weight":0.5,"threshold":0.9}}';
        const criteria = parseCriteriaJson(json);

        expect(criteria.length).toBe(2);
        expect(criteria[0].dimension).toBe('correctness');
      });

      it('should parse comma-separated format', () => {
        const criteria = parseCriteriaJson('correctness:0.3:0.8,security:0.7:0.9');

        expect(criteria.length).toBe(2);
        expect(criteria[0].dimension).toBe('correctness');
        expect(criteria[0].weight).toBe(0.3);
        expect(criteria[0].threshold).toBe(0.8);
      });
    });

    describe('createGateFromCriteria', () => {
      it('should create a gate with normalized weights', () => {
        const gate = createGateFromCriteria('correctness:0.3,security:0.7');

        const totalWeight = gate.criteria.reduce((sum, c) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 2);
      });

      it('should use default passing threshold', () => {
        const gate = createGateFromCriteria('correctness:0.5');
        expect(gate.passingThreshold).toBe(0.8);
      });

      it('should allow custom options', () => {
        const gate = createGateFromCriteria('correctness:0.5', {
          passingThreshold: 0.9,
          maxIterations: 5,
          autoRetry: false,
          name: 'strict-gate'
        });

        expect(gate.passingThreshold).toBe(0.9);
        expect(gate.maxIterations).toBe(5);
        expect(gate.autoRetry).toBe(false);
        expect(gate.name).toBe('strict-gate');
      });
    });
  });

  describe('Gate Result Formatting', () => {
    it('should format result as JSON', () => {
      const result = createPassingGateResult();
      const output = formatGateResult(result, { format: 'json' });
      
      expect(output).toContain('"passed"');
      expect(output).toContain('"score"');
    });

    it('should format result as table', () => {
      const result = createPassingGateResult();
      const output = formatGateResult(result, { format: 'table' });
      
      expect(output).toContain('Quality Gate Evaluation');
      expect(output).toContain('Criteria Breakdown');
    });

    it('should format result as summary', () => {
      const result = createPassingGateResult();
      const output = formatGateResult(result, { format: 'summary' });
      
      expect(output).toContain('PASSED');
    });
  });
});

// Helper functions for creating test data

function createLintSummary(errors: number, warnings: number, info: number): LintSummary {
  const issues = [
    ...Array(errors).fill({ severity: 'error' }),
    ...Array(warnings).fill({ severity: 'warning' }),
    ...Array(info).fill({ severity: 'info' })
  ];
  
  const result: LintResult = {
    tool: 'eslint',
    exitCode: errors > 0 ? 1 : 0,
    success: errors === 0,
    issues: issues.map((issue, i) => ({
      id: `issue-${i}`,
      rule: 'test-rule',
      category: 'style' as const,
      severity: issue.severity as SeverityLevel,
      file: 'src/test.ts',
      line: i + 1,
      column: 1,
      message: 'Test issue',
      source: 'eslint' as const
    })),
    summary: { errors, warnings, hints: 0, info, total: errors + warnings + info },
    metadata: { startTime: new Date(), endTime: new Date(), duration: 100, filesScanned: 5 }
  };
  
  return {
    results: [result],
    aggregate: { errors, warnings, hints: 0, info, total: errors + warnings + info, filesWithIssues: new Set() },
    score: Math.max(0, 1 - (errors * 0.15 + warnings * 0.02)),
    passed: errors === 0
  };
}

function createPassingGateResult(): GateEvaluationResult {
  return {
    gate: DEFAULT_GATES.lint,
    passed: true,
    score: 0.95,
    criterionScores: [
      { dimension: 'correctness', weight: 0.5, threshold: 0.8, score: 0.95, passed: true },
      { dimension: 'style', weight: 0.3, threshold: 0.7, score: 0.95, passed: true },
      { dimension: 'security', weight: 0.2, threshold: 0.9, score: 0.95, passed: true }
    ],
    failedCriteria: [],
    recommendations: [],
    evaluatedAt: new Date()
  };
}

"use strict";
/**
 * Quality Module Tests
 *
 * Tests for linting, type checking, and quality gate evaluation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const gates_1 = require("../src/quality/gates");
// ============================================================================
// Score Calculation Tests
// ============================================================================
describe('Score Calculation', () => {
    describe('calculateLintScore', () => {
        it('should return 1.0 for no issues', () => {
            const results = [{
                    tool: 'eslint',
                    exitCode: 0,
                    success: true,
                    issues: [],
                    summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
                    metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
                }];
            expect((0, gates_1.calculateLintScore)(results)).toBe(1.0);
        });
        it('should penalize for errors', () => {
            const results = [{
                    tool: 'eslint',
                    exitCode: 1,
                    success: false,
                    issues: [],
                    summary: { errors: 5, warnings: 0, hints: 0, info: 0, total: 5 },
                    metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
                }];
            // 5 errors * 0.15 = 0.75 penalty, score = 0.25
            expect((0, gates_1.calculateLintScore)(results)).toBe(0.25);
        });
        it('should penalize less for warnings', () => {
            const results = [{
                    tool: 'eslint',
                    exitCode: 0,
                    success: true,
                    issues: [],
                    summary: { errors: 0, warnings: 10, hints: 0, info: 0, total: 10 },
                    metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
                }];
            // 10 warnings * 0.02 = 0.2 penalty, score = 0.8
            expect((0, gates_1.calculateLintScore)(results)).toBe(0.8);
        });
        it('should combine errors and warnings', () => {
            const results = [{
                    tool: 'eslint',
                    exitCode: 1,
                    success: false,
                    issues: [],
                    summary: { errors: 3, warnings: 5, hints: 0, info: 0, total: 8 },
                    metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 }
                }];
            // 3 errors * 0.15 = 0.45, 5 warnings * 0.02 = 0.1, total = 0.55 penalty, score = 0.45
            expect((0, gates_1.calculateLintScore)(results)).toBe(0.45);
        });
    });
    describe('calculateTypeScore', () => {
        it('should return 1.0 for no type errors', () => {
            expect((0, gates_1.calculateTypeScore)(0, 0)).toBe(1.0);
        });
        it('should penalize heavily for type errors', () => {
            expect((0, gates_1.calculateTypeScore)(5, 0)).toBe(0.5);
        });
        it('should penalize less for warnings', () => {
            expect((0, gates_1.calculateTypeScore)(0, 10)).toBe(0.8);
        });
        it('should combine errors and warnings', () => {
            expect((0, gates_1.calculateTypeScore)(3, 5)).toBe(0.6);
        });
        it('should not go below 0', () => {
            expect((0, gates_1.calculateTypeScore)(20, 20)).toBe(0);
        });
    });
    describe('calculateCoverageScore', () => {
        it('should return 1.0 for 80%+ coverage', () => {
            expect((0, gates_1.calculateCoverageScore)(80)).toBe(1.0);
            expect((0, gates_1.calculateCoverageScore)(100)).toBe(1.0);
        });
        it('should score 60-80% coverage linearly', () => {
            expect((0, gates_1.calculateCoverageScore)(60)).toBe(0.6);
            expect((0, gates_1.calculateCoverageScore)(70)).toBe(0.8);
        });
        it('should score 40-60% coverage linearly', () => {
            expect((0, gates_1.calculateCoverageScore)(40)).toBe(0.4);
            expect((0, gates_1.calculateCoverageScore)(50)).toBe(0.5);
        });
        it('should score below 40% proportionally', () => {
            expect((0, gates_1.calculateCoverageScore)(20)).toBe(0.08);
            expect((0, gates_1.calculateCoverageScore)(0)).toBe(0);
        });
    });
    describe('calculatePassRateScore', () => {
        it('should return pass rate divided by 100', () => {
            expect((0, gates_1.calculatePassRateScore)(100)).toBe(1.0);
            expect((0, gates_1.calculatePassRateScore)(85)).toBe(0.85);
            expect((0, gates_1.calculatePassRateScore)(50)).toBe(0.5);
        });
    });
    describe('calculateSecurityScore', () => {
        it('should return 0 for critical vulnerabilities', () => {
            expect((0, gates_1.calculateSecurityScore)({ critical: 1, high: 0, medium: 0, low: 0 })).toBe(0);
        });
        it('should penalize high vulnerabilities heavily', () => {
            expect((0, gates_1.calculateSecurityScore)({ critical: 0, high: 5, medium: 0, low: 0 })).toBe(0);
            expect((0, gates_1.calculateSecurityScore)({ critical: 0, high: 1, medium: 0, low: 0 })).toBe(0.8);
        });
        it('should penalize medium vulnerabilities moderately', () => {
            expect((0, gates_1.calculateSecurityScore)({ critical: 0, high: 0, medium: 10, low: 0 })).toBe(0.5);
        });
        it('should penalize low vulnerabilities lightly', () => {
            expect((0, gates_1.calculateSecurityScore)({ critical: 0, high: 0, medium: 0, low: 100 })).toBe(0);
        });
    });
    describe('calculateScore (combined)', () => {
        it('should return 1.0 when all inputs are perfect', () => {
            const score = (0, gates_1.calculateScore)({
                lintResults: [{ tool: 'eslint', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
                typeErrors: 0,
                typeWarnings: 0,
                testCoverage: 90,
                testPassRate: 100,
                securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
            });
            expect(score).toBe(1.0);
        });
        it('should return lower score with issues', () => {
            const score = (0, gates_1.calculateScore)({
                lintResults: [{ tool: 'eslint', exitCode: 1, success: false, issues: [], summary: { errors: 3, warnings: 5, hints: 0, info: 0, total: 8 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
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
// ============================================================================
// Quality Gate Evaluation Tests
// ============================================================================
describe('Quality Gate Evaluation', () => {
    const defaultGate = {
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
    describe('evaluateQualityGate', () => {
        it('should pass when all criteria are met', () => {
            const result = (0, gates_1.evaluateQualityGate)({
                gate: defaultGate,
                lintResults: [{ tool: 'eslint', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
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
            const result = (0, gates_1.evaluateQualityGate)({
                gate: defaultGate,
                lintResults: [{ tool: 'eslint', exitCode: 1, success: false, issues: [], summary: { errors: 10, warnings: 0, hints: 0, info: 0, total: 10 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
                typeErrors: 5,
                typeWarnings: 0,
                testCoverage: 30,
                testPassRate: 50,
                securityVulnerabilities: { critical: 0, high: 5, medium: 0, low: 0 }
            });
            expect(result.passed).toBe(false);
        });
        it('should track failed criteria', () => {
            const result = (0, gates_1.evaluateQualityGate)({
                gate: defaultGate,
                lintResults: [{ tool: 'eslint', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
                typeErrors: 0,
                typeWarnings: 0,
                testCoverage: 50, // Below 80% threshold
                testPassRate: 100,
                securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
            });
            expect(result.failedCriteria).toContain('test_coverage');
        });
        it('should generate recommendations for failed criteria', () => {
            const result = (0, gates_1.evaluateQualityGate)({
                gate: defaultGate,
                lintResults: [{ tool: 'eslint', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } }],
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
// ============================================================================
// Lint Summary Tests
// ============================================================================
describe('Lint Summary', () => {
    describe('generateLintSummary', () => {
        it('should aggregate results from multiple linters', () => {
            const results = [
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
            const summary = (0, gates_1.generateLintSummary)(results);
            expect(summary.aggregate.errors).toBe(1);
            expect(summary.aggregate.warnings).toBe(5);
            expect(summary.passed).toBe(false); // Has errors
        });
        it('should track files with issues', () => {
            const results = [
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
            const summary = (0, gates_1.generateLintSummary)(results);
            expect(summary.aggregate.filesWithIssues.has('src/main.ts')).toBe(true);
            expect(summary.aggregate.filesWithIssues.has('src/utils.ts')).toBe(true);
            expect(summary.aggregate.filesWithIssues.size).toBe(2);
        });
    });
});
// ============================================================================
// Criteria Parsing Tests
// ============================================================================
describe('Criteria Parsing', () => {
    describe('parseCriteriaJson', () => {
        it('should parse array format', () => {
            const json = '[{"dimension":"correctness","weight":0.3,"threshold":0.8},{"dimension":"security","weight":0.7,"threshold":0.9}]';
            const criteria = (0, gates_1.parseCriteriaJson)(json);
            expect(criteria.length).toBe(2);
            expect(criteria[0].dimension).toBe('correctness');
            expect(criteria[0].weight).toBe(0.3);
            expect(criteria[1].dimension).toBe('security');
            expect(criteria[1].weight).toBe(0.7);
        });
        it('should parse object format', () => {
            const json = '{"correctness":{"weight":0.5,"threshold":0.8},"security":{"weight":0.5,"threshold":0.9}}';
            const criteria = (0, gates_1.parseCriteriaJson)(json);
            expect(criteria.length).toBe(2);
            expect(criteria[0].dimension).toBe('correctness');
        });
        it('should parse comma-separated format', () => {
            const criteria = (0, gates_1.parseCriteriaJson)('correctness:0.3:0.8,security:0.7:0.9');
            expect(criteria.length).toBe(2);
            expect(criteria[0].dimension).toBe('correctness');
            expect(criteria[0].weight).toBe(0.3);
            expect(criteria[0].threshold).toBe(0.8);
        });
    });
    describe('createGateFromCriteria', () => {
        it('should create a gate with normalized weights', () => {
            const criteria = (0, gates_1.parseCriteriaJson)('correctness:0.3,security:0.7');
            const gate = (0, gates_1.createGateFromCriteria)('correctness:0.3,security:0.7');
            const totalWeight = gate.criteria.reduce((sum, c) => sum + c.weight, 0);
            expect(totalWeight).toBeCloseTo(1.0, 2);
        });
        it('should use default passing threshold', () => {
            const gate = (0, gates_1.createGateFromCriteria)('correctness:0.5');
            expect(gate.passingThreshold).toBe(0.8);
        });
        it('should allow custom options', () => {
            const gate = (0, gates_1.createGateFromCriteria)('correctness:0.5', {
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
//# sourceMappingURL=quality.test.js.map
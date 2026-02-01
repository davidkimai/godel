"use strict";
/**
 * Linter Module Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const linter_1 = require("../../src/quality/linter");
describe('Linter Module', () => {
    describe('runESLint', () => {
        it('should return a valid LintResult structure', async () => {
            // Note: This test expects ESLint to be installed
            // In CI without ESLint, it will return a result with error
            const result = await (0, linter_1.runESLint)('/nonexistent', ['**/*.ts']);
            expect(result).toHaveProperty('tool', 'eslint');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
            expect(result).toHaveProperty('summary');
            expect(result.summary).toHaveProperty('errors');
            expect(result.summary).toHaveProperty('warnings');
            expect(result.summary).toHaveProperty('total');
            expect(result.metadata).toHaveProperty('startTime');
            expect(result.metadata).toHaveProperty('endTime');
        });
        it('should handle non-existent directory gracefully', async () => {
            const result = await (0, linter_1.runESLint)('/nonexistent', ['**/*.ts']);
            // Should return a result even when directory doesn't exist
            expect(result.tool).toBe('eslint');
            expect(result.exitCode).toBeGreaterThanOrEqual(0);
        });
    });
    describe('runPrettier', () => {
        it('should return a valid LintResult structure', async () => {
            const result = await (0, linter_1.runPrettier)('/nonexistent', ['**/*.ts']);
            expect(result).toHaveProperty('tool', 'prettier');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
            expect(result).toHaveProperty('summary');
        });
    });
    describe('runPylint', () => {
        it('should return a valid LintResult structure', async () => {
            const result = await (0, linter_1.runPylint)('/nonexistent', ['**/*.py']);
            expect(result).toHaveProperty('tool', 'pylint');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
            expect(result).toHaveProperty('summary');
        });
    });
    describe('runMyPy', () => {
        it('should return type check result', async () => {
            const result = await (0, linter_1.runMyPy)('/nonexistent', ['**/*.py']);
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('issues');
        });
    });
    describe('runRustfmt', () => {
        it('should return a valid LintResult structure', async () => {
            const result = await (0, linter_1.runRustfmt)('/nonexistent', ['**/*.rs']);
            expect(result).toHaveProperty('tool', 'rustfmt');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
        });
    });
    describe('runCargoCheck', () => {
        it('should return a valid LintResult structure', async () => {
            const result = await (0, linter_1.runCargoCheck)('/nonexistent');
            expect(result).toHaveProperty('tool', 'cargo-check');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
        });
    });
    describe('runGolangciLint', () => {
        it('should return a valid LintResult structure', async () => {
            const result = await (0, linter_1.runGolangciLint)('/nonexistent', ['**/*.go']);
            expect(result).toHaveProperty('tool', 'golangci-lint');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('issues');
        });
    });
    describe('runTypeScriptCheck', () => {
        it('should return type check result', async () => {
            const result = await (0, linter_1.runTypeScriptCheck)('/nonexistent');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('issues');
        });
    });
    describe('runSecurityScan', () => {
        it('should return security scan result', async () => {
            const result = await (0, linter_1.runSecurityScan)('/nonexistent', 'bandit');
            expect(result).toHaveProperty('vulnerabilities');
            expect(result).toHaveProperty('success');
            expect(Array.isArray(result.vulnerabilities)).toBe(true);
        });
        it('should support different security tools', async () => {
            const trivyResult = await (0, linter_1.runSecurityScan)('/nonexistent', 'trivy');
            const semgrepResult = await (0, linter_1.runSecurityScan)('/nonexistent', 'semgrep');
            expect(trivyResult).toHaveProperty('vulnerabilities');
            expect(semgrepResult).toHaveProperty('vulnerabilities');
        });
    });
    describe('runLinters', () => {
        it('should return array of lint results', async () => {
            const results = await (0, linter_1.runLinters)({
                cwd: '/nonexistent',
                language: 'all',
                includePrettier: false,
                includeTypes: false,
                includeSecurity: false
            });
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });
        it('should run language-specific linters', async () => {
            const tsResults = await (0, linter_1.runLinters)({
                cwd: '/nonexistent',
                language: 'typescript',
                includePrettier: false,
                includeTypes: false
            });
            expect(tsResults.some(r => r.tool === 'eslint')).toBe(true);
        });
    });
    describe('lintAgentCodebase', () => {
        it('should return lint results and summary', async () => {
            const result = await (0, linter_1.lintAgentCodebase)({
                agentId: 'test-agent',
                agentPath: '/nonexistent',
                language: 'typescript',
                includePrettier: false,
                includeTypes: false
            });
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('summary');
            expect(result.summary).toHaveProperty('totalErrors');
            expect(result.summary).toHaveProperty('totalWarnings');
            expect(result.summary).toHaveProperty('score');
        });
        it('should detect language automatically', async () => {
            const result = await (0, linter_1.lintAgentCodebase)({
                agentId: 'test-agent',
                agentPath: '/nonexistent',
                language: 'auto',
                includePrettier: false,
                includeTypes: false
            });
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('summary');
        });
    });
});
// Helper function to create test issues
function createIssue(severity, file) {
    return {
        id: `${file}:1:1`,
        rule: 'test-rule',
        category: 'style',
        severity,
        file,
        line: 1,
        column: 1,
        message: 'Test issue',
        source: 'eslint'
    };
}
//# sourceMappingURL=linter.test.js.map
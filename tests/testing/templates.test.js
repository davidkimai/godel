"use strict";
/**
 * Test Templates Module Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const templates_1 = require("../../src/testing/templates");
describe('Test Templates Module', () => {
    const tempDir = '/tmp/dash-test-templates';
    beforeAll(() => {
        // Create temp directory
        if (!require('fs').existsSync(tempDir)) {
            require('fs').mkdirSync(tempDir, { recursive: true });
        }
    });
    afterAll(() => {
        // Cleanup temp directory
        if (require('fs').existsSync(tempDir)) {
            require('fs').rmSync(tempDir, { recursive: true });
        }
    });
    describe('TEST_TEMPLATES', () => {
        it('should contain unit test template', () => {
            const unit = templates_1.TEST_TEMPLATES.find((t) => t.name === 'unit');
            expect(unit).toBeDefined();
            expect(unit?.framework).toBe('jest');
        });
        it('should contain integration test template', () => {
            const integration = templates_1.TEST_TEMPLATES.find((t) => t.name === 'integration');
            expect(integration).toBeDefined();
            expect(integration?.framework).toBe('jest');
        });
        it('should contain API test template', () => {
            const api = templates_1.TEST_TEMPLATES.find((t) => t.name === 'api');
            expect(api).toBeDefined();
            expect(api?.framework).toBe('jest');
        });
        it('should contain React component test template', () => {
            const component = templates_1.TEST_TEMPLATES.find((t) => t.name === 'component');
            expect(component).toBeDefined();
            expect(component?.framework).toBe('jest');
        });
        it('should contain Python test templates', () => {
            const pythonUnit = templates_1.TEST_TEMPLATES.find((t) => t.name === 'python-unit');
            const pythonIntegration = templates_1.TEST_TEMPLATES.find((t) => t.name === 'python-integration');
            expect(pythonUnit).toBeDefined();
            expect(pythonUnit?.framework).toBe('pytest');
            expect(pythonIntegration).toBeDefined();
            expect(pythonIntegration?.framework).toBe('pytest');
        });
        it('should contain Rust test templates', () => {
            const rustUnit = templates_1.TEST_TEMPLATES.find((t) => t.name === 'rust-unit');
            const rustIntegration = templates_1.TEST_TEMPLATES.find((t) => t.name === 'rust-integration');
            expect(rustUnit).toBeDefined();
            expect(rustUnit?.framework).toBe('cargo');
            expect(rustIntegration).toBeDefined();
            expect(rustIntegration?.framework).toBe('cargo');
        });
        it('should contain Go test templates', () => {
            const goUnit = templates_1.TEST_TEMPLATES.find((t) => t.name === 'go-unit');
            const goIntegration = templates_1.TEST_TEMPLATES.find((t) => t.name === 'go-integration');
            expect(goUnit).toBeDefined();
            expect(goUnit?.framework).toBe('go');
            expect(goIntegration).toBeDefined();
            expect(goIntegration?.framework).toBe('go');
        });
        it('should have templates for all major frameworks', () => {
            const frameworks = new Set(templates_1.TEST_TEMPLATES.map((t) => t.framework));
            expect(frameworks).toContain('jest');
            expect(frameworks).toContain('pytest');
            expect(frameworks).toContain('cargo');
            expect(frameworks).toContain('go');
        });
    });
    describe('getTemplates', () => {
        it('should return all templates when no filter', () => {
            const templates = (0, templates_1.getTemplates)();
            expect(templates.length).toBe(templates_1.TEST_TEMPLATES.length);
        });
        it('should filter by framework', () => {
            const jestTemplates = (0, templates_1.getTemplates)('jest');
            const pytestTemplates = (0, templates_1.getTemplates)('pytest');
            for (const t of jestTemplates) {
                expect(t.framework).toBe('jest');
            }
            for (const t of pytestTemplates) {
                expect(t.framework).toBe('pytest');
            }
        });
    });
    describe('getTemplate', () => {
        it('should return template by name', () => {
            const unit = (0, templates_1.getTemplate)('unit');
            expect(unit?.name).toBe('unit');
        });
        it('should filter by framework when specified', () => {
            const pythonUnit = (0, templates_1.getTemplate)('unit', 'pytest');
            expect(pythonUnit?.framework).toBe('pytest');
            const jestUnit = (0, templates_1.getTemplate)('unit', 'jest');
            expect(jestUnit?.framework).toBe('jest');
        });
        it('should return undefined for non-existent template', () => {
            const nonExistent = (0, templates_1.getTemplate)('non-existent');
            expect(nonExistent).toBeUndefined();
        });
    });
    describe('listTemplateNames', () => {
        it('should return all template names', () => {
            const names = (0, templates_1.listTemplateNames)();
            expect(names).toContain('unit');
            expect(names).toContain('integration');
            expect(names).toContain('api');
        });
        it('should filter by framework', () => {
            const jestNames = (0, templates_1.listTemplateNames)('jest');
            const pythonNames = (0, templates_1.listTemplateNames)('pytest');
            expect(jestNames.length).toBeGreaterThan(0);
            expect(pythonNames.length).toBeGreaterThan(0);
        });
    });
    describe('generateTest', () => {
        it('should generate unit test file', () => {
            const result = (0, templates_1.generateTest)({
                template: 'unit',
                targetFile: 'src/components/Button.tsx',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            expect(result.filePath).toContain('Button.test.tsx');
        });
        it('should generate Python test file', () => {
            const result = (0, templates_1.generateTest)({
                template: 'python-unit',
                targetFile: 'utils/validation.py',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            expect(result.filePath).toContain('test_validation.py');
        });
        it('should generate Rust test file', () => {
            const result = (0, templates_1.generateTest)({
                template: 'rust-unit',
                targetFile: 'src/main.rs',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            expect(result.filePath).toContain('main.rs');
        });
        it('should generate Go test file', () => {
            const result = (0, templates_1.generateTest)({
                template: 'go-unit',
                targetFile: 'handlers/user.go',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            expect(result.filePath).toContain('user_test.go');
        });
        it('should replace template variables', () => {
            const result = (0, templates_1.generateTest)({
                template: 'unit',
                targetFile: 'src/services/UserService.ts',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            const content = require('fs').readFileSync(result.filePath, 'utf-8');
            // Check that placeholders were replaced
            expect(content).not.toContain('{{filename}}');
            expect(content).not.toContain('{{className}}');
            expect(content).toContain('UserService');
        });
        it('should handle kebab-case file names', () => {
            const result = (0, templates_1.generateTest)({
                template: 'unit',
                targetFile: 'src/components/my-button.tsx',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            const content = require('fs').readFileSync(result.filePath, 'utf-8');
            expect(content).toContain('MyButton');
        });
        it('should create output directory if not exists', () => {
            const nestedDir = require('path').join(tempDir, 'nested', 'output');
            const result = (0, templates_1.generateTest)({
                template: 'unit',
                targetFile: 'src/test.ts',
                outputDir: nestedDir
            });
            expect(result.success).toBe(true);
            expect(require('fs').existsSync(nestedDir)).toBe(true);
        });
        it('should fail for non-existent template', () => {
            const result = (0, templates_1.generateTest)({
                template: 'non-existent',
                targetFile: 'src/test.ts',
                outputDir: tempDir
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
        it('should filter templates by framework', () => {
            const result = (0, templates_1.generateTest)({
                template: 'unit',
                targetFile: 'src/test.py',
                framework: 'pytest',
                outputDir: tempDir
            });
            expect(result.success).toBe(true);
            const content = require('fs').readFileSync(result.filePath, 'utf-8');
            expect(content).toContain('import pytest');
        });
    });
    describe('template structure', () => {
        it('should have description for each template', () => {
            for (const template of templates_1.TEST_TEMPLATES) {
                expect(template.description.length).toBeGreaterThan(0);
            }
        });
        it('should have valid fileName pattern', () => {
            for (const template of templates_1.TEST_TEMPLATES) {
                expect(template.fileName.length).toBeGreaterThan(0);
                expect(template.fileName).toContain('{{name}}');
            }
        });
        it('should have non-empty template content', () => {
            for (const template of templates_1.TEST_TEMPLATES) {
                expect(template.template.length).toBeGreaterThan(0);
            }
        });
    });
});
//# sourceMappingURL=templates.test.js.map
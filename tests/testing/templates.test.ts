/**
 * Test Templates Module Tests
 */

import {
  generateTest,
  getTemplates,
  getTemplate,
  listTemplateNames,
  TEST_TEMPLATES,
  type TestTemplate
} from '../../src/testing/templates';

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
      const unit = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'unit');
      expect(unit).toBeDefined();
      expect(unit?.framework).toBe('jest');
    });
    
    it('should contain integration test template', () => {
      const integration = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'integration');
      expect(integration).toBeDefined();
      expect(integration?.framework).toBe('jest');
    });
    
    it('should contain API test template', () => {
      const api = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'api');
      expect(api).toBeDefined();
      expect(api?.framework).toBe('jest');
    });
    
    it('should contain React component test template', () => {
      const component = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'component');
      expect(component).toBeDefined();
      expect(component?.framework).toBe('jest');
    });
    
    it('should contain Python test templates', () => {
      const pythonUnit = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'python-unit');
      const pythonIntegration = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'python-integration');
      
      expect(pythonUnit).toBeDefined();
      expect(pythonUnit?.framework).toBe('pytest');
      expect(pythonIntegration).toBeDefined();
      expect(pythonIntegration?.framework).toBe('pytest');
    });
    
    it('should contain Rust test templates', () => {
      const rustUnit = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'rust-unit');
      const rustIntegration = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'rust-integration');
      
      expect(rustUnit).toBeDefined();
      expect(rustUnit?.framework).toBe('cargo');
      expect(rustIntegration).toBeDefined();
      expect(rustIntegration?.framework).toBe('cargo');
    });
    
    it('should contain Go test templates', () => {
      const goUnit = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'go-unit');
      const goIntegration = TEST_TEMPLATES.find((t: TestTemplate) => t.name === 'go-integration');
      
      expect(goUnit).toBeDefined();
      expect(goUnit?.framework).toBe('go');
      expect(goIntegration).toBeDefined();
      expect(goIntegration?.framework).toBe('go');
    });
    
    it('should have templates for all major frameworks', () => {
      const frameworks = new Set(TEST_TEMPLATES.map((t: TestTemplate) => t.framework));
      
      expect(frameworks).toContain('jest');
      expect(frameworks).toContain('pytest');
      expect(frameworks).toContain('cargo');
      expect(frameworks).toContain('go');
    });
  });
  
  describe('getTemplates', () => {
    it('should return all templates when no filter', () => {
      const templates = getTemplates();
      expect(templates.length).toBe(TEST_TEMPLATES.length);
    });
    
    it('should filter by framework', () => {
      const jestTemplates = getTemplates('jest');
      const pytestTemplates = getTemplates('pytest');
      
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
      const unit = getTemplate('unit');
      expect(unit?.name).toBe('unit');
    });
    
    it('should filter by framework when specified', () => {
      const pythonUnit = getTemplate('python-unit', 'pytest');
      expect(pythonUnit?.framework).toBe('pytest');
      
      const jestUnit = getTemplate('unit', 'jest');
      expect(jestUnit?.framework).toBe('jest');
    });
    
    it('should return undefined for non-existent template', () => {
      const nonExistent = getTemplate('non-existent');
      expect(nonExistent).toBeUndefined();
    });
  });
  
  describe('listTemplateNames', () => {
    it('should return all template names', () => {
      const names = listTemplateNames();
      expect(names).toContain('unit');
      expect(names).toContain('integration');
      expect(names).toContain('api');
    });
    
    it('should filter by framework', () => {
      const jestNames = listTemplateNames('jest');
      const pythonNames = listTemplateNames('pytest');
      
      expect(jestNames.length).toBeGreaterThan(0);
      expect(pythonNames.length).toBeGreaterThan(0);
    });
  });
  
  describe('generateTest', () => {
    it('should generate unit test file', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/components/Button.tsx',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('Button.test.tsx');
    });
    
    it('should generate Python test file', () => {
      const result = generateTest({
        template: 'python-unit',
        targetFile: 'utils/validation.py',
        outputDir: tempDir,
        framework: 'pytest'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('test_validation.py');
    });
    
    it('should generate Rust test file', () => {
      const result = generateTest({
        template: 'rust-unit',
        targetFile: 'src/main.rs',
        outputDir: tempDir,
        framework: 'cargo'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('main.rs');
    });
    
    it('should generate Go test file', () => {
      const result = generateTest({
        template: 'go-unit',
        targetFile: 'handlers/user.go',
        outputDir: tempDir,
        framework: 'go'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('user_test.go');
    });
    
    it('should replace template variables', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/services/UserService.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      
      // Check that placeholders were replaced
      expect(content).not.toContain('{{filename}}');
      expect(content).not.toContain('{{className}}');
      expect(content).toContain('UserService');
    });
    
    it('should handle kebab-case file names', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/components/my-button.tsx',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('MyButton');
    });
    
    it('should create output directory if not exists', () => {
      const nestedDir = require('path').join(tempDir, 'nested', 'output');
      
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/test.ts',
        outputDir: nestedDir
      });
      
      expect(result.success).toBe(true);
      expect(require('fs').existsSync(nestedDir)).toBe(true);
    });
    
    it('should fail for non-existent template', () => {
      const result = generateTest({
        template: 'non-existent',
        targetFile: 'src/test.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
    
    it('should filter templates by framework', () => {
      const result = generateTest({
        template: 'python-unit',
        targetFile: 'src/test.py',
        framework: 'pytest',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('import pytest');
    });
  });
  
  describe('template structure', () => {
    it('should have description for each template', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.description.length).toBeGreaterThan(0);
      }
    });
    
    it('should have valid fileName pattern', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.fileName.length).toBeGreaterThan(0);
        expect(template.fileName).toContain('{{name}}');
      }
    });
    
    it('should have non-empty template content', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.template.length).toBeGreaterThan(0);
      }
    });
  });
  
  describe('generateTestSuite', () => {
    it('should create tests directory', () => {
      const suiteDir = require('path').join(tempDir, 'suite-test');
      
      // Clear if exists
      if (require('fs').existsSync(suiteDir)) {
        require('fs').rmSync(suiteDir, { recursive: true });
      }
      
      const { generateTestSuite } = require('../../src/testing/templates');
      const result = generateTestSuite(suiteDir, 'jest');
      
      expect(result.success).toBe(true);
      expect(require('fs').existsSync(require('path').join(suiteDir, 'tests'))).toBe(true);
    });
    
    it('should return empty files array when no templates generated', () => {
      const { generateTestSuite } = require('../../src/testing/templates');
      const result = generateTestSuite(tempDir, 'jest');
      
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([]);
    });
    
    it('should handle already existing tests directory', () => {
      const suiteDir = require('path').join(tempDir, 'suite-existing');
      require('fs').mkdirSync(require('path').join(suiteDir, 'tests'), { recursive: true });
      
      const { generateTestSuite } = require('../../src/testing/templates');
      const result = generateTestSuite(suiteDir, 'jest');
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('generateTest error handling', () => {
    it('should handle file write errors gracefully', () => {
      // Attempt to write to an invalid path
      const { generateTest } = require('../../src/testing/templates');
      const result = generateTest({
        template: 'unit',
        targetFile: '/nonexistent/path/test.ts',
        outputDir: '/invalid/directory',
        framework: 'jest'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('Template variable replacement edge cases', () => {
    it('should handle snake_case file names', () => {
      const { generateTest } = require('../../src/testing/templates');
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/my_snake_case_component.tsx',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('MySnakeCaseComponent');
    });
    
    it('should handle ALL_CAPS file names', () => {
      const { generateTest } = require('../../src/testing/templates');
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/UTILS.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('UTILS');
    });
    
    it('should handle numbers in file names', () => {
      const { generateTest } = require('../../src/testing/templates');
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/v2-api.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('V2Api');
    });
  });
});

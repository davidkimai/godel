/**
 * Templates Tests - Extended
 * 
 * Additional tests for templates.ts to ensure complete coverage
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  getTemplates,
  getTemplate,
  listTemplateNames,
  generateTest,
  generateTestSuite,
  TEST_TEMPLATES,
  type TestTemplate
} from '../../src/testing/templates';
import { TestFramework } from '../../src/testing/types';

describe('Templates Extended Tests', () => {
  const tempDir = path.join(__dirname, 'templates-temp');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Template Validation', () => {
    it('should have unique template names', () => {
      const names = TEST_TEMPLATES.map(t => t.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });

    it('should have templates for all major frameworks', () => {
      const frameworks = new Set(TEST_TEMPLATES.map(t => t.framework));
      
      expect(frameworks).toContain('jest');
      expect(frameworks).toContain('pytest');
      expect(frameworks).toContain('cargo');
      expect(frameworks).toContain('go');
    });

    it('should have non-empty descriptions for all templates', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.description).toBeDefined();
        expect(typeof template.description).toBe('string');
        expect(template.description.length).toBeGreaterThan(0);
      }
    });

    it('should have valid fileName patterns', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.fileName).toBeDefined();
        expect(template.fileName.length).toBeGreaterThan(0);
        expect(template.fileName).toContain('{{name}}');
      }
    });

    it('should have template content with placeholders', () => {
      for (const template of TEST_TEMPLATES) {
        expect(template.template).toBeDefined();
        expect(template.template.length).toBeGreaterThan(0);
        expect(template.template).toMatch(/\{\{.*\}\}/);
      }
    });
  });

  describe('getTemplates', () => {
    it('should return all templates when framework is undefined', () => {
      const all = getTemplates();
      expect(all.length).toBe(TEST_TEMPLATES.length);
    });

    it('should filter for jest framework', () => {
      const jestTemplates = getTemplates('jest');
      for (const t of jestTemplates) {
        expect(t.framework).toBe('jest');
      }
      expect(jestTemplates.length).toBeGreaterThan(0);
    });

    it('should filter for pytest framework', () => {
      const pytestTemplates = getTemplates('pytest');
      expect(pytestTemplates.length).toBeGreaterThan(0);
      for (const t of pytestTemplates) {
        expect(t.framework).toBe('pytest');
      }
    });

    it('should return empty array for unknown framework', () => {
      const unknownTemplates = getTemplates('unknown' as TestFramework);
      expect(unknownTemplates).toEqual([]);
    });
  });

  describe('getTemplate', () => {
    it('should find unit template', () => {
      const unit = getTemplate('unit');
      expect(unit).toBeDefined();
      expect(unit?.name).toBe('unit');
    });

    it('should find integration template', () => {
      const integration = getTemplate('integration');
      expect(integration).toBeDefined();
      expect(integration?.name).toBe('integration');
    });

    it('should find component template', () => {
      const component = getTemplate('component');
      expect(component).toBeDefined();
      expect(component?.name).toBe('component');
    });

    it('should find api template', () => {
      const api = getTemplate('api');
      expect(api).toBeDefined();
      expect(api?.name).toBe('api');
    });

    it('should return undefined for non-existent template', () => {
      const nonExistent = getTemplate('does-not-exist');
      expect(nonExistent).toBeUndefined();
    });

    it('should filter by framework correctly', () => {
      const jestUnit = getTemplate('unit', 'jest');
      expect(jestUnit?.framework).toBe('jest');
      
      const pythonUnit = getTemplate('python-unit', 'pytest');
      expect(pythonUnit?.framework).toBe('pytest');
    });
  });

  describe('listTemplateNames', () => {
    it('should return all template names', () => {
      const names = listTemplateNames();
      
      expect(names).toContain('unit');
      expect(names).toContain('integration');
      expect(names).toContain('api');
      expect(names).toContain('component');
      expect(names).toContain('python-unit');
      expect(names).toContain('python-integration');
      expect(names).toContain('rust-unit');
      expect(names).toContain('rust-integration');
      expect(names).toContain('go-unit');
      expect(names).toContain('go-integration');
    });

    it('should filter names by framework', () => {
      const jestNames = listTemplateNames('jest');
      expect(jestNames).toContain('unit');
      expect(jestNames).toContain('integration');
      expect(jestNames).not.toContain('python-unit');
      expect(jestNames).not.toContain('go-unit');
    });

    it('should return empty array for unknown framework', () => {
      const unknownNames = listTemplateNames('unknown' as TestFramework);
      expect(unknownNames).toEqual([]);
    });
  });

  describe('generateTest', () => {
    it('should generate jest unit test', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/components/Button.tsx',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.filePath!.endsWith('Button.test.tsx')).toBe(true);
    });

    it('should generate pytest test', () => {
      const result = generateTest({
        template: 'python-unit',
        targetFile: 'utils/validators.py',
        outputDir: tempDir,
        framework: 'pytest'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath!.endsWith('test_validators.py')).toBe(true);
    });

    it('should generate rust test', () => {
      const result = generateTest({
        template: 'rust-unit',
        targetFile: 'src/main.rs',
        outputDir: tempDir,
        framework: 'cargo'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath!.endsWith('main.rs')).toBe(true);
    });

    it('should generate go test', () => {
      const result = generateTest({
        template: 'go-unit',
        targetFile: 'handlers/users.go',
        outputDir: tempDir,
        framework: 'go'
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath!.endsWith('users_test.go')).toBe(true);
    });

    it('should fail for non-existent template', () => {
      const result = generateTest({
        template: 'non-existent-template',
        targetFile: 'src/test.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });

    it('should replace className placeholder', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/services/UserService.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = fs.readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('UserService');
      expect(content).not.toContain('{{className}}');
    });

    it('should replace ClassName placeholder', () => {
      const result = generateTest({
        template: 'go-unit',
        targetFile: 'handlers/auth.go',
        outputDir: tempDir,
        framework: 'go'
      });
      
      expect(result.success).toBe(true);
      
      const content = fs.readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('Auth');
      expect(content).not.toContain('{{ClassName}}');
    });

    it('should handle snake_case file names', () => {
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/utils/my_helper.ts',
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = fs.readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('MyHelper');
    });

    it('should create nested output directories', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'path');
      
      const result = generateTest({
        template: 'unit',
        targetFile: 'src/test.ts',
        outputDir: nestedDir
      });
      
      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should handle file names with numbers', () => {
      const numName = 'test123.ts';
      
      const result = generateTest({
        template: 'unit',
        targetFile: numName,
        outputDir: tempDir
      });
      
      expect(result.success).toBe(true);
      
      const content = fs.readFileSync(result.filePath!, 'utf-8');
      expect(content).toContain('Test123');
    });
  });

  describe('generateTestSuite', () => {
    it('should create tests directory', () => {
      const suiteDir = path.join(tempDir, 'suite-test');
      
      const result = generateTestSuite(suiteDir);
      
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(suiteDir, 'tests'))).toBe(true);
    });

    it('should return empty files and errors array', () => {
      const suiteDir = path.join(tempDir, 'suite-test-2');
      
      const result = generateTestSuite(suiteDir);
      
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should handle different directory names', () => {
      const dirs = ['suite-a', 'suite-b', 'suite-c'];
      
      for (const dirName of dirs) {
        const suiteDir = path.join(tempDir, dirName);
        const result = generateTestSuite(suiteDir);
        
        expect(result.success).toBe(true);
      }
    });

    it('should not fail if tests directory exists', () => {
      const suiteDir = path.join(tempDir, 'suite-exists');
      fs.mkdirSync(path.join(suiteDir, 'tests'), { recursive: true });
      
      const result = generateTestSuite(suiteDir);
      
      expect(result.success).toBe(true);
    });
  });
});

describe('Template Edge Cases', () => {
  const tempDir = path.join(__dirname, 'templates-edge');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle very long file names', () => {
    const longName = 'a'.repeat(100) + '.ts';
    
    const result = generateTest({
      template: 'unit',
      targetFile: longName,
      outputDir: tempDir
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle file names with special characters', () => {
    const specialName = 'test-file_v2.ts';
    
    const result = generateTest({
      template: 'unit',
      targetFile: specialName,
      outputDir: tempDir
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle file names starting with numbers', () => {
    const numStart = '123test.ts';
    
    const result = generateTest({
      template: 'unit',
      targetFile: numStart,
      outputDir: tempDir
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle file names with only one character', () => {
    const singleChar = 'a.ts';
    
    const result = generateTest({
      template: 'unit',
      targetFile: singleChar,
      outputDir: tempDir
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle empty template filters gracefully', () => {
    const result = getTemplate('');
    expect(result).toBeUndefined();
  });
});

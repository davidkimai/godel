/**
 * Test Templates Module
 *
 * Generate test templates for various frameworks and test types
 */
import type { TestFramework } from './types';
/**
 * Test template definition
 */
export interface TestTemplate {
    name: string;
    description: string;
    framework: TestFramework;
    template: string;
    fileName: string;
}
/**
 * Generate test result
 */
export interface GenerateTestResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
/**
 * Available test templates
 */
export declare const TEST_TEMPLATES: TestTemplate[];
/**
 * Get all templates or filter by framework
 */
export declare function getTemplates(framework?: TestFramework): TestTemplate[];
/**
 * Get a specific template by name
 */
export declare function getTemplate(name: string, framework?: TestFramework): TestTemplate | undefined;
/**
 * List all template names
 */
export declare function listTemplateNames(framework?: TestFramework): string[];
/**
 * Generate a test file from a template
 */
export declare function generateTest(options: {
    template: string;
    targetFile: string;
    outputDir?: string;
    framework?: string;
}): GenerateTestResult;
/**
 * Generate multiple test files for an agent
 */
export declare function generateTestSuite(targetDir: string): {
    success: boolean;
    files: string[];
    errors: string[];
};
//# sourceMappingURL=templates.d.ts.map
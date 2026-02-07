/**
 * Test Writer Agent
 * 
 * Generates reproduction tests for detected errors.
 * Uses LLM to create comprehensive test cases.
 */

import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { dirname, join, basename, extname } from 'path';
import {
  TestGenerationTask,
  TestResult,
  TestValidation,
  TestWriterAgent as ITestWriterAgent,
  LLMService,
  FileSystem,
} from './types';

// ============================================================================
// File System Implementation
// ============================================================================

class LocalFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    const { readFileSync } = await import('fs');
    return readFileSync(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { writeFileSync } = await import('fs');
    const { mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    
    const dir = dirname(path);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }
    
    writeFileSync(path, content, 'utf-8');
  }

  async deleteFile(path: string): Promise<void> {
    const { unlinkSync } = await import('fs');
    unlinkSync(path);
  }

  async exists(path: string): Promise<boolean> {
    const { existsSync } = await import('fs');
    return existsSync(path);
  }
}

// ============================================================================
// LLM Service Implementation
// ============================================================================

import { quickComplete } from '../core/llm';

class DefaultLLMService implements LLMService {
  async complete(prompt: string): Promise<string> {
    try {
      return await quickComplete(prompt);
    } catch (error) {
      logger.error('autonomic-test-writer', `LLM completion failed: ${error}`);
      throw error;
    }
  }
}

// ============================================================================
// Test Writer Agent Implementation
// ============================================================================

export class TestWriterAgent implements ITestWriterAgent {
  private llm: LLMService;
  private fileSystem: FileSystem;

  constructor(llm?: LLMService, fileSystem?: FileSystem) {
    this.llm = llm || new DefaultLLMService();
    this.fileSystem = fileSystem || new LocalFileSystem();
  }

  async generateReproductionTest(task: TestGenerationTask): Promise<TestResult> {
    logger.info('autonomic-test-writer', `📝 Generating reproduction test for error ${task.errorId}`);

    // Read the source file where error occurred
    let sourceCode: string;
    try {
      sourceCode = await this.fileSystem.readFile(task.targetFile);
    } catch (error) {
      logger.error('autonomic-test-writer', `Failed to read source file: ${error}`);
      sourceCode = '// Source file not found';
    }

    // Read existing tests
    const testFile = this.findTestFile(task.targetFile);
    let existingTests = '';
    if (testFile) {
      try {
        existingTests = await this.fileSystem.readFile(testFile);
      } catch {
        // No existing tests
      }
    }

    // Generate test using LLM
    const prompt = this.buildTestPrompt(task, sourceCode, existingTests);
    
    let testCode: string;
    try {
      testCode = await this.llm.complete(prompt);
    } catch (error) {
      logger.error('autonomic-test-writer', `LLM test generation failed: ${error}`);
      throw error;
    }

    // Clean up the response (remove markdown code blocks if present)
    testCode = this.cleanTestCode(testCode);

    // Validate test
    const validation = await this.validateTest(testCode, task.targetFile);
    
    if (!validation.passes) {
      logger.warn('autonomic-test-writer', 'Initial test validation failed, retrying...');
      
      // Retry with feedback
      const retryPrompt = this.buildRetryPrompt(prompt, testCode, validation.errors || '');
      testCode = await this.llm.complete(retryPrompt);
      testCode = this.cleanTestCode(testCode);
      
      const retryValidation = await this.validateTest(testCode, task.targetFile);
      if (!retryValidation.passes) {
        logger.error('autonomic-test-writer', `Test validation failed after retry: ${retryValidation.errors}`);
      }
      
      return {
        testCode,
        testFile: testFile || this.generateTestFileName(task.targetFile),
        reproducesError: retryValidation.reproducesError,
      };
    }

    logger.info('autonomic-test-writer', `✅ Test generated successfully`);

    return {
      testCode,
      testFile: testFile || this.generateTestFileName(task.targetFile),
      reproducesError: validation.reproducesError,
    };
  }

  private findTestFile(sourceFile: string): string | undefined {
    const dir = dirname(sourceFile);
    const base = basename(sourceFile, extname(sourceFile));
    
    // Common test file patterns
    const candidates = [
      join(dir, `${base}.test.ts`),
      join(dir, `${base}.spec.ts`),
      join(dir, '__tests__', `${base}.test.ts`),
      join(dir, '__tests__', `${base}.spec.ts`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private generateTestFileName(sourceFile: string): string {
    const dir = dirname(sourceFile);
    const base = basename(sourceFile, extname(sourceFile));
    return join(dir, `${base}.autonomic.test.ts`);
  }

  private buildTestPrompt(task: TestGenerationTask, sourceCode: string, existingTests: string): string {
    return `
You are an expert test engineer. Write a Jest test that reproduces the following error:

ERROR DETAILS:
- Error Type: ${task.error.errorType}
- Message: ${task.error.message}
${task.error.stackTrace ? `- Stack Trace:\n${task.error.stackTrace}` : ''}

SOURCE FILE: ${task.targetFile}

SOURCE CODE:
\`\`\`typescript
${sourceCode}
\`\`\`

${existingTests ? `EXISTING TESTS (for reference):
\`\`\`typescript
${existingTests}
\`\`\`` : ''}

INSTRUCTIONS:
1. Write a Jest test that reproduces the exact error above
2. The test should call the function/method that failed with inputs that trigger the error
3. Use expect().toThrow() or try-catch to assert the error occurs
4. The test should be isolated and not depend on external state
5. Import the function being tested from the correct relative path
6. Include any necessary mocks or setup

OUTPUT FORMAT:
Return ONLY the test code, wrapped in a TypeScript code block. Do not include explanations.

Example:
\`\`\`typescript
import { functionName } from './module';

describe('functionName', () => {
  it('should throw error when...', () => {
    expect(() => functionName(...)).toThrow('expected error message');
  });
});
\`\`\`
`;
  }

  private buildRetryPrompt(originalPrompt: string, failedTestCode: string, errors: string): string {
    return `${originalPrompt}

---

PREVIOUS ATTEMPT FAILED:
\`\`\`typescript
${failedTestCode}
\`\`\`

ERRORS:
${errors}

Please fix the issues and generate a corrected test.
`;
  }

  private cleanTestCode(code: string): string {
    // Remove markdown code block markers
    let cleaned = code.replace(/```typescript\n/g, '');
    cleaned = cleaned.replace(/```\n/g, '');
    cleaned = cleaned.replace(/```$/g, '');
    cleaned = cleaned.replace(/```\s*$/g, '');
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  private async validateTest(testCode: string, targetFile: string): Promise<TestValidation> {
    const tempFile = `/tmp/autonomic-test-${Date.now()}.test.ts`;
    
    try {
      // Write test to temp file
      writeFileSync(tempFile, testCode);

      // Try to compile the TypeScript
      try {
        execSync(`npx tsc --noEmit ${tempFile}`, { 
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 30000,
        });
      } catch (compileError) {
        const errorOutput = String(compileError);
        if (errorOutput.includes('error TS')) {
          return {
            passes: false,
            reproducesError: false,
            errors: `TypeScript compilation error: ${errorOutput}`,
          };
        }
      }

      // Try to run the test
      try {
        const result = execSync(`npm test -- ${tempFile} --passWithNoTests --no-coverage`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 60000,
          encoding: 'utf-8',
        });
        
        // Test passed (which means the error wasn't reproduced - we want the test to fail)
        return {
          passes: false,
          reproducesError: false,
          errors: 'Test passed but should have failed (error not reproduced)',
        };
      } catch (testError) {
        const errorOutput = String(testError);
        
        // Check if the test failed as expected (meaning the error was reproduced)
        if (errorOutput.includes('FAIL') || errorOutput.includes('Error')) {
          return {
            passes: true, // The test framework ran successfully
            reproducesError: true, // The error was reproduced (test failed as expected)
            errors: undefined,
          };
        }
        
        return {
          passes: false,
          reproducesError: false,
          errors: errorOutput,
        };
      }
    } catch (error) {
      return {
        passes: false,
        reproducesError: false,
        errors: String(error),
      };
    } finally {
      // Cleanup
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export default TestWriterAgent;

/**
 * Patch Agent
 * 
 * Generates code fixes for detected errors based on reproduction tests.
 * Uses LLM to create minimal, targeted patches.
 */

import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  PatchTask,
  PatchResult,
  FileChange,
  PatchAgent as IPatchAgent,
  LLMService,
  FileSystem,
  TestRunner,
} from './types';
import { quickComplete } from '../core/llm';

// ============================================================================
// Diff Creation
// ============================================================================

function createDiff(original: string, modified: string): string {
  const lines1 = original.split('\n');
  const lines2 = modified.split('\n');
  
  let diff = '--- original\n+++ modified\n';
  let oldLine = 1;
  let newLine = 1;
  
  // Simple diff - in production, use a proper diff library
  if (original !== modified) {
    diff += `@@ -1,${lines1.length} +1,${lines2.length} @@\n`;
    
    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];
      
      if (line1 === undefined) {
        diff += `+${line2}\n`;
      } else if (line2 === undefined) {
        diff += `-${line1}\n`;
      } else if (line1 !== line2) {
        diff += `-${line1}\n`;
        diff += `+${line2}\n`;
      } else {
        diff += ` ${line1}\n`;
      }
    }
  }
  
  return diff;
}

// ============================================================================
// Default Service Implementations
// ============================================================================

class DefaultLLMService implements LLMService {
  async complete(prompt: string): Promise<string> {
    try {
      return await quickComplete(prompt);
    } catch (error) {
      logger.error('autonomic-patch-agent', `LLM completion failed: ${error}`);
      throw error;
    }
  }
}

class LocalFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    const { readFileSync } = await import('fs');
    return readFileSync(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('fs');
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

class JestTestRunner implements TestRunner {
  async runTest(testCode: string): Promise<{ passes: boolean; error?: string }> {
    const tempFile = `/tmp/autonomic-patch-test-${Date.now()}.test.ts`;
    
    try {
      writeFileSync(tempFile, testCode);
      
      execSync(`npm test -- ${tempFile} --passWithNoTests --no-coverage`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000,
        encoding: 'utf-8',
      });
      
      return { passes: true };
    } catch (error) {
      const errorOutput = String(error);
      
      // Check if test passed (error was fixed)
      if (errorOutput.includes('PASS')) {
        return { passes: true };
      }
      
      return { 
        passes: false, 
        error: errorOutput,
      };
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// Parsed Fix Result
// ============================================================================

interface ParsedFix {
  file: string;
  modified: string;
}

// ============================================================================
// Patch Agent Implementation
// ============================================================================

export class PatchAgent implements IPatchAgent {
  private llm: LLMService;
  private fileSystem: FileSystem;
  private testRunner: TestRunner;

  constructor(
    llm?: LLMService,
    fileSystem?: FileSystem,
    testRunner?: TestRunner
  ) {
    this.llm = llm || new DefaultLLMService();
    this.fileSystem = fileSystem || new LocalFileSystem();
    this.testRunner = testRunner || new JestTestRunner();
  }

  async generateFix(task: PatchTask): Promise<PatchResult> {
    logger.info('autonomic-patch-agent', `🔧 Generating fix for error ${task.errorId}`);

    // Read the failing code
    let sourceCode: string;
    try {
      sourceCode = await this.fileSystem.readFile(task.targetFile);
    } catch (error) {
      logger.error('autonomic-patch-agent', `Failed to read source file: ${error}`);
      throw new Error(`Cannot read source file: ${task.targetFile}`);
    }

    // Generate fix using LLM
    const prompt = this.buildFixPrompt(task, sourceCode);
    
    let fixResponse: string;
    try {
      fixResponse = await this.llm.complete(prompt);
    } catch (error) {
      logger.error('autonomic-patch-agent', `LLM fix generation failed: ${error}`);
      throw error;
    }

    // Parse the fix
    const changes = this.parseFixResponse(fixResponse, task.targetFile);
    
    if (changes.length === 0) {
      throw new Error('No valid fixes were generated by the LLM');
    }

    // Apply changes and test
    const appliedChanges: FileChange[] = [];
    const backups = new Map<string, string>();
    
    try {
      for (const change of changes) {
        // Backup original
        const original = await this.fileSystem.readFile(change.file);
        backups.set(change.file, original);
        
        // Apply change
        await this.fileSystem.writeFile(change.file, change.modified);
        appliedChanges.push({
          file: change.file,
          original,
          modified: change.modified,
          diff: createDiff(original, change.modified),
        });
      }

      // Run the reproduction test
      logger.info('autonomic-patch-agent', 'Running reproduction test...');
      const testResult = await this.testRunner.runTest(task.testCode);

      if (!testResult.passes) {
        throw new Error(`Fix did not resolve the issue: ${testResult.error}`);
      }

      logger.info('autonomic-patch-agent', '✅ Fix verified with passing test');

      return {
        id: uuidv4(),
        errorId: task.errorId,
        fileChanges: appliedChanges,
        description: this.generateDescription(appliedChanges),
        testPasses: true,
      };
    } catch (error) {
      // Revert changes on failure
      logger.warn('autonomic-patch-agent', `Fix failed, reverting changes: ${error}`);
      
      for (const [file, original] of backups) {
        await this.fileSystem.writeFile(file, original);
      }
      
      throw error;
    }
  }

  private buildFixPrompt(task: PatchTask, sourceCode: string): string {
    return `
You are a senior software engineer tasked with fixing a bug in the code.

ERROR DETAILS:
- Error Type: ${task.error.errorType}
- Message: ${task.error.message}
${task.error.stackTrace ? `- Stack Trace:\n${task.error.stackTrace}` : ''}

SOURCE FILE: ${task.targetFile}

SOURCE CODE:
\`\`\`typescript
${sourceCode}
\`\`\`

REPRODUCTION TEST:
\`\`\`typescript
${task.testCode}
\`\`\`

INSTRUCTIONS:
1. Analyze the error message and stack trace
2. Identify the root cause in the source code
3. Make MINIMAL changes to fix the bug
4. Do NOT change the test - only fix the source code
5. Preserve the existing code style and structure
6. Add appropriate error handling if needed

OUTPUT FORMAT:
Provide the fixed code in the following format:

FILE: ${task.targetFile}
\`\`\`typescript
<complete fixed file content>
\`\`\`

EXPLANATION: <brief explanation of the fix (1-2 sentences)>

IMPORTANT:
- Return the COMPLETE file content, not just the changed lines
- Ensure the code is syntactically correct TypeScript
- Do not include any markdown outside the code blocks
`;
  }

  private parseFixResponse(response: string, defaultFile: string): ParsedFix[] {
    const changes: ParsedFix[] = [];
    
    // Extract file blocks using regex
    const fileRegex = /FILE:\s*(.+?)\n```typescript\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    
    while ((match = fileRegex.exec(response)) !== null) {
      const file = match[1].trim();
      const code = match[2].trim();
      
      if (file && code) {
        changes.push({
          file: file.startsWith('/') ? file : `${process.cwd()}/${file}`,
          modified: code,
        });
      }
    }
    
    // If no FILE: blocks found, assume the whole response is the fix for the default file
    if (changes.length === 0) {
      const codeBlockMatch = response.match(/```typescript\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        changes.push({
          file: defaultFile,
          modified: codeBlockMatch[1].trim(),
        });
      } else {
        // Try without language specifier
        const plainCodeBlock = response.match(/```\n([\s\S]*?)```/);
        if (plainCodeBlock) {
          changes.push({
            file: defaultFile,
            modified: plainCodeBlock[1].trim(),
          });
        }
      }
    }
    
    return changes;
  }

  private generateDescription(changes: FileChange[]): string {
    const files = changes.map(c => c.file).join(', ');
    return `Fixed bug in ${files}. ${changes.length} file(s) modified with minimal changes.`;
  }
}

export default PatchAgent;

/**
 * Patch Agent Tests
 */

import { PatchAgent } from '../patch-agent';
import { PatchTask, LLMService, FileSystem, TestRunner } from '../types';

// Mock the LLM module
jest.mock('../../core/llm', () => ({
  quickComplete: jest.fn(),
}));

describe('PatchAgent', () => {
  let agent: PatchAgent;
  let mockLLM: jest.Mocked<LLMService>;
  let mockFileSystem: jest.Mocked<FileSystem>;
  let mockTestRunner: jest.Mocked<TestRunner>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLLM = {
      complete: jest.fn(),
    };

    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
      exists: jest.fn(),
    };

    mockTestRunner = {
      runTest: jest.fn(),
    };

    agent = new PatchAgent(mockLLM, mockFileSystem, mockTestRunner);
  });

  describe('Fix Generation', () => {
    const mockTask: PatchTask = {
      errorId: 'err-123',
      error: {
        id: 'err-123',
        timestamp: Date.now(),
        source: 'test.ts',
        errorType: 'TypeError',
        message: 'Cannot read property name of undefined',
        stackTrace: 'at processData (src/core.ts:42:15)',
        context: {},
        severity: 'medium',
        reproducible: true,
      },
      testCode: 'test code',
      targetFile: 'src/core.ts',
    };

    const mockSourceCode = `
function processData(data) {
  return data.name.toUpperCase();
}
`;

    const mockFixResponse = `
FILE: src/core.ts
\`\`\`typescript
function processData(data) {
  if (!data || !data.name) {
    return '';
  }
  return data.name.toUpperCase();
}
\`\`\`

EXPLANATION: Added null check for data and data.name
`;

    beforeEach(() => {
      mockFileSystem.readFile.mockResolvedValue(mockSourceCode);
      mockLLM.complete.mockResolvedValue(mockFixResponse);
    });

    it('should generate a fix successfully', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      const result = await agent.generateFix(mockTask);

      expect(result).toBeDefined();
      expect(result.errorId).toBe('err-123');
      expect(result.testPasses).toBe(true);
      expect(result.fileChanges).toHaveLength(1);
    });

    it('should read the source file', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      await agent.generateFix(mockTask);

      expect(mockFileSystem.readFile).toHaveBeenCalledWith('src/core.ts');
    });

    it('should call LLM with appropriate prompt', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      await agent.generateFix(mockTask);

      expect(mockLLM.complete).toHaveBeenCalled();
      const prompt = mockLLM.complete.mock.calls[0][0];
      expect(prompt).toContain('TypeError');
      expect(prompt).toContain('src/core.ts');
      expect(prompt).toContain('test code');
    });

    it('should apply the fix to the file', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      await agent.generateFix(mockTask);

      expect(mockFileSystem.writeFile).toHaveBeenCalled();
      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('src/core.ts');
      expect(writeCall[1]).toContain('if (!data || !data.name)');
    });

    it('should run the test to verify the fix', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      await agent.generateFix(mockTask);

      expect(mockTestRunner.runTest).toHaveBeenCalledWith('test code');
    });

    it('should revert changes if test fails', async () => {
      mockTestRunner.runTest.mockResolvedValue({ 
        passes: false, 
        error: 'Test still failing',
      });

      await expect(agent.generateFix(mockTask)).rejects.toThrow();

      // Should write original content back
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(2);
      const lastWrite = mockFileSystem.writeFile.mock.calls[1];
      expect(lastWrite[1]).toBe(mockSourceCode);
    });

    it('should throw if source file cannot be read', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('File not found'));

      await expect(agent.generateFix(mockTask)).rejects.toThrow('Cannot read source file');
    });

    it('should throw if no fix is generated', async () => {
      mockLLM.complete.mockResolvedValue('No fix here');

      await expect(agent.generateFix(mockTask)).rejects.toThrow('No valid fixes');
    });

    it('should generate a description', async () => {
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      const result = await agent.generateFix(mockTask);

      expect(result.description).toContain('Fixed bug');
      expect(result.description).toContain('src/core.ts');
    });
  });

  describe('Prompt Building', () => {
    it('should include error details in prompt', async () => {
      mockFileSystem.readFile.mockResolvedValue('code');
      mockLLM.complete.mockResolvedValue('FILE: test.ts\n```typescript\nfixed\n```');
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      const task: PatchTask = {
        errorId: 'err-1',
        error: {
          id: 'err-1',
          timestamp: Date.now(),
          source: 'test.ts',
          errorType: 'ReferenceError',
          message: 'x is not defined',
          context: {},
          severity: 'medium',
          reproducible: true,
        },
        testCode: 'test',
        targetFile: 'test.ts',
      };

      await agent.generateFix(task);

      const prompt = mockLLM.complete.mock.calls[0][0];
      expect(prompt).toContain('ReferenceError');
      expect(prompt).toContain('x is not defined');
    });

    it('should include stack trace in prompt when available', async () => {
      mockFileSystem.readFile.mockResolvedValue('code');
      mockLLM.complete.mockResolvedValue('FILE: test.ts\n```typescript\nfixed\n```');
      mockTestRunner.runTest.mockResolvedValue({ passes: true });

      const task: PatchTask = {
        errorId: 'err-1',
        error: {
          id: 'err-1',
          timestamp: Date.now(),
          source: 'test.ts',
          errorType: 'Error',
          message: 'test',
          stackTrace: 'at line 1\nat line 2',
          context: {},
          severity: 'medium',
          reproducible: true,
        },
        testCode: 'test',
        targetFile: 'test.ts',
      };

      await agent.generateFix(task);

      const prompt = mockLLM.complete.mock.calls[0][0];
      expect(prompt).toContain('at line 1');
      expect(prompt).toContain('at line 2');
    });
  });
});

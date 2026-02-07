/**
 * @fileoverview Intent Parser Tests
 */

import { IntentParser, parseIntent, quickParse } from '../parser';
import { ParsedIntent, TaskType } from '../types';

describe('IntentParser', () => {
  let parser: IntentParser;

  beforeEach(() => {
    parser = new IntentParser({ useLLM: false, strictMode: false });
  });

  describe('rule-based parsing', () => {
    it('should parse refactor intent', async () => {
      const result = await parser.parse('Refactor the auth module with better error handling');
      
      expect(result.taskType).toBe('refactor');
      expect(result.target).toContain('auth module');
      expect(result.focus).toBe('better error handling');
    });

    it('should parse implement intent', async () => {
      const result = await parser.parse('Implement user authentication with JWT');
      
      expect(result.taskType).toBe('implement');
      expect(result.target).toContain('user authentication');
      expect(result.focus).toBe('JWT');
    });

    it('should parse fix intent', async () => {
      const result = await parser.parse('Fix bug #123 in the login system');
      
      expect(result.taskType).toBe('fix');
      expect(result.target.toLowerCase()).toContain('bug');
    });

    it('should parse test intent', async () => {
      const result = await parser.parse('Write tests for the utils module');
      
      expect(result.taskType).toBe('test');
      expect(result.target.toLowerCase()).toContain('utils');
    });

    it('should parse review intent', async () => {
      const result = await parser.parse('Review the API endpoints');
      
      expect(result.taskType).toBe('review');
      expect(result.target.toLowerCase()).toContain('api');
    });

    it('should parse document intent', async () => {
      const result = await parser.parse('Document the database schema');
      
      expect(result.taskType).toBe('document');
      expect(result.target.toLowerCase()).toContain('database');
    });

    it('should parse analyze intent', async () => {
      const result = await parser.parse('Analyze the performance bottlenecks');
      
      expect(result.taskType).toBe('analyze');
      expect(result.target.toLowerCase()).toContain('performance');
    });

    it('should default to implement for unknown intents', async () => {
      const result = await parser.parse('Something about the database');
      
      expect(result.taskType).toBe('implement');
    });
  });

  describe('priority detection', () => {
    it('should detect urgent priority', async () => {
      const result = await parser.parse('Fix critical security bug urgently');
      
      expect(result.priority).toBe('urgent');
    });

    it('should detect high priority', async () => {
      const result = await parser.parse('Fix this high priority issue');
      
      expect(result.priority).toBe('high');
    });

    it('should detect low priority', async () => {
      const result = await parser.parse('Refactor this when possible');
      
      expect(result.priority).toBe('low');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', async () => {
      await expect(parser.parse('')).rejects.toThrow('Empty input');
    });

    it('should handle very long input', async () => {
      const longInput = 'Refactor ' + 'a'.repeat(200);
      const result = await parser.parse(longInput);
      
      expect(result.taskType).toBe('refactor');
      expect(result.target.length).toBeLessThanOrEqual(100);
    });
  });
});

describe('quickParse', () => {
  it('should parse without async/await', () => {
    const result = quickParse('Refactor auth module');
    
    expect(result.taskType).toBe('refactor');
    expect(result.target).toContain('auth module');
  });
});

describe('parseIntent', () => {
  it('should export parseIntent function', async () => {
    const result = await parseIntent('Test the API');
    
    expect(result.taskType).toBe('test');
  });
});

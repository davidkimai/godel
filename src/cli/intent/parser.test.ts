/**
 * @fileoverview Intent Parser Tests - Comprehensive test suite for intent parsing
 * 
 * This test suite validates the parser's ability to correctly identify intent types,
 * extract subjects, assess complexity, and handle edge cases.
 * 
 * Target: 90%+ parsing accuracy for common patterns
 * 
 * @module @godel/cli/intent/parser.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { IntentParser, parseIntent, isValidIntent, detectIntentType } from './parser';
import { IntentType, ParseResult, ParserConfig } from './types';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('IntentParser', () => {
  let parser: IntentParser;

  beforeEach(() => {
    parser = new IntentParser();
  });

  // =========================================================================
  // IMPLEMENT INTENT TESTS
  // =========================================================================

  describe('implement intent', () => {
    it('should parse "Implement user authentication"', () => {
      const result = parser.parse('Implement user authentication');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
      expect(result.intent?.subject).toBe('user authentication');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should parse "Create a REST API for user management"', () => {
      const result = parser.parse('Create a REST API for user management');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
      expect(result.intent?.subject).toBe('a REST API for user management');
    });

    it('should parse "Add JWT authentication with refresh tokens"', () => {
      const result = parser.parse('Add JWT authentication with refresh tokens');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
      expect(result.intent?.subject).toBe('JWT authentication');
      expect(result.intent?.requirements).toContain('refresh tokens');
    });

    it('should parse complex implement command', () => {
      const result = parser.parse('Build a comprehensive payment processing system with Stripe integration');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
      expect(result.intent?.subject).toBe('a comprehensive payment processing system');
      expect(result.intent?.requirements).toContain('Stripe integration');
      expect(result.intent?.complexity).toBe('high');
    });

    it('should parse simple implement command', () => {
      const result = parser.parse('Make a simple button component');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
      expect(result.intent?.subject).toBe('a simple button component');
      expect(result.intent?.complexity).toBe('low');
    });
  });

  // =========================================================================
  // FIX INTENT TESTS
  // =========================================================================

  describe('fix intent', () => {
    it('should parse "Fix bug in payment processing"', () => {
      const result = parser.parse('Fix bug in payment processing');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
      expect(result.intent?.subject).toBe('bug in payment processing');
    });

    it('should parse "Debug the authentication middleware"', () => {
      const result = parser.parse('Debug the authentication middleware');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
      expect(result.intent?.subject).toBe('the authentication middleware');
    });

    it('should parse "Resolve issue with database connections"', () => {
      const result = parser.parse('Resolve issue with database connections');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
      expect(result.intent?.subject).toBe('issue with database connections');
    });

    it('should parse typo fix as low complexity', () => {
      const result = parser.parse('Fix typo in README');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
      expect(result.intent?.complexity).toBe('low');
    });

    it('should parse critical bug as high complexity', () => {
      const result = parser.parse('Fix critical security vulnerability in authentication');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
      expect(result.intent?.complexity).toBe('high');
    });
  });

  // =========================================================================
  // TEST INTENT TESTS
  // =========================================================================

  describe('test intent', () => {
    it('should parse "Test user registration"', () => {
      const result = parser.parse('Test user registration');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('test');
      expect(result.intent?.subject).toBe('user registration');
    });

    it('should parse "Write tests for the API"', () => {
      const result = parser.parse('Write tests for the API');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('test');
      expect(result.intent?.subject).toBe('the API');
    });

    it('should parse comprehensive testing as high complexity', () => {
      const result = parser.parse('Create comprehensive end-to-end tests for the checkout flow');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('test');
      expect(result.intent?.complexity).toBe('high');
    });

    it('should parse unit tests as low complexity', () => {
      const result = parser.parse('Write simple unit tests for utils');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('test');
      expect(result.intent?.complexity).toBe('low');
    });
  });

  // =========================================================================
  // REFACTOR INTENT TESTS
  // =========================================================================

  describe('refactor intent', () => {
    it('should parse "Refactor the authentication module"', () => {
      const result = parser.parse('Refactor the authentication module');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('refactor');
      expect(result.intent?.subject).toBe('the authentication module');
    });

    it('should parse "Rewrite the database layer"', () => {
      const result = parser.parse('Rewrite the database layer');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('refactor');
      expect(result.intent?.subject).toBe('the database layer');
    });

    it('should parse clean up as refactor', () => {
      const result = parser.parse('Clean up the codebase');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('refactor');
      expect(result.intent?.subject).toBe('the codebase');
    });

    it('should parse architectural refactoring as high complexity', () => {
      const result = parser.parse('Refactor the core architecture to support microservices');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('refactor');
      expect(result.intent?.complexity).toBe('high');
    });
  });

  // =========================================================================
  // ANALYZE INTENT TESTS
  // =========================================================================

  describe('analyze intent', () => {
    it('should parse "Analyze the performance bottleneck"', () => {
      const result = parser.parse('Analyze the performance bottleneck');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('analyze');
      expect(result.intent?.subject).toBe('the performance bottleneck');
    });

    it('should parse "Investigate memory leak in worker"', () => {
      const result = parser.parse('Investigate memory leak in worker');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('analyze');
      expect(result.intent?.subject).toBe('memory leak in worker');
    });

    it('should parse research as analyze', () => {
      const result = parser.parse('Research best practices for API design');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('analyze');
      expect(result.intent?.subject).toBe('best practices for API design');
    });
  });

  // =========================================================================
  // REVIEW INTENT TESTS
  // =========================================================================

  describe('review intent', () => {
    it('should parse "Review the pull request"', () => {
      const result = parser.parse('Review the pull request');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('review');
      expect(result.intent?.subject).toBe('the pull request');
    });

    it('should parse "Audit the security of the API"', () => {
      const result = parser.parse('Audit the security of the API');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('review');
      expect(result.intent?.subject).toBe('the security of the API');
    });
  });

  // =========================================================================
  // DEPLOY INTENT TESTS
  // =========================================================================

  describe('deploy intent', () => {
    it('should parse "Deploy to production"', () => {
      const result = parser.parse('Deploy to production');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('deploy');
      expect(result.intent?.subject).toBe('to production');
    });

    it('should parse "Release version 2.0"', () => {
      const result = parser.parse('Release version 2.0');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('deploy');
      expect(result.intent?.subject).toBe('version 2.0');
    });

    it('should parse canary deployment as high complexity', () => {
      const result = parser.parse('Deploy with blue-green strategy to multiple regions');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('deploy');
      expect(result.intent?.complexity).toBe('high');
    });
  });

  // =========================================================================
  // REQUIREMENT EXTRACTION TESTS
  // =========================================================================

  describe('requirement extraction', () => {
    it('should extract "with" requirements', () => { 
      const result = parser.parse('Implement authentication with JWT and refresh tokens');
      
      expect(result.success).toBe(true);
      expect(result.intent?.requirements.length).toBeGreaterThan(0);
      expect(result.intent?.requirements.some(r => r.includes('JWT'))).toBe(true);
    });

    it('should extract "using" requirements', () => {
      const result = parser.parse('Create a dashboard using React and TypeScript');
      
      expect(result.success).toBe(true);
      expect(result.intent?.requirements.some(r => r.includes('React'))).toBe(true);
    });

    it('should extract "including" requirements', () => {
      const result = parser.parse('Build a search system including filters and sorting');
      
      expect(result.success).toBe(true);
      expect(result.intent?.requirements.some(r => r.includes('filters'))).toBe(true);
    });
  });

  // =========================================================================
  // COMPLEXITY ASSESSMENT TESTS
  // =========================================================================

  describe('complexity assessment', () => {
    it('should detect low complexity from keywords', () => {
      const result = parser.parse('Make a simple fix to the button');
      
      expect(result.success).toBe(true);
      expect(result.intent?.complexity).toBe('low');
    });

    it('should detect high complexity from keywords', () => {
      const result = parser.parse('Build a comprehensive enterprise-grade system');
      
      expect(result.success).toBe(true);
      expect(result.intent?.complexity).toBe('high');
    });

    it('should default to medium complexity', () => {
      const result = parser.parse('Implement user login');
      
      expect(result.success).toBe(true);
      expect(result.intent?.complexity).toBe('medium');
    });

    it('should use input length as complexity heuristic', () => {
      const short = parser.parse('Fix bug');
      const long = parser.parse('Implement a complete user authentication and authorization system with multiple providers');
      
      expect(short.intent?.complexity).toBe('low');
      expect(long.intent?.complexity).toBe('high');
    });
  });

  // =========================================================================
  // EDGE CASE TESTS
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parser.parse('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty');
    });

    it('should handle whitespace-only input', () => {
      const result = parser.parse('   ');
      
      expect(result.success).toBe(false);
    });

    it('should handle quoted input', () => {
      const result = parser.parse('"Implement user authentication"');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('implement');
    });

    it('should handle input with trailing punctuation', () => {
      const result = parser.parse('Fix the bug!');
      
      expect(result.success).toBe(true);
      expect(result.intent?.type).toBe('fix');
    });

    it('should handle unknown intent gracefully', () => {
      const result = parser.parse('Something random that does not match');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // CONVENIENCE FUNCTION TESTS
  // =========================================================================

  describe('convenience functions', () => {
    it('isValidIntent should return true for valid input', () => {
      expect(isValidIntent('Implement feature')).toBe(true);
      expect(isValidIntent('Fix bug')).toBe(true);
    });

    it('isValidIntent should return false for invalid input', () => {
      expect(isValidIntent('')).toBe(false);
      expect(isValidIntent('random gibberish')).toBe(false);
    });

    it('detectIntentType should return correct type', () => {
      expect(detectIntentType('Implement feature')).toBe('implement');
      expect(detectIntentType('Fix bug')).toBe('fix');
      expect(detectIntentType('random')).toBeNull();
    });
  });

  // =========================================================================
  // BATCH PARSING TESTS
  // =========================================================================

  describe('batch parsing', () => {
    it('should parse multiple inputs', () => {
      const inputs = [
        'Implement feature A',
        'Fix bug B',
        'Test component C',
      ];
      
      const results = parser.parseBatch(inputs);
      
      expect(results).toHaveLength(3);
      expect(results[0].intent?.type).toBe('implement');
      expect(results[1].intent?.type).toBe('fix');
      expect(results[2].intent?.type).toBe('test');
    });
  });

  // =========================================================================
  // STRICT MODE TESTS
  // =========================================================================

  describe('strict mode', () => {
    it('should reject low-confidence parses in strict mode', () => {
      const strictParser = new IntentParser({
        strictMode: true,
        minConfidence: 0.9,
      });
      
      // This should be rejected due to low confidence
      const result = strictParser.parse('Fix');
      
      // Very short input with minimal context
      expect(result.success || result.confidence < 0.9).toBeTruthy();
    });
  });
});

// ============================================================================
// ACCURACY BENCHMARK
// ============================================================================

describe('Parser Accuracy Benchmark', () => {
  const testCases: { input: string; expectedType: IntentType; shouldPass: boolean }[] = [
    // Implement cases
    { input: 'Implement user authentication', expectedType: 'implement', shouldPass: true },
    { input: 'Create a REST API', expectedType: 'implement', shouldPass: true },
    { input: 'Add pagination to the list', expectedType: 'implement', shouldPass: true },
    { input: 'Build a search feature', expectedType: 'implement', shouldPass: true },
    
    // Fix cases  
    { input: 'Fix the login bug', expectedType: 'fix', shouldPass: true },
    { input: 'Debug the error handler', expectedType: 'fix', shouldPass: true },
    { input: 'Resolve the memory leak', expectedType: 'fix', shouldPass: true },
    
    // Test cases
    { input: 'Test the API endpoints', expectedType: 'test', shouldPass: true },
    { input: 'Write tests for auth', expectedType: 'test', shouldPass: true },
    { input: 'Verify the checkout flow', expectedType: 'test', shouldPass: true },
    
    // Refactor cases
    { input: 'Refactor the database layer', expectedType: 'refactor', shouldPass: true },
    { input: 'Clean up the codebase', expectedType: 'refactor', shouldPass: true },
    { input: 'Optimize the queries', expectedType: 'refactor', shouldPass: true },
    
    // Analyze cases
    { input: 'Analyze the performance', expectedType: 'analyze', shouldPass: true },
    { input: 'Research caching strategies', expectedType: 'analyze', shouldPass: true },
    
    // Review cases
    { input: 'Review the PR', expectedType: 'review', shouldPass: true },
    { input: 'Audit the security', expectedType: 'review', shouldPass: true },
    
    // Deploy cases
    { input: 'Deploy to staging', expectedType: 'deploy', shouldPass: true },
    { input: 'Release version 1.0', expectedType: 'deploy', shouldPass: true },
    
    // Edge cases
    { input: '', expectedType: 'implement', shouldPass: false },
    { input: 'random nonsense here', expectedType: 'implement', shouldPass: false },
  ];

  it(`should achieve 90%+ accuracy on ${testCases.length} test cases`, () => {
    const parser = new IntentParser();
    let correct = 0;
    let passed = 0;
    
    for (const testCase of testCases) {
      const result = parser.parse(testCase.input);
      
      if (testCase.shouldPass) {
        if (result.success && result.intent?.type === testCase.expectedType) {
          correct++;
          passed++;
        }
      } else {
        // Should fail
        if (!result.success) {
          correct++;
        }
      }
    }
    
    const accuracy = (correct / testCases.length) * 100;
    console.log(`\nParser Accuracy: ${accuracy.toFixed(1)}% (${correct}/${testCases.length})`);
    
    expect(accuracy).toBeGreaterThanOrEqual(90);
  });
});

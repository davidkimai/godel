/**
 * @fileoverview Test Handler - Handles testing intents
 * 
 * The test handler processes intents to write tests, verify functionality,
 * and validate code quality.
 * 
 * Supported patterns:
 * - "test the authentication module"
 * - "write unit tests for utils"
 * - "verify API endpoints"
 * 
 * @module @godel/intent/handlers/test
 */

import { Intent, HandlerResult, IntentAction } from '../types';
import { BaseIntentHandler } from './base';

/**
 * Test type options.
 */
export type TestType = 
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'performance'
  | 'security'
  | 'contract'
  | 'snapshot'
  | 'mutation';

/**
 * Test framework preferences.
 */
export type TestFramework = 
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'cypress'
  | 'playwright'
  | 'karma'
  | 'ava';

/**
 * Coverage requirements.
 */
export interface CoverageRequirement {
  /** Minimum overall coverage percentage */
  overall?: number;
  
  /** Minimum statement coverage */
  statements?: number;
  
  /** Minimum branch coverage */
  branches?: number;
  
  /** Minimum function coverage */
  functions?: number;
  
  /** Minimum line coverage */
  lines?: number;
}

/**
 * Test intent with additional context.
 */
export interface TestIntent extends Intent {
  /** Type of tests to create/run */
  testType?: TestType;
  
  /** Test framework to use */
  framework?: TestFramework;
  
  /** Coverage requirements */
  coverage?: CoverageRequirement;
  
  /** Specific test cases to cover */
  testCases?: string[];
  
  /** Whether to run in watch mode */
  watch?: boolean;
  
  /** Whether to update snapshots */
  updateSnapshots?: boolean;
  
  /** Test file pattern */
  pattern?: string;
}

/**
 * Handler for test intents.
 * 
 * Manages the testing lifecycle:
 * - Test planning and design
 * - Test implementation
 * - Test execution and reporting
 * - Coverage analysis
 */
export class TestHandler extends BaseIntentHandler {
  readonly action: IntentAction = 'test';
  readonly name = 'Test Handler';
  readonly description = 'Writes and runs tests to verify code functionality';

  /**
   * Validation specific to test intents.
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    const testIntent = intent as TestIntent;
    
    // Validate test type if provided
    const validTestTypes: TestType[] = [
      'unit', 'integration', 'e2e', 'performance', 'security', 'contract', 'snapshot', 'mutation'
    ];
    if (testIntent.testType && !validTestTypes.includes(testIntent.testType)) {
      return {
        valid: false,
        error: `Unknown test type: ${testIntent.testType}`,
      };
    }
    
    // Validate framework if provided
    const validFrameworks: TestFramework[] = [
      'jest', 'vitest', 'mocha', 'cypress', 'playwright', 'karma', 'ava'
    ];
    if (testIntent.framework && !validFrameworks.includes(testIntent.framework)) {
      return {
        valid: false,
        error: `Unknown test framework: ${testIntent.framework}`,
      };
    }
    
    // Validate coverage requirements
    if (testIntent.coverage) {
      const { overall, statements, branches, functions, lines } = testIntent.coverage;
      const validateCoverage = (val: number | undefined): boolean => 
        val === undefined || (val >= 0 && val <= 100);
      
      if (!validateCoverage(overall) || !validateCoverage(statements) || 
          !validateCoverage(branches) || !validateCoverage(functions) || 
          !validateCoverage(lines)) {
        return {
          valid: false,
          error: 'Coverage values must be between 0 and 100',
        };
      }
    }
    
    return { valid: true };
  }

  /**
   * Execute test intent.
   */
  protected async doExecute(intent: Intent): Promise<HandlerResult> {
    const testIntent = intent as TestIntent;
    
    this.log.info('Planning tests', {
      target: intent.target,
      testType: testIntent.testType,
      framework: testIntent.framework,
    });
    
    // Detect test type and framework if not specified
    const testType = testIntent.testType ?? this.detectTestType(intent.target);
    const framework = testIntent.framework ?? this.detectFramework();
    
    // Generate test plan
    const plan = this.generatePlan(intent, testType, framework);
    
    // Estimate effort
    const estimation = this.estimateEffort(testType, framework);
    
    this.log.info('Test plan generated', {
      testType,
      framework,
      phases: plan.phases.length,
      estimatedMinutes: estimation.minutes,
    });
    
    return this.success({
      plan,
      estimation,
      testType,
      framework,
      target: intent.target,
      coverage: testIntent.coverage ?? this.getDefaultCoverage(testType),
      testCases: testIntent.testCases ?? [],
      watch: testIntent.watch ?? false,
      updateSnapshots: testIntent.updateSnapshots ?? false,
      pattern: testIntent.pattern ?? this.getDefaultPattern(testType),
    });
  }

  /**
   * Detect the appropriate test type from the target.
   */
  private detectTestType(target: string): TestType {
    const lower = target.toLowerCase();
    
    if (lower.includes('e2e') || lower.includes('end-to-end') || lower.includes('user journey')) {
      return 'e2e';
    }
    if (lower.includes('integration') || lower.includes('api test')) {
      return 'integration';
    }
    if (lower.includes('performance') || lower.includes('load') || lower.includes('benchmark')) {
      return 'performance';
    }
    if (lower.includes('security') || lower.includes('vulnerability')) {
      return 'security';
    }
    if (lower.includes('contract') || lower.includes('schema')) {
      return 'contract';
    }
    if (lower.includes('snapshot') || lower.includes('visual regression')) {
      return 'snapshot';
    }
    if (lower.includes('mutation')) {
      return 'mutation';
    }
    
    // Default to unit tests
    return 'unit';
  }

  /**
   * Detect the test framework based on project context.
   */
  private detectFramework(): TestFramework {
    // In a real implementation, this would check package.json
    // For now, return a sensible default
    return 'jest';
  }

  /**
   * Get default coverage requirements for a test type.
   */
  private getDefaultCoverage(testType: TestType): CoverageRequirement {
    const defaults: Record<TestType, CoverageRequirement> = {
      'unit': { overall: 80, statements: 80, branches: 70, functions: 80, lines: 80 },
      'integration': { overall: 60 },
      'e2e': { overall: 40 },
      'performance': {},
      'security': { overall: 90 },
      'contract': { overall: 100 },
      'snapshot': {},
      'mutation': {},
    };
    
    return defaults[testType];
  }

  /**
   * Get default test file pattern for a test type.
   */
  private getDefaultPattern(testType: TestType): string {
    const patterns: Record<TestType, string> = {
      'unit': '**/*.test.ts',
      'integration': '**/*.integration.test.ts',
      'e2e': '**/*.e2e.test.ts',
      'performance': '**/*.perf.test.ts',
      'security': '**/*.security.test.ts',
      'contract': '**/*.contract.test.ts',
      'snapshot': '**/*.snap.test.ts',
      'mutation': '**/*.test.ts',
    };
    
    return patterns[testType];
  }

  /**
   * Generate a test plan.
   */
  private generatePlan(
    intent: Intent,
    testType: TestType,
    framework: TestFramework
  ): {
    phases: string[];
    testFiles: string[];
    assertions: string[];
  } {
    const phases: string[] = [];
    const testFiles: string[] = [];
    const assertions: string[] = [];
    
    // Phase 1: Analysis
    phases.push('Analyze target code structure');
    phases.push('Identify testable units and interfaces');
    
    // Phase 2: Setup
    phases.push(`Set up ${framework} test environment`);
    phases.push('Configure test utilities and mocks');
    testFiles.push(`${framework}.config.js`);
    testFiles.push('test/setup.ts');
    
    // Phase 3: Test Implementation
    phases.push(`Write ${testType} test cases`);
    
    // Test type-specific phases
    switch (testType) {
      case 'unit':
        phases.push('Mock dependencies');
        phases.push('Write unit test cases');
        phases.push('Test edge cases and error paths');
        testFiles.push(`{target}.test.ts`);
        assertions.push('Individual functions work in isolation');
        assertions.push('Edge cases are handled correctly');
        break;
        
      case 'integration':
        phases.push('Set up test database/fixtures');
        phases.push('Write integration test scenarios');
        phases.push('Test component interactions');
        testFiles.push(`{target}.integration.test.ts`);
        assertions.push('Components integrate correctly');
        assertions.push('Data flows properly between systems');
        break;
        
      case 'e2e':
        phases.push('Set up test environment');
        phases.push('Write user journey tests');
        phases.push('Test critical paths');
        testFiles.push(`{target}.e2e.test.ts`);
        assertions.push('User workflows complete successfully');
        assertions.push('UI elements are accessible');
        break;
        
      case 'performance':
        phases.push('Establish performance baselines');
        phases.push('Write benchmark tests');
        phases.push('Identify bottlenecks');
        testFiles.push(`{target}.perf.test.ts`);
        assertions.push('Response times meet SLA');
        assertions.push('Memory usage is acceptable');
        break;
        
      case 'security':
        phases.push('Identify security-critical paths');
        phases.push('Write security test cases');
        phases.push('Test input validation and sanitization');
        testFiles.push(`{target}.security.test.ts`);
        assertions.push('Input is properly validated');
        assertions.push('Common vulnerabilities are mitigated');
        break;
        
      default:
        phases.push('Write test cases');
        testFiles.push(`{target}.test.ts`);
    }
    
    // Phase 4: Execution
    phases.push('Run tests and fix failures');
    phases.push('Verify coverage requirements');
    assertions.push('All tests pass');
    assertions.push('Coverage meets minimum thresholds');
    
    // Phase 5: Documentation
    phases.push('Document test patterns and utilities');
    testFiles.push('test/README.md');
    
    return { phases, testFiles, assertions };
  }

  /**
   * Estimate testing effort.
   */
  private estimateEffort(testType: TestType, framework: TestFramework): {
    minutes: number;
    complexity: 'low' | 'medium' | 'high';
    agents: number;
  } {
    // Base estimates by test type
    const typeEstimates: Record<TestType, { minutes: number; complexity: 'low' | 'medium' | 'high' }> = {
      'unit': { minutes: 60, complexity: 'low' },
      'integration': { minutes: 90, complexity: 'medium' },
      'e2e': { minutes: 120, complexity: 'high' },
      'performance': { minutes: 90, complexity: 'medium' },
      'security': { minutes: 120, complexity: 'high' },
      'contract': { minutes: 45, complexity: 'low' },
      'snapshot': { minutes: 30, complexity: 'low' },
      'mutation': { minutes: 120, complexity: 'high' },
    };
    
    const base = typeEstimates[testType];
    
    // Framework multiplier (some frameworks are faster to write for)
    const frameworkMultipliers: Record<TestFramework, number> = {
      'jest': 1.0,
      'vitest': 0.9,
      'mocha': 1.1,
      'cypress': 1.0,
      'playwright': 1.0,
      'karma': 1.2,
      'ava': 0.95,
    };
    
    const adjustedMinutes = Math.round(base.minutes * frameworkMultipliers[framework]);
    
    // Determine agent count
    const agents = base.complexity === 'high' ? 2 : 1;
    
    return {
      minutes: adjustedMinutes,
      complexity: base.complexity,
      agents,
    };
  }
}

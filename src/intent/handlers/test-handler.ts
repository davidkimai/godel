/**
 * @fileoverview Test Handler - Handles test generation intents
 *
 * The test handler processes intents to generate, update, or improve tests
 * for code modules.
 *
 * Supported patterns:
 * - "write tests for authentication module"
 * - "add unit tests for user service"
 * - "improve test coverage for utils"
 *
 * @module @godel/intent/handlers/test
 */

import { Intent, HandlerResult, IntentAction } from '../types';
import { BaseIntentHandler } from './base';

/**
 * Test types supported by the handler.
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'contract';

/**
 * Test frameworks that can be used.
 */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'ava' | 'tap' | 'pytest' | 'unittest';

/**
 * Coverage requirement levels.
 */
export interface CoverageRequirement {
  /** Minimum statement coverage percentage */
  statements?: number;
  /** Minimum branch coverage percentage */
  branches?: number;
  /** Minimum function coverage percentage */
  functions?: number;
  /** Minimum line coverage percentage */
  lines?: number;
}

/**
 * Test intent with additional context.
 */
export interface TestIntent extends Intent {
  /** Type of tests to generate */
  testType?: TestType;

  /** Test framework to use */
  framework?: TestFramework;

  /** Target coverage requirements */
  coverage?: CoverageRequirement;

  /** Specific test cases to include */
  testCases?: string[];

  /** Files or modules to test */
  targetFiles?: string[];

  /** Whether to update existing tests */
  updateExisting?: boolean;

  /** Test file location (if specific path desired) */
  outputPath?: string;
}

/**
 * Handler for test generation intents.
 *
 * Processes test generation requests through a systematic approach:
 * 1. Analyze target code
 * 2. Identify test scenarios
 * 3. Generate test code
 * 4. Validate test coverage
 */
export class TestHandler extends BaseIntentHandler {
  readonly action: IntentAction = 'test';
  readonly name = 'Test Handler';
  readonly description = 'Generates and updates tests for code modules';

  /**
   * Validation specific to test intents.
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    const testIntent = intent as TestIntent;

    // Validate test type if provided
    const validTypes: TestType[] = ['unit', 'integration', 'e2e', 'performance', 'contract'];
    if (testIntent.testType && !validTypes.includes(testIntent.testType)) {
      return {
        valid: false,
        error: `Unknown test type: ${testIntent.testType}`,
      };
    }

    // Validate framework if provided
    const validFrameworks: TestFramework[] = ['jest', 'vitest', 'mocha', 'ava', 'tap', 'pytest', 'unittest'];
    if (testIntent.framework && !validFrameworks.includes(testIntent.framework)) {
      return {
        valid: false,
        error: `Unknown framework: ${testIntent.framework}`,
      };
    }

    // Validate coverage percentages
    if (testIntent.coverage) {
      const { statements, branches, functions, lines } = testIntent.coverage;
      for (const [key, value] of Object.entries({ statements, branches, functions, lines })) {
        if (value !== undefined && (value < 0 || value > 100)) {
          return {
            valid: false,
            error: `Invalid ${key} coverage: ${value}. Must be between 0 and 100.`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Execute test intent.
   *
   * Generates tests based on the intent configuration.
   */
  protected async doExecute(intent: Intent): Promise<HandlerResult> {
    const testIntent = intent as TestIntent;

    this.log.info('Executing test intent', {
      target: intent.target,
      testType: testIntent.testType,
      framework: testIntent.framework,
    });

    // Determine test configuration
    const testType = testIntent.testType || 'unit';
    const framework = testIntent.framework || 'jest';
    const targetPath = intent.target;

    this.log.info('Test configuration determined', {
      testType,
      framework,
      targetPath,
    });

    // Generate test file path
    const outputPath = this.determineOutputPath(targetPath, testType, framework);

    // Return success with test plan
    return {
      success: true,
      data: {
        target: targetPath,
        testType,
        framework,
        outputPath,
        coverage: testIntent.coverage,
        testCases: testIntent.testCases || [],
      },
    };
  }

  /**
   * Determine output path for test file.
   */
  private determineOutputPath(targetPath: string, testType: TestType, framework: TestFramework): string {
    // Remove file extension if present
    const basePath = targetPath.replace(/\.[^/.]+$/, '');

    // Determine test suffix based on framework
    const suffix = framework === 'pytest' ? '_test.py' :
                   framework === 'unittest' ? '_test.py' :
                   '.test.ts';

    // Determine directory based on test type
    const testDir = testType === 'unit' ? 'tests/unit' :
                    testType === 'integration' ? 'tests/integration' :
                    testType === 'e2e' ? 'tests/e2e' :
                    'tests';

    // Extract filename from path
    const filename = basePath.split('/').pop() || 'test';

    return `${testDir}/${filename}${suffix}`;
  }
}

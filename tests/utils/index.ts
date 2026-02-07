/**
 * Test Utilities Index
 * 
 * Comprehensive utilities for testing the Godel system.
 * 
 * @example
 * ```typescript
 * import { 
 *   setupMockEnvironment, 
 *   expectValidAgent,
 *   IntegrationHarness,
 *   createIntegrationHarness 
 * } from '../utils';
 * ```
 */

// ============================================================================
// Test Helpers
// ============================================================================

export {
  setupMockEnvironment,
  cleanupMockEnvironment,
  suppressConsoleNoise,
  restoreConsole,
  expectValidAgent,
  expectValidTask,
  expectValidApiResponse,
  expectValidPagination,
  expectAgentStatus,
  expectTaskStatus,
  waitFor,
  waitForAsync,
  delay,
  retry,
  generateTestId,
  generateTestIds,
  offsetDate,
  shuffle,
  pickRandom,
  createTrackableMock,
  mockDefaultExport,
  mockNamedExports,
  expectToThrow,
  createMockError,
} from './test-helpers';

// ============================================================================
// Integration Harness
// ============================================================================

export {
  IntegrationHarness,
  createIntegrationHarness,
  type HarnessConfig,
  type HarnessState,
} from './integration-harness';

// ============================================================================
// Combined Utilities
// ============================================================================

/**
 * Sets up a complete test environment with mocks and helpers
 * 
 * @example
 * ```typescript
 * const env = setupCompleteTestEnvironment();
 * // Use env.harness, env.mocks, env.fixtures
 * ```
 */
export function setupCompleteTestEnvironment() {
  const { resetAllMocks } = require('../mocks');
  const { createIntegrationHarness } = require('./integration-harness');
  const { createTestEnvironment } = require('../fixtures');
  
  resetAllMocks();
  
  const harness = createIntegrationHarness();
  const fixtures = createTestEnvironment();
  
  return {
    harness,
    fixtures,
    reset: () => {
      resetAllMocks();
    },
  };
}

/**
 * Standard test setup for unit tests
 * 
 * @example
 * ```typescript
 * describe('MyService', () => {
 *   const { beforeEachSetup, afterEachCleanup } = createUnitTestSetup();
 *   
 *   beforeEach(beforeEachSetup);
 *   afterEach(afterEachCleanup);
 *   
 *   test('should work', () => {
 *     // test code
 *   });
 * });
 * ```
 */
export function createUnitTestSetup() {
  const { setupMockEnvironment, cleanupMockEnvironment } = require('./test-helpers');
  const { resetAllMocks } = require('../mocks');
  
  return {
    beforeEachSetup: () => {
      setupMockEnvironment();
      resetAllMocks();
    },
    afterEachCleanup: () => {
      cleanupMockEnvironment();
    },
  };
}

/**
 * Standard test setup for integration tests
 * 
 * @example
 * ```typescript
 * describe('Integration Tests', () => {
 *   const { harness, beforeAllSetup, afterAllCleanup } = createIntegrationTestSetup();
 *   
 *   beforeAll(beforeAllSetup);
 *   afterAll(afterAllCleanup);
 *   
 *   test('should spawn agent', async () => {
 *     const agent = await harness.spawnAgent({});
 *     expect(agent).toBeDefined();
 *   });
 * });
 * ```
 */
export function createIntegrationTestSetup(config?: Parameters<typeof createIntegrationHarness>[0]) {
  const { createIntegrationHarness } = require('./integration-harness');
  const harness = createIntegrationHarness(config);
  
  return {
    harness,
    beforeAllSetup: async () => {
      await harness.setup();
    },
    afterAllCleanup: async () => {
      await harness.cleanup();
    },
    beforeEachReset: async () => {
      await harness.reset();
    },
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  setupCompleteTestEnvironment,
  createUnitTestSetup,
  createIntegrationTestSetup,
};

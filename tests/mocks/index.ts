/**
 * Mock Infrastructure Index
 * 
 * Centralized mock library for Godel testing.
 * Import mocks from this file for all external dependencies.
 * 
 * @example
 * ```typescript
 * import { mockPiClient, mockPool, mockRedis, mockRuntime } from '../mocks';
 * 
 * beforeEach(() => {
 *   resetAllMocks();
 * });
 * ```
 */

// ============================================================================
// Pi Client Mock
// ============================================================================

export {
  mockPiClient,
  createMockPiClient,
  setupMockPiClient,
  resetMockPiState,
  configureMockResponse,
  getMockPiState,
  simulateConnectionError,
  simulateMessageError,
  simulateToolCall,
  createMockMessageResponse,
  createMockToolCall,
  createMockToolResult,
} from './pi';

// ============================================================================
// Database Mock
// ============================================================================

export {
  mockPool,
  createMockClient,
  setupMockDatabase,
  setupMockPostgresPool,
  resetMockDbState,
  mockQueryResponse,
  getQueryHistory,
  getTransactionQueries,
  setSimulatedDelay,
  simulateDbConnectionError,
  simulateQueryError,
  createMockQueryResult,
  createMockAgentRow,
  createMockTaskRow,
  createMockEventRow,
} from './database';

// ============================================================================
// Redis Mock
// ============================================================================

export {
  mockRedis,
  createMockRedis,
  setupMockRedis,
  setupMockRedisFallback,
  resetMockRedisState,
  setMockRedisValue,
  getMockRedisValue,
  simulateRedisFailure,
  setRedisDelay,
  getMockRedisKeys,
  clearMockRedisData,
} from './redis';

// ============================================================================
// Runtime Mock
// ============================================================================

export {
  mockRuntime,
  createMockRuntime,
  setupMockRuntime,
  setupMockPiRuntime,
  resetMockRuntimeState,
  simulateSpawnFailure,
  simulateExecFailure,
  setSpawnDelay,
  setExecDelay,
  getMockAgents,
  getMockAgent,
  addMockAgent,
  createMockAgent,
  createMockSpawnConfig,
  createMockExecResult,
  createMockExecError,
  waitForAgentEvent,
} from './runtime';

// ============================================================================
// Mock Factory
// ============================================================================

/**
 * Resets all mock states
 * Call this in afterEach to ensure complete test isolation
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetAllMocks();
 * });
 * ```
 */
export function resetAllMocks(): void {
  // Reset all mock states
  const { resetMockPiState } = require('./pi');
  const { resetMockDbState } = require('./database');
  const { resetMockRedisState } = require('./redis');
  const { resetMockRuntimeState } = require('./runtime');
  
  resetMockPiState();
  resetMockDbState();
  resetMockRedisState();
  resetMockRuntimeState();
  
  // Clear all Jest mocks
  jest.clearAllMocks();
}

/**
 * Sets up all mock modules
 * Call this in beforeAll for comprehensive mocking
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupAllMocks();
 * });
 * ```
 */
export function setupAllMocks(): void {
  const { setupMockPiClient } = require('./pi');
  const { setupMockDatabase } = require('./database');
  const { setupMockRedis } = require('./redis');
  const { setupMockRuntime } = require('./runtime');
  
  setupMockPiClient();
  setupMockDatabase();
  setupMockRedis();
  setupMockRuntime();
}

/**
 * Creates a complete mock environment
 * Useful for integration tests that need all dependencies mocked
 * 
 * @example
 * ```typescript
 * const env = createMockEnvironment();
 * 
 * // Configure mocks
 * env.pi.sendMessage.mockResolvedValue({ content: 'Hello' });
 * env.db.query.mockResolvedValue({ rows: [] });
 * 
 * // Use in test
 * const result = await myFunction(env.pi, env.db, env.redis);
 * ```
 */
export function createMockEnvironment() {
  const { createMockPiClient } = require('./pi');
  const { createMockClient } = require('./database');
  const { createMockRedis } = require('./redis');
  const { createMockRuntime } = require('./runtime');
  
  return {
    pi: createMockPiClient(),
    db: createMockClient(),
    redis: createMockRedis(),
    runtime: createMockRuntime(),
  };
}

// ============================================================================
// Type Exports
// ============================================================================

// Types are exported from individual modules directly
// No need to re-export here as they can cause circular dependency issues

// ============================================================================
// Default Export
// ============================================================================

export default {
  resetAllMocks,
  setupAllMocks,
  createMockEnvironment,
};

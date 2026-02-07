/**
 * Test Fixtures Index
 * 
 * Pre-built data for consistent testing across all test suites.
 * 
 * @example
 * ```typescript
 * import { mockAgent, mockTask, mockConfig } from '../fixtures';
 * 
 * // Use fixtures in tests
 * const agent = await repository.create(mockAgent);
 * const task = createTask(mockTask);
 * ```
 */

// ============================================================================
// Agent Fixtures
// ============================================================================

export {
  mockAgent,
  mockRunningAgent,
  mockCompletedAgent,
  mockFailedAgent,
  mockParentAgent,
  mockChildAgent,
  mockHighContextAgent,
  mockAgentWithReasoning,
  mockAgentSwarm,
  mockAgentsWithMixedStatuses,
  createTestAgent,
  createTestAgents,
  createAgentFromOptions,
  isValidAgent,
  hasStatus,
  AGENT_STATUSES,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
} from './agents';

// ============================================================================
// Task Fixtures
// ============================================================================

export {
  mockTask,
  mockInProgressTask,
  mockCompletedTask,
  mockBlockedTask,
  mockFailedTask,
  mockTaskWithDeps,
  mockCriticalTask,
  mockAwaitingApprovalTask,
  mockCancelledTask,
  mockTasksWithMixedStatuses,
  mockTaskDAG,
  createTestTask,
  createTestTasks,
  createTaskFromOptions,
  createQualityGate,
  createCheckpoint,
  isValidTask,
  hasTaskStatus,
  isTaskReady,
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  ACTIVE_TASK_STATUSES,
  TASK_PRIORITIES,
} from './tasks';

// ============================================================================
// Configuration Fixtures
// ============================================================================

export {
  mockRuntimeConfig,
  mockOpenAIRuntimeConfig,
  mockNativeRuntimeConfig,
  mockHighConcurrencyRuntimeConfig,
  mockPiClientConfig,
  mockOpenAIPiConfig,
  mockGooglePiConfig,
  mockLocalPiConfig,
  mockPiConfigAllTools,
  mockPiConfigNoTools,
  mockPostgresConfig,
  mockCiPostgresConfig,
  mockSslPostgresConfig,
  mockPooledPostgresConfig,
  mockRedisConfig,
  mockCiRedisConfig,
  mockAuthRedisConfig,
  mockRedisClusterConfig,
  mockAppConfig,
  mockProductionConfig,
  mockDevelopmentConfig,
  mockSwarmConfig,
  mockSequentialSwarmConfig,
  mockLargeSwarmConfig,
  createRuntimeConfig,
  createPiClientConfig,
  createPostgresConfig,
  createRedisConfig,
  createAppConfig,
  mergeWithEnvConfig,
  isValidRuntimeConfig,
  getConfigForEnv,
} from './config';

// ============================================================================
// Re-export Types
// ============================================================================

export type { Agent, CreateAgentOptions } from '../../src/models/agent';
export type { Task, CreateTaskOptions, QualityGate, Checkpoint } from '../../src/models/task';
export type { RuntimeConfig } from '../../src/runtime/registry';
export type { PiClientConfig } from '../../src/integrations/pi/client';
export type { PostgresConfig } from '../../src/storage/postgres/config';

// ============================================================================
// Fixture Utilities
// ============================================================================

/**
 * Creates a complete test environment with all fixtures
 * 
 * @example
 * ```typescript
 * const env = createTestEnvironment();
 * env.agents.forEach(agent => repository.create(agent));
 * ```
 */
export function createTestEnvironment() {
  const { mockAgentSwarm } = require('./agents');
  const { mockTaskDAG } = require('./tasks');
  const { mockRuntimeConfig, mockAppConfig } = require('./config');
  
  return {
    agents: mockAgentSwarm,
    tasks: mockTaskDAG,
    config: {
      runtime: mockRuntimeConfig,
      app: mockAppConfig,
    },
  };
}

/**
 * Gets all predefined fixtures for quick reference
 * 
 * @example
 * ```typescript
 * const fixtures = getAllFixtures();
 * console.log(fixtures.agents.mockAgent);
 * console.log(fixtures.tasks.mockTask);
 * ```
 */
export function getAllFixtures() {
  return {
    agents: {
      mockAgent: require('./agents').mockAgent,
      mockRunningAgent: require('./agents').mockRunningAgent,
      mockCompletedAgent: require('./agents').mockCompletedAgent,
      mockFailedAgent: require('./agents').mockFailedAgent,
    },
    tasks: {
      mockTask: require('./tasks').mockTask,
      mockInProgressTask: require('./tasks').mockInProgressTask,
      mockCompletedTask: require('./tasks').mockCompletedTask,
      mockBlockedTask: require('./tasks').mockBlockedTask,
    },
    config: {
      mockRuntimeConfig: require('./config').mockRuntimeConfig,
      mockPiClientConfig: require('./config').mockPiClientConfig,
      mockAppConfig: require('./config').mockAppConfig,
    },
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  createTestEnvironment,
  getAllFixtures,
};

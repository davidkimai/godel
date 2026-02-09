/**
 * Test Helpers
 * 
 * Utility functions to reduce test boilerplate and standardize common operations.
 * 
 * @example
 * ```typescript
 * import { setupMockEnvironment, expectValidAgent, waitForAsync } from '../utils/test-helpers';
 * 
 * beforeEach(() => {
 *   setupMockEnvironment();
 * });
 * ```
 */

import { Agent } from '../../src/models/agent';
import { Task } from '../../src/models/task';

// ============================================================================
// Mock Environment Setup
// ============================================================================

/**
 * Sets up a complete mock environment for tests
 * Call this in beforeEach to ensure isolated mocks
 * 
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupMockEnvironment();
 * });
 * ```
 */
export function setupMockEnvironment(): void {
  // Reset all Jest mocks
  jest.clearAllMocks();
  
  // Reset modules if needed
  jest.resetModules();
}

/**
 * Cleans up after tests
 * Call this in afterEach to ensure proper cleanup
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   cleanupMockEnvironment();
 * });
 * ```
 */
export function cleanupMockEnvironment(): void {
  // Clear all timers
  jest.clearAllTimers();
  
  // Restore all mocks
  jest.restoreAllMocks();
}

/**
 * Sets up common console mocks to reduce noise in tests
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   suppressConsoleNoise();
 * });
 * ```
 */
export function suppressConsoleNoise(): void {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
}

/**
 * Restores console methods after tests
 * 
 * @example
 * ```typescript
 * afterAll(() => {
 *   restoreConsole();
 * });
 * ```
 */
export function restoreConsole(): void {
  jest.restoreAllMocks();
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Asserts that an object is a valid agent structure
 * 
 * @example
 * ```typescript
 * expectValidAgent(result);
 * ```
 */
export function expectValidAgent(agent: unknown): void {
  expect(agent).toBeDefined();
  expect(agent).toHaveProperty('id');
  expect(agent).toHaveProperty('status');
  expect(agent).toHaveProperty('model');
  expect(agent).toHaveProperty('runtime');
  expect(agent).toHaveProperty('createdAt');
}

/**
 * Asserts that an object is a valid task structure
 * 
 * @example
 * ```typescript
 * expectValidTask(result);
 * ```
 */
export function expectValidTask(task: unknown): void {
  expect(task).toBeDefined();
  expect(task).toHaveProperty('id');
  expect(task).toHaveProperty('title');
  expect(task).toHaveProperty('status');
  expect(task).toHaveProperty('priority');
  expect(task).toHaveProperty('createdAt');
}

/**
 * Asserts that an object is a valid API response
 * 
 * @example
 * ```typescript
 * expectValidApiResponse(response);
 * ```
 */
export function expectValidApiResponse(response: unknown): void {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('status');
  expect(response).toHaveProperty('data');
}

/**
 * Asserts that an object is a valid paginated response
 * 
 * @example
 * ```typescript
 * expectValidPagination(response);
 * ```
 */
export function expectValidPagination(response: unknown): void {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('data');
  expect(response).toHaveProperty('pagination');
  expect(response).toHaveProperty('pagination.total');
  expect(response).toHaveProperty('pagination.page');
  expect(response).toHaveProperty('pagination.pageSize');
}

/**
 * Asserts that an agent has the expected status
 * 
 * @example
 * ```typescript
 * expectAgentStatus(agent, 'running');
 * ```
 */
export function expectAgentStatus(agent: Agent, expectedStatus: string): void {
  expect(agent.status).toBe(expectedStatus);
}

/**
 * Asserts that a task has the expected status
 * 
 * @example
 * ```typescript
 * expectTaskStatus(task, 'completed');
 * ```
 */
export function expectTaskStatus(task: Task, expectedStatus: string): void {
  expect(task.status).toBe(expectedStatus);
}

// ============================================================================
// Async Helpers
// ============================================================================

/**
 * Waits for a condition to be met with timeout
 * 
 * @example
 * ```typescript
 * await waitFor(() => agent.status === 'running', 5000);
 * ```
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Waits for an async operation with timeout
 * 
 * @example
 * ```typescript
 * const result = await waitForAsync(promise, 10000);
 * ```
 */
export async function waitForAsync<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Delays execution for a specified duration
 * 
 * @example
 * ```typescript
 * await delay(1000); // Wait 1 second
 * ```
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff
 * 
 * @example
 * ```typescript
 * const result = await retry(async () => fetchData(), { maxRetries: 3 });
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 100, backoffMultiplier = 2 } = options;
  
  let lastError: Error | undefined;
  let currentDelay = delayMs;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        await delay(currentDelay);
        currentDelay *= backoffMultiplier;
      }
    }
  }
  
  throw lastError;
}

// ============================================================================
// Data Helpers
// ============================================================================

/**
 * Generates a unique test ID
 * 
 * @example
 * ```typescript
 * const id = generateTestId('agent'); // 'agent-1234567890-abc123'
 * ```
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a batch of unique IDs
 * 
 * @example
 * ```typescript
 * const ids = generateTestIds(5, 'agent');
 * ```
 */
export function generateTestIds(count: number, prefix: string = 'test'): string[] {
  return Array.from({ length: count }, () => generateTestId(prefix));
}

/**
 * Creates a date offset from now
 * 
 * @example
 * ```typescript
 * const date = offsetDate(-3600); // 1 hour ago
 * ```
 */
export function offsetDate(offsetSeconds: number): Date {
  return new Date(Date.now() + offsetSeconds * 1000);
}

/**
 * Shuffles an array randomly
 * 
 * @example
 * ```typescript
 * const shuffled = shuffle([1, 2, 3, 4, 5]);
 * ```
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Picks random items from an array
 * 
 * @example
 * ```typescript
 * const random = pickRandom([1, 2, 3, 4, 5], 2);
 * ```
 */
export function pickRandom<T>(array: T[], count: number): T[] {
  return shuffle(array).slice(0, count);
}

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Creates a mock function with return value tracking
 * 
 * @example
 * ```typescript
 * const fn = createTrackableMock((x) => x * 2);
 * fn(5);
 * expect(fn.getLastCall()).toEqual([5]);
 * ```
 */
export function createTrackableMock<TArgs extends unknown[], TReturn>(
  implementation?: (...args: TArgs) => TReturn
): jest.Mock<TReturn, TArgs> & { getLastCall: () => TArgs | undefined; getAllCalls: () => TArgs[] } {
  const mockFn = jest.fn(implementation);
  
  return Object.assign(mockFn, {
    getLastCall: () => mockFn.mock.calls[mockFn.mock.calls.length - 1] as TArgs | undefined,
    getAllCalls: () => mockFn.mock.calls as TArgs[],
  });
}

/**
 * Mocks a module's default export
 * 
 * @example
 * ```typescript
 * mockDefaultExport('../utils/logger', { info: jest.fn(), error: jest.fn() });
 * ```
 */
export function mockDefaultExport(modulePath: string, mockValue: unknown): void {
  jest.mock(modulePath, () => ({
    __esModule: true,
    default: mockValue,
  }));
}

/**
 * Mocks specific exports from a module
 * 
 * @example
 * ```typescript
 * mockNamedExports('../utils/helpers', { formatDate: jest.fn() });
 * ```
 */
export function mockNamedExports(modulePath: string, mockExports: Record<string, unknown>): void {
  jest.mock(modulePath, () => mockExports);
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Expects a function to throw with specific message
 * 
 * @example
 * ```typescript
 * await expectToThrow(
 *   () => validateInput(null),
 *   'Input is required'
 * );
 * ```
 */
export async function expectToThrow(
  fn: () => unknown,
  expectedMessage: string | RegExp
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    const message = (error as Error).message;
    if (typeof expectedMessage === 'string') {
      expect(message).toContain(expectedMessage);
    } else {
      expect(message).toMatch(expectedMessage);
    }
  }
}

/**
 * Creates a mock error for testing error handling
 * 
 * @example
 * ```typescript
 * const error = createMockError('Connection failed', 'ECONNREFUSED');
 * ```
 */
export function createMockError(message: string, code?: string): Error {
  const error = new Error(message);
  if (code) {
    (error as Error & { code: string }).code = code;
  }
  return error;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
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
};

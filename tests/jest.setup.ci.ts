/**
 * Jest CI Setup
 * 
 * CI-specific configuration for integration tests.
 * This file is automatically loaded in CI environments to provide:
 * - Increased timeouts for integration tests
 * - Global test environment setup/teardown
 * - Standardized mocks for external dependencies
 */

import { jest, beforeAll, afterAll } from '@jest/globals';

// ============================================================================
// Timeout Configuration
// ============================================================================

// Increase default timeout for integration tests (30 seconds)
jest.setTimeout(30000);

// ============================================================================
// Global Test Lifecycle
// ============================================================================

beforeAll(async () => {
  // Log test environment info
  console.log('[CI Setup] Test environment initialized');
  console.log(`[CI Setup] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`[CI Setup] CI: ${process.env.CI || 'false'}`);
});

afterAll(async () => {
  // Cleanup logging
  console.log('[CI Setup] Test environment cleanup complete');
});

// ============================================================================
// Global Mocks
// ============================================================================

// Mock console methods in CI to reduce noise
if (process.env.CI) {
  global.console = {
    ...console,
    // Keep error and warn for debugging, silence info/debug
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Mock fetch globally for tests
(globalThis as any).fetch = jest.fn();

// Mock setInterval/clearInterval for deterministic tests
jest.spyOn(global, 'setInterval');
jest.spyOn(global, 'clearInterval');

// ============================================================================
// Test Environment Utilities
// ============================================================================

/**
 * Wait for all pending promises to resolve
 * Useful for testing async operations
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Wait for a specified duration
 * @param ms - Milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve: resolve!, reject: reject! };
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock message bus for testing
 */
export function createMockBus() {
  const handlers = new Map<string, Function[]>();
  
  return {
    subscribe: jest.fn().mockImplementation((pattern: string, handler: Function) => {
      if (!handlers.has(pattern)) {
        handlers.set(pattern, []);
      }
      handlers.get(pattern)!.push(handler);
      return jest.fn(); // unsubscribe function
    }),
    
    unsubscribe: jest.fn(),
    
    publish: jest.fn().mockImplementation((topic: string, payload: unknown) => {
      // Find matching handlers
      handlers.forEach((topicHandlers, pattern) => {
        if (matchPattern(topic, pattern)) {
          topicHandlers.forEach(handler => handler(payload));
        }
      });
    }),
    
    // Helper to manually trigger handlers
    trigger: (topic: string, message: unknown) => {
      handlers.forEach((topicHandlers, pattern) => {
        if (matchPattern(topic, pattern)) {
          topicHandlers.forEach(handler => handler(message));
        }
      });
    },
    
    // Get handlers for a pattern
    getHandlers: (pattern: string) => handlers.get(pattern) || [],
  };
}

/**
 * Match a topic against a pattern (supports wildcards)
 */
function matchPattern(topic: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === topic) return true;
  
  const topicParts = topic.split('.');
  const patternParts = pattern.split('.');
  
  if (patternParts.length !== topicParts.length) {
    // Handle wildcard at end
    if (patternParts[patternParts.length - 1] === '*') {
      const basePattern = patternParts.slice(0, -1);
      const baseTopic = topicParts.slice(0, basePattern.length);
      return basePattern.every((part, i) => part === baseTopic[i]);
    }
    return false;
  }
  
  return patternParts.every((part, i) => part === '*' || part === topicParts[i]);
}

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse(
  overrides: Partial<Response> = {}
): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
    headers: new Headers(),
    ...overrides,
  } as Response;
}

/**
 * Create a mock agent for testing
 */
export function createMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: `agent-${Date.now()}`,
    name: 'Test Agent',
    type: 'worker',
    status: 'idle',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock task for testing
 */
export function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${Date.now()}`,
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Error Handling
// ============================================================================

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Export setup marker
export const CI_SETUP_LOADED = true;

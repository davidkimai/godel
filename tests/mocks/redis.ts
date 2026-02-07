/**
 * Redis Mock
 * 
 * Comprehensive mock for Redis operations with fallback support.
 * Simulates Redis commands, pub/sub, and fallback behavior.
 * 
 * @example
 * ```typescript
 * import { mockRedis, setupMockRedis, resetMockRedisState } from '../mocks/redis';
 * 
 * beforeEach(() => {
 *   setupMockRedis();
 *   resetMockRedisState();
 * });
 * ```
 */

import { EventEmitter } from 'events';
import type { Redis, RedisOptions } from 'ioredis';

// ============================================================================
// Types
// ============================================================================

interface RedisData {
  value: string;
  expiry: number | null;
}

interface MockRedisState {
  data: Map<string, RedisData>;
  pubSubChannels: Map<string, Set<(message: string) => void>>;
  pubSubPatterns: Map<string, Set<(message: string) => void>>;
  connected: boolean;
  shouldFail: boolean;
  failCommands: Set<string>;
  delayMs: number;
}

// ============================================================================
// State Management
// ============================================================================

const mockRedisState: MockRedisState = {
  data: new Map(),
  pubSubChannels: new Map(),
  pubSubPatterns: new Map(),
  connected: false,
  shouldFail: false,
  failCommands: new Set(),
  delayMs: 0,
};

// ============================================================================
// Mock Redis Implementation
// ============================================================================

/**
 * Creates a mock Redis client
 */
export function createMockRedis(_options?: RedisOptions): jest.Mocked<Redis> {
  const mockRedis = new EventEmitter() as jest.Mocked<Redis>;
  
  // Connection methods
  mockRedis.connect = jest.fn().mockImplementation(async () => {
    if (mockRedisState.shouldFail) {
      throw new Error('Connection refused');
    }
    mockRedisState.connected = true;
    mockRedis.emit('connect');
  });
  
  mockRedis.disconnect = jest.fn().mockImplementation(() => {
    mockRedisState.connected = false;
    mockRedis.emit('disconnect');
  });
  
  mockRedis.quit = jest.fn().mockImplementation(async () => {
    mockRedisState.connected = false;
    mockRedis.emit('end');
  });
  
  mockRedis.ping = jest.fn().mockResolvedValue('PONG');
  
  // Basic commands
  mockRedis.get = jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
    await simulateDelay();
    checkShouldFail('get');
    
    const data = mockRedisState.data.get(key);
    if (!data) return null;
    
    // Check expiry
    if (data.expiry && Date.now() > data.expiry) {
      mockRedisState.data.delete(key);
      return null;
    }
    
    return data.value;
  });
  
  mockRedis.set = jest.fn().mockImplementation(async (key: string, value: string): Promise<'OK'> => {
    await simulateDelay();
    checkShouldFail('set');
    
    mockRedisState.data.set(key, { value, expiry: null });
    return 'OK';
  });
  
  mockRedis.setex = jest.fn().mockImplementation(async (key: string, seconds: number, value: string): Promise<'OK'> => {
    await simulateDelay();
    checkShouldFail('setex');
    
    mockRedisState.data.set(key, {
      value,
      expiry: Date.now() + (seconds * 1000),
    });
    return 'OK';
  });
  
  mockRedis.del = jest.fn().mockImplementation(async (...keys: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('del');
    
    let count = 0;
    for (const key of keys) {
      if (mockRedisState.data.delete(key)) {
        count++;
      }
    }
    return count;
  });
  
  mockRedis.exists = jest.fn().mockImplementation(async (...keys: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('exists');
    
    let count = 0;
    for (const key of keys) {
      const data = mockRedisState.data.get(key);
      if (data) {
        if (!data.expiry || Date.now() <= data.expiry) {
          count++;
        } else {
          mockRedisState.data.delete(key);
        }
      }
    }
    return count;
  });
  
  mockRedis.expire = jest.fn().mockImplementation(async (key: string, seconds: number): Promise<number> => {
    await simulateDelay();
    checkShouldFail('expire');
    
    const data = mockRedisState.data.get(key);
    if (!data) return 0;
    
    data.expiry = Date.now() + (seconds * 1000);
    return 1;
  });
  
  mockRedis.ttl = jest.fn().mockImplementation(async (key: string): Promise<number> => {
    await simulateDelay();
    checkShouldFail('ttl');
    
    const data = mockRedisState.data.get(key);
    if (!data) return -2;
    if (!data.expiry) return -1;
    
    const ttl = Math.ceil((data.expiry - Date.now()) / 1000);
    return ttl > 0 ? ttl : -2;
  });
  
  // Hash commands
  mockRedis.hget = jest.fn().mockImplementation(async (key: string, field: string): Promise<string | null> => {
    await simulateDelay();
    checkShouldFail('hget');
    
    const hashKey = `${key}:${field}`;
    const data = mockRedisState.data.get(hashKey);
    return data?.value || null;
  });
  
  mockRedis.hset = jest.fn().mockImplementation(async (key: string, ...args: unknown[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('hset');
    
    // Handle both hset(key, field, value) and hset(key, {field: value})
    if (args.length === 1 && typeof args[0] === 'object') {
      const obj = args[0] as Record<string, string>;
      let count = 0;
      for (const [field, value] of Object.entries(obj)) {
        mockRedisState.data.set(`${key}:${field}`, { value, expiry: null });
        count++;
      }
      return count;
    } else if (args.length >= 2) {
      const field = args[0] as string;
      const value = args[1] as string;
      mockRedisState.data.set(`${key}:${field}`, { value, expiry: null });
      return 1;
    }
    return 0;
  });
  
  mockRedis.hgetall = jest.fn().mockImplementation(async (key: string): Promise<Record<string, string>> => {
    await simulateDelay();
    checkShouldFail('hgetall');
    
    const result: Record<string, string> = {};
    const entries = Array.from(mockRedisState.data.entries());
    for (const [dataKey, data] of entries) {
      if (dataKey.startsWith(`${key}:`)) {
        const field = dataKey.slice(key.length + 1);
        result[field] = data.value;
      }
    }
    return result;
  });
  
  mockRedis.hdel = jest.fn().mockImplementation(async (key: string, ...fields: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('hdel');
    
    let count = 0;
    for (const field of fields) {
      if (mockRedisState.data.delete(`${key}:${field}`)) {
        count++;
      }
    }
    return count;
  });
  
  // List commands
  mockRedis.lpush = jest.fn().mockImplementation(async (key: string, ...values: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('lpush');
    
    const existing = mockRedisState.data.get(key);
    const list: string[] = existing ? JSON.parse(existing.value) : [];
    list.unshift(...values);
    mockRedisState.data.set(key, { value: JSON.stringify(list), expiry: null });
    return list.length;
  });
  
  mockRedis.rpush = jest.fn().mockImplementation(async (key: string, ...values: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('rpush');
    
    const existing = mockRedisState.data.get(key);
    const list: string[] = existing ? JSON.parse(existing.value) : [];
    list.push(...values);
    mockRedisState.data.set(key, { value: JSON.stringify(list), expiry: null });
    return list.length;
  });
  
  mockRedis.lpop = jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
    await simulateDelay();
    checkShouldFail('lpop');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return null;
    
    const list: string[] = JSON.parse(existing.value);
    const value = list.shift();
    mockRedisState.data.set(key, { value: JSON.stringify(list), expiry: null });
    return value || null;
  });
  
  mockRedis.rpop = jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
    await simulateDelay();
    checkShouldFail('rpop');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return null;
    
    const list: string[] = JSON.parse(existing.value);
    const value = list.pop();
    mockRedisState.data.set(key, { value: JSON.stringify(list), expiry: null });
    return value || null;
  });
  
  mockRedis.lrange = jest.fn().mockImplementation(async (key: string, start: number, stop: number): Promise<string[]> => {
    await simulateDelay();
    checkShouldFail('lrange');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return [];
    
    const list: string[] = JSON.parse(existing.value);
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end);
  });
  
  // Set commands
  mockRedis.sadd = jest.fn().mockImplementation(async (key: string, ...members: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('sadd');
    
    const existing = mockRedisState.data.get(key);
    const arr: string[] = existing ? JSON.parse(existing.value) : [];
    const set = new Set(arr);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    mockRedisState.data.set(key, { value: JSON.stringify(Array.from(set)), expiry: null });
    return added;
  });
  
  mockRedis.srem = jest.fn().mockImplementation(async (key: string, ...members: string[]): Promise<number> => {
    await simulateDelay();
    checkShouldFail('srem');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return 0;
    
    const arr: string[] = JSON.parse(existing.value);
    const set = new Set(arr);
    let removed = 0;
    for (const member of members) {
      if (set.has(member)) {
        set.delete(member);
        removed++;
      }
    }
    mockRedisState.data.set(key, { value: JSON.stringify(Array.from(set)), expiry: null });
    return removed;
  });
  
  mockRedis.sismember = jest.fn().mockImplementation(async (key: string, member: string): Promise<number> => {
    await simulateDelay();
    checkShouldFail('sismember');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return 0;
    
    const arr: string[] = JSON.parse(existing.value);
    const set = new Set(arr);
    return set.has(member) ? 1 : 0;
  });
  
  mockRedis.smembers = jest.fn().mockImplementation(async (key: string): Promise<string[]> => {
    await simulateDelay();
    checkShouldFail('smembers');
    
    const existing = mockRedisState.data.get(key);
    if (!existing) return [];
    
    return JSON.parse(existing.value) as string[];
  });
  
  // Pub/Sub commands
  mockRedis.publish = jest.fn().mockImplementation(async (channel: string, message: string): Promise<number> => {
    await simulateDelay();
    checkShouldFail('publish');
    
    const subscribers = mockRedisState.pubSubChannels.get(channel);
    if (subscribers) {
      subscribers.forEach(callback => callback(message));
      return subscribers.size;
    }
    return 0;
  });
  
  mockRedis.subscribe = jest.fn().mockImplementation(async (...channels: string[]): Promise<void> => {
    await simulateDelay();
    checkShouldFail('subscribe');
    
    for (const channel of channels) {
      if (!mockRedisState.pubSubChannels.has(channel)) {
        mockRedisState.pubSubChannels.set(channel, new Set());
      }
    }
    mockRedis.emit('subscribe', channels.length);
  });
  
  mockRedis.unsubscribe = jest.fn().mockImplementation(async (...channels: string[]): Promise<void> => {
    await simulateDelay();
    checkShouldFail('unsubscribe');
    
    for (const channel of channels) {
      mockRedisState.pubSubChannels.delete(channel);
    }
  });
  
  mockRedis.psubscribe = jest.fn().mockImplementation(async (...patterns: string[]): Promise<void> => {
    await simulateDelay();
    checkShouldFail('psubscribe');
    
    for (const pattern of patterns) {
      if (!mockRedisState.pubSubPatterns.has(pattern)) {
        mockRedisState.pubSubPatterns.set(pattern, new Set());
      }
    }
  });
  
  mockRedis.punsubscribe = jest.fn().mockImplementation(async (...patterns: string[]): Promise<void> => {
    await simulateDelay();
    checkShouldFail('punsubscribe');
    
    for (const pattern of patterns) {
      mockRedisState.pubSubPatterns.delete(pattern);
    }
  });
  
  // Key scanning
  mockRedis.keys = jest.fn().mockImplementation(async (pattern: string): Promise<string[]> => {
    await simulateDelay();
    checkShouldFail('keys');
    
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(mockRedisState.data.keys()).filter(key => regex.test(key));
  });
  
  mockRedis.scan = jest.fn().mockImplementation(async (_cursor: number): Promise<[string, string[]]> => {
    await simulateDelay();
    checkShouldFail('scan');
    
    const keys = Array.from(mockRedisState.data.keys());
    return ['0', keys]; // Simplified: returns all keys at once
  });
  
  // Event emitter methods
  mockRedis.on = jest.fn().mockImplementation(function(this: EventEmitter, event: string, listener: (...args: unknown[]) => void) {
    return EventEmitter.prototype.on.call(this, event, listener);
  });
  
  mockRedis.once = jest.fn().mockImplementation(function(this: EventEmitter, event: string, listener: (...args: unknown[]) => void) {
    return EventEmitter.prototype.once.call(this, event, listener);
  });
  
  mockRedis.removeListener = jest.fn().mockImplementation(function(this: EventEmitter, event: string, listener: (...args: unknown[]) => void) {
    return EventEmitter.prototype.removeListener.call(this, event, listener);
  });
  
  mockRedis.removeAllListeners = jest.fn().mockImplementation(function(this: EventEmitter, event?: string) {
    return EventEmitter.prototype.removeAllListeners.call(this, event);
  });
  
  mockRedis.status = 'ready';
  
  return mockRedis;
}

// ============================================================================
// Singleton Mock Instance
// ============================================================================

/**
 * Global mock Redis instance
 */
export const mockRedis = createMockRedis();

// ============================================================================
// Module Mock Setup
// ============================================================================

/**
 * Sets up Jest to mock the ioredis module
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockRedis();
 * });
 * ```
 */
export function setupMockRedis(): void {
  jest.mock('ioredis', () => {
    return jest.fn().mockImplementation((_options?: RedisOptions) => createMockRedis(_options));
  });
}

/**
 * Sets up Jest to mock the RedisFallback module
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockRedisFallback();
 * });
 * ```
 */
export function setupMockRedisFallback(): void {
  jest.mock('../../src/storage/redis-fallback', () => ({
    RedisFallback: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockImplementation(async (_op: unknown, fallback: unknown) => fallback),
      getStats: jest.fn().mockReturnValue({
        isConnected: true,
        isInFallbackMode: false,
        queuedEvents: 0,
        replayedEvents: 0,
        droppedEvents: 0,
        failedConnections: 0,
        lastError: null,
        lastRecovery: null,
      }),
      getState: jest.fn().mockReturnValue('connected'),
      forceRecovery: jest.fn().mockResolvedValue(true),
      shutdown: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
    FallbackState: {
      CONNECTED: 'connected',
      FALLBACK: 'fallback',
      RECOVERING: 'recovering',
      DISCONNECTED: 'disconnected',
    },
  }));
}

// ============================================================================
// State Management
// ============================================================================

async function simulateDelay(): Promise<void> {
  if (mockRedisState.delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, mockRedisState.delayMs));
  }
}

function checkShouldFail(command: string): void {
  if (mockRedisState.shouldFail || mockRedisState.failCommands.has(command)) {
    throw new Error(`Redis command failed: ${command}`);
  }
}

/**
 * Resets the mock Redis state
 * Call this in afterEach to ensure test isolation
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetMockRedisState();
 * });
 * ```
 */
export function resetMockRedisState(): void {
  mockRedisState.data.clear();
  mockRedisState.pubSubChannels.clear();
  mockRedisState.pubSubPatterns.clear();
  mockRedisState.connected = false;
  mockRedisState.shouldFail = false;
  mockRedisState.failCommands.clear();
  mockRedisState.delayMs = 0;
  
  // Clear all mocks
  Object.values(mockRedis).forEach(fn => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      fn.mockClear();
    }
  });
}

/**
 * Sets a value in the mock Redis store
 * 
 * @example
 * ```typescript
 * setMockRedisValue('my-key', 'my-value', 60); // With 60s TTL
 * ```
 */
export function setMockRedisValue(key: string, value: string, ttlSeconds?: number): void {
  mockRedisState.data.set(key, {
    value,
    expiry: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null,
  });
}

/**
 * Gets a value from the mock Redis store
 * 
 * @example
 * ```typescript
 * const value = getMockRedisValue('my-key');
 * ```
 */
export function getMockRedisValue(key: string): string | null {
  const data = mockRedisState.data.get(key);
  if (!data) return null;
  if (data.expiry && Date.now() > data.expiry) {
    mockRedisState.data.delete(key);
    return null;
  }
  return data.value;
}

/**
 * Simulates Redis connection failure
 * 
 * @example
 * ```typescript
 * simulateRedisFailure();
 * ```
 */
export function simulateRedisFailure(commands?: string[]): void {
  mockRedisState.shouldFail = true;
  if (commands) {
    commands.forEach(cmd => mockRedisState.failCommands.add(cmd));
  }
}

/**
 * Sets simulated delay for all Redis operations
 * 
 * @example
 * ```typescript
 * setRedisDelay(100); // 100ms delay
 * ```
 */
export function setRedisDelay(ms: number): void {
  mockRedisState.delayMs = ms;
}

/**
 * Gets all keys in the mock Redis store
 * 
 * @example
 * ```typescript
 * const keys = getMockRedisKeys();
 * ```
 */
export function getMockRedisKeys(): string[] {
  return Array.from(mockRedisState.data.keys());
}

/**
 * Clears all data in the mock Redis store
 * 
 * @example
 * ```typescript
 * clearMockRedisData();
 * ```
 */
export function clearMockRedisData(): void {
  mockRedisState.data.clear();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
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
};

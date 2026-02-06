/**
 * Utils Module - Main Export
 * 
 * Centralized exports for utility functions
 */

// Logger
export { logger, Logger, LogLevel, LogLevelEnum } from './logger';
export type { LogEntry, LogLevelString } from './logger';

// Cache
export { LRUCache, createLRUCache } from './cache';
export type { CacheEntry, LRUCacheOptions } from './cache';

// Connection Pool
export { ConnectionPool, createPool } from './pool';
export type { PoolOptions, PooledResource } from './pool';

// Memory Management
export {
  MemoryManager,
  ObjectPool,
  getMemoryManager,
  resetMemoryManager,
  createBufferPool,
  monitorMemoryUsage,
} from './memory-manager';
export type {
  MemoryManagerConfig,
  MemorySnapshot,
  ObjectPoolConfig,
} from './memory-manager';

// CLI State Persistence
export {
  loadState,
  saveState,
  getOpenClawState,
  setOpenClawState,
  clearOpenClawState,
  isOpenClawConnected,
  isOpenClawMockMode,
  getStateFilePath,
  resetState,
} from './cli-state';
export type { CLIState, OpenClawState } from './cli-state';

// Crypto utilities
export {
  SALT_ROUNDS,
  hashPassword,
  comparePassword,
  hashApiKey,
  compareApiKey,
  timingSafeCompare,
  generateSecureToken,
  generateRandomString,
} from './crypto';

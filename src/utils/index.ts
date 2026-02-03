/**
 * Utils Module - Main Export
 * 
 * Centralized exports for utility functions
 */

// Logger
export { logger, Logger, LogLevel, LogLevelEnum } from './logger';
export type { LogEntry, LogLevelString } from './logger';

// Cache
export { LRUCache, memoize } from './cache';
export type { CacheEntry, CacheOptions } from './cache';

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

/**
 * In-Memory Cache Layer
 * 
 * LRU (Least Recently Used) cache for frequently accessed data.
 * Provides configurable TTL, size limits, and metrics.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number; // Size in bytes (approximate)
}

export interface CacheOptions {
  /** Maximum number of entries */
  maxEntries?: number;
  /** Maximum memory usage in bytes (approximate) */
  maxMemory?: number;
  /** Default TTL in milliseconds */
  ttlMs?: number;
  /** Enable automatic cleanup interval */
  cleanupIntervalMs?: number;
  /** Enable metrics collection */
  enableMetrics?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  currentSize: number;
  currentEntries: number;
  hitRate: number;
}

export interface CacheStats {
  uptime: number;
  metrics: CacheMetrics;
}

// ============================================================================
// LRUCache Implementation
// ============================================================================

/**
 * LRU Cache with TTL support
 */
export class LRUCache<T = unknown> extends EventEmitter {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheOptions>;
  private metrics: CacheMetrics;
  private startTime: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    super();
    this.options = {
      maxEntries: options.maxEntries ?? 1000,
      maxMemory: options.maxMemory ?? 10 * 1024 * 1024, // 10MB default
      ttlMs: options.ttlMs ?? 300000, // 5 minutes default
      cleanupIntervalMs: options.cleanupIntervalMs ?? 60000, // 1 minute
      enableMetrics: options.enableMetrics ?? true,
    };
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      currentSize: 0,
      currentEntries: 0,
      hitRate: 0,
    };
    this.startTime = Date.now();
    this.startCleanupTimer();
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.recordMiss();
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.recordMiss();
      return undefined;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.recordHit();
    return entry.value;
  }

  /**
   * Get a value from the cache, returning a default if not found
   */
  getOrDefault(key: string, defaultValue: T): T {
    const value = this.get(key);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Calculate entry size
    const size = this.estimateSize(value);
    const expiresAt = Date.now() + (ttlMs ?? this.options.ttlMs);

    // Delete existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.metrics.currentSize -= existing.size;
      this.cache.delete(key);
    }

    // Evict entries if needed
    while (
      this.cache.size >= this.options.maxEntries ||
      this.metrics.currentSize + size > this.options.maxMemory
    ) {
      this.evictLeastRecentlyUsed();
    }

    // Create new entry
    const entry: CacheEntry<T> = {
      key,
      value,
      expiresAt,
      lastAccessed: Date.now(),
      accessCount: 0,
      size,
    };

    this.cache.set(key, entry);
    this.metrics.currentSize += size;
    this.metrics.currentEntries = this.cache.size;
    this.metrics.sets++;
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.metrics.currentSize -= entry.size;
    this.metrics.currentEntries = this.cache.size;
    this.metrics.deletes++;
    this.emit('delete', key, entry.value);
    return true;
  }

  /**
   * Check if a key exists in the cache (without updating LRU order)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.metrics.currentSize = 0;
    this.metrics.currentEntries = 0;
    this.emit('clear');
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Get multiple values at once
   */
  getMany(keys: string[]): Map<string, T | undefined> {
    const result = new Map<string, T | undefined>();
    for (const key of keys) {
      result.set(key, this.get(key));
    }
    return result;
  }

  /**
   * Set multiple values at once
   */
  setMany(entries: Array<{ key: string; value: T; ttlMs?: number }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttlMs);
    }
  }

  /**
   * Delete multiple values at once
   */
  deleteMany(keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) count++;
    }
    return count;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get all keys matching a pattern
   */
  keys(pattern?: RegExp): string[] {
    if (!pattern) {
      return Array.from(this.cache.keys());
    }
    return Array.from(this.cache.keys()).filter(key => pattern.test(key));
  }

  /**
   * Get all entries
   */
  entries(): Map<string, CacheEntry<T>> {
    return new Map(this.cache);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      uptime: Date.now() - this.startTime,
      metrics: {
        ...this.metrics,
        hitRate: total > 0 ? this.metrics.hits / total : 0,
      },
    };
  }

  /**
   * Get cache size in bytes
   */
  getMemoryUsage(): number {
    return this.metrics.currentSize;
  }

  /**
   * Get entry count
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get remaining TTL for a key
   */
  getTTL(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return -1;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : -1;
  }

  /**
   * Update TTL for a key
   */
  updateTTL(key: string, ttlMs: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    entry.expiresAt = Date.now() + ttlMs;
    entry.lastAccessed = Date.now();
    return true;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    return expiredKeys.length;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private evictLeastRecentlyUsed(): void {
    let oldestEntry: [string, CacheEntry<T>] | null = null;
    let oldestAccessed = Infinity;

    for (const entry of this.cache) {
      if (entry[1].lastAccessed < oldestAccessed) {
        oldestAccessed = entry[1].lastAccessed;
        oldestEntry = entry;
      }
    }

    if (oldestEntry) {
      this.cache.delete(oldestEntry[0]);
      this.metrics.currentSize -= oldestEntry[1].size;
      this.metrics.currentEntries = this.cache.size;
      this.metrics.evictions++;
      this.emit('evict', oldestEntry[0], oldestEntry[1]);
    }
  }

  private estimateSize(value: unknown): number {
    // Rough estimate of object size in bytes
    if (typeof value === 'string') {
      return value.length * 2;
    }
    if (typeof value === 'number') {
      return 8;
    }
    if (typeof value === 'boolean') {
      return 4;
    }
    if (value === null || value === undefined) {
      return 4;
    }
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 64; // Fallback for non-serializable objects
    }
  }

  private recordHit(): void {
    if (this.options.enableMetrics) {
      this.metrics.hits++;
    }
  }

  private recordMiss(): void {
    if (this.options.enableMetrics) {
      this.metrics.misses++;
    }
  }

  private startCleanupTimer(): void {
    if (this.options.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.options.cleanupIntervalMs);
    }
  }

  /**
   * Destroy the cache and stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// ============================================================================
// Cache Manager (Multi-Cache Support)
// ============================================================================

export interface CacheManagerOptions {
  /** Default cache options */
  defaultOptions?: CacheOptions;
  /** Named caches to create */
  caches?: Record<string, CacheOptions>;
}

/**
 * Manages multiple named caches
 */
export class CacheManager {
  private caches: Map<string, LRUCache<unknown>> = new Map();
  private defaultOptions: Required<CacheOptions>;

  constructor(options: CacheManagerOptions = {}) {
    this.defaultOptions = {
      maxEntries: options.defaultOptions?.maxEntries ?? 1000,
      maxMemory: options.defaultOptions?.maxMemory ?? 10 * 1024 * 1024,
      ttlMs: options.defaultOptions?.ttlMs ?? 300000,
      cleanupIntervalMs: options.defaultOptions?.cleanupIntervalMs ?? 60000,
      enableMetrics: options.defaultOptions?.enableMetrics ?? true,
    };

    // Create named caches
    if (options.caches) {
      for (const [name, cacheOptions] of Object.entries(options.caches)) {
        this.create(name, cacheOptions);
      }
    }
  }

  /**
   * Get or create a named cache
   */
  get<T = unknown>(name: string, options?: CacheOptions): LRUCache<T> {
    let cache = this.caches.get(name) as LRUCache<T> | undefined;
    
    if (!cache) {
      cache = this.create<T>(name, options);
    }
    
    return cache;
  }

  /**
   * Create a new named cache
   */
  create<T = unknown>(name: string, options?: CacheOptions): LRUCache<T> {
    const cache = new LRUCache<T>({
      ...this.defaultOptions,
      ...options,
    });
    this.caches.set(name, cache);
    return cache;
  }

  /**
   * Delete a named cache
   */
  delete(name: string): boolean {
    const cache = this.caches.get(name);
    if (!cache) return false;
    
    cache.destroy();
    return this.caches.delete(name);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Get statistics for all caches
   */
  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    
    for (const [name, cache] of this.caches) {
      stats[name] = cache.getStats();
    }
    
    return stats;
  }

  /**
   * Clean up expired entries in all caches
   */
  cleanupAll(): Record<string, number> {
    const results: Record<string, number> = {};
    
    for (const [name, cache] of this.caches) {
      results[name] = cache.cleanup();
    }
    
    return results;
  }

  /**
   * Destroy all caches
   */
  destroy(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }
}

// ============================================================================
// Default Cache Instance
// ============================================================================

let globalCacheManager: CacheManager | null = null;

/**
 * Get or create the global cache manager
 */
export function getCacheManager(options?: CacheManagerOptions): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
  }
  return globalCacheManager;
}

/**
 * Reset the global cache manager
 */
export function resetCacheManager(): void {
  if (globalCacheManager) {
    globalCacheManager.destroy();
    globalCacheManager = null;
  }
}

// ============================================================================
// Pre-configured Caches
// ============================================================================

/**
 * Cache for agent data (1 minute TTL, 1000 entries)
 */
export function getAgentCache(): LRUCache {
  return getCacheManager().get('agents', {
    maxEntries: 1000,
    ttlMs: 60000,
    cleanupIntervalMs: 30000,
  });
}

/**
 * Cache for session data (5 minute TTL, 500 entries)
 */
export function getSessionCache(): LRUCache {
  return getCacheManager().get('sessions', {
    maxEntries: 500,
    ttlMs: 300000,
    cleanupIntervalMs: 60000,
  });
}

/**
 * Cache for workflow definitions (10 minute TTL, 200 entries)
 */
export function getWorkflowCache(): LRUCache {
  return getCacheManager().get('workflows', {
    maxEntries: 200,
    ttlMs: 600000,
    cleanupIntervalMs: 120000,
  });
}

/**
 * Cache for API responses (30 second TTL, 2000 entries)
 */
export function getApiCache(): LRUCache {
  return getCacheManager().get('api', {
    maxEntries: 2000,
    ttlMs: 30000,
    cleanupIntervalMs: 15000,
  });
}

export default LRUCache;

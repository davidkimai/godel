/**
 * LRU Cache Implementation
 * 
 * Simple, efficient LRU cache for hot data caching.
 * Used for agent, swarm, and event caching to reduce database queries.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number; // milliseconds
}

/**
 * LRU Cache with TTL support
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.defaultTTL = options.defaultTTL ?? 30000; // 30 seconds default
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Remove if exists (to update LRU order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need hit/miss tracking
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Memoize a function with LRU cache
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options: CacheOptions & { keyGenerator?: (...args: Parameters<T>) => string } = {}
): T {
  const cache = new LRUCache<ReturnType<T>>(options);
  const keyGenerator = options.keyGenerator ?? ((...args) => JSON.stringify(args));

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator(...args);
    const cached = cache.get(key);
    
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

export default LRUCache;

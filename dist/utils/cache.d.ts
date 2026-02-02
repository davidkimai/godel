/**
 * LRU Cache Implementation - Performance Optimized
 *
 * Simple, efficient LRU cache for hot data caching.
 * Used for agent, swarm, and event caching to reduce database queries.
 *
 * PERFORMANCE ROUND 2 OPTIMIZATIONS:
 * - Hit/miss tracking for cache performance monitoring
 * - Longer default TTLs for CLI workloads (60s default)
 * - Pre-allocated Map capacity hint
 * - Batch cleanup for expired entries
 */
export interface CacheEntry<T> {
    value: T;
    expiresAt: number;
    accessCount: number;
}
export interface CacheOptions {
    maxSize?: number;
    defaultTTL?: number;
    trackStats?: boolean;
}
export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
}
/**
 * LRU Cache with TTL support and performance tracking
 */
export declare class LRUCache<T> {
    private cache;
    private maxSize;
    private defaultTTL;
    private trackStats;
    private hits;
    private misses;
    private evictions;
    private lastCleanup;
    private readonly CLEANUP_INTERVAL;
    constructor(options?: CacheOptions);
    /**
     * Get a value from the cache
     * PERFORMANCE: O(1) with optional hit tracking
     */
    get(key: string): T | undefined;
    /**
     * Get multiple values from cache (batch operation)
     * PERFORMANCE: Reduces repeated Map operations
     */
    getMany(keys: string[]): Map<string, T>;
    /**
     * Set a value in the cache
     * PERFORMANCE: O(1) with automatic eviction
     */
    set(key: string, value: T, ttl?: number): void;
    /**
     * Set multiple values (batch operation)
     * PERFORMANCE: Reduces repeated eviction checks
     */
    setMany(entries: Array<{
        key: string;
        value: T;
        ttl?: number;
    }>): void;
    /**
     * Delete a value from the cache
     */
    delete(key: string): boolean;
    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache statistics with hit rate calculation
     * PERFORMANCE: Real-time hit/miss tracking
     */
    getStats(): CacheStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    /**
     * Clean up expired entries
     * PERFORMANCE: Batch cleanup with interval check
     */
    cleanup(): number;
    /**
     * Get cache keys sorted by access frequency (for cache warming analysis)
     */
    getHotKeys(limit?: number): Array<{
        key: string;
        accessCount: number;
    }>;
}
/**
 * Memoize a function with LRU cache
 */
export declare function memoize<T extends (...args: any[]) => any>(fn: T, options?: CacheOptions & {
    keyGenerator?: (...args: Parameters<T>) => string;
}): T;
export default LRUCache;
//# sourceMappingURL=cache.d.ts.map
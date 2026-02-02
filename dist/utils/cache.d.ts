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
    defaultTTL?: number;
}
/**
 * LRU Cache with TTL support
 */
export declare class LRUCache<T> {
    private cache;
    private maxSize;
    private defaultTTL;
    constructor(options?: CacheOptions);
    /**
     * Get a value from the cache
     */
    get(key: string): T | undefined;
    /**
     * Set a value in the cache
     */
    set(key: string, value: T, ttl?: number): void;
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
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
    };
    /**
     * Clean up expired entries
     */
    cleanup(): number;
}
/**
 * Memoize a function with LRU cache
 */
export declare function memoize<T extends (...args: any[]) => any>(fn: T, options?: CacheOptions & {
    keyGenerator?: (...args: Parameters<T>) => string;
}): T;
export default LRUCache;
//# sourceMappingURL=cache.d.ts.map
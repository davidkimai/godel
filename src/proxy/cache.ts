/**
 * Response Cache Module
 * 
 * Caches LLM responses to reduce costs and improve latency.
 * Supports Redis as the primary cache backend with in-memory fallback.
 * 
 * @module proxy/cache
 */

import { 
  CompletionRequest, 
  CompletionResponse, 
  CacheEntry, 
  CacheStats,
  Message,
  Tool
} from './types.js';

// =============================================================================
// Cache Configuration
// =============================================================================

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default TTL in seconds */
  defaultTtl: number;
  
  /** Maximum cache size (number of entries) */
  maxSize: number;
  
  /** Enable cache compression */
  enableCompression: boolean;
  
  /** Cache key prefix */
  keyPrefix: string;
  
  /** Redis connection config */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    tls?: boolean;
  };
  
  /** Cache warming configuration */
  warming?: {
    enabled: boolean;
    models: string[];
    queries: string[];
  };
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTtl: 3600, // 1 hour
  maxSize: 10000,
  enableCompression: false,
  keyPrefix: 'dash:llm:',
  redis: undefined,
  warming: {
    enabled: false,
    models: [],
    queries: []
  }
};

// =============================================================================
// In-Memory Cache
// =============================================================================

/**
 * Simple in-memory cache with LRU eviction
 */
export class InMemoryCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;
  
  constructor(maxSize: number = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  /**
   * Get entry from cache
   */
  get(key: string): CompletionResponse | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check if entry has expired
    if (entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.response;
  }
  
  /**
   * Set entry in cache
   */
  set(key: string, response: CompletionResponse, ttlSeconds: number): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    const now = new Date();
    const entry: CacheEntry = {
      key,
      response,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      accessCount: 0
    };
    
    this.cache.set(key, entry);
  }
  
  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Delete entries matching a pattern
   */
  deletePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let memoryUsage = 0;
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;
    
    for (const entry of Array.from(this.cache.values())) {
      memoryUsage += JSON.stringify(entry).length;
      
      if (!oldestEntry || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (!newestEntry || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }
    
    const total = this.hits + this.misses;
    
    return {
      totalEntries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      memoryUsage,
      oldestEntry,
      newestEntry
    };
  }
  
  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get entry count
   */
  size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Redis Cache Client Interface
// =============================================================================

/**
 * Redis client interface
 */
export interface RedisClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<unknown[]>;
  mget(keys: string[]): Promise<unknown[]>;
  mset(entries: Record<string, string>): Promise<unknown>;
  ping(): Promise<unknown>;
  info(): Promise<unknown>;
}

// =============================================================================
// Main Response Cache
// =============================================================================

/**
 * Response cache with Redis and in-memory fallback
 */
export class ResponseCache {
  private config: CacheConfig;
  private memoryCache: InMemoryCache;
  private redis: RedisClient | null = null;
  private enabled: boolean = true;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.memoryCache = new InMemoryCache(this.config.maxSize);
  }
  
  /**
   * Initialize Redis connection if configured
   */
  async initialize(): Promise<void> {
    if (this.config.redis) {
      try {
        // Dynamic import to avoid bundling Redis when not needed
        const { createClient } = await import('redis');
        
        const client = createClient({
          socket: {
            host: this.config.redis.host,
            port: this.config.redis.port,
            tls: this.config.redis.tls
          },
          password: this.config.redis.password,
          database: this.config.redis.db || 0
        });
        
        await client.connect();
        
        this.redis = {
          get: (key: string) => client.get(key),
          set: (key: string, value: string, ttl?: number) => 
            client.set(key, value, { EX: ttl }),
          del: (key: string) => client.del(key).then(() => {}),
          keys: (pattern: string) => client.keys(pattern),
          mget: (keys: string[]) => client.mGet(keys),
          mset: (entries: Record<string, string>) => client.mSet(entries),
          ping: () => client.ping(),
          info: () => client.info()
        };
        
        console.log('[Cache] Redis connection established');
      } catch (error) {
        console.warn('[Cache] Failed to connect to Redis, using in-memory cache:', error);
        this.redis = null;
      }
    }
  }
  
  /**
   * Get cached response
   */
  async get(key: string): Promise<CompletionResponse | null> {
    if (!this.enabled) return null;
    
    const fullKey = this.config.keyPrefix + key;
    
    // Try Redis first if available
    if (this.redis) {
      try {
        const cached = await this.redis.get(fullKey);
        if (cached) {
          const entry = JSON.parse(cached as string) as CacheEntry;
          
          // Check expiration
          if (new Date(entry.expiresAt) > new Date()) {
            return {
              ...entry.response,
              cached: true
            };
          }
          
          // Expired, delete it
          await this.redis.del(fullKey);
        }
      } catch (error) {
        console.error('[Cache] Redis get error:', error);
      }
    }
    
    // Fallback to memory cache
    const memoryResult = this.memoryCache.get(fullKey);
    if (memoryResult) {
      return {
        ...memoryResult,
        cached: true
      };
    }
    
    return null;
  }
  
  /**
   * Cache a response
   */
  async set(
    key: string, 
    response: CompletionResponse, 
    ttlSeconds?: number
  ): Promise<void> {
    if (!this.enabled) return;
    
    // Don't cache error responses or streaming responses
    if (!response.content && !response.toolCalls) return;
    if (response.finishReason === 'length') return; // Don't cache truncated responses
    
    const fullKey = this.config.keyPrefix + key;
    const ttl = ttlSeconds || this.config.defaultTtl;
    
    const entry: CacheEntry = {
      key: fullKey,
      response,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttl * 1000),
      accessCount: 0
    };
    
    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.set(fullKey, JSON.stringify(entry), ttl) as unknown as Promise<void>;
      } catch (error) {
        console.error('[Cache] Redis set error:', error);
        // Fallback to memory cache on Redis error
        this.memoryCache.set(fullKey, response, ttl);
      }
    } else {
      // Use memory cache
      this.memoryCache.set(fullKey, response, ttl);
    }
  }
  
  /**
   * Invalidate a specific cache entry
   */
  async invalidate(key: string): Promise<void> {
    const fullKey = this.config.keyPrefix + key;
    
    if (this.redis) {
      try {
        await this.redis.del(fullKey);
      } catch (error) {
        console.error('[Cache] Redis del error:', error);
      }
    }
    
    this.memoryCache.delete(fullKey);
  }
  
  /**
   * Invalidate cache entries matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const fullPattern = this.config.keyPrefix + pattern;
    let count = 0;
    
    if (this.redis) {
      try {
        const keys = await this.redis.keys(fullPattern + '*') as string[];
        if (keys.length > 0) {
          await Promise.all(keys.map(k => this.redis!.del(k)));
          count = keys.length;
        }
      } catch (error) {
        console.error('[Cache] Redis pattern delete error:', error);
      }
    }
    
    count += this.memoryCache.deletePattern(fullPattern);
    
    return count;
  }
  
  /**
   * Generate cache key from request
   */
  generateKey(req: CompletionRequest): string {
    // Create deterministic key from request
    const keyData = {
      model: req.model,
      messages: req.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      })),
      tools: req.tools?.map(t => t.name).sort(),
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      top_p: req.top_p,
      response_format: req.response_format?.type
    };
    
    const keyString = JSON.stringify(keyData);
    return this.hashKey(keyString);
  }
  
  /**
   * Hash a string to create a cache key
   */
  private hashKey(str: string): string {
    // Simple hash function for cache keys
    // In production, use a proper hash like SHA-256
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const memoryStats = this.memoryCache.getStats();
    
    if (this.redis) {
      try {
        const info = await this.redis.info();
        // Parse Redis info for stats
        return {
          ...memoryStats,
          // Could add Redis-specific stats here
        };
      } catch (error) {
        console.error('[Cache] Redis stats error:', error);
      }
    }
    
    return memoryStats;
  }
  
  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(this.config.keyPrefix + '*') as string[];
        if (keys.length > 0) {
          await Promise.all(keys.map(k => this.redis!.del(k)));
        }
      } catch (error) {
        console.error('[Cache] Redis clear error:', error);
      }
    }
    
    this.memoryCache.clear();
  }
  
  /**
   * Check cache health
   */
  async checkHealth(): Promise<{ healthy: boolean; hitRate?: number }> {
    const stats = await this.getStats();
    
    if (this.redis) {
      try {
        await this.redis.ping();
        return {
          healthy: true,
          hitRate: stats.hitRate
        };
      } catch (error) {
        return {
          healthy: false,
          hitRate: stats.hitRate
        };
      }
    }
    
    return {
      healthy: true,
      hitRate: stats.hitRate
    };
  }
  
  /**
   * Enable/disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Warm cache with pre-computed responses
   */
  async warmCache(warmData: Array<{ request: CompletionRequest; response: CompletionResponse }>): Promise<void> {
    if (!this.enabled || !this.config.warming?.enabled) return;
    
    for (const { request, response } of warmData) {
      const key = this.generateKey(request);
      await this.set(key, response, this.config.defaultTtl * 2); // Longer TTL for warmed cache
    }
    
    console.log(`[Cache] Warmed ${warmData.length} entries`);
  }
  
  /**
   * Pre-warm common queries
   */
  async prewarmCommonQueries(): Promise<void> {
    if (!this.config.warming?.enabled) return;
    
    const commonQueries = this.config.warming.queries;
    const models = this.config.warming.models;
    
    // This would typically fetch pre-computed responses
    // For now, just log the intention
    console.log(`[Cache] Would pre-warm ${commonQueries.length} queries for ${models.length} models`);
  }
  
  /**
   * Get cache size
   */
  async size(): Promise<number> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(this.config.keyPrefix + '*');
        return keys.length;
      } catch (error) {
        console.error('[Cache] Redis size error:', error);
      }
    }
    
    return this.memoryCache.size();
  }
  
  /**
   * Close cache connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      // Redis client cleanup would go here
      // await this.redis.quit();
      this.redis = null;
    }
  }
}

// =============================================================================
// Cache Key Utilities
// =============================================================================

/**
 * Create a cache key for a specific user and request
 */
export function createUserCacheKey(userId: string, requestKey: string): string {
  return `user:${userId}:${requestKey}`;
}

/**
 * Create a cache key for a tenant
 */
export function createTenantCacheKey(tenantId: string, requestKey: string): string {
  return `tenant:${tenantId}:${requestKey}`;
}

/**
 * Create a cache key for a model
 */
export function createModelCacheKey(model: string, requestKey: string): string {
  return `model:${model}:${requestKey}`;
}

/**
 * Determine if a request should be cached
 */
export function shouldCacheRequest(req: CompletionRequest): boolean {
  // Don't cache streaming requests
  if (req.stream) return false;
  
  // Don't cache requests with specific routing hints that disable caching
  if (req.routing?.fallbackAllowed === false) return false;
  
  // Don't cache requests with tools (results may vary)
  if (req.tools && req.tools.length > 0) return false;
  
  return true;
}

/**
 * Determine TTL based on request characteristics
 */
export function calculateCacheTtl(req: CompletionRequest, defaultTtl: number): number {
  // Use shorter TTL for high-temperature requests (more random)
  if (req.temperature && req.temperature > 0.5) {
    return Math.floor(defaultTtl / 2);
  }
  
  // Use longer TTL for low-temperature or deterministic requests
  if (req.temperature === 0 || req.seed !== undefined) {
    return defaultTtl * 2;
  }
  
  return defaultTtl;
}

// =============================================================================
// Cache Decorator
// =============================================================================

/**
 * Cache decorator for methods that return CompletionResponse
 */
export function Cached(ttlSeconds?: number) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      // Assume first arg is the request and this has a cache property
      const cache: ResponseCache | undefined = (this as { cache?: ResponseCache }).cache;
      const req = args[0] as CompletionRequest;
      
      if (!cache || !shouldCacheRequest(req)) {
        return originalMethod.apply(this, args);
      }
      
      const key = cache.generateKey(req);
      const cached = await cache.get(key);
      
      if (cached) {
        return cached;
      }
      
      const result = await originalMethod.apply(this, args);
      
      if (result) {
        await cache.set(key, result, ttlSeconds);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Response Cache for LLM Proxy
 * Caches responses to reduce costs and latency
 */

import { CompletionResponse } from './types';

export interface CacheEntry {
  response: CompletionResponse;
  timestamp: Date;
  ttl: number;
}

export class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTtl: number;

  constructor(defaultTtl: number = 300) {
    this.defaultTtl = defaultTtl;
  }

  /**
   * Get cached response
   */
  get(key: string): CompletionResponse | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp.getTime() + entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return {
      ...entry.response,
      cached: true
    };
  }

  /**
   * Set cached response
   */
  set(key: string, response: CompletionResponse, ttl?: number): void {
    this.cache.set(key, {
      response,
      timestamp: new Date(),
      ttl: ttl || this.defaultTtl
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate cache key from request
   */
  generateKey(request: { model: string; messages: any[]; temperature?: number }): string {
    const keyData = {
      model: request.model,
      messages: request.messages,
      temp: request.temperature || 0.7
    };
    return `cache:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // Would track in production
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp.getTime() + entry.ttl * 1000) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
}

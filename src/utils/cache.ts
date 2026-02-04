/**
 * LRU Cache Implementation
 * A simple in-memory least-recently-used cache with O(1) access and O(1) updates
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export interface LRUCacheOptions {
  maxSize?: number;
  ttlMs?: number;
  onEvict?: <T>(key: string, value: T) => void;
}

export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttlMs: number | null;
  private onEvict?: <T>(key: string, value: T) => void;

  constructor(options: LRUCacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 1000;
    this.ttlMs = options.ttlMs ?? null;
    this.onEvict = options.onEvict;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.timestamp = Date.now();
    entry.hits++;
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (evicted && this.onEvict) {
        this.onEvict(oldestKey, evicted.value);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    return Array.from(this.cache.values()).map((e) => e.value);
  }

  stats(): { size: number; maxSize: number; ttlMs: number | null } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

export function createLRUCache<T>(options?: LRUCacheOptions): LRUCache<T> {
  return new LRUCache<T>(options);
}

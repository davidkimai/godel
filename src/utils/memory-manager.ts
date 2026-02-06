/**
 * Memory Management Utilities
 * 
 * Provides:
 * - Memory leak detection
 * - Object pooling for frequently created objects
 * - Cleanup intervals
 * - Memory usage monitoring
 */

import { EventEmitter } from 'events';
import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface MemoryManagerConfig {
  /** Enable memory monitoring */
  enableMonitoring?: boolean;
  /** Monitoring interval (ms) */
  monitoringIntervalMs?: number;
  /** Memory threshold warning (percent) */
  memoryThreshold?: number;
  /** Enable automatic cleanup */
  enableAutoCleanup?: boolean;
  /** Cleanup interval (ms) */
  cleanupIntervalMs?: number;
  /** Memory limit in MB */
  memoryLimitMB?: number;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  percentUsed: number;
}

export interface ObjectPoolConfig<T> {
  /** Initial pool size */
  initialSize?: number;
  /** Maximum pool size */
  maxSize?: number;
  /** Factory function to create objects */
  factory: () => T;
  /** Reset function to prepare object for reuse */
  reset?: (obj: T) => void;
  /** Validate function to check if object is still usable */
  validate?: (obj: T) => boolean;
}

// ============================================================================
// Memory Manager
// ============================================================================

export class MemoryManager extends EventEmitter {
  private config: Required<MemoryManagerConfig>;
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots = 100;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupHandlers: Array<() => void> = [];
  private pools: Map<string, ObjectPool<unknown>> = new Map();

  constructor(config: MemoryManagerConfig = {}) {
    super();
    this.config = {
      enableMonitoring: config.enableMonitoring !== false,
      monitoringIntervalMs: config.monitoringIntervalMs || 30000, // 30s
      memoryThreshold: config.memoryThreshold || 80,
      enableAutoCleanup: config.enableAutoCleanup !== false,
      cleanupIntervalMs: config.cleanupIntervalMs || 60000, // 1 minute
      memoryLimitMB: config.memoryLimitMB || 1024, // 1GB
    };

    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Take a memory snapshot
   */
  snapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024), // MB
      percentUsed: Math.round((usage.heapUsed / usage.heapTotal) * 100),
    };

    this.snapshots.push(snapshot);
    
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Check threshold
    if (snapshot.percentUsed > this.config.memoryThreshold) {
      this.emit('warning', {
        type: 'memory_threshold',
        message: `Memory usage at ${snapshot.percentUsed}%`,
        snapshot,
      });
      logger.warn('memory-manager', `High memory usage: ${snapshot.percentUsed}%`);
    }

    return snapshot;
  }

  /**
   * Get memory history
   */
  getHistory(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get current memory usage
   */
  getCurrentUsage(): MemorySnapshot {
    return this.snapshot();
  }

  /**
   * Register a cleanup handler
   */
  onCleanup(handler: () => void): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Unregister a cleanup handler
   */
  offCleanup(handler: () => void): void {
    const index = this.cleanupHandlers.indexOf(handler);
    if (index > -1) {
      this.cleanupHandlers.splice(index, 1);
    }
  }

  /**
   * Run all cleanup handlers
   */
  runCleanup(): void {
    logger.info('memory-manager', 'Running cleanup handlers');
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (error) {
        logger.error('memory-manager', 'Cleanup handler error: ' + error);
      }
    }
    
    // Trigger GC if available
    if (global.gc) {
      global.gc();
      logger.info('memory-manager', 'Garbage collection triggered');
    }
  }

  /**
   * Create or get an object pool
   */
  getPool<T>(name: string, config: ObjectPoolConfig<T>): ObjectPool<T> {
    if (!this.pools.has(name)) {
      const pool = new ObjectPool<T>(config);
      this.pools.set(name, pool as ObjectPool<unknown>);
    }
    return this.pools.get(name) as ObjectPool<T>;
  }

  /**
   * Get all pool statistics
   */
  getPoolStats(): Record<string, ReturnType<ObjectPool<unknown>['getStats']>> {
    const stats: Record<string, ReturnType<ObjectPool<unknown>['getStats']>> = {};
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  /**
   * Force garbage collection (if available)
   */
  forceGC(): void {
    if (global.gc) {
      global.gc();
      logger.info('memory-manager', 'Forced garbage collection');
    } else {
      logger.warn('memory-manager', 'Garbage collection not available. Run with --expose-gc flag.');
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectLeaks(): Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    growthRate: number;
  }> {
    const leaks: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      growthRate: number;
    }> = [];

    if (this.snapshots.length < 5) return leaks;

    // Calculate growth rate over last 5 snapshots
    const recent = this.snapshots.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000 / 60; // minutes

    if (timeDiff > 0) {
      const heapGrowth = (last.heapUsed - first.heapUsed) / timeDiff;
      const rssGrowth = (last.rss - first.rss) / timeDiff;

      // High heap growth (> 10MB/min)
      if (heapGrowth > 10) {
        leaks.push({
          type: 'heap',
          severity: heapGrowth > 50 ? 'high' : 'medium',
          message: `Heap growing at ${Math.round(heapGrowth)}MB/min`,
          growthRate: heapGrowth,
        });
      }

      // High RSS growth (> 20MB/min)
      if (rssGrowth > 20) {
        leaks.push({
          type: 'rss',
          severity: rssGrowth > 100 ? 'high' : 'medium',
          message: `RSS growing at ${Math.round(rssGrowth)}MB/min`,
          growthRate: rssGrowth,
        });
      }
    }

    return leaks;
  }

  /**
   * Shutdown memory manager
   */
  shutdown(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear pools
    for (const pool of this.pools.values()) {
      pool.clear();
    }
    this.pools.clear();

    this.cleanupHandlers = [];
    logger.info('memory-manager', 'Memory manager shutdown');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.snapshot();
    }, this.config.monitoringIntervalMs);
  }

  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const snapshot = this.snapshot();
      
      // Run cleanup if memory is above threshold
      if (snapshot.percentUsed > this.config.memoryThreshold) {
        this.runCleanup();
      }

      // Check for leaks
      const leaks = this.detectLeaks();
      if (leaks.length > 0) {
        this.emit('leak', leaks);
      }
    }, this.config.cleanupIntervalMs);
  }
}

// ============================================================================
// Object Pool
// ============================================================================

export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private config: Required<Omit<ObjectPoolConfig<T>, 'factory' | 'reset' | 'validate'>> & 
                 Pick<ObjectPoolConfig<T>, 'factory' | 'reset' | 'validate'>;
  private stats = {
    created: 0,
    reused: 0,
    destroyed: 0,
  };

  constructor(config: ObjectPoolConfig<T>) {
    this.config = {
      initialSize: config.initialSize || 10,
      maxSize: config.maxSize || 100,
      factory: config.factory,
      reset: config.reset,
      validate: config.validate,
    };

    // Initialize pool
    for (let i = 0; i < this.config.initialSize; i++) {
      this.available.push(this.config.factory());
      this.stats.created++;
    }
  }

  /**
   * Acquire an object from the pool
   */
  acquire(): T {
    // Try to get from available
    while (this.available.length > 0) {
      const obj = this.available.pop()!;
      
      // Validate if validator provided
      if (!this.config.validate || this.config.validate(obj)) {
        this.inUse.add(obj);
        this.stats.reused++;
        return obj;
      } else {
        this.stats.destroyed++;
      }
    }

    // Create new if under limit
    if (this.inUse.size < this.config.maxSize) {
      const obj = this.config.factory();
      this.inUse.add(obj);
      this.stats.created++;
      return obj;
    }

    throw new Error('Object pool exhausted');
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      return;
    }

    this.inUse.delete(obj);

    // Reset if provided
    if (this.config.reset) {
      this.config.reset(obj);
    }

    // Add back to available
    this.available.push(obj);
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    available: number;
    inUse: number;
    total: number;
    created: number;
    reused: number;
    destroyed: number;
    reuseRate: number;
  } {
    const total = this.available.length + this.inUse.size;
    const reuseRate = this.stats.created > 0
      ? this.stats.reused / (this.stats.reused + this.stats.created)
      : 0;

    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total,
      created: this.stats.created,
      reused: this.stats.reused,
      destroyed: this.stats.destroyed,
      reuseRate: Math.round(reuseRate * 100) / 100,
    };
  }

  /**
   * Clear all objects from pool
   */
  clear(): void {
    this.available = [];
    this.inUse.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalMemoryManager: MemoryManager | null = null;

export function getMemoryManager(config?: MemoryManagerConfig): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager(config);
  }
  return globalMemoryManager;
}

export function resetMemoryManager(): void {
  globalMemoryManager?.shutdown();
  globalMemoryManager = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a buffer pool for frequent allocations
 */
export function createBufferPool(
  size: number,
  count: number
): ObjectPool<Buffer> {
  return getMemoryManager().getPool(`buffer_${size}`, {
    initialSize: count,
    maxSize: count * 2,
    factory: () => Buffer.allocUnsafe(size),
    reset: (buf) => buf.fill(0),
  });
}

/**
 * Monitor function memory usage
 */
export function monitorMemoryUsage(
  fn: () => void,
  label: string
): void {
  const before = process.memoryUsage();
  fn();
  const after = process.memoryUsage();
  
  const heapDelta = (after.heapUsed - before.heapUsed) / 1024 / 1024;
  if (heapDelta > 1) {
    logger.info('memory-manager', `${label} allocated ${Math.round(heapDelta)}MB`);
  }
}

export default MemoryManager;

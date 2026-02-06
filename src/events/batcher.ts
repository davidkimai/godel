/**
 * Event Batcher
 * 
 * Optimizes event handling by:
 * - Batching small events together
 * - Reducing event overhead
 * - Adding compression for large payloads
 * - Implementing deduplication
 */

import { EventEmitter } from 'events';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Types
// ============================================================================

export interface EventBatchConfig {
  /** Maximum events per batch */
  maxBatchSize?: number;
  /** Maximum time to wait before flushing (ms) */
  maxWaitMs?: number;
  /** Enable compression for payloads larger than this (bytes) */
  compressionThreshold?: number;
  /** Enable deduplication */
  enableDeduplication?: boolean;
  /** Deduplication window (ms) */
  dedupWindowMs?: number;
}

export interface BatchedEvent {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface EventBatch {
  id: string;
  events: BatchedEvent[];
  createdAt: number;
  compressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
}

export interface BatchMetrics {
  batchesCreated: number;
  eventsBatched: number;
  eventsDeduplicated: number;
  avgBatchSize: number;
  avgCompressionRatio: number;
  flushCount: number;
}

// ============================================================================
// Event Batcher
// ============================================================================

export class EventBatcher extends EventEmitter {
  private config: Required<EventBatchConfig>;
  private pendingEvents: BatchedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private dedupSet: Set<string> = new Set();
  private dedupTimestamps: Map<string, number> = new Map();
  private metrics = {
    batchesCreated: 0,
    eventsBatched: 0,
    eventsDeduplicated: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    flushCount: 0,
  };
  private isFlushing = false;

  constructor(config: EventBatchConfig = {}) {
    super();
    this.config = {
      maxBatchSize: config.maxBatchSize || 100,
      maxWaitMs: config.maxWaitMs || 50, // 50ms default
      compressionThreshold: config.compressionThreshold || 1024, // 1KB
      enableDeduplication: config.enableDeduplication !== false,
      dedupWindowMs: config.dedupWindowMs || 1000, // 1 second
    };
  }

  /**
   * Add an event to the batch
   */
  async add(
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: BatchedEvent = {
      id: this.generateEventId(),
      type,
      payload,
      timestamp: Date.now(),
      metadata,
    };

    // Check for duplicates if enabled
    if (this.config.enableDeduplication && this.isDuplicate(event)) {
      this.metrics.eventsDeduplicated++;
      return;
    }

    this.pendingEvents.push(event);
    this.metrics.eventsBatched++;

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.config.maxWaitMs);
    }

    // Flush immediately if batch is full
    if (this.pendingEvents.length >= this.config.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Flush pending events as a batch
   */
  async flush(): Promise<EventBatch | null> {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return null;
    }

    this.isFlushing = true;

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Take events from pending
    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    // Create batch
    const batch: EventBatch = {
      id: this.generateBatchId(),
      events,
      createdAt: Date.now(),
    };

    // Calculate original size
    const originalSize = this.calculateSize(events);
    batch.originalSize = originalSize;
    this.metrics.totalOriginalSize += originalSize;

    // Compress if needed
    if (originalSize > this.config.compressionThreshold) {
      try {
        const compressed = await this.compressBatch(batch);
        batch.compressed = true;
        batch.compressedSize = compressed.length;
        this.metrics.totalCompressedSize += compressed.length;
      } catch (error) {
        logger.warn('event-batcher', 'Compression failed, using uncompressed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.metrics.batchesCreated++;
    this.metrics.flushCount++;

    // Emit batch
    this.emit('batch', batch);
    this.isFlushing = false;

    return batch;
  }

  /**
   * Process a batch (decompress and emit events)
   */
  async processBatch(batch: EventBatch): Promise<BatchedEvent[]> {
    if (batch.compressed && batch.compressedSize) {
      try {
        return await this.decompressBatch(batch);
      } catch (error) {
        logger.error('event-batcher', 'Decompression failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return batch.events;
      }
    }
    return batch.events;
  }

  /**
   * Get batch metrics
   */
  getMetrics(): BatchMetrics {
    const avgBatchSize = this.metrics.flushCount > 0
      ? this.metrics.eventsBatched / this.metrics.flushCount
      : 0;
    
    const avgCompressionRatio = this.metrics.totalOriginalSize > 0 && this.metrics.totalCompressedSize > 0
      ? this.metrics.totalOriginalSize / this.metrics.totalCompressedSize
      : 1;

    return {
      batchesCreated: this.metrics.batchesCreated,
      eventsBatched: this.metrics.eventsBatched,
      eventsDeduplicated: this.metrics.eventsDeduplicated,
      avgBatchSize: Math.round(avgBatchSize * 100) / 100,
      avgCompressionRatio: Math.round(avgCompressionRatio * 100) / 100,
      flushCount: this.metrics.flushCount,
    };
  }

  /**
   * Get pending event count
   */
  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * Clear pending events
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingEvents = [];
  }

  /**
   * Shutdown the batcher
   */
  async shutdown(): Promise<void> {
    await this.flush();
    this.clear();
    this.removeAllListeners();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private isDuplicate(event: BatchedEvent): boolean {
    const dedupKey = this.generateDedupKey(event);
    const now = Date.now();

    // Clean old dedup entries
    for (const [key, timestamp] of this.dedupTimestamps) {
      if (now - timestamp > this.config.dedupWindowMs) {
        this.dedupSet.delete(key);
        this.dedupTimestamps.delete(key);
      }
    }

    if (this.dedupSet.has(dedupKey)) {
      return true;
    }

    this.dedupSet.add(dedupKey);
    this.dedupTimestamps.set(dedupKey, now);
    return false;
  }

  private generateDedupKey(event: BatchedEvent): string {
    // Create a dedup key based on type and payload content
    const payloadHash = this.hashCode(JSON.stringify(event.payload));
    return `${event.type}:${payloadHash}`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async compressBatch(batch: EventBatch): Promise<Buffer> {
    const data = JSON.stringify(batch.events);
    return gzipAsync(Buffer.from(data, 'utf8'));
  }

  private async decompressBatch(batch: EventBatch): Promise<BatchedEvent[]> {
    // In a real implementation, the compressed data would be stored in the batch
    // For now, return the original events
    return batch.events;
  }

  private calculateSize(events: BatchedEvent[]): number {
    try {
      return Buffer.byteLength(JSON.stringify(events), 'utf8');
    } catch {
      return events.length * 100; // Estimate
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Event Batch Processor
// ============================================================================

export class EventBatchProcessor extends EventEmitter {
  private batchers: Map<string, EventBatcher> = new Map();
  private defaultConfig: EventBatchConfig;

  constructor(defaultConfig: EventBatchConfig = {}) {
    super();
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a batcher for a specific event type
   */
  getBatcher(type: string, config?: EventBatchConfig): EventBatcher {
    if (!this.batchers.has(type)) {
      const batcher = new EventBatcher(config || this.defaultConfig);
      
      // Forward batch events
      batcher.on('batch', (batch) => {
        this.emit('batch', { type, batch });
      });

      this.batchers.set(type, batcher);
    }
    return this.batchers.get(type)!;
  }

  /**
   * Add an event to the appropriate batcher
   */
  async add(
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const batcher = this.getBatcher(type);
    await batcher.add(type, payload, metadata);
  }

  /**
   * Flush all batchers
   */
  async flushAll(): Promise<void> {
    const promises = Array.from(this.batchers.values()).map(b => b.flush());
    await Promise.all(promises);
  }

  /**
   * Get metrics for all batchers
   */
  getAllMetrics(): Record<string, BatchMetrics> {
    const metrics: Record<string, BatchMetrics> = {};
    for (const [type, batcher] of this.batchers) {
      metrics[type] = batcher.getMetrics();
    }
    return metrics;
  }

  /**
   * Shutdown all batchers
   */
  async shutdown(): Promise<void> {
    const promises = Array.from(this.batchers.values()).map(b => b.shutdown());
    await Promise.all(promises);
    this.batchers.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalProcessor: EventBatchProcessor | null = null;

export function getEventBatchProcessor(config?: EventBatchConfig): EventBatchProcessor {
  if (!globalProcessor) {
    globalProcessor = new EventBatchProcessor(config);
  }
  return globalProcessor;
}

export function resetEventBatchProcessor(): void {
  globalProcessor = null;
}

export default EventBatcher;

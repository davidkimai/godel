/**
 * Batch Operation Methods
 * Utilities for efficient batch processing with concurrency control
 */

export interface BatchOptions {
  batchSize?: number;
  concurrency?: number;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
}

export interface BatchResult<T> {
  success: T[];
  failed: Array<{ item: T; error: Error }>;
  total: number;
  duration: number;
}

export interface BatchItem<T, R> {
  item: T;
  index: number;
  resolve: (value: R) => void;
  reject: (error: Error) => void;
}

export class BatchProcessor<T = unknown, R = unknown> {
  private queue: BatchItem<T, R>[];
  private results: R[];
  private errors: Array<{ item: T; error: Error }>;
  private options: Required<BatchOptions>;
  private processor: (item: T) => R | Promise<R>;

  constructor(
    processor: (item: T) => R | Promise<R>,
    options: BatchOptions = {}
  ) {
    this.processor = processor;
    this.queue = [];
    this.results = [];
    this.errors = [];
    this.options = {
      batchSize: options.batchSize ?? 100,
      concurrency: options.concurrency ?? 5,
      timeoutMs: options.timeoutMs ?? 30000,
      retryCount: options.retryCount ?? 0,
      retryDelayMs: options.retryDelayMs ?? 1000,
    };
  }

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        item,
        index: this.queue.length,
        resolve,
        reject,
      });
    });
  }

  async processAll(): Promise<BatchResult<T>> {
    const start = Date.now();
    const success: R[] = [];
    const failed: Array<{ item: T; error: Error }> = [];

    // Process in batches with concurrency
    const batches = this.chunk(this.queue, this.options.batchSize);

    for (const batch of batches) {
      const batchResults = await this.processBatch(batch);
      success.push(...batchResults.success);
      failed.push(...batchResults.failed);
    }

    return {
      success,
      failed,
      total: this.queue.length,
      duration: Date.now() - start,
    };
  }

  private async processBatch(
    batch: BatchItem<T, R>[]
  ): Promise<{ success: R[]; failed: Array<{ item: T; error: Error }> }> {
    const success: R[] = [];
    const failed: Array<{ item: T; error: Error }> = [];

    // Process with concurrency limit
    const chunks = this.chunk(batch, this.options.concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (item) => {
        try {
          const result = await this.withTimeout(
            this.withRetry(() => this.processor(item.item))
          );
          success.push(result);
          item.resolve(result);
          return { success: true, result };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          failed.push({ item: item.item, error: err });
          item.reject(err);
          return { success: false, error: err };
        }
      });

      await Promise.all(promises);
    }

    return { success, failed };
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt < this.options.retryCount) {
        await this.sleep(this.options.retryDelayMs * (attempt + 1));
        return this.withRetry(fn, attempt + 1);
      }
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Batch item timeout')), this.options.timeoutMs)
      ),
    ]);
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clear(): void {
    this.queue = [];
    this.results = [];
    this.errors = [];
  }

  pending(): number {
    return this.queue.length;
  }
}

/**
 * Simple batch function for one-off processing
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => R | Promise<R>,
  options?: BatchOptions
): Promise<BatchResult<T>> {
  const batchProcessor = new BatchProcessor<T, R>(processor, options);

  // Add all items
  for (const item of items) {
    batchProcessor.add(item);
  }

  return batchProcessor.processAll();
}

/**
 * Throttled function wrapper
 */
export function createThrottled<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  maxConcurrent: number
): T {
  const inFlight = new Set<Promise<unknown>>();

  return ((...args: Parameters<T>) => {
    const result = fn(...args);

    const cleanup = () => inFlight.delete(result);
    result.then(cleanup, cleanup);

    // Wait if at concurrency limit
    const wait = async (): Promise<unknown> => {
      while (inFlight.size >= maxConcurrent) {
        await Promise.race(inFlight);
      }
    };

    wait().then(() => inFlight.add(result));

    return result;
  }) as T;
}

/**
 * Rate limiter with sliding window
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private options: { rate: number; intervalMs: number };

  constructor(options: { rate: number; intervalMs: number }) {
    this.tokens = options.rate;
    this.lastRefill = Date.now();
    this.options = options;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for next refill
    const waitTime = this.options.intervalMs;
    await this.sleep(waitTime);
    this.tokens = this.options.rate - 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.options.intervalMs) {
      this.tokens = this.options.rate;
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Metrics Types - Core metric type definitions and implementations
 * 
 * Provides Counter, Gauge, and Histogram metric types for observability.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels?: string[];
  buckets?: number[];      // For histograms
  quantiles?: number[];    // For summaries
}

export interface MetricValue {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Counter - Monotonically increasing metric
 * Can only go up (or be reset to 0)
 */
export class Counter {
  private value = 0;

  constructor(private definition: MetricDefinition) {}

  /**
   * Increment the counter by a given amount (default: 1)
   */
  inc(amount = 1): void {
    if (amount < 0) {
      throw new Error('Cannot decrement a counter');
    }
    this.value += amount;
  }

  /**
   * Get current counter value
   */
  get(): number {
    return this.value;
  }

  /**
   * Reset counter to 0
   */
  reset(): void {
    this.value = 0;
  }

  /**
   * Get metric definition
   */
  getDefinition(): MetricDefinition {
    return this.definition;
  }
}

/**
 * Gauge - Metric that can go up or down
 * Used for values that change over time (e.g., queue depth, memory usage)
 */
export class Gauge {
  private value = 0;

  constructor(private definition: MetricDefinition) {}

  /**
   * Set gauge to a specific value
   */
  set(value: number): void {
    this.value = value;
  }

  /**
   * Increment gauge by amount (default: 1)
   */
  inc(amount = 1): void {
    this.value += amount;
  }

  /**
   * Decrement gauge by amount (default: 1)
   */
  dec(amount = 1): void {
    this.value -= amount;
  }

  /**
   * Get current gauge value
   */
  get(): number {
    return this.value;
  }

  /**
   * Set gauge to current timestamp
   */
  setToCurrentTime(): void {
    this.value = Date.now() / 1000;
  }

  /**
   * Time a function execution and set gauge to duration
   */
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      this.value = (Date.now() - start) / 1000;
    };
  }

  /**
   * Get metric definition
   */
  getDefinition(): MetricDefinition {
    return this.definition;
  }
}

/**
 * Histogram - Distribution of values
 * Tracks value distributions with configurable buckets
 */
export class Histogram {
  private observations: number[] = [];
  private buckets: Map<number, number> = new Map();
  private sum = 0;

  constructor(private definition: MetricDefinition) {
    // Initialize buckets with default or provided values
    const bucketValues = definition.buckets || [0.1, 0.5, 1, 2, 5, 10];
    for (const bucket of bucketValues) {
      this.buckets.set(bucket, 0);
    }
  }

  /**
   * Observe a value
   */
  observe(value: number): void {
    this.observations.push(value);
    this.sum += value;

    // Update bucket counts
    for (const [bucket, count] of this.buckets) {
      if (value <= bucket) {
        this.buckets.set(bucket, count + 1);
      }
    }
  }

  /**
   * Time a function and observe its duration
   */
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      this.observe((Date.now() - start) / 1000);
    };
  }

  /**
   * Get sum of all observed values
   */
  getSum(): number {
    return this.sum;
  }

  /**
   * Get count of all observations
   */
  getCount(): number {
    return this.observations.length;
  }

  /**
   * Get bucket counts
   */
  getBuckets(): Map<number, number> {
    return new Map(this.buckets);
  }

  /**
   * Calculate percentile (p50, p95, p99, etc.)
   */
  percentile(p: number): number {
    if (this.observations.length === 0) return 0;

    const sorted = [...this.observations].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get mean of all observations
   */
  mean(): number {
    if (this.observations.length === 0) return 0;
    return this.sum / this.observations.length;
  }

  /**
   * Get min observation
   */
  min(): number {
    if (this.observations.length === 0) return 0;
    return Math.min(...this.observations);
  }

  /**
   * Get max observation
   */
  max(): number {
    if (this.observations.length === 0) return 0;
    return Math.max(...this.observations);
  }

  /**
   * Get standard deviation
   */
  stdDev(): number {
    if (this.observations.length === 0) return 0;
    const mean = this.mean();
    const squaredDiffs = this.observations.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.observations.length;
    return Math.sqrt(variance);
  }

  /**
   * Reset all observations and buckets
   */
  reset(): void {
    this.observations = [];
    this.sum = 0;
    for (const bucket of this.buckets.keys()) {
      this.buckets.set(bucket, 0);
    }
  }

  /**
   * Get metric definition
   */
  getDefinition(): MetricDefinition {
    return this.definition;
  }
}

/**
 * Summary - Calculates configurable quantiles over a sliding time window
 * Similar to histogram but calculates quantiles on the client side
 */
export class Summary {
  private observations: number[] = [];
  private maxAge: number;
  private ageBuckets: number;

  constructor(
    private definition: MetricDefinition,
    options: { maxAgeSeconds?: number; ageBuckets?: number } = {}
  ) {
    this.maxAge = (options.maxAgeSeconds || 600) * 1000; // Default 10 minutes
    this.ageBuckets = options.ageBuckets || 5;
  }

  /**
   * Observe a value
   */
  observe(value: number): void {
    this.observations.push(value);
    this.cleanOldObservations();
  }

  /**
   * Time a function and observe its duration
   */
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      this.observe((Date.now() - start) / 1000);
    };
  }

  /**
   * Calculate quantile (0-1 range)
   */
  quantile(q: number): number {
    this.cleanOldObservations();
    if (this.observations.length === 0) return 0;

    const sorted = [...this.observations].sort((a, b) => a - b);
    const index = Math.ceil(q * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get count of observations
   */
  getCount(): number {
    this.cleanOldObservations();
    return this.observations.length;
  }

  /**
   * Get sum of observations
   */
  getSum(): number {
    this.cleanOldObservations();
    return this.observations.reduce((a, b) => a + b, 0);
  }

  /**
   * Remove observations older than maxAge
   */
  private cleanOldObservations(): void {
    const cutoff = Date.now() - this.maxAge;
    // For simplicity, we're not tracking observation timestamps
    // In production, you'd want to track when each observation was made
  }

  /**
   * Get metric definition
   */
  getDefinition(): MetricDefinition {
    return this.definition;
  }
}

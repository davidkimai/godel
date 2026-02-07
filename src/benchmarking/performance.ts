/**
 * Performance Benchmarking Suite
 * 
 * Godel Phase 7: Production Hardening
 * 
 * Provides comprehensive performance benchmarking for:
 * - Agent creation and management
 * - Task execution throughput
 * - Memory and CPU efficiency
 * - End-to-end latency
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface BenchmarkConfig {
  /** Benchmark name */
  name: string;
  /** Number of iterations */
  iterations: number;
  /** Warmup iterations (not counted) */
  warmupIterations?: number;
  /** Maximum duration in seconds */
  maxDurationSeconds?: number;
  /** Minimum iterations before stopping */
  minIterations?: number;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  durationMs: number;
  opsPerSecond: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  memory: {
    startBytes: number;
    endBytes: number;
    peakBytes: number;
    deltaBytes: number;
  };
  samples: number[];
}

export type BenchmarkFunction = () => Promise<void> | void;

/**
 * Performance benchmark runner
 */
export class PerformanceBenchmark extends EventEmitter {
  private results: Map<string, BenchmarkResult> = new Map();

  /**
   * Run a benchmark
   */
  async benchmark(
    name: string,
    fn: BenchmarkFunction,
    config: Partial<BenchmarkConfig> = {}
  ): Promise<BenchmarkResult> {
    const opts: BenchmarkConfig = {
      name,
      iterations: 1000,
      warmupIterations: 100,
      maxDurationSeconds: 60,
      minIterations: 100,
      ...config,
    };

    this.emit('benchmark:start', { name, config: opts });

    // Warmup
    for (let i = 0; i < (opts.warmupIterations || 0); i++) {
      await fn();
    }

    // Collect memory baseline
    if (global.gc) global.gc();
    const startMemory = process.memoryUsage();

    // Run benchmark
    const samples: number[] = [];
    const startTime = performance.now();
    let peakMemory = startMemory.heapUsed;

    for (let i = 0; i < opts.iterations; i++) {
      const iterStart = performance.now();
      
      try {
        await fn();
      } catch (error) {
        this.emit('benchmark:error', { name, iteration: i, error });
        throw error;
      }

      const iterDuration = performance.now() - iterStart;
      samples.push(iterDuration);

      // Track memory
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > peakMemory) {
        peakMemory = currentMemory.heapUsed;
      }

      // Check max duration
      const elapsed = performance.now() - startTime;
      if (elapsed > (opts.maxDurationSeconds || 60) * 1000 && i >= (opts.minIterations || 100)) {
        break;
      }
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    // Calculate statistics
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    const result: BenchmarkResult = {
      name,
      iterations: samples.length,
      durationMs: endTime - startTime,
      opsPerSecond: (samples.length / (endTime - startTime)) * 1000,
      latency: {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        median: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99),
      },
      memory: {
        startBytes: startMemory.heapUsed,
        endBytes: endMemory.heapUsed,
        peakBytes: peakMemory,
        deltaBytes: endMemory.heapUsed - startMemory.heapUsed,
      },
      samples,
    };

    this.results.set(name, result);
    this.emit('benchmark:complete', result);

    return result;
  }

  /**
   * Run multiple benchmarks
   */
  async runSuite(
    benchmarks: Array<{ name: string; fn: BenchmarkFunction; config?: Partial<BenchmarkConfig> }>
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const { name, fn, config } of benchmarks) {
      const result = await this.benchmark(name, fn, config);
      results.push(result);
    }

    return results;
  }

  /**
   * Compare two benchmark results
   */
  compare(baseline: string, current: string): {
    name: string;
    baselineOps: number;
    currentOps: number;
    change: number;
    regression: boolean;
  } | null {
    const baselineResult = this.results.get(baseline);
    const currentResult = this.results.get(current);

    if (!baselineResult || !currentResult) {
      return null;
    }

    const change = ((currentResult.opsPerSecond - baselineResult.opsPerSecond) / baselineResult.opsPerSecond) * 100;

    return {
      name: baselineResult.name,
      baselineOps: baselineResult.opsPerSecond,
      currentOps: currentResult.opsPerSecond,
      change,
      regression: change < -5, // More than 5% regression
    };
  }

  /**
   * Generate benchmark report
   */
  generateReport(): string {
    const results = Array.from(this.results.values());
    
    let report = '# Performance Benchmark Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    for (const result of results) {
      report += `## ${result.name}\n\n`;
      report += `- **Iterations**: ${result.iterations.toLocaleString()}\n`;
      report += `- **Duration**: ${result.durationMs.toFixed(2)}ms\n`;
      report += `- **Ops/sec**: ${result.opsPerSecond.toFixed(2)}\n`;
      report += `- **Latency (mean)**: ${result.latency.mean.toFixed(3)}ms\n`;
      report += `- **Latency (p95)**: ${result.latency.p95.toFixed(3)}ms\n`;
      report += `- **Latency (p99)**: ${result.latency.p99.toFixed(3)}ms\n`;
      report += `- **Memory delta**: ${(result.memory.deltaBytes / 1024 / 1024).toFixed(2)} MB\n\n`;
    }

    return report;
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Agent creation benchmark
 */
export async function benchmarkAgentCreation(
  createAgent: () => Promise<void>,
  count: number = 1000
): Promise<BenchmarkResult> {
  const bench = new PerformanceBenchmark();
  
  return bench.benchmark('agent-creation', createAgent, {
    iterations: count,
    warmupIterations: 10,
  });
}

/**
 * Task execution benchmark
 */
export async function benchmarkTaskExecution(
  executeTask: () => Promise<void>,
  count: number = 1000
): Promise<BenchmarkResult> {
  const bench = new PerformanceBenchmark();
  
  return bench.benchmark('task-execution', executeTask, {
    iterations: count,
    warmupIterations: 50,
  });
}

/**
 * Memory allocation benchmark
 */
export async function benchmarkMemoryAllocation(
  allocate: () => Promise<void>,
  count: number = 1000
): Promise<BenchmarkResult> {
  const bench = new PerformanceBenchmark();
  
  // Force GC before benchmark if available
  if (global.gc) {
    global.gc();
  }
  
  return bench.benchmark('memory-allocation', allocate, {
    iterations: count,
    warmupIterations: 10,
  });
}

export default PerformanceBenchmark;

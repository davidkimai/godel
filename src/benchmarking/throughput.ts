/**
 * Throughput Benchmarking
 * 
 * Measures system throughput under various loads.
 */

import { EventEmitter } from 'events';

export interface ThroughputConfig {
  /** Test duration in seconds */
  duration: number;
  /** Concurrent operations */
  concurrency: number;
  /** Operation to benchmark */
  operation: () => Promise<void>;
  /** Ramp-up time in seconds */
  rampUpTime?: number;
}

export interface ThroughputResult {
  totalOperations: number;
  durationMs: number;
  operationsPerSecond: number;
  concurrentOperations: number;
  errors: number;
  errorRate: number;
  latencyMs: {
    min: number;
    max: number;
    mean: number;
    p95: number;
    p99: number;
  };
}

/**
 * Measure system throughput
 */
export async function measureThroughput(
  config: ThroughputConfig
): Promise<ThroughputResult> {
  const results: { success: boolean; latency: number }[] = [];
  const startTime = Date.now();
  const endTime = startTime + config.duration * 1000;

  // Ramp-up workers
  const workers: Promise<void>[] = [];
  const rampUpDelay = (config.rampUpTime || 0) * 1000 / config.concurrency;

  for (let i = 0; i < config.concurrency; i++) {
    await new Promise(resolve => setTimeout(resolve, rampUpDelay));
    
    workers.push((async () => {
      while (Date.now() < endTime) {
        const opStart = Date.now();
        try {
          await config.operation();
          results.push({ success: true, latency: Date.now() - opStart });
        } catch {
          results.push({ success: false, latency: Date.now() - opStart });
        }
      }
    })());
  }

  await Promise.all(workers);

  const actualDuration = Date.now() - startTime;
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const latencies = successful.map(r => r.latency).sort((a, b) => a - b);

  return {
    totalOperations: results.length,
    durationMs: actualDuration,
    operationsPerSecond: (results.length / actualDuration) * 1000,
    concurrentOperations: config.concurrency,
    errors: failed.length,
    errorRate: results.length > 0 ? (failed.length / results.length) * 100 : 0,
    latencyMs: {
      min: latencies[0] || 0,
      max: latencies[latencies.length - 1] || 0,
      mean: latencies.length > 0 
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
        : 0,
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
  };
}

/**
 * Find maximum sustainable throughput
 */
export async function findMaxThroughput(
  operation: () => Promise<void>,
  options?: {
    maxConcurrency?: number;
    targetLatency?: number;
    maxErrorRate?: number;
  }
): Promise<{ maxThroughput: number; optimalConcurrency: number }> {
  const maxConcurrency = options?.maxConcurrency || 100;
  const targetLatency = options?.targetLatency || 1000;
  const maxErrorRate = options?.maxErrorRate || 1;

  let bestThroughput = 0;
  let optimalConcurrency = 1;

  for (let concurrency = 1; concurrency <= maxConcurrency; concurrency *= 2) {
    const result = await measureThroughput({
      duration: 10,
      concurrency,
      operation,
      rampUpTime: 2,
    });

    console.log(`Concurrency ${concurrency}: ${result.operationsPerSecond.toFixed(1)} ops/s, ` +
      `${result.latencyMs.p95.toFixed(0)}ms p95, ${result.errorRate.toFixed(2)}% errors`);

    // Check if this is sustainable
    if (result.latencyMs.p95 > targetLatency || result.errorRate > maxErrorRate) {
      break;
    }

    if (result.operationsPerSecond > bestThroughput) {
      bestThroughput = result.operationsPerSecond;
      optimalConcurrency = concurrency;
    }
  }

  return { maxThroughput: bestThroughput, optimalConcurrency };
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

export default { measureThroughput, findMaxThroughput };

/**
 * Resource Usage Monitoring
 * 
 * Tracks CPU, memory, and I/O usage during benchmarks.
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface ResourceSnapshot {
  timestamp: number;
  cpu: {
    user: number;
    system: number;
    total: number;
  };
  memory: {
    used: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  eventLoop: {
    lag: number;
    utilization: number;
  };
}

export interface ResourceMetrics {
  durationMs: number;
  samples: ResourceSnapshot[];
  cpu: {
    avgPercent: number;
    maxPercent: number;
    userMs: number;
    systemMs: number;
  };
  memory: {
    startBytes: number;
    endBytes: number;
    peakBytes: number;
    avgBytes: number;
    leakedBytes: number;
  };
  eventLoop: {
    avgLagMs: number;
    maxLagMs: number;
    avgUtilization: number;
  };
}

export class ResourceMonitor extends EventEmitter {
  private snapshots: ResourceSnapshot[] = [];
  private interval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private startUsage: NodeJS.CpuUsage;

  /**
   * Start monitoring
   */
  start(sampleIntervalMs: number = 1000): void {
    this.startTime = performance.now();
    this.startUsage = process.cpuUsage();
    this.snapshots = [];

    this.interval = setInterval(() => {
      this.collectSnapshot();
    }, sampleIntervalMs);

    this.emit('monitor:start');
  }

  /**
   * Stop monitoring
   */
  stop(): ResourceMetrics {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Final snapshot
    this.collectSnapshot();

    const metrics = this.calculateMetrics();
    this.emit('monitor:stop', metrics);
    return metrics;
  }

  private collectSnapshot(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.startUsage);
    
    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      cpu: {
        user: cpuUsage.user / 1000, // Convert to ms
        system: cpuUsage.system / 1000,
        total: (cpuUsage.user + cpuUsage.system) / 1000,
      },
      memory: {
        used: memUsage.heapUsed + memUsage.external,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      eventLoop: {
        lag: 0, // Would need event-loop-lag package for accurate measurement
        utilization: 0,
      },
    };

    this.snapshots.push(snapshot);
    this.emit('snapshot', snapshot);
  }

  private calculateMetrics(): ResourceMetrics {
    if (this.snapshots.length === 0) {
      throw new Error('No snapshots collected');
    }

    const endTime = performance.now();
    const durationMs = endTime - this.startTime;

    // CPU metrics
    const lastCpu = this.snapshots[this.snapshots.length - 1].cpu;
    const cpuPercent = (lastCpu.total / durationMs) * 100;

    // Memory metrics
    const memValues = this.snapshots.map(s => s.memory.heapUsed);
    const avgMem = memValues.reduce((a, b) => a + b, 0) / memValues.length;

    return {
      durationMs,
      samples: this.snapshots,
      cpu: {
        avgPercent: cpuPercent,
        maxPercent: Math.max(...this.snapshots.map(s => 
          (s.cpu.total / durationMs) * 100
        )),
        userMs: lastCpu.user,
        systemMs: lastCpu.system,
      },
      memory: {
        startBytes: this.snapshots[0].memory.heapUsed,
        endBytes: this.snapshots[this.snapshots.length - 1].memory.heapUsed,
        peakBytes: Math.max(...memValues),
        avgBytes: avgMem,
        leakedBytes: this.snapshots[this.snapshots.length - 1].memory.heapUsed - 
                     this.snapshots[0].memory.heapUsed,
      },
      eventLoop: {
        avgLagMs: 0,
        maxLagMs: 0,
        avgUtilization: 0,
      },
    };
  }
}

/**
 * Profile resource usage during a function
 */
export async function profileResources<T>(
  fn: () => Promise<T>,
  sampleIntervalMs: number = 500
): Promise<{ result: T; metrics: ResourceMetrics }> {
  const monitor = new ResourceMonitor();
  
  monitor.start(sampleIntervalMs);
  const result = await fn();
  const metrics = monitor.stop();

  return { result, metrics };
}

/**
 * Check for memory leaks
 */
export async function detectMemoryLeak(
  operation: () => Promise<void>,
  iterations: number = 100
): Promise<{
  leaked: boolean;
  leakRateBytesPerIteration: number;
  recommendation: string;
}> {
  const measurements: number[] = [];

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  for (let i = 0; i < iterations; i++) {
    await operation();
    
    if (global.gc) {
      global.gc();
    }
    
    measurements.push(process.memoryUsage().heapUsed);
  }

  // Simple linear regression to detect trend
  const n = measurements.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = measurements.reduce((a, b) => a + b, 0);
  const sumXY = measurements.reduce((sum, y, x) => sum + x * y, 0);
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  const leaked = slope > 1024; // More than 1KB per iteration

  return {
    leaked,
    leakRateBytesPerIteration: slope,
    recommendation: leaked 
      ? `Memory leak detected: ${(slope / 1024).toFixed(2)} KB per iteration. Review operation for unclosed resources or growing caches.`
      : 'No significant memory leak detected.',
  };
}

export default { ResourceMonitor, profileResources, detectMemoryLeak };

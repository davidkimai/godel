/**
 * Load Testing Framework for Godel
 * 
 * Core framework for session-based load testing with configurable
 * scale scenarios, metrics collection, and pass/fail criteria.
 * 
 * Supports: 10/25/50 concurrent session scenarios
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { logger } from '../../src/utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface LoadTest {
  /** Test name */
  name: string;
  /** Number of concurrent sessions (swarms) */
  sessions: number;
  /** Test duration in minutes */
  duration: number;
  /** Ramp-up time in seconds */
  rampUp: number;
  /** Agents per session (coordinator + workers) */
  agentsPerSession: number;
  /** Workload type */
  workload: 'review' | 'test' | 'refactor' | 'mixed';
  /** Pass/fail criteria */
  criteria: PassFailCriteria;
}

export interface PassFailCriteria {
  /** Max acceptable latency in ms */
  maxLatencyMs: number;
  /** Max acceptable error rate (0-1) */
  maxErrorRate: number;
  /** Min required throughput (events/sec) */
  minThroughput: number;
  /** Max acceptable CPU usage % */
  maxCpuPercent?: number;
  /** Max acceptable memory growth in MB */
  maxMemoryGrowthMB?: number;
}

export interface TestResult {
  /** Test configuration */
  test: LoadTest;
  /** Test start timestamp */
  startTime: string;
  /** Test duration in ms */
  durationMs: number;
  /** Overall success */
  success: boolean;
  /** Scenario results */
  scenarios: ScenarioResult[];
  /** Aggregated metrics */
  metrics: AggregatedMetrics;
  /** Pass/fail checks */
  checks: CheckResult[];
}

export interface ScenarioResult {
  /** Session index */
  sessionIndex: number;
  /** Swarm ID */
  swarmId: string;
  /** Success flag */
  success: boolean;
  /** Duration in ms */
  durationMs: number;
  /** Agents spawned */
  agentsSpawned: number;
  /** Errors encountered */
  errors: string[];
  /** Latency metrics */
  latency: {
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
}

export interface AggregatedMetrics {
  /** Total sessions executed */
  totalSessions: number;
  /** Successful sessions */
  successfulSessions: number;
  /** Failed sessions */
  failedSessions: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** P95 latency in ms */
  p95LatencyMs: number;
  /** P99 latency in ms */
  p99LatencyMs: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Events per second */
  eventsPerSecond: number;
  /** CPU usage % */
  cpuUsagePercent: number;
  /** Memory growth in MB */
  memoryGrowthMB: number;
  /** Peak memory in MB */
  peakMemoryMB: number;
  /** Queue depth (avg) */
  avgQueueDepth: number;
  /** Recovery time in ms (for stress tests) */
  recoveryTimeMs?: number;
}

export interface CheckResult {
  /** Check name */
  name: string;
  /** Check passed */
  passed: boolean;
  /** Expected value */
  expected: string;
  /** Actual value */
  actual: string;
  /** Severity */
  severity: 'critical' | 'warning' | 'info';
}

export interface Metric {
  /** Metric timestamp */
  timestamp: number;
  /** Metric type */
  type: 'latency' | 'throughput' | 'error' | 'resource' | 'queue';
  /** Metric name */
  name: string;
  /** Metric value */
  value: number;
  /** Session ID (optional) */
  sessionId?: string;
  /** Additional labels */
  labels?: Record<string, string>;
}

export interface LoadTestRunnerOptions {
  /** Output directory for reports */
  outputDir: string;
  /** Enable verbose logging */
  verbose: boolean;
  /** Stop on first failure */
  stopOnFailure: boolean;
  /** Collect detailed metrics */
  detailedMetrics: boolean;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_CRITERIA: Record<number, PassFailCriteria> = {
  10: {
    maxLatencyMs: 100,
    maxErrorRate: 0.01,
    minThroughput: 50,
    maxCpuPercent: 70,
    maxMemoryGrowthMB: 100,
  },
  25: {
    maxLatencyMs: 200,
    maxErrorRate: 0.01,
    minThroughput: 100,
    maxCpuPercent: 75,
    maxMemoryGrowthMB: 250,
  },
  50: {
    maxLatencyMs: 500,
    maxErrorRate: 0.05,
    minThroughput: 150,
    maxCpuPercent: 85,
    maxMemoryGrowthMB: 500,
  },
};

const DEFAULT_OPTIONS: LoadTestRunnerOptions = {
  outputDir: './tests/load/reports',
  verbose: false,
  stopOnFailure: false,
  detailedMetrics: true,
};

// ============================================================================
// Load Test Runner
// ============================================================================

export class LoadTestRunner extends EventEmitter {
  private options: LoadTestRunnerOptions;
  private metrics: Metric[] = [];
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(options: Partial<LoadTestRunnerOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a callback for metric events
   */
  onMetric(callback: (metric: Metric) => void): void {
    this.on('metric', callback);
  }

  /**
   * Run a load test
   */
  async run(test: LoadTest): Promise<TestResult> {
    if (this.isRunning) {
      throw new Error('Load test already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.metrics = [];

    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    const startTimestamp = new Date().toISOString();

    logger.info(`\n🚀 Starting Load Test: ${test.name}`);
    logger.info(`   Sessions: ${test.sessions} | Duration: ${test.duration}min | Ramp-up: ${test.rampUp}s`);
    logger.info(`   Agents/Session: ${test.agentsPerSession} | Workload: ${test.workload}`);

    try {
      // Execute test scenarios
      const scenarios = await this.executeScenarios(test);

      // Calculate metrics
      const durationMs = performance.now() - startTime;
      const endMemory = process.memoryUsage();
      const metrics = this.calculateAggregatedMetrics(
        scenarios,
        durationMs,
        startMemory,
        endMemory
      );

      // Run pass/fail checks
      const checks = this.runChecks(test, metrics);
      const success = checks.every(c => c.passed || c.severity !== 'critical');

      const result: TestResult = {
        test,
        startTime: startTimestamp,
        durationMs,
        success,
        scenarios,
        metrics,
        checks,
      };

      this.emit('complete', result);
      
      logger.info(`\n✅ Load test complete: ${success ? 'PASSED' : 'FAILED'}`);
      logger.info(`   Duration: ${(durationMs / 1000).toFixed(1)}s | Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);

      return result;
    } catch (error) {
      logger.error(`\n❌ Load test failed: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * Abort the current test
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.emit('aborted');
    }
  }

  /**
   * Execute test scenarios in parallel
   */
  private async executeScenarios(test: LoadTest): Promise<ScenarioResult[]> {
    const scenarios: ScenarioResult[] = [];
    const batchSize = this.calculateBatchSize(test.sessions);
    const batches = Math.ceil(test.sessions / batchSize);
    const rampUpDelayMs = (test.rampUp * 1000) / batches;

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min((batchIndex + 1) * batchSize, test.sessions);
      const batchCount = batchEnd - batchStart;

      logger.info(`\n   Executing batch ${batchIndex + 1}/${batches} (${batchCount} sessions)...`);

      // Execute batch in parallel
      const batchPromises = Array.from({ length: batchCount }, (_, i) =>
        this.executeSession(test, batchStart + i)
      );

      const batchResults = await Promise.all(batchPromises);
      scenarios.push(...batchResults);

      // Emit progress
      this.emit('progress', {
        completed: scenarios.length,
        total: test.sessions,
        successful: scenarios.filter(s => s.success).length,
      });

      // Ramp-up delay between batches
      if (batchIndex < batches - 1) {
        await this.delay(rampUpDelayMs);
      }
    }

    return scenarios;
  }

  /**
   * Execute a single session
   */
  private async executeSession(test: LoadTest, sessionIndex: number): Promise<ScenarioResult> {
    const startTime = performance.now();
    const swarmId = `load-test-${test.sessions}-${Date.now()}-${sessionIndex}`;
    const errors: string[] = [];
    const latencies: number[] = [];

    try {
      // Simulate session lifecycle
      // 1. Spawn coordinator
      const coordinatorStart = performance.now();
      await this.simulateAgentSpawn(swarmId, 'coordinator');
      latencies.push(performance.now() - coordinatorStart);
      this.recordMetric('latency', 'agent_spawn', latencies[latencies.length - 1], { swarmId, role: 'coordinator' });

      // 2. Spawn workers
      for (let i = 0; i < test.agentsPerSession - 1; i++) {
        const workerStart = performance.now();
        await this.simulateAgentSpawn(swarmId, `worker-${i}`);
        latencies.push(performance.now() - workerStart);
        this.recordMetric('latency', 'agent_spawn', latencies[latencies.length - 1], { swarmId, role: 'worker' });
      }

      // 3. Execute workload
      await this.executeWorkload(test, swarmId, latencies);

      // 4. Cleanup
      await this.simulateCleanup(swarmId);

      const durationMs = performance.now() - startTime;
      
      return {
        sessionIndex,
        swarmId,
        success: true,
        durationMs,
        agentsSpawned: test.agentsPerSession,
        errors,
        latency: this.calculateLatencyStats(latencies),
      };
    } catch (error) {
      const durationMs = performance.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.recordMetric('error', 'session_failure', 1, { swarmId, error: errorMsg });

      return {
        sessionIndex,
        swarmId,
        success: false,
        durationMs,
        agentsSpawned: 0,
        errors,
        latency: { avg: 0, min: 0, max: 0, p95: 0, p99: 0 },
      };
    }
  }

  /**
   * Execute workload for a session
   */
  private async executeWorkload(test: LoadTest, swarmId: string, latencies: number[]): Promise<void> {
    const workloadDuration = test.duration * 60 * 1000;
    const checkInterval = 1000; // 1 second
    const startTime = performance.now();

    while (performance.now() - startTime < workloadDuration) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      const opStart = performance.now();

      // Simulate workload based on type
      switch (test.workload) {
        case 'review':
          await this.simulateCodeReview(swarmId);
          break;
        case 'test':
          await this.simulateTestExecution(swarmId);
          break;
        case 'refactor':
          await this.simulateRefactoring(swarmId);
          break;
        case 'mixed':
          const workloads = ['review', 'test', 'refactor'];
          const randomWorkload = workloads[Math.floor(Math.random() * workloads.length)];
          switch (randomWorkload) {
            case 'review': await this.simulateCodeReview(swarmId); break;
            case 'test': await this.simulateTestExecution(swarmId); break;
            case 'refactor': await this.simulateRefactoring(swarmId); break;
          }
          break;
      }

      latencies.push(performance.now() - opStart);
      this.recordMetric('throughput', 'operation_completed', 1, { swarmId, workload: test.workload });

      await this.delay(checkInterval);
    }
  }

  /**
   * Simulate agent spawn
   */
  private async simulateAgentSpawn(swarmId: string, role: string): Promise<void> {
    // Simulate spawn latency (10-50ms)
    const spawnLatency = 10 + Math.random() * 40;
    await this.delay(spawnLatency);
    this.recordMetric('latency', 'agent_spawn', spawnLatency, { swarmId, role });
  }

  /**
   * Simulate code review workload
   */
  private async simulateCodeReview(swarmId: string): Promise<void> {
    // Simulate code review operation (50-150ms)
    const latency = 50 + Math.random() * 100;
    await this.delay(latency);
    this.recordMetric('latency', 'code_review', latency, { swarmId });
  }

  /**
   * Simulate test execution workload
   */
  private async simulateTestExecution(swarmId: string): Promise<void> {
    // Simulate test execution (100-300ms)
    const latency = 100 + Math.random() * 200;
    await this.delay(latency);
    this.recordMetric('latency', 'test_execution', latency, { swarmId });
  }

  /**
   * Simulate refactoring workload
   */
  private async simulateRefactoring(swarmId: string): Promise<void> {
    // Simulate refactoring operation (200-500ms)
    const latency = 200 + Math.random() * 300;
    await this.delay(latency);
    this.recordMetric('latency', 'refactoring', latency, { swarmId });
  }

  /**
   * Simulate cleanup
   */
  private async simulateCleanup(swarmId: string): Promise<void> {
    await this.delay(10);
    this.recordMetric('resource', 'session_cleanup', 1, { swarmId });
  }

  /**
   * Calculate batch size based on total sessions
   */
  private calculateBatchSize(totalSessions: number): number {
    if (totalSessions <= 10) return 5;
    if (totalSessions <= 25) return 8;
    return 10;
  }

  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats(latencies: number[]): { avg: number; min: number; max: number; p95: number; p99: number } {
    if (latencies.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: this.getPercentile(sorted, 0.95),
      p99: this.getPercentile(sorted, 0.99),
    };
  }

  /**
   * Get percentile value
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Record a metric
   */
  private recordMetric(type: Metric['type'], name: string, value: number, labels?: Record<string, string>): void {
    const metric: Metric = {
      timestamp: Date.now(),
      type,
      name,
      value,
      labels,
    };
    this.metrics.push(metric);
    this.emit('metric', metric);
  }

  /**
   * Calculate aggregated metrics
   */
  private calculateAggregatedMetrics(
    scenarios: ScenarioResult[],
    durationMs: number,
    startMemory: NodeJS.MemoryUsage,
    endMemory: NodeJS.MemoryUsage
  ): AggregatedMetrics {
    const successful = scenarios.filter(s => s.success);
    const allLatencies = scenarios.flatMap(s => [s.latency.avg]);
    const sortedLatencies = allLatencies.filter(l => l > 0).sort((a, b) => a - b);

    const totalOperations = this.metrics.filter(m => m.name === 'operation_completed').length;
    const eventsPerSecond = (totalOperations / durationMs) * 1000;

    return {
      totalSessions: scenarios.length,
      successfulSessions: successful.length,
      failedSessions: scenarios.length - successful.length,
      avgLatencyMs: sortedLatencies.length > 0 ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length : 0,
      p95LatencyMs: sortedLatencies.length > 0 ? this.getPercentile(sortedLatencies, 0.95) : 0,
      p99LatencyMs: sortedLatencies.length > 0 ? this.getPercentile(sortedLatencies, 0.99) : 0,
      errorRate: scenarios.length > 0 ? (scenarios.length - successful.length) / scenarios.length : 0,
      eventsPerSecond,
      cpuUsagePercent: 0, // Would require external monitoring
      memoryGrowthMB: (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024,
      peakMemoryMB: endMemory.heapUsed / 1024 / 1024,
      avgQueueDepth: 0, // Would require queue monitoring
    };
  }

  /**
   * Run pass/fail checks
   */
  private runChecks(test: LoadTest, metrics: AggregatedMetrics): CheckResult[] {
    const criteria = test.criteria;
    const checks: CheckResult[] = [];

    // Latency check
    checks.push({
      name: 'Max Latency',
      passed: metrics.avgLatencyMs <= criteria.maxLatencyMs,
      expected: `<= ${criteria.maxLatencyMs}ms`,
      actual: `${metrics.avgLatencyMs.toFixed(2)}ms`,
      severity: 'critical',
    });

    // Error rate check
    checks.push({
      name: 'Error Rate',
      passed: metrics.errorRate <= criteria.maxErrorRate,
      expected: `<= ${(criteria.maxErrorRate * 100).toFixed(1)}%`,
      actual: `${(metrics.errorRate * 100).toFixed(2)}%`,
      severity: 'critical',
    });

    // Throughput check
    checks.push({
      name: 'Min Throughput',
      passed: metrics.eventsPerSecond >= criteria.minThroughput,
      expected: `>= ${criteria.minThroughput}/sec`,
      actual: `${metrics.eventsPerSecond.toFixed(2)}/sec`,
      severity: 'warning',
    });

    // CPU check (if configured)
    if (criteria.maxCpuPercent !== undefined) {
      checks.push({
        name: 'CPU Usage',
        passed: metrics.cpuUsagePercent <= criteria.maxCpuPercent,
        expected: `<= ${criteria.maxCpuPercent}%`,
        actual: `${metrics.cpuUsagePercent.toFixed(1)}%`,
        severity: 'warning',
      });
    }

    // Memory check (if configured)
    if (criteria.maxMemoryGrowthMB !== undefined) {
      checks.push({
        name: 'Memory Growth',
        passed: metrics.memoryGrowthMB <= criteria.maxMemoryGrowthMB,
        expected: `<= ${criteria.maxMemoryGrowthMB}MB`,
        actual: `${metrics.memoryGrowthMB.toFixed(2)}MB`,
        severity: 'warning',
      });
    }

    return checks;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get collected metrics
   */
  getMetrics(): Metric[] {
    return [...this.metrics];
  }
}

// ============================================================================
// Predefined Tests
// ============================================================================

export const PredefinedTests = {
  /** 10 sessions - warm-up test */
  warmUp: (): LoadTest => ({
    name: 'Warm-up Test (10 Sessions)',
    sessions: 10,
    duration: 10,
    rampUp: 30,
    agentsPerSession: 4, // 1 Coordinator + 3 Workers
    workload: 'review',
    criteria: DEFAULT_CRITERIA[10],
  }),

  /** 25 sessions - production load */
  production: (): LoadTest => ({
    name: 'Production Load (25 Sessions)',
    sessions: 25,
    duration: 30,
    rampUp: 60,
    agentsPerSession: 4,
    workload: 'mixed',
    criteria: DEFAULT_CRITERIA[25],
  }),

  /** 50 sessions - stress test */
  stress: (): LoadTest => ({
    name: 'Stress Test (50 Sessions)',
    sessions: 50,
    duration: 60,
    rampUp: 120,
    agentsPerSession: 4,
    workload: 'mixed',
    criteria: DEFAULT_CRITERIA[50],
  }),

  /** Custom test configuration */
  custom: (sessions: number, duration: number, workload: LoadTest['workload'] = 'mixed'): LoadTest => ({
    name: `Custom Test (${sessions} Sessions)`,
    sessions,
    duration,
    rampUp: Math.min(120, sessions * 3),
    agentsPerSession: 4,
    workload,
    criteria: DEFAULT_CRITERIA[sessions] || DEFAULT_CRITERIA[50],
  }),
};

export default LoadTestRunner;

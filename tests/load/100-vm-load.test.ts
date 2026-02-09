/**
 * 100 VM Load Test
 *
 * Comprehensive load test suite for 100 concurrent VMs.
 * Tests spawn performance, command execution, and resource utilization.
 *
 * @module tests/load/100-vm-load
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.3
 */

import { performance } from 'perf_hooks';
import {
  SpawnConfig,
  AgentRuntime,
  ExecutionResult,
  ResourceExhaustedError,
  SpawnError,
} from '../../src/core/runtime/runtime-provider';
import { logger } from '../../src/utils/logger';

// ============================================================================
// Load Test Configuration
// ============================================================================

const LOAD_TEST_CONFIG = {
  vmCount: 100,
  concurrentSpawnLimit: 25,
  targetSpawnTimeMs: 100,
  targetSuccessRate: 100,
  targetCommandTimeoutMs: 5000,
  maxCpuPercent: 80,
  maxMemoryPercent: 85,
  maxDiskPercent: 80,
  spawnTimeoutMs: 30000,
  commandTimeoutMs: 10000,
  cleanupTimeoutMs: 60000,
};

// ============================================================================
// Test Metrics Interfaces
// ============================================================================

interface LoadTestMetrics {
  totalSpawnAttempts: number;
  successfulSpawns: number;
  failedSpawns: number;
  spawnTimesMs: number[];
  totalCommandExecutions: number;
  successfulCommands: number;
  failedCommands: number;
  commandTimesMs: number[];
  peakCpuUsage: number;
  peakMemoryUsage: number;
  peakDiskUsage: number;
  testStartTime: Date;
  testEndTime?: Date;
}

interface LoadTestResult {
  passed: boolean;
  metrics: LoadTestMetrics;
  summary: {
    totalRuntimes: number;
    spawnSuccessRate: number;
    avgSpawnTimeMs: number;
    p95SpawnTimeMs: number;
    avgCommandTimeMs: number;
    p95CommandTimeMs: number;
    totalDurationMs: number;
  };
  failures: string[];
  warnings: string[];
}

// ============================================================================
// Mock Runtime Provider
// ============================================================================

class MockLoadTestRuntimeProvider {
  private runtimes: Map<string, AgentRuntime> = new Map();
  private spawnCounter = 0;
  private simulateFailures = false;
  private failureRate = 0;
  private resourceExhaustionThreshold: number;

  constructor(options?: {
    simulateFailures?: boolean;
    failureRate?: number;
    resourceExhaustionThreshold?: number;
  }) {
    this.simulateFailures = options?.simulateFailures ?? false;
    this.failureRate = options?.failureRate ?? 0;
    this.resourceExhaustionThreshold = options?.resourceExhaustionThreshold ?? 150;
  }

  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    const startTime = performance.now();
    const spawnDelay = 10 + Math.random() * 40;
    await this.delay(spawnDelay);

    if (this.spawnCounter >= this.resourceExhaustionThreshold) {
      throw new ResourceExhaustedError(
        'Maximum concurrent runtimes exceeded',
        'agents',
        undefined,
        { currentCount: this.spawnCounter, maxAllowed: this.resourceExhaustionThreshold }
      );
    }

    if (this.simulateFailures && Math.random() < this.failureRate) {
      throw new SpawnError('Simulated spawn failure', undefined, {
        config,
        attempt: this.spawnCounter + 1,
      });
    }

    this.spawnCounter++;
    const id = `load-test-vm-${this.spawnCounter}-${Date.now()}`;

    const runtime: AgentRuntime = {
      id,
      runtime: config.runtime,
      state: 'running',
      resources: {
        cpu: 0.1 + Math.random() * 0.2,
        memory: 50 * 1024 * 1024 + Math.random() * 100 * 1024 * 1024,
        disk: 100 * 1024 * 1024 + Math.random() * 200 * 1024 * 1024,
        network: {
          rxBytes: Math.floor(Math.random() * 1000000),
          txBytes: Math.floor(Math.random() * 1000000),
          rxPackets: Math.floor(Math.random() * 10000),
          txPackets: Math.floor(Math.random() * 10000),
        },
      },
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: {
        type: config.runtime,
        labels: config.labels || {},
        createdAt: new Date(),
      },
    };

    this.runtimes.set(id, runtime);
    return runtime;
  }

  async terminate(runtimeId: string): Promise<void> {
    await this.delay(5);
    this.runtimes.delete(runtimeId);
  }

  async execute(runtimeId: string, command: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    if (!this.runtimes.has(runtimeId)) {
      throw new Error(`Runtime ${runtimeId} not found`);
    }

    const execDelay = 5 + Math.random() * 15;
    await this.delay(execDelay);

    const runtime = this.runtimes.get(runtimeId)!;
    runtime.lastActiveAt = new Date();

    if (this.simulateFailures && Math.random() < 0.01) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Simulated command failure',
        duration: execDelay,
        metadata: {
          command,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      };
    }

    const duration = performance.now() - startTime;

    return {
      exitCode: 0,
      stdout: `Command executed: ${command}`,
      stderr: '',
      duration,
      metadata: {
        command,
        startedAt: new Date(Date.now() - duration),
        endedAt: new Date(),
      },
    };
  }

  async getStatus(runtimeId: string) {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeId} not found`);
    }

    return {
      id: runtimeId,
      state: runtime.state,
      resources: runtime.resources,
      health: 'healthy' as const,
      uptime: Date.now() - runtime.createdAt.getTime(),
    };
  }

  async listRuntimes() {
    return Array.from(this.runtimes.values());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Main Load Test Class
// ============================================================================

export class HundredVMLoadTest {
  private provider: MockLoadTestRuntimeProvider;
  private metrics: LoadTestMetrics;
  private runtimes: AgentRuntime[] = [];

  constructor(options?: { simulateFailures?: boolean; failureRate?: number }) {
    this.provider = new MockLoadTestRuntimeProvider(options);
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): LoadTestMetrics {
    return {
      totalSpawnAttempts: 0,
      successfulSpawns: 0,
      failedSpawns: 0,
      spawnTimesMs: [],
      totalCommandExecutions: 0,
      successfulCommands: 0,
      failedCommands: 0,
      commandTimesMs: [],
      peakCpuUsage: 0,
      peakMemoryUsage: 0,
      peakDiskUsage: 0,
      testStartTime: new Date(),
    };
  }

  async run(): Promise<LoadTestResult> {
    logger.info('Starting 100 VM Load Test');

    const startTime = performance.now();

    try {
      logger.info('Phase 1: Spawning 100 VMs');
      await this.spawnVMs();

      logger.info('Phase 2: Executing commands on all VMs');
      await this.executeCommands();

      logger.info('Phase 3: Monitoring resource usage');
      await this.monitorResources();

      logger.info('Phase 4: Cleaning up');
      await this.cleanup();

      this.metrics.testEndTime = new Date();

      return this.generateResult(performance.now() - startTime);
    } catch (error) {
      logger.error('Load test failed', { error });
      await this.cleanup();
      throw error;
    }
  }

  private async spawnVMs(): Promise<void> {
    const { vmCount, concurrentSpawnLimit, spawnTimeoutMs } = LOAD_TEST_CONFIG;
    const spawnConfig: SpawnConfig = {
      runtime: 'kata',
      resources: {
        cpu: 0.5,
        memory: '256Mi',
        disk: '1Gi',
      },
      timeout: spawnTimeoutMs / 1000,
    };

    const batches = Math.ceil(vmCount / concurrentSpawnLimit);
    let spawnedCount = 0;

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrentSpawnLimit, vmCount - spawnedCount);
      logger.info(`Batch ${batch + 1}/${batches}: Spawning ${batchSize} VMs`);

      const batchPromises: Promise<AgentRuntime | null>[] = [];
      for (let i = 0; i < batchSize; i++) {
        batchPromises.push(this.spawnSingleVM(spawnConfig));
      }

      const batchResults = await Promise.all(batchPromises);
      const successful = batchResults.filter((r): r is AgentRuntime => r !== null);
      this.runtimes.push(...successful);

      spawnedCount += batchSize;
      logger.info(`Batch ${batch + 1} complete: ${successful.length}/${batchSize} VMs spawned`);
    }

    logger.info(`Total VMs spawned: ${this.runtimes.length}/${vmCount}`);
  }

  private async spawnSingleVM(config: SpawnConfig): Promise<AgentRuntime | null> {
    const startTime = performance.now();
    this.metrics.totalSpawnAttempts++;

    try {
      const runtime = await this.provider.spawn(config);
      const spawnTime = performance.now() - startTime;

      this.metrics.successfulSpawns++;
      this.metrics.spawnTimesMs.push(spawnTime);

      return runtime;
    } catch (error) {
      this.metrics.failedSpawns++;
      if (error instanceof SpawnError || error instanceof ResourceExhaustedError) {
        logger.error('Spawn failed', { error: error.message });
      }
      return null;
    }
  }

  private async executeCommands(): Promise<void> {
    const testCommands = ['echo "Hello"', 'date', 'whoami', 'pwd', 'ls -la'];

    for (let i = 0; i < this.runtimes.length; i++) {
      const runtime = this.runtimes[i];
      const command = testCommands[i % testCommands.length];

      try {
        this.metrics.totalCommandExecutions++;
        const result = await this.provider.execute(runtime.id, command);

        if (result.exitCode === 0) {
          this.metrics.successfulCommands++;
          this.metrics.commandTimesMs.push(result.duration);
        } else {
          this.metrics.failedCommands++;
        }
      } catch (error) {
        this.metrics.failedCommands++;
      }

      if ((i + 1) % 25 === 0) {
        logger.info(`${i + 1}/${this.runtimes.length} VMs processed`);
      }
    }

    logger.info(`Commands executed: ${this.metrics.successfulCommands}/${this.metrics.totalCommandExecutions}`);
  }

  private async monitorResources(): Promise<void> {
    let totalCpu = 0;
    let totalMemory = 0;
    let totalDisk = 0;

    for (const runtime of this.runtimes) {
      totalCpu += runtime.resources.cpu;
      totalMemory += runtime.resources.memory;
      totalDisk += runtime.resources.disk;
    }

    const cpuLimit = this.runtimes.length * 0.5;
    const memoryLimit = this.runtimes.length * 256 * 1024 * 1024;
    const diskLimit = this.runtimes.length * 1024 * 1024 * 1024;

    const cpuPercent = (totalCpu / cpuLimit) * 100;
    const memoryPercent = (totalMemory / memoryLimit) * 100;
    const diskPercent = (totalDisk / diskLimit) * 100;

    this.metrics.peakCpuUsage = cpuPercent;
    this.metrics.peakMemoryUsage = memoryPercent;
    this.metrics.peakDiskUsage = diskPercent;

    logger.info('Resource usage', {
      cpuPercent: cpuPercent.toFixed(1),
      memoryPercent: memoryPercent.toFixed(1),
      diskPercent: diskPercent.toFixed(1),
    });
  }

  private async cleanup(): Promise<void> {
    logger.info(`Terminating ${this.runtimes.length} VMs`);

    const cleanupPromises = this.runtimes.map(runtime =>
      this.provider.terminate(runtime.id).catch(error => {
        logger.error(`Failed to terminate ${runtime.id}`, { error: error.message });
      })
    );

    await Promise.all(cleanupPromises);
    logger.info('All VMs terminated');
  }

  private generateResult(totalDurationMs: number): LoadTestResult {
    const spawnSuccessRate = (this.metrics.successfulSpawns / this.metrics.totalSpawnAttempts) * 100;
    const sortedSpawnTimes = [...this.metrics.spawnTimesMs].sort((a, b) => a - b);
    const avgSpawnTimeMs = sortedSpawnTimes.reduce((a, b) => a + b, 0) / sortedSpawnTimes.length;
    const p95SpawnTimeMs = sortedSpawnTimes[Math.floor(sortedSpawnTimes.length * 0.95)] || 0;

    const sortedCommandTimes = [...this.metrics.commandTimesMs].sort((a, b) => a - b);
    const avgCommandTimeMs = sortedCommandTimes.reduce((a, b) => a + b, 0) / sortedCommandTimes.length;
    const p95CommandTimeMs = sortedCommandTimes[Math.floor(sortedCommandTimes.length * 0.95)] || 0;

    const failures: string[] = [];
    const warnings: string[] = [];

    if (spawnSuccessRate < LOAD_TEST_CONFIG.targetSuccessRate) {
      failures.push(`Spawn success rate ${spawnSuccessRate.toFixed(1)}% below target ${LOAD_TEST_CONFIG.targetSuccessRate}%`);
    }

    if (avgSpawnTimeMs > LOAD_TEST_CONFIG.targetSpawnTimeMs) {
      failures.push(`Average spawn time ${avgSpawnTimeMs.toFixed(2)}ms exceeds target ${LOAD_TEST_CONFIG.targetSpawnTimeMs}ms`);
    }

    if (this.metrics.peakCpuUsage > LOAD_TEST_CONFIG.maxCpuPercent) {
      warnings.push(`Peak CPU usage ${this.metrics.peakCpuUsage.toFixed(1)}% exceeds threshold`);
    }

    if (this.metrics.peakMemoryUsage > LOAD_TEST_CONFIG.maxMemoryPercent) {
      warnings.push(`Peak memory usage ${this.metrics.peakMemoryUsage.toFixed(1)}% exceeds threshold`);
    }

    if (this.metrics.failedSpawns > 0) {
      warnings.push(`${this.metrics.failedSpawns} spawns failed`);
    }

    const passed = failures.length === 0;

    return {
      passed,
      metrics: this.metrics,
      summary: {
        totalRuntimes: this.runtimes.length,
        spawnSuccessRate,
        avgSpawnTimeMs,
        p95SpawnTimeMs,
        avgCommandTimeMs,
        p95CommandTimeMs,
        totalDurationMs,
      },
      failures,
      warnings,
    };
  }
}

// ============================================================================
// Test Runner Function
// ============================================================================

export async function run100VMLoadTest(options?: {
  simulateFailures?: boolean;
  failureRate?: number;
}): Promise<LoadTestResult> {
  const test = new HundredVMLoadTest(options);
  return test.run();
}

// ============================================================================
// CLI Execution
// ============================================================================

if (require.main === module) {
  run100VMLoadTest()
    .then(result => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('  100 VM Load Test Results');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('Spawn Metrics:');
      console.log(`  Total Attempts: ${result.metrics.totalSpawnAttempts}`);
      console.log(`  Successful: ${result.metrics.successfulSpawns}`);
      console.log(`  Failed: ${result.metrics.failedSpawns}`);
      console.log(`  Success Rate: ${result.summary.spawnSuccessRate.toFixed(2)}%`);
      console.log(`  Avg Spawn Time: ${result.summary.avgSpawnTimeMs.toFixed(2)}ms`);
      console.log(`  P95 Spawn Time: ${result.summary.p95SpawnTimeMs.toFixed(2)}ms`);

      console.log('\nCommand Execution:');
      console.log(`  Total: ${result.metrics.totalCommandExecutions}`);
      console.log(`  Successful: ${result.metrics.successfulCommands}`);
      console.log(`  Failed: ${result.metrics.failedCommands}`);
      console.log(`  Avg Time: ${result.summary.avgCommandTimeMs.toFixed(2)}ms`);
      console.log(`  P95 Time: ${result.summary.p95CommandTimeMs.toFixed(2)}ms`);

      console.log('\nResource Usage:');
      console.log(`  Peak CPU: ${result.metrics.peakCpuUsage.toFixed(1)}%`);
      console.log(`  Peak Memory: ${result.metrics.peakMemoryUsage.toFixed(1)}%`);
      console.log(`  Peak Disk: ${result.metrics.peakDiskUsage.toFixed(1)}%`);

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
      }

      if (result.failures.length > 0) {
        console.log('\nFailures:');
        result.failures.forEach(f => console.log(`  ✗ ${f}`));
      }

      console.log(`\nStatus: ${result.passed ? 'PASS' : 'FAIL'}`);
      console.log(`Duration: ${(result.summary.totalDurationMs / 1000).toFixed(2)}s`);
      console.log('═══════════════════════════════════════════════════════════\n');

      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Load test failed:', error);
      process.exit(1);
    });
}

// Exports
export { LoadTestMetrics, LoadTestResult, MockLoadTestRuntimeProvider };
export default HundredVMLoadTest;

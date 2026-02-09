/**
 * VM Spawn Optimizer Benchmarks
 * 
 * Validates performance targets:
 * - Spawn time: <100ms P95
 * - Cold start: <200ms
 * - Pool hit rate: >80%
 */

import { VMSpawnOptimizer, SpawnRequest, VMSpec, PoolConfig } from '../../../src/core/runtime/kata/spawn-optimizer';

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgTimeMs: number;
  p50TimeMs: number;
  p95TimeMs: number;
  p99TimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  successRate: number;
  poolHitRate: number;
  passed: boolean;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallPassRate: number;
  };
}

// Performance targets
const TARGETS = {
  spawnTimeP95: 100,  // <100ms P95
  coldStartMax: 200,  // <200ms cold start
  poolHitRate: 80,    // >80% pool hit rate
  bootTimeAvg: 50,    // <50ms avg boot time with cache
};

/**
 * Run comprehensive spawn optimizer benchmarks
 */
export async function runSpawnBenchmarks(): Promise<BenchmarkSuite> {
  console.log('=== VM Spawn Optimizer Benchmarks ===\n');
  
  const results: BenchmarkResult[] = [];
  
  // Test 1: Warm spawn from pool
  results.push(await benchmarkWarmSpawn());
  
  // Test 2: Fast boot with image cache
  results.push(await benchmarkFastBoot());
  
  // Test 3: Cold start
  results.push(await benchmarkColdStart());
  
  // Test 4: Sustained load
  results.push(await benchmarkSustainedLoad());
  
  // Test 5: Burst load
  results.push(await benchmarkBurstLoad());
  
  // Test 6: Pool hit rate
  results.push(await benchmarkPoolHitRate());
  
  // Test 7: Predictive scaling
  results.push(await benchmarkPredictiveScaling());
  
  // Summary
  const passedTests = results.filter(r => r.passed).length;
  const suite: BenchmarkSuite = {
    name: 'VM Spawn Optimizer Performance Suite',
    results,
    summary: {
      totalTests: results.length,
      passedTests,
      failedTests: results.length - passedTests,
      overallPassRate: (passedTests / results.length) * 100,
    },
  };
  
  printSummary(suite);
  return suite;
}

/**
 * Benchmark warm spawns from pool (should be <50ms)
 */
async function benchmarkWarmSpawn(): Promise<BenchmarkResult> {
  console.log('Running: Warm Spawn from Pool...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 20,
    minPoolSize: 10,
    predictiveScalingEnabled: false,
  });
  
  // Pre-warm pool
  await delay(500);
  
  const iterations = 100;
  const times: number[] = [];
  const spec = createTestSpec();
  
  for (let i = 0; i < iterations; i++) {
    const request: SpawnRequest = {
      spec,
      priority: 'normal',
      timeoutMs: 5000,
    };
    
    const start = performance.now();
    try {
      const result = await optimizer.spawn(request);
      times.push(result.spawnTimeMs);
      
      // Return VM to pool for next iteration
      // In real usage, VM would be released after use
    } catch (error) {
      console.error(`Iteration ${i} failed:`, error);
    }
  }
  
  await optimizer.shutdown();
  
  const result = calculateStats(times, iterations, 'Warm Spawn from Pool');
  result.passed = result.p95TimeMs < TARGETS.spawnTimeP95;
  
  printResult(result);
  return result;
}

/**
 * Benchmark fast boot with image cache (should be <100ms)
 */
async function benchmarkFastBoot(): Promise<BenchmarkResult> {
  console.log('Running: Fast Boot with Image Cache...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 0, // Force cache-based boot
    fastBootEnabled: true,
    imageCacheSize: 10,
  });
  
  const spec = createTestSpec();
  
  // First spawn to populate cache
  await optimizer.spawn({
    spec,
    priority: 'normal',
    timeoutMs: 5000,
  });
  
  await delay(100);
  
  const iterations = 50;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const request: SpawnRequest = {
      spec,
      priority: 'normal',
      timeoutMs: 5000,
    };
    
    const result = await optimizer.spawn(request);
    times.push(result.spawnTimeMs);
  }
  
  await optimizer.shutdown();
  
  const result = calculateStats(times, iterations, 'Fast Boot with Cache');
  result.passed = result.p95TimeMs < TARGETS.spawnTimeP95 && result.avgTimeMs < 80;
  
  printResult(result);
  return result;
}

/**
 * Benchmark cold starts (should be <200ms)
 */
async function benchmarkColdStart(): Promise<BenchmarkResult> {
  console.log('Running: Cold Start Performance...');
  
  const iterations = 20;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    // Create new optimizer each time to force cold start
    const optimizer = new VMSpawnOptimizer({
      targetPoolSize: 0,
      fastBootEnabled: false,
    });
    
    const request: SpawnRequest = {
      spec: createTestSpec(),
      priority: 'normal',
      timeoutMs: 5000,
    };
    
    const result = await optimizer.spawn(request);
    times.push(result.spawnTimeMs);
    
    await optimizer.shutdown();
    await delay(50);
  }
  
  const result = calculateStats(times, iterations, 'Cold Start');
  result.passed = result.maxTimeMs < TARGETS.coldStartMax && result.p95TimeMs < 180;
  
  printResult(result);
  return result;
}

/**
 * Benchmark sustained load over time
 */
async function benchmarkSustainedLoad(): Promise<BenchmarkResult> {
  console.log('Running: Sustained Load (1000 requests)...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 50,
    maxPoolSize: 100,
    predictiveScalingEnabled: true,
  });
  
  await delay(1000); // Let pool warm up
  
  const iterations = 1000;
  const times: number[] = [];
  let poolHits = 0;
  
  for (let i = 0; i < iterations; i++) {
    const request: SpawnRequest = {
      spec: createTestSpec(),
      priority: 'normal',
      timeoutMs: 5000,
    };
    
    const result = await optimizer.spawn(request);
    times.push(result.spawnTimeMs);
    if (result.poolHit) poolHits++;
    
    // Small delay between requests
    if (i % 10 === 0) await delay(1);
  }
  
  const metrics = optimizer.getMetrics();
  await optimizer.shutdown();
  
  const result = calculateStats(times, iterations, 'Sustained Load (1000 req)');
  result.poolHitRate = (poolHits / iterations) * 100;
  result.passed = result.p95TimeMs < TARGETS.spawnTimeP95 && result.poolHitRate >= TARGETS.poolHitRate;
  
  printResult(result);
  console.log(`  Pool hit rate: ${result.poolHitRate.toFixed(1)}% (target: >${TARGETS.poolHitRate}%)`);
  
  return result;
}

/**
 * Benchmark burst load handling
 */
async function benchmarkBurstLoad(): Promise<BenchmarkResult> {
  console.log('Running: Burst Load (100 concurrent)...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 20,
    maxPoolSize: 150,
    predictiveScalingEnabled: true,
  });
  
  await delay(500);
  
  const burstSize = 100;
  const times: number[] = [];
  
  const burstPromises = Array.from({ length: burstSize }, async (_, i) => {
    await delay(Math.random() * 10); // Slight jitter
    
    const request: SpawnRequest = {
      spec: createTestSpec(),
      priority: 'high',
      timeoutMs: 10000,
    };
    
    const start = performance.now();
    const result = await optimizer.spawn(request);
    return result.spawnTimeMs;
  });
  
  const results = await Promise.all(burstPromises);
  times.push(...results);
  
  const metrics = optimizer.getMetrics();
  await optimizer.shutdown();
  
  const result = calculateStats(times, burstSize, 'Burst Load (100 concurrent)');
  result.passed = result.p95TimeMs < TARGETS.spawnTimeP95 * 1.5 && result.avgTimeMs < 150;
  
  printResult(result);
  console.log(`  Final pool size: ${metrics.totalVMs} VMs`);
  
  return result;
}

/**
 * Benchmark pool hit rate over time
 */
async function benchmarkPoolHitRate(): Promise<BenchmarkResult> {
  console.log('Running: Pool Hit Rate Analysis...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 30,
    minPoolSize: 10,
    predictiveScalingEnabled: true,
  });
  
  await delay(800); // Initial pool warm-up
  
  const iterations = 200;
  let poolHits = 0;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const request: SpawnRequest = {
      spec: createTestSpec(),
      priority: 'normal',
      timeoutMs: 5000,
    };
    
    const result = await optimizer.spawn(request);
    times.push(result.spawnTimeMs);
    if (result.poolHit) poolHits++;
    
    // Simulate realistic workload pattern
    await delay(Math.random() * 20 + 5);
  }
  
  const metrics = optimizer.getMetrics();
  await optimizer.shutdown();
  
  const hitRate = (poolHits / iterations) * 100;
  const result = calculateStats(times, iterations, 'Pool Hit Rate');
  result.poolHitRate = hitRate;
  result.passed = hitRate >= TARGETS.poolHitRate;
  
  printResult(result);
  console.log(`  Achieved hit rate: ${hitRate.toFixed(1)}% (target: >${TARGETS.poolHitRate}%)`);
  
  return result;
}

/**
 * Benchmark predictive scaling effectiveness
 */
async function benchmarkPredictiveScaling(): Promise<BenchmarkResult> {
  console.log('Running: Predictive Scaling...');
  
  const optimizer = new VMSpawnOptimizer({
    targetPoolSize: 10,
    maxPoolSize: 80,
    predictiveScalingEnabled: true,
    scaleUpThreshold: 0.7,
  });
  
  await delay(500);
  
  const initialStatus = optimizer.getPoolStatus();
  console.log(`  Initial pool: ${initialStatus.readyVMs} ready VMs`);
  
  // Gradually increase load to trigger scaling
  const times: number[] = [];
  
  for (let burst = 1; burst <= 5; burst++) {
    const requests = Array.from({ length: burst * 10 }, () => 
      optimizer.spawn({
        spec: createTestSpec(),
        priority: 'normal',
        timeoutMs: 5000,
      })
    );
    
    const results = await Promise.all(requests);
    times.push(...results.map(r => r.spawnTimeMs));
    
    await delay(2000); // Let scaling take effect
    
    const status = optimizer.getPoolStatus();
    console.log(`  After burst ${burst}: ${status.readyVMs} ready VMs`);
  }
  
  const finalStatus = optimizer.getPoolStatus();
  await optimizer.shutdown();
  
  const result = calculateStats(times, times.length, 'Predictive Scaling');
  result.passed = finalStatus.readyVMs > initialStatus.readyVMs * 2;
  
  printResult(result);
  console.log(`  Pool grew from ${initialStatus.readyVMs} to ${finalStatus.readyVMs} VMs`);
  
  return result;
}

// Helper functions

function createTestSpec(): VMSpec {
  return {
    id: `test-${Date.now()}`,
    vcpus: 2,
    memoryMb: 512,
    imageRef: 'benchmark-rootfs',
    kernelRef: 'benchmark-kernel',
    rootfsSizeMb: 1024,
  };
}

function calculateStats(times: number[], iterations: number, name: string): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  return {
    name,
    iterations,
    avgTimeMs: sum / sorted.length,
    p50TimeMs: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95TimeMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99TimeMs: sorted[Math.floor(sorted.length * 0.99)] || 0,
    minTimeMs: sorted[0] || 0,
    maxTimeMs: sorted[sorted.length - 1] || 0,
    successRate: (times.length / iterations) * 100,
    poolHitRate: 0,
    passed: false,
  };
}

function printResult(result: BenchmarkResult): void {
  console.log(`  Avg: ${result.avgTimeMs.toFixed(2)}ms | P95: ${result.p95TimeMs.toFixed(2)}ms | P99: ${result.p99TimeMs.toFixed(2)}ms`);
  console.log(`  Min: ${result.minTimeMs.toFixed(2)}ms | Max: ${result.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Status: ${result.passed ? '✓ PASS' : '✗ FAIL'}\n`);
}

function printSummary(suite: BenchmarkSuite): void {
  console.log('\n=== Benchmark Summary ===');
  console.log(`Total Tests: ${suite.summary.totalTests}`);
  console.log(`Passed: ${suite.summary.passedTests}`);
  console.log(`Failed: ${suite.summary.failedTests}`);
  console.log(`Success Rate: ${suite.summary.overallPassRate.toFixed(1)}%`);
  console.log('\nPerformance Targets:');
  console.log(`  Spawn Time P95: <${TARGETS.spawnTimeP95}ms`);
  console.log(`  Cold Start Max: <${TARGETS.coldStartMax}ms`);
  console.log(`  Pool Hit Rate: >${TARGETS.poolHitRate}%`);
  console.log(`\nOverall: ${suite.summary.failedTests === 0 ? '✓ ALL TARGETS MET' : '✗ SOME TARGETS FAILED'}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSpawnBenchmarks().catch(console.error);
}

export { TARGETS };
export type { BenchmarkResult, BenchmarkSuite };

/**
 * Health Check Load Test Scenario
 * 
 * Simple health endpoint testing for baseline performance measurement.
 */

import { LoadGenerator, BuiltInScenarios, LoadTestResult } from '../loader';

export interface HealthCheckConfig {
  target: string;
  agentCount?: number;
  duration?: number;
  requestRate?: number;
}

/**
 * Run health check load test
 */
export async function runHealthCheckLoadTest(
  config: HealthCheckConfig
): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: config.agentCount || 100,
    duration: config.duration || 60,
    requestRate: config.requestRate || 10,
    target: config.target,
    scenario: 'health-check',
    timeout: 5000,
    successCriteria: {
      minSuccessRate: 99.9,
      maxP95Latency: 100,
      maxP99Latency: 200,
      maxErrorRate: 0.1,
    },
  });

  generator.registerScenario('health-check', BuiltInScenarios.healthCheck(config.target));

  // Log progress
  generator.on('start', (data) => {
    console.log(`[${new Date().toISOString()}] Load test started: ${data.testId}`);
    console.log(`  Agents: ${data.config.agentCount}, Duration: ${data.config.duration}s`);
  });

  generator.on('request', (data) => {
    if (data.iteration % 100 === 0) {
      process.stdout.write(`\r  Agent ${data.agentId}: ${data.iteration} requests`);
    }
  });

  generator.on('complete', (result) => {
    console.log('\n');
    console.log(`[${new Date().toISOString()}] Load test completed`);
    console.log(`  Total requests: ${result.metrics.totalRequests}`);
    console.log(`  Success rate: ${result.metrics.successRate.toFixed(2)}%`);
    console.log(`  P95 latency: ${result.metrics.latencies.p95}ms`);
    console.log(`  P99 latency: ${result.metrics.latencies.p99}ms`);
    console.log(`  Passed: ${result.passed}`);
    
    if (result.violations.length > 0) {
      console.log('  Violations:');
      result.violations.forEach(v => console.log(`    - ${v}`));
    }
  });

  return generator.run();
}

/**
 * Run baseline performance test (10 agents, 30s)
 */
export async function runBaselineTest(target: string): Promise<LoadTestResult> {
  return runHealthCheckLoadTest({
    target,
    agentCount: 10,
    duration: 30,
    requestRate: 5,
  });
}

/**
 * Run stress test (100+ agents, 60s)
 */
export async function runStressTest(target: string): Promise<LoadTestResult> {
  return runHealthCheckLoadTest({
    target,
    agentCount: 100,
    duration: 60,
    requestRate: 10,
  });
}

/**
 * Run soak test (sustained load over extended period)
 */
export async function runSoakTest(target: string): Promise<LoadTestResult> {
  return runHealthCheckLoadTest({
    target,
    agentCount: 50,
    duration: 600, // 10 minutes
    requestRate: 5,
  });
}

/**
 * Run spike test (sudden increase in load)
 */
export async function runSpikeTest(target: string): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: 200,
    duration: 60,
    rampUpTime: 1, // Very fast ramp-up
    requestRate: 20,
    target,
    scenario: 'health-check',
    timeout: 5000,
    successCriteria: {
      minSuccessRate: 99.0, // Slightly lower due to spike
      maxP95Latency: 500,
      maxP99Latency: 1000,
      maxErrorRate: 1.0,
    },
  });

  generator.registerScenario('health-check', BuiltInScenarios.healthCheck(target));

  generator.on('start', () => console.log('Spike test started (200 agents, 1s ramp-up)'));
  generator.on('complete', (result) => {
    console.log(`Spike test completed: ${result.metrics.successRate.toFixed(2)}% success`);
  });

  return generator.run();
}

export default {
  runHealthCheckLoadTest,
  runBaselineTest,
  runStressTest,
  runSoakTest,
  runSpikeTest,
};

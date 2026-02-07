/**
 * Task Execution Load Test Scenario
 * 
 * Tests the system's ability to handle concurrent task execution.
 */

import { LoadGenerator, BuiltInScenarios, LoadTestResult } from '../loader';

export interface TaskExecutionConfig {
  target: string;
  agentCount?: number;
  duration?: number;
  requestRate?: number;
  taskTypes?: string[];
}

/**
 * Run task execution load test
 */
export async function runTaskExecutionLoadTest(
  config: TaskExecutionConfig
): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: config.agentCount || 100,
    duration: config.duration || 60,
    requestRate: config.requestRate || 5,
    target: config.target,
    scenario: 'task-execution',
    timeout: 30000, // Tasks may take time
    successCriteria: {
      minSuccessRate: 99.9,
      maxP95Latency: 5000,
      maxP99Latency: 10000,
      maxErrorRate: 0.1,
    },
  });

  // Rotate through task types if provided
  const taskTypes = config.taskTypes || ['compute', 'io', 'memory'];
  let taskIndex = 0;

  generator.registerScenario('task-execution', async (agentId, iteration) => {
    const taskType = taskTypes[taskIndex % taskTypes.length];
    taskIndex++;
    return BuiltInScenarios.executeTask(config.target, taskType)(agentId, iteration);
  });

  generator.on('start', (data) => {
    console.log(`[Task Execution Test] Started: ${data.testId}`);
    console.log(`  Executing tasks with ${data.config.agentCount} agents`);
    console.log(`  Task types: ${taskTypes.join(', ')}`);
  });

  generator.on('complete', (result) => {
    console.log(`[Task Execution Test] Completed`);
    console.log(`  Tasks executed: ${result.metrics.totalRequests}`);
    console.log(`  Success rate: ${result.metrics.successRate.toFixed(2)}%`);
    console.log(`  Avg execution time: ${result.metrics.latencies.mean.toFixed(0)}ms`);
    console.log(`  Throughput: ${result.metrics.throughput.requestsPerSecond.toFixed(1)} req/s`);
  });

  return generator.run();
}

/**
 * Run compute-intensive task test
 */
export async function runComputeTaskTest(target: string): Promise<LoadTestResult> {
  return runTaskExecutionLoadTest({
    target,
    agentCount: 50,
    duration: 60,
    requestRate: 2,
    taskTypes: ['compute-heavy'],
  });
}

/**
 * Run I/O intensive task test
 */
export async function runIOTaskTest(target: string): Promise<LoadTestResult> {
  return runTaskExecutionLoadTest({
    target,
    agentCount: 100,
    duration: 60,
    requestRate: 10,
    taskTypes: ['io-heavy'],
  });
}

/**
 * Run mixed workload test
 */
export async function runMixedWorkloadTest(target: string): Promise<LoadTestResult> {
  return runTaskExecutionLoadTest({
    target,
    agentCount: 100,
    duration: 120,
    requestRate: 5,
    taskTypes: ['compute', 'io', 'memory', 'network', 'mixed'],
  });
}

/**
 * Run backpressure test (high load to test queue behavior)
 */
export async function runBackpressureTest(target: string): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: 200,
    duration: 60,
    rampUpTime: 5,
    requestRate: 20,
    target,
    scenario: 'backpressure',
    timeout: 60000, // Long timeout for queued tasks
    successCriteria: {
      minSuccessRate: 95.0, // Lower due to potential queue drops
      maxP95Latency: 30000,
      maxP99Latency: 60000,
      maxErrorRate: 5.0,
    },
  });

  generator.registerScenario('backpressure', BuiltInScenarios.executeTask(target, 'compute'));

  generator.on('start', () => {
    console.log('[Backpressure Test] High load to test queue limits...');
  });

  generator.on('complete', (result) => {
    console.log('[Backpressure Test] Completed');
    console.log(`  Queue behavior: ${result.metrics.successRate > 95 ? 'ACCEPTABLE' : 'DEGRADED'}`);
    console.log(`  Max latency: ${result.metrics.latencies.max}ms`);
  });

  return generator.run();
}

export default {
  runTaskExecutionLoadTest,
  runComputeTaskTest,
  runIOTaskTest,
  runMixedWorkloadTest,
  runBackpressureTest,
};

/**
 * 25 Session Load Test Scenario
 * 
 * Production load test with 25 concurrent sessions.
 * - Each session: 1 Coordinator + 3 Workers
 * - Duration: 30 minutes
 * - Workload: Mixed (review, test, refactor)
 * - Measures: Queue depth, event latency, throughput
 * 
 * Success Criteria:
 * - Latency: <200ms
 * - Error Rate: <1%
 */

import { LoadTestRunner, type LoadTest, type TestResult } from '../framework';
import { ReportGenerator } from '../report';
import { logger } from '../../../src/utils/logger';

// Test configuration
export const testConfig: LoadTest = {
  name: '25 Session Production Load Test',
  sessions: 25,
  duration: 30, // 30 minutes
  rampUp: 60, // 60 seconds
  agentsPerSession: 4, // 1 Coordinator + 3 Workers
  workload: 'mixed', // Mixed workloads
  criteria: {
    maxLatencyMs: 200,
    maxErrorRate: 0.01,
    minThroughput: 100,
    maxCpuPercent: 75,
    maxMemoryGrowthMB: 250,
  },
};

/**
 * Run the 25-session load test
 */
export async function run25SessionTest(options: {
  outputDir?: string;
  verbose?: boolean;
} = {}): Promise<TestResult> {
  const { outputDir = './tests/load/reports', verbose = false } = options;

  logger.info('\n' + '='.repeat(70));
  logger.info('  25 SESSION LOAD TEST (Production)');
  logger.info('='.repeat(70));
  logger.info(`
Configuration:
  Sessions: ${testConfig.sessions}
  Duration: ${testConfig.duration} minutes
  Ramp-up: ${testConfig.rampUp} seconds
  Agents per Session: ${testConfig.agentsPerSession}
  Workload: ${testConfig.workload} (review, test, refactor)

Success Criteria:
  Max Latency: ${testConfig.criteria.maxLatencyMs}ms
  Max Error Rate: ${(testConfig.criteria.maxErrorRate * 100).toFixed(0)}%
  Min Throughput: ${testConfig.criteria.minThroughput}/sec

Key Metrics:
  - Queue depth monitoring
  - Event latency distribution
  - System throughput under sustained load
`);

  // Create runner
  const runner = new LoadTestRunner({
    outputDir,
    verbose,
    stopOnFailure: false,
    detailedMetrics: true,
  });

  // Collect queue depth metrics
  const queueDepths: number[] = [];
  runner.onMetric((metric) => {
    if (metric.type === 'queue' && metric.name === 'depth') {
      queueDepths.push(metric.value);
    }
  });

  // Run test
  const startTime = Date.now();
  const result = await runner.run(testConfig);
  const actualDuration = (Date.now() - startTime) / 1000;

  // Calculate queue metrics
  const avgQueueDepth = queueDepths.length > 0 
    ? queueDepths.reduce((a, b) => a + b, 0) / queueDepths.length 
    : 0;
  const maxQueueDepth = queueDepths.length > 0 ? Math.max(...queueDepths) : 0;

  logger.info(`\n📊 Production Load Metrics:`);
  logger.info(`   Average Queue Depth: ${avgQueueDepth.toFixed(2)}`);
  logger.info(`   Max Queue Depth: ${maxQueueDepth.toFixed(0)}`);
  logger.info(`   Event Latency: ${result.metrics.avgLatencyMs.toFixed(2)}ms`);
  logger.info(`   Actual Duration: ${actualDuration.toFixed(1)}s`);

  // Generate reports
  const generator = new ReportGenerator({ outputDir });
  const files = generator.generate(result, {
    title: 'Godel 25-Session Production Load Test',
  });

  logger.info('\n📊 Reports generated:');
  files.forEach(f => logger.info(`   - ${f}`));

  return result;
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: { outputDir?: string; verbose?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
      case '-o':
        options.outputDir = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
25-Session Load Test (Production)

Usage: ts-node 25-sessions.ts [options]

Options:
  -o, --output <dir>   Output directory for reports (default: ./tests/load/reports)
  -v, --verbose        Enable verbose logging
  -h, --help           Show this help

Examples:
  ts-node 25-sessions.ts
  ts-node 25-sessions.ts --output ./reports
  ts-node 25-sessions.ts --verbose
`);
        process.exit(0);
    }
  }

  try {
    const result = await run25SessionTest(options);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error(`Test failed: ${error}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default run25SessionTest;

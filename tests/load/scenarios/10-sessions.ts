/**
 * 10 Session Load Test Scenario
 * 
 * Warm-up test with 10 concurrent sessions.
 * - Each session: 1 Coordinator + 3 Workers
 * - Duration: 10 minutes
 * - Workload: Code review
 * - Measures: Response time, CPU, memory
 * 
 * Success Criteria:
 * - Latency: <100ms
 * - Error Rate: <1%
 */

import { LoadTestRunner, PredefinedTests, type LoadTest, type TestResult } from '../framework';
import { ReportGenerator } from '../report';
import { logger } from '../../../src/utils/logger';

// Test configuration
export const testConfig: LoadTest = {
  name: '10 Session Warm-up Test',
  sessions: 10,
  duration: 10, // 10 minutes
  rampUp: 30, // 30 seconds
  agentsPerSession: 4, // 1 Coordinator + 3 Workers
  workload: 'review', // Code review workload
  criteria: {
    maxLatencyMs: 100,
    maxErrorRate: 0.01,
    minThroughput: 50,
    maxCpuPercent: 70,
    maxMemoryGrowthMB: 100,
  },
};

/**
 * Run the 10-session load test
 */
export async function run10SessionTest(options: {
  outputDir?: string;
  verbose?: boolean;
} = {}): Promise<TestResult> {
  const { outputDir = './tests/load/reports', verbose = false } = options;

  logger.info('\n' + '='.repeat(70));
  logger.info('  10 SESSION LOAD TEST (Warm-up)');
  logger.info('='.repeat(70));
  logger.info(`
Configuration:
  Sessions: ${testConfig.sessions}
  Duration: ${testConfig.duration} minutes
  Ramp-up: ${testConfig.rampUp} seconds
  Agents per Session: ${testConfig.agentsPerSession}
  Workload: ${testConfig.workload}

Success Criteria:
  Max Latency: ${testConfig.criteria.maxLatencyMs}ms
  Max Error Rate: ${(testConfig.criteria.maxErrorRate * 100).toFixed(0)}%
  Min Throughput: ${testConfig.criteria.minThroughput}/sec
`);

  // Create runner
  const runner = new LoadTestRunner({
    outputDir,
    verbose,
    stopOnFailure: false,
    detailedMetrics: true,
  });

  // Run test
  const result = await runner.run(testConfig);

  // Generate reports
  const generator = new ReportGenerator({ outputDir });
  const files = generator.generate(result, {
    title: 'Godel 10-Session Load Test',
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
10-Session Load Test

Usage: ts-node 10-sessions.ts [options]

Options:
  -o, --output <dir>   Output directory for reports (default: ./tests/load/reports)
  -v, --verbose        Enable verbose logging
  -h, --help           Show this help

Examples:
  ts-node 10-sessions.ts
  ts-node 10-sessions.ts --output ./reports
  ts-node 10-sessions.ts --verbose
`);
        process.exit(0);
    }
  }

  try {
    const result = await run10SessionTest(options);
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

export default run10SessionTest;

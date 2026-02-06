/**
 * 50 Session Load Test Scenario
 * 
 * Maximum stress test with 50 concurrent sessions.
 * - Each session: 1 Coordinator + 3 Workers
 * - Duration: 60 minutes
 * - Workload: Mixed (high intensity)
 * - Measures: Failure rate, recovery time, system stability
 * 
 * Success Criteria:
 * - Latency: <500ms
 * - Error Rate: <5%
 */

import { LoadTestRunner, type LoadTest, type TestResult } from '../framework';
import { ReportGenerator } from '../report';
import { logger } from '../../../src/utils/logger';

// Test configuration
export const testConfig: LoadTest = {
  name: '50 Session Stress Test',
  sessions: 50,
  duration: 60, // 60 minutes
  rampUp: 120, // 2 minutes
  agentsPerSession: 4, // 1 Coordinator + 3 Workers
  workload: 'mixed', // Mixed high-intensity workloads
  criteria: {
    maxLatencyMs: 500,
    maxErrorRate: 0.05,
    minThroughput: 150,
    maxCpuPercent: 85,
    maxMemoryGrowthMB: 500,
  },
};

/**
 * Run the 50-session stress test
 */
export async function run50SessionTest(options: {
  outputDir?: string;
  verbose?: boolean;
  measureRecovery?: boolean;
} = {}): Promise<TestResult & { recoveryMetrics?: { recoveryTimeMs: number; recoverySuccess: boolean } }> {
  const { outputDir = './tests/load/reports', verbose = false, measureRecovery = true } = options;

  logger.info('\n' + '='.repeat(70));
  logger.info('  50 SESSION LOAD TEST (Maximum Stress)');
  logger.info('='.repeat(70));
  logger.info(`
⚠️  WARNING: This is a maximum stress test that will push the system to its limits.

Configuration:
  Sessions: ${testConfig.sessions}
  Duration: ${testConfig.duration} minutes
  Ramp-up: ${testConfig.rampUp} seconds
  Agents per Session: ${testConfig.agentsPerSession}
  Workload: ${testConfig.workload} (high intensity)

Success Criteria:
  Max Latency: ${testConfig.criteria.maxLatencyMs}ms
  Max Error Rate: ${(testConfig.criteria.maxErrorRate * 100).toFixed(0)}%
  Min Throughput: ${testConfig.criteria.minThroughput}/sec

Key Metrics:
  - Failure rate under maximum load
  - System stability over extended duration
  - Recovery time after stress (if enabled)
`);

  // Create runner
  const runner = new LoadTestRunner({
    outputDir,
    verbose,
    stopOnFailure: false,
    detailedMetrics: true,
  });

  // Track failures and recovery
  const failures: { timestamp: number; error: string }[] = [];
  runner.onMetric((metric) => {
    if (metric.type === 'error') {
      failures.push({ timestamp: Date.now(), error: metric.name });
    }
  });

  // Run main stress test
  const startTime = Date.now();
  const result = await runner.run(testConfig);
  const mainTestDuration = Date.now() - startTime;

  // Measure recovery time if enabled
  let recoveryMetrics;
  if (measureRecovery) {
    logger.info('\n🔄 Measuring system recovery...');
    recoveryMetrics = await measureRecoveryTime();
  }

  // Calculate failure rate
  const failureRate = failures.length / (testConfig.sessions * testConfig.agentsPerSession);
  
  logger.info(`\n📊 Stress Test Results:`);
  logger.info(`   Total Failures: ${failures.length}`);
  logger.info(`   Failure Rate: ${(failureRate * 100).toFixed(2)}%`);
  logger.info(`   Main Test Duration: ${(mainTestDuration / 1000 / 60).toFixed(1)} minutes`);
  
  if (recoveryMetrics) {
    logger.info(`   Recovery Time: ${recoveryMetrics.recoveryTimeMs.toFixed(0)}ms`);
    logger.info(`   Recovery Success: ${recoveryMetrics.recoverySuccess ? 'YES' : 'NO'}`);
  }

  // Generate reports
  const generator = new ReportGenerator({ outputDir });
  const files = generator.generate(result, {
    title: 'Godel 50-Session Stress Test',
  });

  logger.info('\n📊 Reports generated:');
  files.forEach(f => logger.info(`   - ${f}`));

  return {
    ...result,
    recoveryMetrics,
  };
}

/**
 * Measure system recovery time after stress test
 */
async function measureRecoveryTime(): Promise<{ recoveryTimeMs: number; recoverySuccess: boolean }> {
  const recoveryStart = Date.now();
  const timeoutMs = 30000; // 30 second max recovery time
  const checkInterval = 100; // Check every 100ms
  
  // Simulate recovery monitoring
  // In a real implementation, this would check actual system metrics
  let recovered = false;
  
  while (Date.now() - recoveryStart < timeoutMs) {
    // Check if system has recovered
    // For simulation, we'll check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    // Recovery criteria: Memory below 200MB and stable
    if (heapUsedMB < 200) {
      recovered = true;
      break;
    }
    
    await delay(checkInterval);
  }
  
  const recoveryTimeMs = Date.now() - recoveryStart;
  
  return {
    recoveryTimeMs,
    recoverySuccess: recovered,
  };
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: { outputDir?: string; verbose?: boolean; measureRecovery?: boolean } = {
    measureRecovery: true,
  };

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
      case '--no-recovery':
        options.measureRecovery = false;
        break;
      case '--help':
      case '-h':
        console.log(`
50-Session Stress Test (Maximum Load)

Usage: ts-node 50-sessions.ts [options]

Options:
  -o, --output <dir>    Output directory for reports (default: ./tests/load/reports)
  -v, --verbose         Enable verbose logging
  --no-recovery         Skip recovery time measurement
  -h, --help            Show this help

Examples:
  ts-node 50-sessions.ts
  ts-node 50-sessions.ts --output ./reports
  ts-node 50-sessions.ts --verbose --no-recovery
`);
        process.exit(0);
    }
  }

  try {
    const result = await run50SessionTest(options);
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

export default run50SessionTest;

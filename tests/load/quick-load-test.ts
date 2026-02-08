/**
 * Quick Load Test Validation Script
 * 
 * Runs 10/25/50 session tests with shorter durations for validation.
 * 
 * Usage: ts-node quick-load-test.ts
 */

import { LoadTestRunner, PredefinedTests, type TestResult } from './framework';
import { ReportGenerator } from './report';
import { logger } from '../../src/utils/logger';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = './tests/load/reports';

interface TestSummary {
  scale: number;
  result: TestResult;
}

async function runQuickTest(sessions: number, duration: number): Promise<TestResult> {
  const test = PredefinedTests.custom(sessions, duration, 'mixed');
  
  logger.info(`\n${'='.repeat(70)}`);
  logger.info(`  ${sessions} SESSION QUICK TEST`);
  logger.info(`${'='.repeat(70)}`);
  logger.info(`
Configuration:
  Sessions: ${test.sessions}
  Duration: ${test.duration} minutes (QUICK MODE)
  Ramp-up: ${test.rampUp} seconds
  Agents per Session: ${test.agentsPerSession}
  Workload: ${test.workload}
`);

  const runner = new LoadTestRunner({
    outputDir: OUTPUT_DIR,
    verbose: false,
    stopOnFailure: false,
    detailedMetrics: true,
  });

  const result = await runner.run(test);
  
  // Generate report
  const generator = new ReportGenerator({ outputDir: OUTPUT_DIR });
  const files = generator.generate(result, {
    title: `Godel ${sessions}-Session Quick Load Test`,
  });

  logger.info('\n📊 Reports generated:');
  files.forEach(f => logger.info(`   - ${f}`));

  return result;
}

async function main(): Promise<void> {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const summaries: TestSummary[] = [];
  
  logger.info('\n' + '='.repeat(70));
  logger.info('  QUICK LOAD TEST SUITE - 10/25/50 Sessions');
  logger.info('='.repeat(70));
  logger.info('\nRunning quick validation tests with reduced duration...\n');

  // Test 10 sessions (2 min)
  try {
    logger.info('\n🧪 Test 1/3: 10 sessions (2 min)');
    const result10 = await runQuickTest(10, 2);
    summaries.push({ scale: 10, result: result10 });
    logger.info(`\n✅ 10-session test: ${result10.success ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    logger.error(`\n❌ 10-session test error: ${error}`);
    summaries.push({ scale: 10, result: { success: false, error: String(error) } as any });
  }

  // Test 25 sessions (2 min)
  try {
    logger.info('\n🧪 Test 2/3: 25 sessions (2 min)');
    const result25 = await runQuickTest(25, 2);
    summaries.push({ scale: 25, result: result25 });
    logger.info(`\n✅ 25-session test: ${result25.success ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    logger.error(`\n❌ 25-session test error: ${error}`);
    summaries.push({ scale: 25, result: { success: false, error: String(error) } as any });
  }

  // Test 50 sessions (2 min)
  try {
    logger.info('\n🧪 Test 3/3: 50 sessions (2 min)');
    const result50 = await runQuickTest(50, 2);
    summaries.push({ scale: 50, result: result50 });
    logger.info(`\n✅ 50-session test: ${result50.success ? 'PASSED' : 'FAILED'}`);
  } catch (error) {
    logger.error(`\n❌ 50-session test error: ${error}`);
    summaries.push({ scale: 50, result: { success: false, error: String(error) } as any });
  }

  // Print final summary
  logger.info('\n' + '='.repeat(70));
  logger.info('  LOAD TEST SUITE SUMMARY');
  logger.info('='.repeat(70));

  const passed = summaries.filter(s => s.result.success).length;
  const failed = summaries.length - passed;

  logger.info(`\nResults: ${passed} passed, ${failed} failed`);

  for (const summary of summaries) {
    const status = summary.result.success ? '✅ PASS' : '❌ FAIL';
    const metrics = summary.result.metrics;
    logger.info(`\n  ${status} - ${summary.scale} Sessions`);
    if (metrics) {
      logger.info(`     Sessions: ${metrics.totalSessions}/${summary.scale}`);
      logger.info(`     Latency: ${metrics.avgLatencyMs?.toFixed(1)}ms (P95: ${metrics.p95LatencyMs?.toFixed(1)}ms)`);
      logger.info(`     Error Rate: ${(metrics.errorRate * 100)?.toFixed(2)}%`);
      logger.info(`     Throughput: ${metrics.eventsPerSecond?.toFixed(1)}/sec`);
    }
  }

  logger.info('\n' + '='.repeat(70));
  
  if (failed === 0) {
    logger.info('  ✅ ALL TESTS PASSED');
  } else if (passed === 0) {
    logger.info('  ❌ ALL TESTS FAILED');
  } else {
    logger.info(`  ⚠️  ${passed}/${summaries.length} TESTS PASSED`);
  }

  logger.info('='.repeat(70) + '\n');

  // Generate combined report
  const validResults = summaries
    .filter(s => s.result.metrics)
    .map(s => s.result);
  
  if (validResults.length > 0) {
    const generator = new ReportGenerator({ outputDir: OUTPUT_DIR });
    const multiReport = generator.generateMultiReport(validResults);
    const reportPath = join(OUTPUT_DIR, 'quick-load-test-suite-report.md');
    const fs = require('fs');
    fs.writeFileSync(reportPath, multiReport);
    logger.info(`📊 Combined report: ${reportPath}`);
  }

  // Exit with appropriate code
  const allPassed = summaries.every(s => s.result.success);
  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runQuickTest };
export default main;

/**
 * Load Test Runner
 * 
 * Main entry point for running load tests with configurable scale.
 * Supports 10/25/50 session scenarios with automatic report generation.
 * 
 * Usage:
 *   ts-node run.ts --scale 10
 *   ts-node run.ts --scale 25 --verbose
 *   ts-node run.ts --scale 50 --output ./reports
 *   ts-node run.ts --all
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { run10SessionTest } from './scenarios/10-sessions';
import { run25SessionTest } from './scenarios/25-sessions';
import { run50SessionTest } from './scenarios/50-sessions';
import { ReportGenerator } from './report';
import { LoadTestRunner, PredefinedTests, type TestResult } from './framework';
import { logger } from '../../src/utils/logger';

// ============================================================================
// CLI Options
// ============================================================================

interface RunOptions {
  /** Scale: 10, 25, 50, or 'all' */
  scale: 10 | 25 | 50 | 'all';
  /** Output directory for reports */
  outputDir: string;
  /** Enable verbose logging */
  verbose: boolean;
  /** Generate all report formats */
  allFormats: boolean;
  /** Stop on first failure */
  stopOnFailure: boolean;
  /** Measure recovery time (for stress tests) */
  measureRecovery: boolean;
  /** Custom duration (minutes) - overrides defaults */
  duration?: number;
}

const DEFAULT_OPTIONS: RunOptions = {
  scale: 10,
  outputDir: './tests/load/reports',
  verbose: false,
  allFormats: false,
  stopOnFailure: false,
  measureRecovery: true,
};

// ============================================================================
// Main Runner
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: Partial<RunOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--scale':
        if (nextArg === 'all') {
          options.scale = 'all';
        } else {
          const scale = parseInt(nextArg, 10);
          if ([10, 25, 50].includes(scale)) {
            options.scale = scale as 10 | 25 | 50;
          } else {
            console.error(`Error: Invalid scale '${nextArg}'. Use 10, 25, 50, or 'all'`);
            process.exit(1);
          }
        }
        i++;
        break;

      case '--output':
      case '-o':
        options.outputDir = nextArg;
        i++;
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--all':
        options.scale = 'all';
        break;

      case '--stop-on-failure':
        options.stopOnFailure = true;
        break;

      case '--no-recovery':
        options.measureRecovery = false;
        break;

      case '--duration':
      case '-d':
        options.duration = parseInt(nextArg, 10);
        i++;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option '${arg}'`);
          printHelp();
          process.exit(1);
        }
        break;
    }
  }

  return { ...DEFAULT_OPTIONS, ...options };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Godel Load Testing Framework

Usage: ts-node run.ts [options]

Options:
  --scale <n|all>      Test scale: 10, 25, 50, or 'all' (default: 10)
  -o, --output <dir>   Output directory for reports (default: ./tests/load/reports)
  -v, --verbose        Enable verbose logging
  --all                Run all scales (10, 25, 50)
  --stop-on-failure    Stop on first failed test
  --no-recovery        Skip recovery time measurement
  -d, --duration <m>   Override test duration (minutes)
  -h, --help           Show this help

Scenarios:
  10  - Warm-up test: 10 sessions, 10min, code review workload
  25  - Production load: 25 sessions, 30min, mixed workloads
  50  - Stress test: 50 sessions, 60min, maximum intensity

Success Criteria:
  ┌───────────┬──────────┬───────────┬────────────┐
  │ Scale     │ Sessions │ Latency   │ Error Rate │
  ├───────────┼──────────┼───────────┼────────────┤
  │ Warm-up   │ 10       │ <100ms    │ <1%        │
  │ Production│ 25       │ <200ms    │ <1%        │
  │ Stress    │ 50       │ <500ms    │ <5%        │
  └───────────┴──────────┴───────────┴────────────┘

Examples:
  ts-node run.ts --scale 10
  ts-node run.ts --scale 25 --verbose
  ts-node run.ts --scale 50 --output ./reports
  ts-node run.ts --all
  ts-node run.ts --scale 10 --duration 5

Output:
  Reports are generated in the specified output directory:
  - HTML report with charts and metrics
  - JSON report with raw data
  - Markdown summary
`);
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Run a single scale test
 */
async function runScale(scale: 10 | 25 | 50, options: RunOptions): Promise<TestResult> {
  const testOptions = {
    outputDir: options.outputDir,
    verbose: options.verbose,
    ...(scale === 50 && { measureRecovery: options.measureRecovery }),
  };

  switch (scale) {
    case 10:
      return run10SessionTest(testOptions);
    case 25:
      return run25SessionTest(testOptions);
    case 50:
      return run50SessionTest(testOptions);
    default:
      throw new Error(`Unknown scale: ${scale}`);
  }
}

/**
 * Run all scales sequentially
 */
async function runAllScales(options: RunOptions): Promise<TestResult[]> {
  const scales: (10 | 25 | 50)[] = [10, 25, 50];
  const results: TestResult[] = [];

  logger.info('\n' + '='.repeat(70));
  logger.info('  RUNNING ALL LOAD TEST SCENARIOS');
  logger.info('='.repeat(70));
  logger.info(`
This will run three load tests sequentially:
  1. 10 sessions (10 min) - Warm-up
  2. 25 sessions (30 min) - Production load
  3. 50 sessions (60 min) - Stress test

Total estimated time: ~100 minutes
`);

  for (const scale of scales) {
    logger.info(`\n${'─'.repeat(70)}`);
    logger.info(`Running ${scale}-session test...`);
    logger.info(`${'─'.repeat(70)}`);

    try {
      const result = await runScale(scale, options);
      results.push(result);

      if (!result.success && options.stopOnFailure) {
        logger.error(`\n❌ Stopping due to failure in ${scale}-session test`);
        break;
      }

      // Brief pause between tests
      if (scale !== 50) {
        logger.info('\n⏸️  Pausing 10 seconds before next test...');
        await delay(10000);
      }
    } catch (error) {
      logger.error(`\n❌ Error running ${scale}-session test: ${error}`);
      if (options.stopOnFailure) {
        break;
      }
    }
  }

  return results;
}

/**
 * Print final summary
 */
function printSummary(results: TestResult[]): void {
  logger.info('\n' + '='.repeat(70));
  logger.info('  LOAD TEST SUITE SUMMARY');
  logger.info('='.repeat(70));

  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  logger.info(`\nResults: ${passed} passed, ${failed} failed`);

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    logger.info(`\n  ${status} - ${result.test.name}`);
    logger.info(`     Sessions: ${result.metrics.totalSessions}/${result.test.sessions}`);
    logger.info(`     Latency: ${result.metrics.avgLatencyMs.toFixed(1)}ms (P95: ${result.metrics.p95LatencyMs.toFixed(1)}ms)`);
    logger.info(`     Error Rate: ${(result.metrics.errorRate * 100).toFixed(2)}%`);
    logger.info(`     Throughput: ${result.metrics.eventsPerSecond.toFixed(1)}/sec`);
    logger.info(`     Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  }

  logger.info('\n' + '='.repeat(70));

  if (failed === 0) {
    logger.info('  ✅ ALL TESTS PASSED');
  } else if (passed === 0) {
    logger.info('  ❌ ALL TESTS FAILED');
  } else {
    logger.info(`  ⚠️  ${passed}/${results.length} TESTS PASSED`);
  }

  logger.info('='.repeat(70) + '\n');
}

/**
 * Generate combined report for all tests
 */
function generateCombinedReport(results: TestResult[], outputDir: string): void {
  const generator = new ReportGenerator({ outputDir });
  const multiReport = generator.generateMultiReport(results);
  
  const reportPath = join(outputDir, 'load-test-suite-report.md');
  const fs = require('fs');
  fs.writeFileSync(reportPath, multiReport);
  
  logger.info(`📊 Combined report: ${reportPath}`);
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();
  
  ensureOutputDir(options.outputDir);

  logger.info('\n🚀 Godel Load Testing Framework');
  logger.info(`   Output: ${options.outputDir}`);
  logger.info(`   Verbose: ${options.verbose ? 'YES' : 'NO'}`);

  try {
    let results: TestResult[];

    if (options.scale === 'all') {
      results = await runAllScales(options);
      printSummary(results);
      generateCombinedReport(results, options.outputDir);
    } else {
      const result = await runScale(options.scale, options);
      results = [result];
      
      logger.info('\n' + '='.repeat(70));
      logger.info(`  FINAL RESULT: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      logger.info('='.repeat(70) + '\n');
    }

    // Exit with appropriate code
    const allPassed = results.every(r => r.success);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    logger.error(`\n❌ Fatal error: ${error}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runScale, runAllScales };
export default main;

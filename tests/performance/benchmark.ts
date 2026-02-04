import { logger } from '../../src/utils/logger';
/**
 * Benchmark Runner for Dash Performance Testing
 * 
 * Automated benchmark runner with configurable agent counts, progress reporting,
 * and result persistence.
 * 
 * Usage:
 *   ts-node benchmark.ts
 *   ts-node benchmark.ts --agents 10,20,50
 *   ts-node benchmark.ts --scenario baseline
 *   ts-node benchmark.ts --output ./results
 */

import { 
  LoadTestConfig, 
  LoadTestResult, 
  LoadTestGenerator,
  TestScenarios 
} from './load-test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

// ============================================================================
// Types
// ============================================================================

export interface BenchmarkConfig {
  /** Test scenarios to run (agent counts) */
  scenarios: number[];
  /** Number of iterations per scenario */
  iterations: number;
  /** Output directory for results */
  outputDir: string;
  /** Generate HTML report */
  generateHtmlReport: boolean;
  /** Generate JSON summary */
  generateJsonSummary: boolean;
  /** Compare with baseline */
  compareWithBaseline?: string;
  /** Stop on first failure */
  stopOnFailure: boolean;
}

export interface BenchmarkRun {
  /** Run ID */
  id: string;
  /** Timestamp */
  timestamp: string;
  /** Configuration used */
  config: BenchmarkConfig;
  /** Results for each scenario */
  results: BenchmarkScenarioResult[];
  /** Total duration */
  totalDurationMs: number;
  /** Overall success */
  success: boolean;
}

export interface BenchmarkScenarioResult {
  /** Agent count for this scenario */
  agentCount: number;
  /** Iteration results */
  iterations: LoadTestResult[];
  /** Aggregated metrics */
  aggregated: AggregatedMetrics;
  /** Success rate (0-1) */
  successRate: number;
  /** Pass/fail status */
  status: 'passed' | 'failed' | 'degraded';
}

export interface AggregatedMetrics {
  /** Average spawn time (ms) */
  avgSpawnTime: number;
  /** P95 spawn time (ms) */
  p95SpawnTime: number;
  /** Average event delivery (ms) */
  avgEventDelivery: number;
  /** P95 event delivery (ms) */
  p95EventDelivery: number;
  /** Events per second */
  eventsPerSecond: number;
  /** Messages per second */
  messagesPerSecond: number;
  /** Memory growth (MB) */
  memoryGrowthMB: number;
  /** Peak memory (MB) */
  peakMemoryMB: number;
  /** Delivery rate (0-1) */
  deliveryRate: number;
  /** Total errors */
  totalErrors: number;
}

export interface PerformanceThresholds {
  /** Max acceptable spawn time (ms) */
  maxSpawnTimeMs: number;
  /** Max acceptable event delivery time (ms) */
  maxEventDeliveryMs: number;
  /** Min required events per second */
  minEventsPerSecond: number;
  /** Max acceptable memory growth (MB) */
  maxMemoryGrowthMB: number;
  /** Min required delivery rate */
  minDeliveryRate: number;
  /** Max acceptable error count */
  maxErrors: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  scenarios: [10, 20, 50, 100],
  iterations: 3,
  outputDir: './benchmark-results',
  generateHtmlReport: true,
  generateJsonSummary: true,
  stopOnFailure: false,
};

const DEFAULT_THRESHOLDS: Record<number, PerformanceThresholds> = {
  10: {
    maxSpawnTimeMs: 100,
    maxEventDeliveryMs: 10,
    minEventsPerSecond: 50,
    maxMemoryGrowthMB: 50,
    minDeliveryRate: 0.99,
    maxErrors: 0,
  },
  20: {
    maxSpawnTimeMs: 200,
    maxEventDeliveryMs: 20,
    minEventsPerSecond: 100,
    maxMemoryGrowthMB: 100,
    minDeliveryRate: 0.99,
    maxErrors: 0,
  },
  50: {
    maxSpawnTimeMs: 500,
    maxEventDeliveryMs: 50,
    minEventsPerSecond: 200,
    maxMemoryGrowthMB: 250,
    minDeliveryRate: 0.95,
    maxErrors: 5,
  },
  100: {
    maxSpawnTimeMs: 1000,
    maxEventDeliveryMs: 100,
    minEventsPerSecond: 300,
    maxMemoryGrowthMB: 500,
    minDeliveryRate: 0.90,
    maxErrors: 10,
  },
};

// ============================================================================
// Benchmark Runner
// ============================================================================

export class BenchmarkRunner {
  private config: BenchmarkConfig;
  private results: BenchmarkRun;
  private startTime: number;

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...config };
    this.startTime = performance.now();
    
    this.results = {
      id: `benchmark-${Date.now()}`,
      timestamp: new Date().toISOString(),
      config: this.config,
      results: [],
      totalDurationMs: 0,
      success: true,
    };
  }

  /**
   * Run the complete benchmark suite
   */
  async run(): Promise<BenchmarkRun> {
    logger.info('\n' + '='.repeat(70));
    logger.info('  DASH PERFORMANCE BENCHMARK');
    logger.info('='.repeat(70));
    logger.info(`\nConfiguration:`);
    logger.info(`  Scenarios: ${this.config.scenarios.join(', ')} agents`);
    logger.info(`  Iterations per scenario: ${this.config.iterations}`);
    logger.info(`  Output directory: ${this.config.outputDir}`);
    logger.info('');

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Run each scenario
    for (const agentCount of this.config.scenarios) {
      const scenarioResult = await this.runScenario(agentCount);
      this.results.results.push(scenarioResult);

      if (!scenarioResult.iterations.every(i => i.success) && this.config.stopOnFailure) {
        logger.info(`\n❌ Stopping benchmark due to failure`);
        this.results.success = false;
        break;
      }
    }

    this.results.totalDurationMs = performance.now() - this.startTime;
    this.results.success = this.results.results.every(r => r.status === 'passed');

    // Generate reports
    await this.generateReports();

    // Print summary
    this.printSummary();

    return this.results;
  }

  /**
   * Run a single scenario (multiple iterations)
   */
  private async runScenario(agentCount: number): Promise<BenchmarkScenarioResult> {
    logger.info(`\n${'-'.repeat(70)}`);
    logger.info(`  Scenario: ${agentCount} Agents`);
    logger.info(`${'-'.repeat(70)}`);

    const iterations: LoadTestResult[] = [];
    const thresholds = DEFAULT_THRESHOLDS[agentCount] || DEFAULT_THRESHOLDS[100];

    for (let i = 0; i < this.config.iterations; i++) {
      logger.info(`\n  Iteration ${i + 1}/${this.config.iterations}...`);

      const testConfig = TestScenarios.custom(agentCount, 30000);
      const generator = new LoadTestGenerator(testConfig);

      try {
        const result = await generator.run();
        iterations.push(result);

        // Print iteration summary
        this.printIterationSummary(result, i + 1);
      } catch (error) {
        console.error(`    ❌ Error: ${error}`);
        iterations.push({
          config: testConfig,
          timestamp: new Date().toISOString(),
          testDuration: 0,
          latency: {} as any,
          throughput: {} as any,
          memory: {} as any,
          eventBus: {} as any,
          lifecycle: {} as any,
          errors: [{ message: String(error), count: 1 }],
          success: false,
        });
      }
    }

    // Aggregate results
    const aggregated = this.aggregateMetrics(iterations);
    const successRate = iterations.filter(i => i.success).length / iterations.length;

    // Determine status
    let status: 'passed' | 'failed' | 'degraded' = 'passed';
    if (successRate < 0.5) {
      status = 'failed';
    } else if (successRate < 1 || !this.meetsThresholds(aggregated, thresholds)) {
      status = 'degraded';
    }

    // Print scenario summary
    logger.info(`\n  Scenario Summary:`);
    logger.info(`    Success rate: ${(successRate * 100).toFixed(1)}%`);
    logger.info(`    Status: ${status.toUpperCase()}`);
    logger.info(`    Avg spawn time: ${aggregated.avgSpawnTime.toFixed(2)}ms`);
    logger.info(`    Events/sec: ${aggregated.eventsPerSecond.toFixed(2)}`);
    logger.info(`    Memory growth: ${aggregated.memoryGrowthMB.toFixed(2)}MB`);

    return {
      agentCount,
      iterations,
      aggregated,
      successRate,
      status,
    };
  }

  /**
   * Aggregate metrics across iterations
   */
  private aggregateMetrics(iterations: LoadTestResult[]): AggregatedMetrics {
    const validIterations = iterations.filter(i => i.success && i.latency?.spawnTime);
    
    if (validIterations.length === 0) {
      return {
        avgSpawnTime: 0,
        p95SpawnTime: 0,
        avgEventDelivery: 0,
        p95EventDelivery: 0,
        eventsPerSecond: 0,
        messagesPerSecond: 0,
        memoryGrowthMB: 0,
        peakMemoryMB: 0,
        deliveryRate: 0,
        totalErrors: iterations.reduce((sum, i) => sum + i.errors.length, 0),
      };
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      avgSpawnTime: avg(validIterations.map(i => i.latency.spawnTime.avg)),
      p95SpawnTime: avg(validIterations.map(i => i.latency.spawnTime.p95)),
      avgEventDelivery: avg(validIterations.map(i => i.latency.eventDelivery.avg)),
      p95EventDelivery: avg(validIterations.map(i => i.latency.eventDelivery.p95)),
      eventsPerSecond: avg(validIterations.map(i => i.throughput.eventsPerSecond)),
      messagesPerSecond: avg(validIterations.map(i => i.throughput.messagesPerSecond)),
      memoryGrowthMB: avg(validIterations.map(i => i.memory.heapGrowth / 1024 / 1024)),
      peakMemoryMB: avg(validIterations.map(i => i.memory.heapUsedPeak / 1024 / 1024)),
      deliveryRate: avg(validIterations.map(i => i.eventBus.deliveryRate)),
      totalErrors: iterations.reduce((sum, i) => sum + i.errors.reduce((es, e) => es + e.count, 0), 0),
    };
  }

  /**
   * Check if metrics meet thresholds
   */
  private meetsThresholds(metrics: AggregatedMetrics, thresholds: PerformanceThresholds): boolean {
    return (
      metrics.avgSpawnTime <= thresholds.maxSpawnTimeMs &&
      metrics.avgEventDelivery <= thresholds.maxEventDeliveryMs &&
      metrics.eventsPerSecond >= thresholds.minEventsPerSecond &&
      metrics.memoryGrowthMB <= thresholds.maxMemoryGrowthMB &&
      metrics.deliveryRate >= thresholds.minDeliveryRate &&
      metrics.totalErrors <= thresholds.maxErrors
    );
  }

  /**
   * Print iteration summary
   */
  private printIterationSummary(result: LoadTestResult, iteration: number): void {
    const status = result.success ? '✅' : '❌';
    logger.info(`    ${status} Iteration ${iteration}:`);
    logger.info(`       Spawn: ${result.latency.spawnTime?.avg.toFixed(2) || 'N/A'}ms avg`);
    logger.info(`       Events: ${result.throughput.eventsPerSecond.toFixed(2)}/sec`);
    logger.info(`       Memory: ${(result.memory.heapGrowth / 1024 / 1024).toFixed(2)}MB growth`);
    if (result.errors.length > 0) {
      logger.info(`       Errors: ${result.errors.reduce((s, e) => s + e.count, 0)}`);
    }
  }

  /**
   * Generate all reports
   */
  private async generateReports(): Promise<void> {
    // JSON report
    if (this.config.generateJsonSummary) {
      const jsonPath = join(this.config.outputDir, `benchmark-${this.results.id}.json`);
      writeFileSync(jsonPath, JSON.stringify(this.results, null, 2));
      logger.info(`\n📄 JSON report saved: ${jsonPath}`);
    }

    // HTML report
    if (this.config.generateHtmlReport) {
      const htmlPath = join(this.config.outputDir, `benchmark-${this.results.id}.html`);
      writeFileSync(htmlPath, this.generateHtmlReport());
      logger.info(`📄 HTML report saved: ${htmlPath}`);
    }

    // Summary markdown
    const summaryPath = join(this.config.outputDir, 'benchmark-summary.md');
    writeFileSync(summaryPath, this.generateMarkdownSummary());
    logger.info(`📄 Summary saved: ${summaryPath}`);
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(): string {
    const chartData = this.results.results.map(r => ({
      agents: r.agentCount,
      spawnTime: r.aggregated.avgSpawnTime,
      eventDelivery: r.aggregated.avgEventDelivery,
      eventsPerSec: r.aggregated.eventsPerSecond,
      memory: r.aggregated.memoryGrowthMB,
    }));

    return `<!DOCTYPE html>
<html>
<head>
  <title>Dash Performance Benchmark</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 0.5rem; }
    h2 { color: #555; margin-top: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .metric { background: #f8f9fa; padding: 1rem; border-radius: 4px; }
    .metric-label { font-size: 0.875rem; color: #666; }
    .metric-value { font-size: 1.5rem; font-weight: bold; color: #333; }
    .status-passed { color: #4CAF50; }
    .status-failed { color: #f44336; }
    .status-degraded { color: #ff9800; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .chart { height: 300px; margin: 2rem 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div class="container">
    <h1>🚀 Dash Performance Benchmark Report</h1>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-label">Benchmark ID</div>
        <div class="metric-value" style="font-size: 1rem;">${this.results.id}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Timestamp</div>
        <div class="metric-value" style="font-size: 1rem;">${this.results.timestamp}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Total Duration</div>
        <div class="metric-value">${(this.results.totalDurationMs / 1000).toFixed(1)}s</div>
      </div>
      <div class="metric">
        <div class="metric-label">Overall Status</div>
        <div class="metric-value ${this.results.success ? 'status-passed' : 'status-failed'}">
          ${this.results.success ? '✅ PASSED' : '❌ FAILED'}
        </div>
      </div>
    </div>

    <h2>Scenario Results</h2>
    <table>
      <thead>
        <tr>
          <th>Agents</th>
          <th>Status</th>
          <th>Success Rate</th>
          <th>Spawn Time (ms)</th>
          <th>Event Delivery (ms)</th>
          <th>Events/sec</th>
          <th>Memory Growth (MB)</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        ${this.results.results.map(r => `
          <tr>
            <td>${r.agentCount}</td>
            <td class="status-${r.status}">${r.status.toUpperCase()}</td>
            <td>${(r.successRate * 100).toFixed(1)}%</td>
            <td>${r.aggregated.avgSpawnTime.toFixed(2)}</td>
            <td>${r.aggregated.avgEventDelivery.toFixed(2)}</td>
            <td>${r.aggregated.eventsPerSecond.toFixed(2)}</td>
            <td>${r.aggregated.memoryGrowthMB.toFixed(2)}</td>
            <td>${r.aggregated.totalErrors}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Performance Charts</h2>
    <div class="chart">
      <canvas id="spawnTimeChart"></canvas>
    </div>
    <div class="chart">
      <canvas id="eventsChart"></canvas>
    </div>

    <script>
      const chartData = ${JSON.stringify(chartData)};
      
      new Chart(document.getElementById('spawnTimeChart'), {
        type: 'line',
        data: {
          labels: chartData.map(d => d.agents + ' agents'),
          datasets: [{
            label: 'Spawn Time (ms)',
            data: chartData.map(d => d.spawnTime),
            borderColor: '#4CAF50',
            tension: 0.1
          }, {
            label: 'Event Delivery (ms)',
            data: chartData.map(d => d.eventDelivery),
            borderColor: '#2196F3',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: 'Latency Metrics' } }
        }
      });

      new Chart(document.getElementById('eventsChart'), {
        type: 'bar',
        data: {
          labels: chartData.map(d => d.agents + ' agents'),
          datasets: [{
            label: 'Events/sec',
            data: chartData.map(d => d.eventsPerSec),
            backgroundColor: '#4CAF50'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: 'Throughput' } }
        }
      });
    </script>
  </div>
</body>
</html>`;
  }

  /**
   * Generate Markdown summary
   */
  private generateMarkdownSummary(): string {
    return `# Dash Performance Benchmark Summary

**Benchmark ID:** ${this.results.id}  
**Timestamp:** ${this.results.timestamp}  
**Total Duration:** ${(this.results.totalDurationMs / 1000).toFixed(1)}s  
**Overall Status:** ${this.results.success ? '✅ PASSED' : '❌ FAILED'}

## Scenario Results

| Agents | Status | Success Rate | Spawn Time (ms) | Event Delivery (ms) | Events/sec | Memory Growth (MB) | Errors |
|--------|--------|--------------|-----------------|---------------------|------------|-------------------|--------|
${this.results.results.map(r => 
  `| ${r.agentCount} | ${r.status.toUpperCase()} | ${(r.successRate * 100).toFixed(1)}% | ${r.aggregated.avgSpawnTime.toFixed(2)} | ${r.aggregated.avgEventDelivery.toFixed(2)} | ${r.aggregated.eventsPerSecond.toFixed(2)} | ${r.aggregated.memoryGrowthMB.toFixed(2)} | ${r.aggregated.totalErrors} |`
).join('\n')}

## Thresholds

| Agents | Max Spawn (ms) | Max Delivery (ms) | Min Events/sec | Max Memory (MB) | Min Delivery Rate | Max Errors |
|--------|----------------|-------------------|----------------|-----------------|-------------------|------------|
${this.config.scenarios.map(s => {
  const t = DEFAULT_THRESHOLDS[s] || DEFAULT_THRESHOLDS[100];
  return `| ${s} | ${t.maxSpawnTimeMs} | ${t.maxEventDeliveryMs} | ${t.minEventsPerSecond} | ${t.maxMemoryGrowthMB} | ${(t.minDeliveryRate * 100).toFixed(0)}% | ${t.maxErrors} |`;
}).join('\n')}

## Detailed Results

${this.results.results.map(r => `
### ${r.agentCount} Agents

- **Status:** ${r.status}
- **Success Rate:** ${(r.successRate * 100).toFixed(1)}%
- **Average Spawn Time:** ${r.aggregated.avgSpawnTime.toFixed(2)}ms (p95: ${r.aggregated.p95SpawnTime.toFixed(2)}ms)
- **Average Event Delivery:** ${r.aggregated.avgEventDelivery.toFixed(2)}ms (p95: ${r.aggregated.p95EventDelivery.toFixed(2)}ms)
- **Events/sec:** ${r.aggregated.eventsPerSecond.toFixed(2)}
- **Messages/sec:** ${r.aggregated.messagesPerSecond.toFixed(2)}
- **Memory Growth:** ${r.aggregated.memoryGrowthMB.toFixed(2)}MB
- **Peak Memory:** ${r.aggregated.peakMemoryMB.toFixed(2)}MB
- **Delivery Rate:** ${(r.aggregated.deliveryRate * 100).toFixed(2)}%
- **Total Errors:** ${r.aggregated.totalErrors}
`).join('')}

---
*Generated by Dash Benchmark Runner*
`;
  }

  /**
   * Print final summary
   */
  private printSummary(): void {
    logger.info('\n' + '='.repeat(70));
    logger.info('  BENCHMARK SUMMARY');
    logger.info('='.repeat(70));

    for (const result of this.results.results) {
      const icon = result.status === 'passed' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
      logger.info(`\n  ${icon} ${result.agentCount} agents: ${result.status.toUpperCase()}`);
      logger.info(`     Spawn: ${result.aggregated.avgSpawnTime.toFixed(2)}ms | Events: ${result.aggregated.eventsPerSecond.toFixed(2)}/sec | Memory: ${result.aggregated.memoryGrowthMB.toFixed(2)}MB`);
    }

    logger.info('\n' + '='.repeat(70));
    logger.info(`  Overall: ${this.results.success ? '✅ PASSED' : '❌ FAILED'}`);
    logger.info(`  Duration: ${(this.results.totalDurationMs / 1000).toFixed(1)}s`);
    logger.info(`  Reports: ${this.config.outputDir}/`);
    logger.info('='.repeat(70) + '\n');
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<BenchmarkConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--agents':
        config.scenarios = nextArg?.split(',').map(Number);
        i++;
        break;
      case '--iterations':
        config.iterations = Number(nextArg);
        i++;
        break;
      case '--output':
        config.outputDir = nextArg;
        i++;
        break;
      case '--scenario':
        if (nextArg === 'baseline') {
          config.scenarios = [10];
        } else if (nextArg === 'standard') {
          config.scenarios = [10, 20];
        } else if (nextArg === 'full') {
          config.scenarios = [10, 20, 50, 100];
        } else if (nextArg === 'stress') {
          config.scenarios = [50, 100, 150];
        }
        i++;
        break;
      case '--no-html':
        config.generateHtmlReport = false;
        break;
      case '--stop-on-failure':
        config.stopOnFailure = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  const runner = new BenchmarkRunner(config);
  const results = await runner.run();
  process.exit(results.success ? 0 : 1);
}

function printHelp(): void {
  logger.info(`
Dash Performance Benchmark Runner

Usage: ts-node benchmark.ts [options]

Options:
  --agents <counts>      Comma-separated agent counts (default: 10,20,50,100)
  --iterations <n>       Number of iterations per scenario (default: 3)
  --output <dir>         Output directory (default: ./benchmark-results)
  --scenario <type>      Predefined scenario: baseline, standard, full, stress
  --no-html              Don't generate HTML report
  --stop-on-failure      Stop on first failed scenario
  --help                 Show this help

Examples:
  ts-node benchmark.ts
  ts-node benchmark.ts --agents 10,20,50
  ts-node benchmark.ts --scenario full --output ./perf-results
  ts-node benchmark.ts --agents 100 --iterations 5 --stop-on-failure
`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default BenchmarkRunner;

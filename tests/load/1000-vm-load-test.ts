/**
 * 1000 VM Load Test
 * 
 * Sustained 1-hour load test with 1000 virtual machines.
 * Validates system performance at maximum scale.
 * 
 * @module tests/load/1000-vm-load-test
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../../src/utils/logger';
import { LoadTestRunner, LoadTest, TestResult, PassFailCriteria } from './framework';

// ============================================================================
// 1000 VM Load Test Configuration
// ============================================================================

const TEST_DURATION_MINUTES = 60;
const VM_COUNT = 1000;
const RAMP_UP_SECONDS = 300; // 5 minutes ramp-up
const BATCH_SIZE = 50;

const CRITERIA_1000_VM: PassFailCriteria = {
  maxLatencyMs: 2000,        // 2 seconds max latency
  maxErrorRate: 0.001,       // 0.1% error rate
  minThroughput: 5000,       // 5000 events/sec
  maxCpuPercent: 90,         // 90% CPU
  maxMemoryGrowthMB: 8192,   // 8GB memory growth
};

// ============================================================================
// VM Load Test Class
// ============================================================================

export class VM1000LoadTest extends EventEmitter {
  private pool: Pool;
  private runner: LoadTestRunner;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private metrics: VMMetricsCollector;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.runner = new LoadTestRunner({
      outputDir: './tests/load/reports/1000-vm',
      verbose: true,
      stopOnFailure: false,
      detailedMetrics: true,
    });
    this.metrics = new VMMetricsCollector(pool);
  }

  /**
   * Execute 1000 VM sustained load test
   */
  async execute(): Promise<VMTestResult> {
    const testId = `1000-vm-${Date.now()}`;
    const startMs = performance.now();
    const startTime = new Date().toISOString();

    logger.info('╔════════════════════════════════════════════════════════╗');
    logger.info('║     1000 VM SUSTAINED LOAD TEST - GA VALIDATION       ║');
    logger.info('╚════════════════════════════════════════════════════════╝');
    logger.info(`Test ID: ${testId}`);
    logger.info(`Duration: ${TEST_DURATION_MINUTES} minutes`);
    logger.info(`VM Count: ${VM_COUNT}`);
    logger.info(`Start Time: ${startTime}`);
    logger.info('');

    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      // Phase 1: Pre-test validation
      await this.validateEnvironment();

      // Phase 2: Database preparation
      await this.prepareDatabase();

      // Phase 3: Warm-up (100 VMs)
      await this.executeWarmup();

      // Phase 4: Main 1000 VM test
      const mainResult = await this.executeMainTest();

      // Phase 5: Cool-down and cleanup
      await this.executeCooldown();

      const durationMs = performance.now() - startMs;
      
      const result: VMTestResult = {
        success: mainResult.success,
        testId,
        startTime,
        endTime: new Date().toISOString(),
        durationMs,
        vmCount: VM_COUNT,
        mainResult,
        metrics: await this.metrics.getFinalMetrics(),
        validationPassed: mainResult.success,
        gaReady: this.isGAReady(mainResult),
      };

      await this.generateReport(result);
      this.logResult(result);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Test failed: ${errorMsg}`);

      return {
        success: false,
        testId,
        startTime,
        endTime: new Date().toISOString(),
        durationMs: performance.now() - startMs,
        vmCount: VM_COUNT,
        mainResult: null,
        metrics: await this.metrics.getFinalMetrics(),
        validationPassed: false,
        gaReady: false,
        errors: [errorMsg],
      };
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * Abort running test
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.runner.abort();
      logger.warn('Test abort signal sent');
    }
  }

  /**
   * Check if test is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async validateEnvironment(): Promise<void> {
    logger.info('Phase 1: Validating environment...');

    // Check database connectivity
    const dbStart = performance.now();
    try {
      await this.pool.query('SELECT 1');
      logger.info(`  ✓ Database connected (${(performance.now() - dbStart).toFixed(0)}ms)`);
    } catch (error) {
      throw new Error(`Database connectivity failed: ${error}`);
    }

    // Check disk space
    const { statfsSync } = require('fs');
    const stats = statfsSync(process.cwd());
    const freeSpaceGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    if (freeSpaceGB < 10) {
      throw new Error(`Insufficient disk space: ${freeSpaceGB.toFixed(2)}GB (need 10GB)`);
    }
    logger.info(`  ✓ Disk space: ${freeSpaceGB.toFixed(2)}GB available`);

    // Check memory
    const memUsage = process.memoryUsage();
    const freeMemMB = (require('os').freemem()) / (1024 ** 2);
    if (freeMemMB < 2048) {
      throw new Error(`Insufficient memory: ${freeMemMB.toFixed(0)}MB free (need 2GB)`);
    }
    logger.info(`  ✓ Memory: ${freeMemMB.toFixed(0)}MB available`);

    logger.info('  ✓ Environment validation complete\n');
  }

  private async prepareDatabase(): Promise<void> {
    logger.info('Phase 2: Preparing database...');

    // Create test tables
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS load_test_vms (
        id VARCHAR(255) PRIMARY KEY,
        test_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        metrics JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS load_test_metrics (
        id SERIAL PRIMARY KEY,
        test_id VARCHAR(255) NOT NULL,
        vm_id VARCHAR(255),
        metric_type VARCHAR(50) NOT NULL,
        metric_name VARCHAR(255) NOT NULL,
        metric_value NUMERIC NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_load_test_vms_test_id ON load_test_vms(test_id);
      CREATE INDEX IF NOT EXISTS idx_load_test_metrics_test_id ON load_test_metrics(test_id);
      CREATE INDEX IF NOT EXISTS idx_load_test_metrics_timestamp ON load_test_metrics(timestamp);
    `);

    // Insert VM records
    const vms: string[] = [];
    for (let i = 0; i < VM_COUNT; i++) {
      vms.push(`('vm-${i}', 'pending')`);
    }

    // Batch insert
    for (let i = 0; i < vms.length; i += BATCH_SIZE) {
      const batch = vms.slice(i, i + BATCH_SIZE);
      await this.pool.query(`
        INSERT INTO load_test_vms (id, status) VALUES ${batch.join(',')}
      `);
    }

    logger.info(`  ✓ ${VM_COUNT} VM records created`);
    logger.info('  ✓ Database preparation complete\n');
  }

  private async executeWarmup(): Promise<void> {
    logger.info('Phase 3: Warm-up (100 VMs)...');

    const warmupTest: LoadTest = {
      name: 'Warm-up Test (100 VMs)',
      sessions: 100,
      duration: 5,
      rampUp: 60,
      agentsPerSession: 4,
      workload: 'mixed',
      criteria: {
        maxLatencyMs: 500,
        maxErrorRate: 0.01,
        minThroughput: 100,
      },
    };

    const result = await this.runner.run(warmupTest);

    if (!result.success) {
      throw new Error('Warm-up test failed - aborting main test');
    }

    logger.info(`  ✓ Warm-up complete: ${result.success ? 'PASSED' : 'FAILED'}`);
    logger.info(`    Error Rate: ${(result.metrics.errorRate * 100).toFixed(2)}%`);
    logger.info(`    Avg Latency: ${result.metrics.avgLatencyMs.toFixed(2)}ms\n`);
  }

  private async executeMainTest(): Promise<TestResult> {
    logger.info('Phase 4: Main 1000 VM Sustained Load Test');
    logger.info('  Starting 1-hour sustained load test...');

    const mainTest: LoadTest = {
      name: '1000 VM Sustained Load Test',
      sessions: VM_COUNT,
      duration: TEST_DURATION_MINUTES,
      rampUp: RAMP_UP_SECONDS,
      agentsPerSession: 4,
      workload: 'mixed',
      criteria: CRITERIA_1000_VM,
    };

    // Progress reporting
    const progressInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(progressInterval);
        return;
      }

      const metrics = await this.metrics.collectCurrentMetrics();
      logger.info(`  [${new Date().toISOString()}] ` +
        `VMs: ${metrics.activeVMs}/${VM_COUNT} | ` +
        `Throughput: ${metrics.throughput.toFixed(0)}/s | ` +
        `Latency: ${metrics.avgLatency.toFixed(0)}ms | ` +
        `Errors: ${(metrics.errorRate * 100).toFixed(2)}%`
      );
    }, 60000); // Every minute

    const result = await this.runner.run(mainTest);
    clearInterval(progressInterval);

    // Store results in database
    await this.pool.query(`
      INSERT INTO load_test_results (test_id, success, result_data, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [mainTest.name, result.success, JSON.stringify(result)]);

    logger.info(`\n  ✓ Main test complete: ${result.success ? 'PASSED ✓' : 'FAILED ✗'}`);
    logger.info(`    Total Sessions: ${result.metrics.totalSessions}`);
    logger.info(`    Successful: ${result.metrics.successfulSessions}`);
    logger.info(`    Error Rate: ${(result.metrics.errorRate * 100).toFixed(2)}%`);
    logger.info(`    Avg Latency: ${result.metrics.avgLatencyMs.toFixed(2)}ms`);
    logger.info(`    P95 Latency: ${result.metrics.p95LatencyMs.toFixed(2)}ms`);
    logger.info(`    P99 Latency: ${result.metrics.p99LatencyMs.toFixed(2)}ms`);
    logger.info(`    Throughput: ${result.metrics.eventsPerSecond.toFixed(2)}/s\n`);

    return result;
  }

  private async executeCooldown(): Promise<void> {
    logger.info('Phase 5: Cool-down and cleanup...');

    // Wait for all VMs to complete
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const result = await this.pool.query(`
        SELECT COUNT(*) as active_count 
        FROM load_test_vms 
        WHERE status IN ('pending', 'running')
      `);

      const activeCount = parseInt(result.rows[0].active_count);
      if (activeCount === 0) {
        break;
      }

      logger.info(`  Waiting for ${activeCount} VMs to complete...`);
      await this.delay(5000);
      attempts++;
    }

    // Cleanup test data (keep results)
    if (!process.env['KEEP_TEST_DATA']) {
      await this.pool.query(`DELETE FROM load_test_vms WHERE test_id = $1`, ['1000-vm-test']);
    }

    logger.info('  ✓ Cool-down complete\n');
  }

  private isGAReady(result: TestResult): boolean {
    const checks = [
      result.success,
      result.metrics.errorRate <= CRITERIA_1000_VM.maxErrorRate,
      result.metrics.avgLatencyMs <= CRITERIA_1000_VM.maxLatencyMs,
      result.metrics.eventsPerSecond >= CRITERIA_1000_VM.minThroughput,
    ];

    return checks.every(c => c);
  }

  private async generateReport(result: VMTestResult): Promise<void> {
    const fs = require('fs');
    const path = require('path');

    const reportDir = path.join(process.cwd(), 'tests', 'load', 'reports', '1000-vm');
    fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `report-${result.testId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

    // Generate HTML report
    const htmlReport = this.generateHTMLReport(result);
    const htmlPath = path.join(reportDir, `report-${result.testId}.html`);
    fs.writeFileSync(htmlPath, htmlReport);

    logger.info(`Reports generated:`);
    logger.info(`  JSON: ${reportPath}`);
    logger.info(`  HTML: ${htmlPath}\n`);
  }

  private generateHTMLReport(result: VMTestResult): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>1000 VM Load Test Report - ${result.testId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: ${result.success ? '#28a745' : '#dc3545'}; }
    .status { font-size: 24px; font-weight: bold; padding: 15px; border-radius: 4px; background: ${result.success ? '#d4edda' : '#f8d7da'}; color: ${result.success ? '#155724' : '#721c24'}; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
    .metric-card { background: #f8f9fa; padding: 20px; border-radius: 4px; border-left: 4px solid #007bff; }
    .metric-value { font-size: 32px; font-weight: bold; color: #007bff; }
    .metric-label { color: #6c757d; font-size: 14px; }
    .ga-ready { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin: 20px 0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>1000 VM Load Test Report</h1>
    <div class="status">${result.success ? '✓ PASSED' : '✗ FAILED'}</div>
    
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${result.vmCount}</div>
        <div class="metric-label">Virtual Machines</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${((result.durationMs || 0) / 1000 / 60).toFixed(1)}m</div>
        <div class="metric-label">Duration</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${result.mainResult?.metrics.errorRate ? (result.mainResult.metrics.errorRate * 100).toFixed(2) : 'N/A'}%</div>
        <div class="metric-label">Error Rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${result.mainResult?.metrics.avgLatencyMs ? result.mainResult.metrics.avgLatencyMs.toFixed(0) : 'N/A'}ms</div>
        <div class="metric-label">Avg Latency</div>
      </div>
    </div>

    ${result.gaReady ? '<div class="ga-ready">✓ SYSTEM IS GA READY</div>' : '<div class="ga-ready" style="background: #f8d7da; color: #721c24;">✗ SYSTEM NOT GA READY</div>'}

    <h2>Test Details</h2>
    <p><strong>Test ID:</strong> ${result.testId}</p>
    <p><strong>Start Time:</strong> ${result.startTime}</p>
    <p><strong>End Time:</strong> ${result.endTime}</p>
    
    <h2>Performance Metrics</h2>
    <pre>${JSON.stringify(result.mainResult?.metrics, null, 2)}</pre>
  </div>
</body>
</html>
    `;
  }

  private logResult(result: VMTestResult): void {
    logger.info('╔════════════════════════════════════════════════════════╗');
    logger.info('║              1000 VM LOAD TEST COMPLETE                ║');
    logger.info('╚════════════════════════════════════════════════════════╝');
    logger.info(`Status: ${result.success ? '✓ PASSED' : '✗ FAILED'}`);
    logger.info(`GA Ready: ${result.gaReady ? '✓ YES' : '✗ NO'}`);
    logger.info(`Duration: ${(result.durationMs / 1000 / 60).toFixed(1)} minutes`);
    logger.info('');
    logger.info('Performance Metrics:');
    logger.info(`  VMs: ${result.vmCount}`);
    logger.info(`  Error Rate: ${(result.mainResult?.metrics.errorRate || 0 * 100).toFixed(2)}%`);
    logger.info(`  Avg Latency: ${result.mainResult?.metrics.avgLatencyMs || 0}ms`);
    logger.info(`  Throughput: ${result.mainResult?.metrics.eventsPerSecond || 0}/s`);
    logger.info('');

    if (result.gaReady) {
      logger.info('✅ PHASE 4 EXIT CRITERIA MET - PRODUCTION GA READY');
    } else {
      logger.info('❌ PHASE 4 EXIT CRITERIA NOT MET');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// VM Metrics Collector
// ============================================================================

class VMMetricsCollector {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async collectCurrentMetrics(): Promise<{
    activeVMs: number;
    throughput: number;
    avgLatency: number;
    errorRate: number;
  }> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as active_vms,
        AVG(CASE WHEN metric_name = 'throughput' THEN metric_value END) as throughput,
        AVG(CASE WHEN metric_name = 'latency' THEN metric_value END) as avg_latency,
        AVG(CASE WHEN metric_name = 'error_rate' THEN metric_value END) as error_rate
      FROM load_test_metrics
      WHERE timestamp >= NOW() - INTERVAL '1 minute'
    `);

    const row = result.rows[0];
    return {
      activeVMs: parseInt(row.active_vms) || 0,
      throughput: parseFloat(row.throughput) || 0,
      avgLatency: parseFloat(row.avg_latency) || 0,
      errorRate: parseFloat(row.error_rate) || 0,
    };
  }

  async getFinalMetrics(): Promise<Record<string, number>> {
    const result = await this.pool.query(`
      SELECT 
        metric_name,
        AVG(metric_value) as avg_value,
        MAX(metric_value) as max_value,
        MIN(metric_value) as min_value
      FROM load_test_metrics
      GROUP BY metric_name
    `);

    const metrics: Record<string, number> = {};
    for (const row of result.rows) {
      metrics[`${row.metric_name}_avg`] = parseFloat(row.avg_value) || 0;
      metrics[`${row.metric_name}_max`] = parseFloat(row.max_value) || 0;
      metrics[`${row.metric_name}_min`] = parseFloat(row.min_value) || 0;
    }

    return metrics;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface VMTestResult {
  success: boolean;
  testId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  vmCount: number;
  mainResult: TestResult | null;
  metrics: Record<string, number>;
  validationPassed: boolean;
  gaReady: boolean;
  errors?: string[];
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function run1000VMTest(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
  });

  const test = new VM1000LoadTest(pool);

  process.on('SIGINT', async () => {
    logger.info('\nReceived SIGINT, aborting test...');
    test.abort();
  });

  try {
    const result = await test.execute();
    process.exit(result.gaReady ? 0 : 1);
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  run1000VMTest();
}

export default VM1000LoadTest;

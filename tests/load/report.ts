/**
 * Report Generation for Load Testing
 * 
 * Generates HTML, JSON, and Markdown reports with charts and
 * pass/fail criteria visualization.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TestResult, CheckResult, AggregatedMetrics, ScenarioResult } from './framework';

// ============================================================================
// Report Types
// ============================================================================

export interface ReportOptions {
  /** Output directory */
  outputDir: string;
  /** Generate HTML report */
  html: boolean;
  /** Generate JSON report */
  json: boolean;
  /** Generate Markdown report */
  markdown: boolean;
  /** Include charts in HTML */
  includeCharts: boolean;
  /** Report title */
  title: string;
}

export interface ReportSummary {
  /** Test name */
  name: string;
  /** Test timestamp */
  timestamp: string;
  /** Overall status */
  status: 'passed' | 'failed' | 'degraded';
  /** Duration in seconds */
  duration: number;
  /** Total sessions */
  sessions: number;
  /** Success rate */
  successRate: number;
  /** Key metrics */
  metrics: {
    latency: number;
    errorRate: number;
    throughput: number;
    memoryGrowth: number;
  };
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: ReportOptions = {
  outputDir: './tests/load/reports',
  html: true,
  json: true,
  markdown: true,
  includeCharts: true,
  title: 'Godel Load Test Report',
};

// ============================================================================
// Report Generator
// ============================================================================

export class ReportGenerator {
  private options: ReportOptions;

  constructor(options: Partial<ReportOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ensureOutputDir();
  }

  /**
   * Generate all reports for a test result
   */
  generate(result: TestResult, options?: Partial<ReportOptions>): string[] {
    const opts = { ...this.options, ...options };
    const generatedFiles: string[] = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const testName = result.test.name.toLowerCase().replace(/\s+/g, '-');

    if (opts.html) {
      const htmlPath = join(opts.outputDir, `load-test-${testName}-${timestamp}.html`);
      writeFileSync(htmlPath, this.generateHtml(result));
      generatedFiles.push(htmlPath);
    }

    if (opts.json) {
      const jsonPath = join(opts.outputDir, `load-test-${testName}-${timestamp}.json`);
      writeFileSync(jsonPath, this.generateJson(result));
      generatedFiles.push(jsonPath);
    }

    if (opts.markdown) {
      const mdPath = join(opts.outputDir, `load-test-${testName}-${timestamp}.md`);
      writeFileSync(mdPath, this.generateMarkdown(result));
      generatedFiles.push(mdPath);
    }

    // Always generate summary
    const summaryPath = join(opts.outputDir, 'latest-summary.md');
    writeFileSync(summaryPath, this.generateSummary(result));
    generatedFiles.push(summaryPath);

    return generatedFiles;
  }

  /**
   * Generate HTML report with charts
   */
  generateHtml(result: TestResult): string {
    const { test, metrics, checks, scenarios, startTime } = result;
    const status = this.getStatus(result);
    const statusColor = status === 'passed' ? '#4CAF50' : status === 'degraded' ? '#FF9800' : '#F44336';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.options.title} - ${test.name}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f7fa;
      color: #333;
      line-height: 1.6;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }
    header {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 0.5rem 0;
      color: #1a202c;
      font-size: 2rem;
    }
    .subtitle {
      color: #718096;
      font-size: 1rem;
    }
    .status-badge {
      display: inline-block;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.875rem;
      margin-top: 1rem;
      background: ${statusColor}20;
      color: ${statusColor};
      border: 2px solid ${statusColor};
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .card h3 {
      margin: 0 0 1rem 0;
      color: #4a5568;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a202c;
    }
    .metric-unit {
      font-size: 1rem;
      color: #718096;
      font-weight: 400;
    }
    .metric-delta {
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .metric-delta.positive { color: #48bb78; }
    .metric-delta.negative { color: #f56565; }
    .chart-container {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .chart-wrapper {
      height: 300px;
      position: relative;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      font-weight: 600;
      color: #4a5568;
      background: #f7fafc;
    }
    tr:hover { background: #f7fafc; }
    .check-passed { color: #48bb78; font-weight: 600; }
    .check-failed { color: #f56565; font-weight: 600; }
    .check-warning { color: #ed8936; font-weight: 600; }
    .severity-critical { color: #f56565; }
    .severity-warning { color: #ed8936; }
    .severity-info { color: #4299e1; }
    .two-column {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1.5rem;
    }
    @media (max-width: 768px) {
      .container { padding: 1rem; }
      .two-column { grid-template-columns: 1fr; }
      .metric-value { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.options.title}</h1>
      <div class="subtitle">${test.name}</div>
      <div class="subtitle">Started: ${new Date(startTime).toLocaleString()}</div>
      <div class="subtitle">Duration: ${(result.durationMs / 1000).toFixed(1)}s</div>
      <span class="status-badge">${status.toUpperCase()}</span>
    </header>

    <!-- Key Metrics Grid -->
    <div class="grid">
      <div class="card">
        <h3>Total Sessions</h3>
        <div class="metric-value">${metrics.totalSessions}<span class="metric-unit"> / ${test.sessions}</span></div>
        <div class="metric-delta ${metrics.successfulSessions === metrics.totalSessions ? 'positive' : 'negative'}">
          ${metrics.successfulSessions} successful, ${metrics.failedSessions} failed
        </div>
      </div>
      
      <div class="card">
        <h3>Average Latency</h3>
        <div class="metric-value">${metrics.avgLatencyMs.toFixed(1)}<span class="metric-unit">ms</span></div>
        <div class="metric-delta">
          P95: ${metrics.p95LatencyMs.toFixed(1)}ms | P99: ${metrics.p99LatencyMs.toFixed(1)}ms
        </div>
      </div>
      
      <div class="card">
        <h3>Error Rate</h3>
        <div class="metric-value">${(metrics.errorRate * 100).toFixed(2)}<span class="metric-unit">%</span></div>
        <div class="metric-delta ${metrics.errorRate <= test.criteria.maxErrorRate ? 'positive' : 'negative'}">
          Target: ${(test.criteria.maxErrorRate * 100).toFixed(1)}%
        </div>
      </div>
      
      <div class="card">
        <h3>Throughput</h3>
        <div class="metric-value">${metrics.eventsPerSecond.toFixed(1)}<span class="metric-unit">/sec</span></div>
        <div class="metric-delta ${metrics.eventsPerSecond >= test.criteria.minThroughput ? 'positive' : 'negative'}">
          Target: ${test.criteria.minThroughput}/sec
        </div>
      </div>
      
      <div class="card">
        <h3>Memory Growth</h3>
        <div class="metric-value">${metrics.memoryGrowthMB.toFixed(1)}<span class="metric-unit">MB</span></div>
        <div class="metric-delta">
          Peak: ${metrics.peakMemoryMB.toFixed(1)}MB
        </div>
      </div>
      
      <div class="card">
        <h3>Success Rate</h3>
        <div class="metric-value">${((metrics.successfulSessions / metrics.totalSessions) * 100).toFixed(1)}<span class="metric-unit">%</span></div>
        <div class="metric-delta ${metrics.successfulSessions === metrics.totalSessions ? 'positive' : 'negative'}">
          ${metrics.successfulSessions}/${metrics.totalSessions} sessions
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="two-column">
      <div class="chart-container">
        <h3>Latency Distribution</h3>
        <div class="chart-wrapper">
          <canvas id="latencyChart"></canvas>
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Session Results</h3>
        <div class="chart-wrapper">
          <canvas id="sessionChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Pass/Fail Checks -->
    <div class="card">
      <h3>Pass/Fail Criteria</h3>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Severity</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${checks.map(check => `
            <tr>
              <td>${check.name}</td>
              <td>${check.expected}</td>
              <td>${check.actual}</td>
              <td class="severity-${check.severity}">${check.severity.toUpperCase()}</td>
              <td class="${check.passed ? 'check-passed' : 'check-failed'}">
                ${check.passed ? '✓ PASS' : '✗ FAIL'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Scenario Details -->
    <div class="card">
      <h3>Scenario Details (First 20)</h3>
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Swarm ID</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Agents</th>
            <th>Latency (avg)</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          ${scenarios.slice(0, 20).map(s => `
            <tr>
              <td>#${s.sessionIndex + 1}</td>
              <td><code>${s.teamId.slice(-12)}</code></td>
              <td class="${s.success ? 'check-passed' : 'check-failed'}">${s.success ? '✓' : '✗'}</td>
              <td>${(s.durationMs / 1000).toFixed(1)}s</td>
              <td>${s.agentsSpawned}</td>
              <td>${s.latency.avg.toFixed(1)}ms</td>
              <td>${s.errors.length}</td>
            </tr>
          `).join('')}
          ${scenarios.length > 20 ? `
            <tr>
              <td colspan="7" style="text-align: center; color: #718096;">
                ... and ${scenarios.length - 20} more scenarios
              </td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <!-- Configuration -->
    <div class="card">
      <h3>Test Configuration</h3>
      <table>
        <tbody>
          <tr><td><strong>Sessions</strong></td><td>${test.sessions}</td></tr>
          <tr><td><strong>Duration</strong></td><td>${test.duration} minutes</td></tr>
          <tr><td><strong>Ramp-up</strong></td><td>${test.rampUp} seconds</td></tr>
          <tr><td><strong>Agents per Session</strong></td><td>${test.agentsPerSession}</td></tr>
          <tr><td><strong>Workload Type</strong></td><td>${test.workload}</td></tr>
          <tr><td><strong>Max Latency</strong></td><td>${test.criteria.maxLatencyMs}ms</td></tr>
          <tr><td><strong>Max Error Rate</strong></td><td>${(test.criteria.maxErrorRate * 100).toFixed(1)}%</td></tr>
          <tr><td><strong>Min Throughput</strong></td><td>${test.criteria.minThroughput}/sec</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    // Latency Distribution Chart
    new Chart(document.getElementById('latencyChart'), {
      type: 'bar',
      data: {
        labels: ['Avg', 'P95', 'P99'],
        datasets: [{
          label: 'Latency (ms)',
          data: [${metrics.avgLatencyMs}, ${metrics.p95LatencyMs}, ${metrics.p99LatencyMs}],
          backgroundColor: ['#4299e1', '#ed8936', '#f56565'],
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Milliseconds' }
          }
        }
      }
    });

    // Session Results Chart
    new Chart(document.getElementById('sessionChart'), {
      type: 'doughnut',
      data: {
        labels: ['Successful', 'Failed'],
        datasets: [{
          data: [${metrics.successfulSessions}, ${metrics.failedSessions}],
          backgroundColor: ['#48bb78', '#f56565'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          }
        }
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  generateJson(result: TestResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate Markdown report
   */
  generateMarkdown(result: TestResult): string {
    const { test, metrics, checks, scenarios, startTime, durationMs } = result;
    const status = this.getStatus(result);

    return `# Load Test Report: ${test.name}

**Status:** ${status.toUpperCase()}  
**Started:** ${new Date(startTime).toLocaleString()}  
**Duration:** ${(durationMs / 1000).toFixed(1)}s

## Summary

| Metric | Value | Target |
|--------|-------|--------|
| Sessions | ${metrics.totalSessions}/${test.sessions} | ${test.sessions} |
| Success Rate | ${((metrics.successfulSessions / metrics.totalSessions) * 100).toFixed(1)}% | 100% |
| Avg Latency | ${metrics.avgLatencyMs.toFixed(1)}ms | ≤${test.criteria.maxLatencyMs}ms |
| P95 Latency | ${metrics.p95LatencyMs.toFixed(1)}ms | - |
| P99 Latency | ${metrics.p99LatencyMs.toFixed(1)}ms | - |
| Error Rate | ${(metrics.errorRate * 100).toFixed(2)}% | ≤${(test.criteria.maxErrorRate * 100).toFixed(1)}% |
| Throughput | ${metrics.eventsPerSecond.toFixed(1)}/sec | ≥${test.criteria.minThroughput}/sec |
| Memory Growth | ${metrics.memoryGrowthMB.toFixed(1)}MB | - |
| Peak Memory | ${metrics.peakMemoryMB.toFixed(1)}MB | - |

## Pass/Fail Criteria

| Check | Expected | Actual | Severity | Status |
|-------|----------|--------|----------|--------|
${checks.map(c => `| ${c.name} | ${c.expected} | ${c.actual} | ${c.severity.toUpperCase()} | ${c.passed ? '✓ PASS' : '✗ FAIL'} |`).join('\n')}

## Configuration

- **Sessions:** ${test.sessions}
- **Duration:** ${test.duration} minutes
- **Ramp-up:** ${test.rampUp} seconds
- **Agents per Session:** ${test.agentsPerSession}
- **Workload Type:** ${test.workload}
- **Max Latency:** ${test.criteria.maxLatencyMs}ms
- **Max Error Rate:** ${(test.criteria.maxErrorRate * 100).toFixed(1)}%
- **Min Throughput:** ${test.criteria.minThroughput}/sec

## Scenario Summary

- **Total:** ${scenarios.length} sessions
- **Successful:** ${metrics.successfulSessions}
- **Failed:** ${metrics.failedSessions}
- **Average Duration:** ${(scenarios.reduce((sum, s) => sum + s.durationMs, 0) / scenarios.length / 1000).toFixed(1)}s

## Failed Sessions

${scenarios.filter(s => !s.success).length === 0 ? '*No failed sessions*' : scenarios.filter(s => !s.success).map(s => `- Session #${s.sessionIndex + 1}: ${s.errors.join(', ')}`).join('\n')}

---
*Generated by Godel Load Testing Framework*
`;
  }

  /**
   * Generate summary report
   */
  generateSummary(result: TestResult): string {
    const { test, metrics } = result;
    const status = this.getStatus(result);

    return `# Latest Load Test Summary

**Test:** ${test.name}  
**Status:** ${status.toUpperCase()}  
**Timestamp:** ${new Date().toISOString()}

### Quick Stats

| Metric | Value |
|--------|-------|
| Sessions | ${metrics.totalSessions}/${test.sessions} |
| Success Rate | ${((metrics.successfulSessions / metrics.totalSessions) * 100).toFixed(1)}% |
| Avg Latency | ${metrics.avgLatencyMs.toFixed(1)}ms |
| Error Rate | ${(metrics.errorRate * 100).toFixed(2)}% |
| Throughput | ${metrics.eventsPerSecond.toFixed(1)}/sec |

### Success Criteria

| Scale | Sessions | Latency | Error Rate | Status |
|-------|----------|---------|------------|--------|
| Warm-up | 10 | <100ms | <1% | ${test.sessions === 10 ? (status === 'passed' ? '✓' : '✗') : '-'} |
| Production | 25 | <200ms | <1% | ${test.sessions === 25 ? (status === 'passed' ? '✓' : '✗') : '-'} |
| Stress | 50 | <500ms | <5% | ${test.sessions === 50 ? (status === 'passed' ? '✓' : '✗') : '-'} |
`;
  }

  /**
   * Generate summary from multiple results
   */
  generateMultiReport(results: TestResult[]): string {
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    return `# Load Test Suite Report

**Overall Status:** ${failed === 0 ? '✅ ALL PASSED' : failed === results.length ? '❌ ALL FAILED' : `⚠️ ${passed}/${results.length} PASSED`}

## Results by Scale

| Scale | Sessions | Latency | Error Rate | Status |
|-------|----------|---------|------------|--------|
${results.map(r => `| ${r.test.name} | ${r.metrics.totalSessions} | ${r.metrics.avgLatencyMs.toFixed(1)}ms | ${(r.metrics.errorRate * 100).toFixed(2)}% | ${r.success ? '✓ PASS' : '✗ FAIL'} |`).join('\n')}

## Success Criteria Matrix

| Scale | Sessions | Latency Target | Error Rate Target | Result |
|-------|----------|----------------|-------------------|--------|
| Warm-up | 10 | <100ms | <1% | ${this.getResultForScale(results, 10)} |
| Production | 25 | <200ms | <1% | ${this.getResultForScale(results, 25)} |
| Stress | 50 | <500ms | <5% | ${this.getResultForScale(results, 50)} |

## Detailed Results

${results.map(r => `
### ${r.test.name}
- **Duration:** ${(r.durationMs / 1000).toFixed(1)}s
- **Sessions:** ${r.metrics.successfulSessions}/${r.metrics.totalSessions} successful
- **Latency:** ${r.metrics.avgLatencyMs.toFixed(1)}ms (P95: ${r.metrics.p95LatencyMs.toFixed(1)}ms)
- **Throughput:** ${r.metrics.eventsPerSecond.toFixed(1)}/sec
- **Memory Growth:** ${r.metrics.memoryGrowthMB.toFixed(1)}MB
`).join('\n')}

---
*Generated by Godel Load Testing Framework*
`;
  }

  /**
   * Get result status
   */
  private getStatus(result: TestResult): 'passed' | 'failed' | 'degraded' {
    if (result.success) return 'passed';
    const criticalFailures = result.checks.filter(c => !c.passed && c.severity === 'critical').length;
    return criticalFailures > 0 ? 'failed' : 'degraded';
  }

  /**
   * Get result for specific scale
   */
  private getResultForScale(results: TestResult[], sessions: number): string {
    const result = results.find(r => r.test.sessions === sessions);
    if (!result) return '-';
    return result.success ? '✅ PASS' : '❌ FAIL';
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!existsSync(this.options.outputDir)) {
      mkdirSync(this.options.outputDir, { recursive: true });
    }
  }
}

// ============================================================================
// Export singleton
// ============================================================================

export const defaultGenerator = new ReportGenerator();

export default {
  ReportGenerator,
  defaultGenerator,
};

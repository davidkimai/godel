/**
 * Load Test Report Generator
 * 
 * Generates comprehensive reports from load test results.
 */

import { LoadTestResult, LoadMetrics } from '../loader';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface ReportOptions {
  outputDir: string;
  format: 'json' | 'html' | 'markdown' | 'all';
  includeTimeline: boolean;
  compareWith?: string; // Path to previous report for comparison
}

export interface ComparisonResult {
  metric: string;
  previous: number;
  current: number;
  change: number; // Percentage change
  improved: boolean;
}

/**
 * Generate comprehensive load test report
 */
export async function generateReport(
  result: LoadTestResult,
  options: Partial<ReportOptions> = {}
): Promise<string> {
  const opts: ReportOptions = {
    outputDir: './reports',
    format: 'all',
    includeTimeline: true,
    ...options,
  };

  // Ensure output directory exists
  if (!existsSync(opts.outputDir)) {
    mkdirSync(opts.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basePath = join(opts.outputDir, `load-test-${timestamp}`);

  const outputs: string[] = [];

  if (opts.format === 'all' || opts.format === 'json') {
    const jsonPath = `${basePath}.json`;
    generateJSONReport(result, jsonPath);
    outputs.push(jsonPath);
  }

  if (opts.format === 'all' || opts.format === 'html') {
    const htmlPath = `${basePath}.html`;
    generateHTMLReport(result, htmlPath, opts);
    outputs.push(htmlPath);
  }

  if (opts.format === 'all' || opts.format === 'markdown') {
    const mdPath = `${basePath}.md`;
    generateMarkdownReport(result, mdPath, opts);
    outputs.push(mdPath);
  }

  return outputs.join(', ');
}

/**
 * Generate JSON report
 */
function generateJSONReport(result: LoadTestResult, path: string): void {
  writeFileSync(path, JSON.stringify(result, null, 2));
}

/**
 * Generate HTML report
 */
function generateHTMLReport(
  result: LoadTestResult,
  path: string,
  options: ReportOptions
): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Report - ${result.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 {
      color: ${result.passed ? '#28a745' : '#dc3545'};
      margin-bottom: 10px;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
      background: ${result.passed ? '#d4edda' : '#f8d7da'};
      color: ${result.passed ? '#155724' : '#721c24'};
    }
    .meta {
      margin: 20px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .meta-item {
      display: flex;
      justify-content: space-between;
    }
    .meta-label {
      font-weight: 600;
      color: #666;
    }
    h2 {
      margin: 30px 0 15px;
      color: #444;
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 10px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }
    .metric-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #007bff;
    }
    .metric-card.error {
      border-left-color: #dc3545;
    }
    .metric-card.success {
      border-left-color: #28a745;
    }
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      color: #333;
    }
    .metric-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .latency-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .latency-table th,
    .latency-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e9ecef;
    }
    .latency-table th {
      background: #f8f9fa;
      font-weight: 600;
    }
    .violations {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .violations h3 {
      color: #721c24;
      margin-bottom: 10px;
    }
    .violations ul {
      margin-left: 20px;
      color: #721c24;
    }
    .timeline {
      height: 200px;
      background: #f8f9fa;
      border-radius: 4px;
      margin: 20px 0;
      position: relative;
    }
    .error-breakdown {
      margin: 20px 0;
    }
    .error-item {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      border-bottom: 1px solid #e9ecef;
    }
    .error-item:last-child {
      border-bottom: none;
    }
    .timestamp {
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Load Test Report <span class="status">${result.passed ? 'PASSED' : 'FAILED'}</span></h1>
    <p class="timestamp">Test ID: ${result.id}</p>
    <p class="timestamp">Generated: ${new Date().toISOString()}</p>

    <div class="meta">
      <h3>Test Configuration</h3>
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Agents:</span>
          <span>${result.config.agentCount}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Duration:</span>
          <span>${result.config.duration}s</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Request Rate:</span>
          <span>${result.config.requestRate}/s per agent</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Target:</span>
          <span>${result.config.target}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Start:</span>
          <span>${result.startTime.toISOString()}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">End:</span>
          <span>${result.endTime.toISOString()}</span>
        </div>
      </div>
    </div>

    <h2>Summary Metrics</h2>
    <div class="metrics-grid">
      <div class="metric-card ${result.metrics.successRate >= 99.9 ? 'success' : 'error'}">
        <div class="metric-value">${result.metrics.successRate.toFixed(2)}%</div>
        <div class="metric-label">Success Rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${result.metrics.totalRequests.toLocaleString()}</div>
        <div class="metric-label">Total Requests</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${result.metrics.throughput.requestsPerSecond.toFixed(1)}</div>
        <div class="metric-label">Req/s Throughput</div>
      </div>
      <div class="metric-card ${result.metrics.latencies.p95 <= 1000 ? 'success' : 'error'}">
        <div class="metric-value">${result.metrics.latencies.p95}ms</div>
        <div class="metric-label">P95 Latency</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${result.metrics.latencies.p99}ms</div>
        <div class="metric-label">P99 Latency</div>
      </div>
      <div class="metric-card ${result.metrics.errorRate <= 0.1 ? 'success' : 'error'}">
        <div class="metric-value">${result.metrics.errorRate.toFixed(2)}%</div>
        <div class="metric-label">Error Rate</div>
      </div>
    </div>

    <h2>Latency Distribution</h2>
    <table class="latency-table">
      <thead>
        <tr>
          <th>Percentile</th>
          <th>Latency (ms)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Min</td>
          <td>${result.metrics.latencies.min}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>Mean</td>
          <td>${result.metrics.latencies.mean.toFixed(2)}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>Median (P50)</td>
          <td>${result.metrics.latencies.median}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>P95</td>
          <td>${result.metrics.latencies.p95}</td>
          <td>${result.metrics.latencies.p95 <= result.config.successCriteria.maxP95Latency ? '✓' : '✗'}</td>
        </tr>
        <tr>
          <td>P99</td>
          <td>${result.metrics.latencies.p99}</td>
          <td>${result.metrics.latencies.p99 <= result.config.successCriteria.maxP99Latency ? '✓' : '✗'}</td>
        </tr>
        <tr>
          <td>P99.9</td>
          <td>${result.metrics.latencies.p99_9}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>Max</td>
          <td>${result.metrics.latencies.max}</td>
          <td>-</td>
        </tr>
      </tbody>
    </table>

    ${result.violations.length > 0 ? `
    <div class="violations">
      <h3>⚠️ Success Criteria Violations</h3>
      <ul>
        ${result.violations.map(v => `<li>${v}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <h2>Error Breakdown</h2>
    <div class="error-breakdown">
      ${result.metrics.errors.length > 0 
        ? result.metrics.errors.map(e => `
          <div class="error-item">
            <span>${e.type}</span>
            <span>${e.count} (${e.percentage.toFixed(2)}%)</span>
          </div>
        `).join('')
        : '<p>No errors recorded</p>'
      }
    </div>
  </div>
</body>
</html>`;

  writeFileSync(path, html);
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(
  result: LoadTestResult,
  path: string,
  options: ReportOptions
): void {
  const md = `# Load Test Report

**Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}

**Test ID:** ${result.id}  
**Generated:** ${new Date().toISOString()}

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Agents | ${result.config.agentCount} |
| Duration | ${result.config.duration}s |
| Ramp-up Time | ${result.config.rampUpTime}s |
| Request Rate | ${result.config.requestRate}/s per agent |
| Target | ${result.config.target} |
| Scenario | ${result.config.scenario} |
| Timeout | ${result.config.timeout}ms |

**Time Range:** ${result.startTime.toISOString()} - ${result.endTime.toISOString()}

---

## Summary Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Success Rate | ${result.metrics.successRate.toFixed(2)}% | ≥ ${result.config.successCriteria.minSuccessRate}% | ${result.metrics.successRate >= result.config.successCriteria.minSuccessRate ? '✓' : '✗'} |
| Total Requests | ${result.metrics.totalRequests.toLocaleString()} | - | - |
| Successful | ${result.metrics.successfulRequests.toLocaleString()} | - | - |
| Failed | ${result.metrics.failedRequests.toLocaleString()} | - | - |
| Error Rate | ${result.metrics.errorRate.toFixed(2)}% | ≤ ${result.config.successCriteria.maxErrorRate}% | ${result.metrics.errorRate <= result.config.successCriteria.maxErrorRate ? '✓' : '✗'} |
| Throughput | ${result.metrics.throughput.requestsPerSecond.toFixed(1)} req/s | - | - |

---

## Latency Distribution

| Percentile | Latency (ms) | Threshold | Status |
|------------|--------------|-----------|--------|
| Min | ${result.metrics.latencies.min} | - | - |
| Mean | ${result.metrics.latencies.mean.toFixed(2)} | - | - |
| Median (P50) | ${result.metrics.latencies.median} | - | - |
| P95 | ${result.metrics.latencies.p95} | ≤ ${result.config.successCriteria.maxP95Latency}ms | ${result.metrics.latencies.p95 <= result.config.successCriteria.maxP95Latency ? '✓' : '✗'} |
| P99 | ${result.metrics.latencies.p99} | ≤ ${result.config.successCriteria.maxP99Latency}ms | ${result.metrics.latencies.p99 <= result.config.successCriteria.maxP99Latency ? '✓' : '✗'} |
| P99.9 | ${result.metrics.latencies.p99_9} | - | - |
| Max | ${result.metrics.latencies.max} | - | - |

---

## Success Criteria

${result.violations.length === 0 
  ? '✅ All success criteria met.'
  : `❌ **${result.violations.length} violation(s) detected:**

${result.violations.map(v => `- ${v}`).join('\n')}`
}

---

## Error Breakdown

${result.metrics.errors.length > 0 
  ? `| Error Type | Count | Percentage |
|------------|-------|------------|
${result.metrics.errors.map(e => `| ${e.type} | ${e.count} | ${e.percentage.toFixed(2)}% |`).join('\n')}`
  : 'No errors recorded.'
}

---

## Agent Statistics

${result.metrics.agentStats.slice(0, 10).map(a => 
  `- **${a.agentId}**: ${a.requests} requests, ${(a.success/a.requests*100).toFixed(1)}% success, avg ${a.avgLatency.toFixed(0)}ms`
).join('\n')}

${result.metrics.agentStats.length > 10 ? `\n... and ${result.metrics.agentStats.length - 10} more agents` : ''}

---

*Report generated by Godel Load Testing Framework*
`;

  writeFileSync(path, md);
}

/**
 * Compare two load test results
 */
export function compareResults(
  previous: LoadTestResult,
  current: LoadTestResult
): ComparisonResult[] {
  return [
    compareMetric('Success Rate (%)', previous.metrics.successRate, current.metrics.successRate),
    compareMetric('P95 Latency (ms)', previous.metrics.latencies.p95, current.metrics.latencies.p95, true),
    compareMetric('P99 Latency (ms)', previous.metrics.latencies.p99, current.metrics.latencies.p99, true),
    compareMetric('Error Rate (%)', previous.metrics.errorRate, current.metrics.errorRate, true),
    compareMetric('Throughput (req/s)', previous.metrics.throughput.requestsPerSecond, current.metrics.throughput.requestsPerSecond),
  ];
}

function compareMetric(
  metric: string,
  previous: number,
  current: number,
  lowerIsBetter = false
): ComparisonResult {
  const change = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const improved = lowerIsBetter ? change < 0 : change > 0;
  
  return {
    metric,
    previous,
    current,
    change,
    improved,
  };
}

export default {
  generateReport,
  compareResults,
};

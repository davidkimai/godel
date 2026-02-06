# Godel Load Testing Framework

Session-based load testing framework for Godel agent orchestration platform.

## Overview

This framework provides comprehensive load testing capabilities for validating Godel's scalability up to 50 concurrent sessions. Each session simulates a swarm with 1 Coordinator and 3 Workers.

## Quick Start

```bash
# Run 10-session warm-up test
npm run test:load:10

# Run 25-session production load test
npm run test:load:25

# Run 50-session stress test
npm run test:load:50

# Run all scenarios sequentially
npm run test:load:all
```

## Usage

### Command Line

```bash
npm run test:load -- [options]

Options:
  --scale <n|all>      Test scale: 10, 25, 50, or 'all' (default: 10)
  -o, --output <dir>   Output directory (default: ./tests/load/reports)
  -v, --verbose        Enable verbose logging
  --all                Run all scales
  --stop-on-failure    Stop on first failed test
  --no-recovery        Skip recovery time measurement
  -d, --duration <m>   Override test duration (minutes)
  -h, --help           Show help
```

### Programmatic Usage

```typescript
import { LoadTestRunner, PredefinedTests } from './tests/load';

const runner = new LoadTestRunner({
  outputDir: './reports',
  verbose: true,
});

// Use predefined test
const test = PredefinedTests.warmUp(); // 10 sessions
// const test = PredefinedTests.production(); // 25 sessions
// const test = PredefinedTests.stress(); // 50 sessions

const result = await runner.run(test);
console.log(`Test ${result.success ? 'PASSED' : 'FAILED'}`);
```

## Test Scenarios

| Scale | Sessions | Duration | Workload | Latency Target | Error Rate |
|-------|----------|----------|----------|----------------|------------|
| Warm-up | 10 | 10 min | Code review | <100ms | <1% |
| Production | 25 | 30 min | Mixed | <200ms | <1% |
| Stress | 50 | 60 min | High intensity | <500ms | <5% |

## Architecture

```
tests/load/
├── framework.ts          # Core LoadTestRunner
├── metrics.ts            # Metrics collection (histograms, counters, gauges)
├── report.ts             # HTML/JSON/Markdown report generation
├── run.ts                # CLI entry point
├── index.ts              # Module exports
├── scenarios/
│   ├── 10-sessions.ts    # Warm-up test
│   ├── 25-sessions.ts    # Production load
│   └── 50-sessions.ts    # Stress test
└── reports/              # Generated reports
```

## Metrics

### Collected Metrics

- **Latency**: P50, P95, P99 response times
- **Throughput**: Events per second, operations per minute
- **Errors**: Error count and rate by type
- **Resources**: Memory usage, CPU utilization
- **Queue**: Queue depth, processing lag

### Report Formats

1. **HTML Report**: Interactive charts and detailed tables
2. **JSON Report**: Raw data for programmatic analysis
3. **Markdown Summary**: Human-readable summary

## Success Criteria

Tests are evaluated against these criteria:

| Metric | Warm-up (10) | Production (25) | Stress (50) |
|--------|--------------|-----------------|-------------|
| Latency | <100ms | <200ms | <500ms |
| Error Rate | <1% | <1% | <5% |
| Throughput | >50/s | >100/s | >150/s |
| Memory Growth | <100MB | <250MB | <500MB |

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Load Test
  run: |
    npm run test:load:10
    npm run test:load:25
```

The test runner exits with code 0 on success, non-zero on failure.

## Custom Tests

```typescript
import { LoadTestRunner, type LoadTest } from './tests/load';

const customTest: LoadTest = {
  name: 'Custom Load Test',
  sessions: 15,
  duration: 15,
  rampUp: 45,
  agentsPerSession: 4,
  workload: 'mixed',
  criteria: {
    maxLatencyMs: 150,
    maxErrorRate: 0.02,
    minThroughput: 75,
  },
};

const runner = new LoadTestRunner();
const result = await runner.run(customTest);
```

## License

MIT

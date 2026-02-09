# Boot Time Benchmark Report

Generated: 2026-02-09T01:40:45.079Z
Target: <100ms P95
Iterations: 1000

## Summary

| Metric | Cold Start | Warm Start | Status |
|--------|------------|------------|--------|
| P50 | 82.30ms | 1.18ms | - |
| P95 | 98.42ms | 2.35ms | ✓ PASS |
| P99 | 104.75ms | 4.99ms | - |
| Mean | 81.81ms | 1.64ms | - |
| Min | 52.20ms | 0.02ms | - |
| Max | 125.48ms | 14.23ms | - |

## Detailed Metrics

| Component | P50 | P95 | Mean |
|-----------|-----|-----|------|
| K8s Scheduling | 25.10ms | 35.07ms | 25.44ms |
| VM Creation | 38.09ms | 49.37ms | 38.20ms |
| Container Start | 18.10ms | 25.09ms | 18.17ms |

## Validation

- Target Met: ✓ YES
- Regression Detected: ✓ NO

## Comparison Charts

### Cold vs Warm Start

```
Cold:  ███████████████████████████████████████░ 98.4ms
Warm:  █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2.3ms
Target:████████████████████████████████████████ 100ms
```

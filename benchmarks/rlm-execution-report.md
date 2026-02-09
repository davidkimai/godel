# RLM Execution Benchmark Report

Generated: 2026-02-08T07:21:05.390Z

## Spawn Time

P95 Spawn Time: 5.04ms
Target: <100ms
Status: ✓ PASS

## Throughput

| Mode | Concurrency | Throughput (calls/sec) |
|------|-------------|------------------------|
| Sequential | 1 | 163.49 |
| Parallel | 1 | 169.15 |
| Parallel | 10 | 2150.85 |
| Parallel | 50 | 7635.00 |
| Parallel | 100 | 15106.79 |
| Parallel | 500 | 18857.10 |
| Parallel | 1000 | 15558.35 |
| Max Throughput | 1000 | 6806.02 |

## 1000 Agent Test

- Total Agents: 1000
- Successful: 1000
- Failed: 0
- Total Time: 146.93ms
- Status: ✓ PASS

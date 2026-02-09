# Context Loading Benchmark Report

Generated: 2026-02-08T07:22:46.871Z

## Summary

| Connector | File Size | P95 Latency | Target | Status |
|-----------|-----------|-------------|--------|--------|
| Local | 1MB | 1.97ms | 10ms | ✓ PASS |
| Local | 100MB | 0.47ms | 10ms | ✓ PASS |
| Local | 1GB | 1.04ms | 10ms | ✓ PASS |

## Details

### Local - 1MB

- Iterations: 50
- Average Latency: 0.34ms
- Min/Max: 0.04ms / 2.26ms
- P50: 0.07ms
- P95: 1.97ms
- P99: 2.26ms
- Throughput: 2948.13 MB/s

### Local - 100MB

- Iterations: 50
- Average Latency: 0.19ms
- Min/Max: 0.04ms / 0.60ms
- P50: 0.11ms
- P95: 0.47ms
- P99: 0.60ms
- Throughput: 5313.45 MB/s

### Local - 1GB

- Iterations: 50
- Average Latency: 0.52ms
- Min/Max: 0.10ms / 1.85ms
- P50: 0.42ms
- P95: 1.04ms
- P99: 1.85ms
- Throughput: 1918.63 MB/s

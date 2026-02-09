# OOLONG-Pairs Benchmark Report

Generated: 2026-02-08T07:22:27.561Z

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Passed | 13 |
| Failed | 2 |
| **F1 Score** | **86.7%** |

## Comparison to GPT-5

| Model | F1 Score |
|-------|----------|
| GPT-5 Baseline | 45.0% |
| RLM (This Run) | 86.7% |
| Improvement | +92.6% |
| Target (>50%) | ✓ PASS |

## Execution Metrics

- Average Task Time: 0.27ms
- Total Time: 4.00ms
- Total Agent Calls: 11722

## Detailed Results

| Task ID | Type | Complexity | Match | F1 Score |
|---------|------|------------|-------|----------|
| OOLONG-R1 | recursive | linear | ✓ | 100.0% |
| OOLONG-R2 | recursive | quadratic | ✓ | 100.0% |
| OOLONG-R3 | recursive | linear | ✓ | 100.0% |
| OOLONG-R4 | recursive | linear | ✓ | 100.0% |
| OOLONG-R5 | recursive | linear | ✓ | 100.0% |
| OOLONG-R6 | recursive | quadratic | ✓ | 100.0% |
| OOLONG-P1 | parallel | linear | ✗ | 0.0% |
| OOLONG-P2 | parallel | linear | ✓ | 100.0% |
| OOLONG-P3 | parallel | linear | ✗ | 0.0% |
| OOLONG-S1 | sequential | linear | ✓ | 100.0% |
| OOLONG-S2 | sequential | quadratic | ✓ | 100.0% |
| OOLONG-C1 | recursive | linear | ✓ | 100.0% |
| OOLONG-C2 | parallel | linear | ✓ | 100.0% |
| OOLONG-E1 | recursive | linear | ✓ | 100.0% |
| OOLONG-E2 | recursive | linear | ✓ | 100.0% |

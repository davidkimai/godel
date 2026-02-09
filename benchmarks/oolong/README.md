# OOLONG Benchmark Suite

Production-grade benchmark for evaluating RLM recursive decomposition capabilities.

## Overview

This benchmark implements the OOLONG-Pairs task from SPEC-003 Section 7.1, measuring F1 score on quadratic complexity (O(N²)) comparison tasks.

## Quick Start

```bash
# Run full OOLONG benchmark
npm run benchmark:oolong

# Run specific complexity level
npm run benchmark:oolong -- --complexity=linear
npm run benchmark:oolong -- --complexity=quadratic
npm run benchmark:oolong -- --complexity=exponential

# Run with specific dataset size
npm run benchmark:oolong -- --chunks=1000
```

## Architecture

The OOLONG benchmark uses RLM recursive decomposition:

1. **Input:** N chunks of text/documents
2. **Task:** Compare every chunk with every other chunk (N² comparisons)
3. **RLM Solution:**
   - Programmatically chunk input
   - Delegate sub-tasks to child RLMWorker agents
   - Aggregate results hierarchically
   - Report F1 score vs ground truth

## Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **F1 Score** | >50% | 580x improvement over GPT-5 baseline (<0.1%) |
| **Cost** | Competitive | ~$0.33 vs GPT-5 $0.16 |
| **Context** | 10M+ tokens | Two orders of magnitude beyond context windows |

## Results

Benchmark results are saved to `benchmark-results/oolong/` with:
- F1 scores by complexity level
- Execution times
- Cost breakdowns
- Decomposition metrics

## Documentation

See `docs/OOLONG_BENCHMARK.md` for detailed methodology.

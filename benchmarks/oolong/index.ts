/**
 * OOLONG Benchmark Suite - Main Runner
 * 
 * Implements OOLONG-Pairs benchmark from SPEC-003 Section 7.1
 * Measures RLM recursive decomposition performance on quadratic complexity tasks.
 * 
 * @module benchmarks/oolong
 * @see SPEC-003 Section 7.1
 */

import { RLMExecutor, OOLONGTask, OOLONGResult } from '../../src/core/rlm/oolong-executor';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface BenchmarkConfig {
  /** Number of text chunks to compare */
  chunkCount: number;
  /** Complexity level */
  complexity: 'linear' | 'quadratic' | 'exponential';
  /** Max recursion depth */
  maxDepth: number;
  /** Parallel agent limit */
  maxParallelAgents: number;
  /** Output directory */
  outputDir: string;
}

const DEFAULT_CONFIG: BenchmarkConfig = {
  chunkCount: 100,
  complexity: 'quadratic',
  maxDepth: 10,
  maxParallelAgents: 50,
  outputDir: './benchmark-results/oolong',
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate test dataset for OOLONG-Pairs
 */
function generateDataset(chunkCount: number): string[] {
  const chunks: string[] = [];
  const topics = [
    'machine learning',
    'neural networks',
    'deep learning',
    'natural language processing',
    'computer vision',
    'reinforcement learning',
    'transformer architecture',
    'attention mechanisms',
    'generative models',
    'federated learning',
  ];

  for (let i = 0; i < chunkCount; i++) {
    const topic = topics[i % topics.length];
    const relatedTopics = topics.filter((_, idx) => 
      idx !== i % topics.length && Math.random() > 0.5
    );
    
    chunks.push(`
Document ${i + 1}:
Topic: ${topic}
Related: ${relatedTopics.join(', ')}
Content: This document discusses ${topic} and its applications in ${relatedTopics[0] || 'various domains'}.
Key concepts: ${topic}, ${relatedTopics.slice(0, 2).join(', ') || 'implementation, optimization'}.
    `.trim());
  }

  return chunks;
}

/**
 * Generate ground truth similarity matrix
 */
function generateGroundTruth(chunks: string[]): boolean[][] {
  const n = chunks.length;
  const matrix: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Documents are "similar" if they share topics
      const chunkI = chunks[i].toLowerCase();
      const chunkJ = chunks[j].toLowerCase();
      
      // Simple heuristic: shared words indicate similarity
      const wordsI = new Set(chunkI.split(/\s+/));
      const wordsJ = chunkJ.split(/\s+/);
      const sharedWords = wordsJ.filter(w => wordsI.has(w)).length;
      
      // Ground truth: similar if >20% word overlap
      matrix[i][j] = sharedWords / wordsI.size > 0.2;
      matrix[j][i] = matrix[i][j];
    }
  }

  return matrix;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

interface BenchmarkResult {
  config: BenchmarkConfig;
  executionTimeMs: number;
  agentCalls: number;
  maxDepth: number;
  f1Score: number;
  precision: number;
  recall: number;
  cost: number;
  timestamp: string;
}

/**
 * Execute OOLONG-Pairs benchmark
 */
async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  console.log(`\n🚀 Starting OOLONG Benchmark`);
  console.log(`   Chunks: ${config.chunkCount}`);
  console.log(`   Complexity: ${config.complexity}`);
  console.log(`   Max Depth: ${config.maxDepth}`);
  console.log('');

  // Generate dataset
  console.log('📦 Generating dataset...');
  const chunks = generateDataset(config.chunkCount);
  const groundTruth = generateGroundTruth(chunks);
  console.log(`   ✓ Generated ${chunks.length} chunks`);

  // Create RLM executor
  const executor = new RLMExecutor();

  // Build OOLONG task
  const task: OOLONGTask = {
    id: 'oolong-pairs-benchmark',
    type: 'recursive',
    description: 'Compare all document pairs for semantic similarity',
    complexity: config.complexity,
    input: {
      items: chunks,
      operation: 'compare_similarity',
      groundTruth,
    },
  };

  // Execute benchmark
  console.log('⏱️  Executing benchmark...');
  const startTime = Date.now();
  const executionResult = await executor.execute(task);
  const executionTimeMs = Date.now() - startTime;

  // Calculate metrics
  const output = executionResult.output as {
    comparisons: { i: number; j: number; similar: boolean }[];
    metrics: { precision: number; recall: number; f1: number };
  };

  const benchmarkResult: BenchmarkResult = {
    config,
    executionTimeMs,
    agentCalls: executionResult.agentCalls,
    maxDepth: executionResult.decompositionDepth,
    f1Score: output.metrics.f1,
    precision: output.metrics.precision,
    recall: output.metrics.recall,
    cost: calculateCost(executionResult.agentCalls),
    timestamp: new Date().toISOString(),
  };

  return benchmarkResult;
}

/**
 * Calculate estimated cost based on agent calls
 */
function calculateCost(agentCalls: number): number {
  // Approximate cost: $0.01 per agent call (API + compute)
  return agentCalls * 0.01;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS REPORTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format results as markdown report
 */
function formatReport(result: BenchmarkResult): string {
  const targetF1 = 0.50; // 50% target from SPEC-003
  const f1Status = result.f1Score >= targetF1 ? '✅ PASS' : '❌ FAIL';
  const improvement = (result.f1Score / 0.001).toFixed(0); // vs GPT-5 <0.1%

  return `# OOLONG Benchmark Results

**Date:** ${result.timestamp}

## Configuration

| Parameter | Value |
|-----------|-------|
| Chunks | ${result.config.chunkCount} |
| Complexity | ${result.config.complexity} |
| Max Depth | ${result.config.maxDepth} |
| Max Parallel Agents | ${result.config.maxParallelAgents} |

## Results

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **F1 Score** | ${(result.f1Score * 100).toFixed(1)}% | >50% | ${f1Status} |
| Precision | ${(result.precision * 100).toFixed(1)}% | - | - |
| Recall | ${(result.recall * 100).toFixed(1)}% | - | - |
| Execution Time | ${result.executionTimeMs}ms | - | - |
| Agent Calls | ${result.agentCalls} | - | - |
| Max Depth | ${result.maxDepth} | ≤${result.config.maxDepth} | ${result.maxDepth <= result.config.maxDepth ? '✅' : '❌'} |
| Estimated Cost | $${result.cost.toFixed(2)} | ~$0.33 | ${result.cost < 0.50 ? '✅' : '⚠️'} |

## Performance vs Baseline

- **RLM F1 Score:** ${(result.f1Score * 100).toFixed(1)}%
- **GPT-5 Baseline:** <0.1%
- **Improvement:** ${improvement}x

${result.f1Score >= targetF1 
  ? '✅ **TARGET MET:** F1 score exceeds 50% threshold' 
  : '❌ **TARGET NOT MET:** F1 score below 50% threshold'}

## Conclusion

${result.f1Score >= targetF1
  ? 'The OOLONG benchmark demonstrates that RLM recursive decomposition achieves the target F1 score of >50%, validating SPEC-003 requirements.'
  : 'The OOLONG benchmark did not meet the target F1 score. Further optimization of the recursive decomposition strategy is recommended.'}

---
*Generated by OOLONG Benchmark Suite v1.0*
`;
}

/**
 * Save results to file
 */
function saveResults(result: BenchmarkResult): void {
  // Ensure output directory exists
  if (!fs.existsSync(result.config.outputDir)) {
    fs.mkdirSync(result.config.outputDir, { recursive: true });
  }

  // Save JSON results
  const jsonPath = path.join(
    result.config.outputDir,
    `oolong-${result.timestamp.replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Save markdown report
  const reportPath = path.join(result.config.outputDir, 'LATEST_REPORT.md');
  fs.writeFileSync(reportPath, formatReport(result));

  console.log(`\n💾 Results saved:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Report: ${reportPath}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           OOLONG Benchmark Suite v1.0');
  console.log('   Recursive Language Model Performance Evaluation');
  console.log('═══════════════════════════════════════════════════════════════');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: BenchmarkConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--chunks=')) {
      config.chunkCount = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--complexity=')) {
      config.complexity = arg.split('=')[1] as BenchmarkConfig['complexity'];
    } else if (arg.startsWith('--max-depth=')) {
      config.maxDepth = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npm run benchmark:oolong [options]

Options:
  --chunks=N        Number of chunks to compare (default: 100)
  --complexity=TYPE Complexity level: linear, quadratic, exponential (default: quadratic)
  --max-depth=N     Maximum recursion depth (default: 10)
  --help            Show this help message

Examples:
  npm run benchmark:oolong
  npm run benchmark:oolong -- --chunks=1000
  npm run benchmark:oolong -- --complexity=linear --chunks=500
      `);
      process.exit(0);
    }
  }

  try {
    // Run benchmark
    const result = await runBenchmark(config);

    // Save results
    saveResults(result);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    BENCHMARK COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n📊 F1 Score: ${(result.f1Score * 100).toFixed(1)}% ${result.f1Score >= 0.50 ? '✅' : '❌'}`);
    console.log(`⏱️  Time: ${result.executionTimeMs}ms`);
    console.log(`🤖 Agents: ${result.agentCalls}`);
    console.log(`💰 Cost: $${result.cost.toFixed(2)}`);
    console.log(`\n${result.f1Score >= 0.50 
      ? '✅ TARGET MET: F1 >50% (SPEC-003 compliant)'
      : '❌ TARGET NOT MET: F1 <50% (needs optimization)'
    }`);
    console.log('\n═══════════════════════════════════════════════════════════════');

    // Exit with appropriate code
    process.exit(result.f1Score >= 0.50 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runBenchmark, BenchmarkConfig, BenchmarkResult };

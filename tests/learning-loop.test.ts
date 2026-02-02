/**
 * Test script for Learning Loop (Phase 4B)
 * 
 * Verifies:
 * - LearningEngine records improvements
 * - ImprovementStore stores data
 * - Strategy effectiveness tracking
 * - A/B testing framework
 * - Learning data accumulation
 */

import { getDb } from '../storage/sqlite';
import {
  LearningEngine,
  ImprovementStore,
  getLearningEngine,
  getImprovementStore,
  resetLearningEngine,
  resetImprovementStore,
} from '../integrations/openclaw';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests(): Promise<void> {
  console.log('🧪 Testing Learning Loop (Phase 4B)\n');

  let storage: Awaited<ReturnType<typeof getDb>>;
  let learningEngine: LearningEngine;
  let improvementStore: ImprovementStore;
  let passed = 0;
  let failed = 0;

  try {
    // Initialize storage
    console.log('📦 Initializing storage...');
    storage = await getDb({ dbPath: './test-learning.db' });
    
    // Reset singletons
    resetLearningEngine();
    resetImprovementStore();
    
    learningEngine = getLearningEngine(storage);
    improvementStore = getImprovementStore(storage);
    
    await learningEngine.initialize();
    await improvementStore.initialize();
    console.log('✅ Storage and engines initialized\n');

    // Test 1: Record improvements
    console.log('Test 1: Recording improvements to LearningEngine...');
    try {
      const improvementId1 = await learningEngine.recordImprovement({
        timestamp: new Date(),
        area: 'codeQuality',
        strategy: 'refactor-complex-functions',
        success: true,
        confidence: 0.95,
        budgetUsed: 0.5,
        durationMs: 30000,
        changes: 3,
        metrics: {
          testCoverageDelta: 5,
          bugsFixed: 2,
          performanceImprovement: 10,
        },
        context: {
          swarmId: 'swarm-test-1',
          agentCount: 2,
          modelUsed: 'claude-sonnet-4',
          toolsUsed: ['read', 'write', 'edit'],
        },
      });

      const improvementId2 = await learningEngine.recordImprovement({
        timestamp: new Date(),
        area: 'codeQuality',
        strategy: 'refactor-complex-functions',
        success: true,
        confidence: 0.9,
        budgetUsed: 0.3,
        durationMs: 20000,
        changes: 2,
        metrics: {
          testCoverageDelta: 3,
          bugsFixed: 1,
        },
        context: {
          swarmId: 'swarm-test-2',
          agentCount: 1,
          modelUsed: 'claude-sonnet-4',
          toolsUsed: ['read', 'edit'],
        },
      });

      console.log(`  ✅ Recorded improvement 1: ${improvementId1}`);
      console.log(`  ✅ Recorded improvement 2: ${improvementId2}`);
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 2: Store improvements
    console.log('\nTest 2: Storing improvements to ImprovementStore...');
    try {
      const storeId1 = await improvementStore.store({
        timestamp: new Date(),
        area: 'documentation',
        strategy: 'add-jsdoc-comments',
        success: true,
        confidence: 0.88,
        budgetUsed: 0.25,
        durationMs: 15000,
        changes: 10,
        metrics: {
          documentationCoverage: 15,
          filesChanged: 5,
        },
        context: {
          swarmId: 'swarm-test-3',
          agentCount: 1,
          modelUsed: 'kimi-coding',
          toolsUsed: ['read', 'write'],
        },
        tags: ['documentation', 'success'],
      });

      console.log(`  ✅ Stored improvement: ${storeId1}`);
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 3: Strategy statistics tracking
    console.log('\nTest 3: Strategy statistics tracking...');
    try {
      await sleep(100); // Allow DB operations to complete
      
      const strategyStats = learningEngine.getStrategiesForArea('codeQuality');
      console.log(`  📊 Found ${strategyStats.length} strategies for codeQuality`);
      
      if (strategyStats.length > 0) {
        const refactorStrategy = strategyStats.find(s => s.strategy === 'refactor-complex-functions');
        if (refactorStrategy) {
          console.log(`  ✅ Strategy 'refactor-complex-functions':`);
          console.log(`     - Total attempts: ${refactorStrategy.totalAttempts}`);
          console.log(`     - Success rate: ${(refactorStrategy.successRate * 100).toFixed(1)}%`);
          console.log(`     - Avg budget: $${refactorStrategy.avgBudgetUsed.toFixed(2)}`);
          console.log(`     - Confidence: ${(refactorStrategy.confidenceScore * 100).toFixed(1)}%`);
          passed++;
        } else {
          console.error(`  ❌ Strategy not found in cache`);
          failed++;
        }
      } else {
        console.error(`  ❌ No strategies found`);
        failed++;
      }
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 4: Pattern identification
    console.log('\nTest 4: Pattern identification...');
    try {
      const patterns = await learningEngine.identifyPatterns('codeQuality');
      console.log(`  📊 Identified ${patterns.length} patterns`);
      
      for (const pattern of patterns.slice(0, 3)) {
        console.log(`  • ${pattern.pattern} (${(pattern.confidence * 100).toFixed(0)}% confidence)`);
      }
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 5: Strategy recommendations
    console.log('\nTest 5: Strategy recommendations...');
    try {
      const recommendations = await learningEngine.recommendStrategies('codeQuality', 3);
      console.log(`  📊 Got ${recommendations.length} recommendations`);
      
      for (const rec of recommendations) {
        console.log(`  • ${rec.strategy}: ${(rec.predictedSuccessRate * 100).toFixed(0)}% predicted success`);
        console.log(`    Reasoning: ${rec.reasoning}`);
      }
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 6: A/B Testing
    console.log('\nTest 6: A/B testing framework...');
    try {
      const testId = await learningEngine.startABTest(
        'Refactor Strategy Comparison',
        'Detailed refactoring vs Quick refactoring',
        'detailed-refactor',
        'quick-refactor',
        'codeQuality'
      );
      console.log(`  ✅ Started A/B test: ${testId}`);

      // Record results for variant A
      await learningEngine.recordImprovement({
        timestamp: new Date(),
        area: 'codeQuality',
        strategy: 'detailed-refactor',
        success: true,
        confidence: 0.95,
        budgetUsed: 0.8,
        durationMs: 60000,
        changes: 5,
        metrics: { testCoverageDelta: 8 },
        context: {
          swarmId: 'ab-test-a',
          agentCount: 2,
          modelUsed: 'claude-sonnet-4',
          toolsUsed: ['read', 'write', 'edit'],
        },
      });

      // Record results for variant B
      await learningEngine.recordImprovement({
        timestamp: new Date(),
        area: 'codeQuality',
        strategy: 'quick-refactor',
        success: true,
        confidence: 0.7,
        budgetUsed: 0.3,
        durationMs: 20000,
        changes: 2,
        metrics: { testCoverageDelta: 3 },
        context: {
          swarmId: 'ab-test-b',
          agentCount: 1,
          modelUsed: 'claude-sonnet-4',
          toolsUsed: ['read', 'edit'],
        },
      });

      const activeTests = learningEngine.getActiveABTests();
      console.log(`  ✅ Active A/B tests: ${activeTests.length}`);
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 7: Improvement Store query
    console.log('\nTest 7: Improvement Store query operations...');
    try {
      const results = await improvementStore.query({
        areas: ['documentation'],
        successOnly: true,
      }, 10);
      
      console.log(`  ✅ Found ${results.length} documentation improvements`);
      
      const effectiveness = await improvementStore.getStrategyEffectiveness('documentation');
      console.log(`  ✅ Strategy effectiveness: ${effectiveness.length} strategies`);
      
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 8: Learning metrics
    console.log('\nTest 8: Learning metrics aggregation...');
    try {
      const metrics = await learningEngine.getMetrics();
      console.log(`  📊 Total improvements: ${metrics.totalImprovements}`);
      console.log(`  📊 Overall success rate: ${(metrics.overallSuccessRate * 100).toFixed(1)}%`);
      console.log(`  📊 Total budget: $${metrics.totalBudgetSpent.toFixed(2)}`);
      console.log(`  📊 Active A/B tests: ${metrics.activeTests}`);
      console.log(`  📊 Patterns: ${metrics.patternsIdentified}`);
      
      if (metrics.totalImprovements >= 4) {
        console.log(`  ✅ Learning data accumulated: ${metrics.totalImprovements} records`);
        passed++;
      } else {
        console.error(`  ❌ Expected at least 4 improvements, got ${metrics.totalImprovements}`);
        failed++;
      }
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 9: Time series data
    console.log('\nTest 9: Time series aggregation...');
    try {
      const timeSeries = await improvementStore.getTimeSeries('day', undefined, 7);
      console.log(`  ✅ Time series data: ${timeSeries.length} periods`);
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    // Test 10: Learning report
    console.log('\nTest 10: Learning report generation...');
    try {
      const report = await learningEngine.getLearningReport();
      console.log(report);
      passed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

  } catch (error) {
    console.error(`\n💥 Critical error: ${error}`);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Learning Loop is functional.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed.`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});

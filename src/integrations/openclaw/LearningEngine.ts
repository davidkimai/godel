/**
 * Learning Engine for Godel Self-Improvement
 * 
 * Tracks improvement effectiveness, identifies patterns in successful
 * improvements, prioritizes strategies, and manages A/B testing.
 * 
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section F4.3 Learning Loop
 */

import { SQLiteStorage } from '../../storage/sqlite';

// ============================================================================
// Types
// ============================================================================

export interface ImprovementRecord {
  id: string;
  timestamp: Date;
  area: string;
  strategy: string;
  success: boolean;
  confidence: number;
  budgetUsed: number;
  durationMs: number;
  changes: number;
  metrics: {
    testCoverageDelta?: number;
    bugsFixed?: number;
    performanceImprovement?: number;
    codeQualityScore?: number;
    documentationCoverage?: number;
  };
  context: {
    teamId: string;
    agentCount: number;
    modelUsed: string;
    toolsUsed: string[];
  };
  errorDetails?: string;
}

export interface StrategyStats {
  strategy: string;
  area: string;
  totalAttempts: number;
  successes: number;
  failures: number;
  successRate: number;
  avgBudgetUsed: number;
  avgDurationMs: number;
  avgChanges: number;
  confidenceScore: number; // 0-1, calculated from success rate and sample size
  lastUsed: Date;
  trend: 'improving' | 'stable' | 'declining';
}

export interface PatternMatch {
  patternId: string;
  pattern: string;
  description: string;
  confidence: number;
  matches: ImprovementRecord[];
  successRate: number;
}

export interface ABTest {
  id: string;
  name: string;
  hypothesis: string;
  variantA: string;
  variantB: string;
  area: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'cancelled';
  resultsA: ABTestResults;
  resultsB: ABTestResults;
  winner?: 'A' | 'B' | 'tie' | 'inconclusive';
  confidence: number;
}

export interface ABTestResults {
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  avgBudgetUsed: number;
  avgDurationMs: number;
}

export interface LearningConfig {
  minSampleSize: number;
  confidenceThreshold: number;
  patternWindowSize: number;
  abTestMinDurationMs: number;
  abTestMinSamples: number;
  strategyDecayFactor: number; // How quickly old data loses importance
}

export interface StrategyRecommendation {
  strategy: string;
  area: string;
  confidence: number;
  predictedSuccessRate: number;
  estimatedBudget: number;
  estimatedDurationMs: number;
  reasoning: string;
}

// ============================================================================
// Learning Engine
// ============================================================================

export class LearningEngine {
  private storage: SQLiteStorage;
  private config: LearningConfig;
  private strategyCache: Map<string, StrategyStats> = new Map();
  private patternCache: Map<string, PatternMatch> = new Map();
  private activeABTests: Map<string, ABTest> = new Map();

  private readonly DEFAULT_CONFIG: LearningConfig = {
    minSampleSize: 5,
    confidenceThreshold: 0.8,
    patternWindowSize: 20,
    abTestMinDurationMs: 3600000, // 1 hour
    abTestMinSamples: 10,
    strategyDecayFactor: 0.95, // Older data has 95% weight of newer data
  };

  constructor(storage: SQLiteStorage, config?: Partial<LearningConfig>) {
    this.storage = storage;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<void> {
    await this.initializeTables();
    await this.loadStrategyCache();
    await this.loadActiveABTests();
  }

  private async initializeTables(): Promise<void> {
    // Improvements table
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS learning_improvements (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        area TEXT NOT NULL,
        strategy TEXT NOT NULL,
        success INTEGER NOT NULL,
        confidence REAL DEFAULT 0,
        budget_used REAL DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        changes INTEGER DEFAULT 0,
        test_coverage_delta REAL,
        bugs_fixed INTEGER,
        performance_improvement REAL,
        code_quality_score REAL,
        documentation_coverage REAL,
        team_id TEXT,
        agent_count INTEGER,
        model_used TEXT,
        tools_used TEXT,
        error_details TEXT
      )
    `);

    // Strategy statistics table
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS learning_strategies (
        strategy TEXT PRIMARY KEY,
        area TEXT NOT NULL,
        total_attempts INTEGER DEFAULT 0,
        successes INTEGER DEFAULT 0,
        failures INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        avg_budget_used REAL DEFAULT 0,
        avg_duration_ms INTEGER DEFAULT 0,
        avg_changes REAL DEFAULT 0,
        confidence_score REAL DEFAULT 0,
        last_used TEXT,
        trend TEXT DEFAULT 'stable'
      )
    `);

    // A/B tests table
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS learning_ab_tests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        variant_a TEXT NOT NULL,
        variant_b TEXT NOT NULL,
        area TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        status TEXT DEFAULT 'running',
        results_a_attempts INTEGER DEFAULT 0,
        results_a_successes INTEGER DEFAULT 0,
        results_a_failures INTEGER DEFAULT 0,
        results_a_success_rate REAL DEFAULT 0,
        results_a_avg_budget_used REAL DEFAULT 0,
        results_a_avg_duration_ms INTEGER DEFAULT 0,
        results_b_attempts INTEGER DEFAULT 0,
        results_b_successes INTEGER DEFAULT 0,
        results_b_failures INTEGER DEFAULT 0,
        results_b_success_rate REAL DEFAULT 0,
        results_b_avg_budget_used REAL DEFAULT 0,
        results_b_avg_duration_ms INTEGER DEFAULT 0,
        winner TEXT,
        confidence REAL DEFAULT 0
      )
    `);

    // Create indexes
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_improvements_area ON learning_improvements(area)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_improvements_strategy ON learning_improvements(strategy)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_improvements_timestamp ON learning_improvements(timestamp)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_improvements_success ON learning_improvements(success)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_strategies_area ON learning_strategies(area)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_strategies_success_rate ON learning_strategies(success_rate)`);
  }

  private async loadStrategyCache(): Promise<void> {
    const rows = await this.storage.all(`
      SELECT * FROM learning_strategies
    `);

    for (const row of rows) {
      const stats: StrategyStats = {
        strategy: row.strategy,
        area: row.area,
        totalAttempts: row.total_attempts,
        successes: row.successes,
        failures: row.failures,
        successRate: row.success_rate,
        avgBudgetUsed: row.avg_budget_used,
        avgDurationMs: row.avg_duration_ms,
        avgChanges: row.avg_changes,
        confidenceScore: row.confidence_score,
        lastUsed: new Date(row.last_used),
        trend: row.trend as StrategyStats['trend'],
      };
      this.strategyCache.set(row.strategy, stats);
    }
  }

  private async loadActiveABTests(): Promise<void> {
    const rows = await this.storage.all(`
      SELECT * FROM learning_ab_tests WHERE status = 'running'
    `);

    for (const row of rows) {
      const test: ABTest = {
        id: row.id,
        name: row.name,
        hypothesis: row.hypothesis,
        variantA: row.variant_a,
        variantB: row.variant_b,
        area: row.area,
        startTime: new Date(row.start_time),
        status: row.status,
        resultsA: {
          attempts: row.results_a_attempts,
          successes: row.results_a_successes,
          failures: row.results_a_failures,
          successRate: row.results_a_success_rate,
          avgBudgetUsed: row.results_a_avg_budget_used,
          avgDurationMs: row.results_a_avg_duration_ms,
        },
        resultsB: {
          attempts: row.results_b_attempts,
          successes: row.results_b_successes,
          failures: row.results_b_failures,
          successRate: row.results_b_success_rate,
          avgBudgetUsed: row.results_b_avg_budget_used,
          avgDurationMs: row.results_b_avg_duration_ms,
        },
        confidence: row.confidence,
      };
      this.activeABTests.set(row.id, test);
    }
  }

  // ========================================================================
  // Improvement Recording
  // ========================================================================

  /**
   * Record an improvement attempt and its outcome
   */
  async recordImprovement(record: Omit<ImprovementRecord, 'id'>): Promise<string> {
    const id = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const fullRecord: ImprovementRecord = {
      ...record,
      id,
    };

    // Store in database
    await this.storage.run(`
      INSERT INTO learning_improvements (
        id, timestamp, area, strategy, success, confidence, budget_used, duration_ms, changes,
        test_coverage_delta, bugs_fixed, performance_improvement, code_quality_score, documentation_coverage,
        team_id, agent_count, model_used, tools_used, error_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      record.timestamp.toISOString(),
      record.area,
      record.strategy,
      record.success ? 1 : 0,
      record.confidence,
      record.budgetUsed,
      record.durationMs,
      record.changes,
      record.metrics.testCoverageDelta ?? null,
      record.metrics.bugsFixed ?? null,
      record.metrics.performanceImprovement ?? null,
      record.metrics.codeQualityScore ?? null,
      record.metrics.documentationCoverage ?? null,
      record.context.teamId,
      record.context.agentCount,
      record.context.modelUsed,
      JSON.stringify(record.context.toolsUsed),
      record.errorDetails ?? null
    );

    // Update strategy statistics
    await this.updateStrategyStats(record.strategy, record.area, fullRecord);

    // Check if this record applies to any active A/B tests
    await this.updateABTests(fullRecord);

    return id;
  }

  private async updateStrategyStats(
    strategy: string,
    area: string,
    record: ImprovementRecord
  ): Promise<void> {
    let stats = this.strategyCache.get(strategy);
    
    if (!stats) {
      stats = {
        strategy,
        area,
        totalAttempts: 0,
        successes: 0,
        failures: 0,
        successRate: 0,
        avgBudgetUsed: 0,
        avgDurationMs: 0,
        avgChanges: 0,
        confidenceScore: 0,
        lastUsed: new Date(),
        trend: 'stable',
      };
    }

    // Calculate trend based on recent vs older performance
    const previousSuccessRate = stats.successRate;
    
    // Update counters
    stats.totalAttempts++;
    if (record.success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    // Calculate weighted averages with decay
    const decay = this.config.strategyDecayFactor;
    stats.avgBudgetUsed = (stats.avgBudgetUsed * decay) + (record.budgetUsed * (1 - decay));
    stats.avgDurationMs = Math.round((stats.avgDurationMs * decay) + (record.durationMs * (1 - decay)));
    stats.avgChanges = (stats.avgChanges * decay) + (record.changes * (1 - decay));

    // Calculate success rate
    stats.successRate = stats.successes / stats.totalAttempts;

    // Calculate confidence score (based on sample size and consistency)
    const sampleSizeBonus = Math.min(stats.totalAttempts / this.config.minSampleSize, 1);
    const consistency = 1 - Math.abs(stats.successRate - 0.5) * 2; // Higher confidence when rate is extreme
    stats.confidenceScore = sampleSizeBonus * (0.5 + consistency * 0.5);

    // Determine trend
    if (stats.successRate > previousSuccessRate + 0.1) {
      stats.trend = 'improving';
    } else if (stats.successRate < previousSuccessRate - 0.1) {
      stats.trend = 'declining';
    } else {
      stats.trend = 'stable';
    }

    stats.lastUsed = new Date();

    // Update cache
    this.strategyCache.set(strategy, stats);

    // Persist to database
    await this.storage.run(`
      INSERT INTO learning_strategies (
        strategy, area, total_attempts, successes, failures, success_rate,
        avg_budget_used, avg_duration_ms, avg_changes, confidence_score, last_used, trend
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(strategy) DO UPDATE SET
        total_attempts = excluded.total_attempts,
        successes = excluded.successes,
        failures = excluded.failures,
        success_rate = excluded.success_rate,
        avg_budget_used = excluded.avg_budget_used,
        avg_duration_ms = excluded.avg_duration_ms,
        avg_changes = excluded.avg_changes,
        confidence_score = excluded.confidence_score,
        last_used = excluded.last_used,
        trend = excluded.trend
    `,
      strategy, area, stats.totalAttempts, stats.successes, stats.failures,
      stats.successRate, stats.avgBudgetUsed, stats.avgDurationMs, stats.avgChanges,
      stats.confidenceScore, stats.lastUsed.toISOString(), stats.trend
    );
  }

  // ========================================================================
  // Pattern Identification
  // ========================================================================

  /**
   * Identify patterns in successful improvements
   */
  async identifyPatterns(area?: string): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];

    // Query for successful improvements
    let query = `
      SELECT * FROM learning_improvements 
      WHERE success = 1
    `;
    const params: unknown[] = [];

    if (area) {
      query += ` AND area = ?`;
      params.push(area);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(this.config.patternWindowSize);

    const rows = await this.storage.all(query, ...params);
    const records: ImprovementRecord[] = rows.map(row => this.rowToRecord(row));

    // Pattern 1: High-confidence strategies
    const highConfidenceStrategies = this.findHighConfidenceStrategies(records);
    if (highConfidenceStrategies.length > 0) {
      patterns.push({
        patternId: 'high-confidence',
        pattern: 'High Confidence Strategies',
        description: 'Strategies with >90% confidence consistently succeed',
        confidence: this.calculatePatternConfidence(highConfidenceStrategies),
        matches: highConfidenceStrategies,
        successRate: 1,
      });
    }

    // Pattern 2: Budget-efficient strategies
    const budgetEfficient = this.findBudgetEfficientStrategies(records);
    if (budgetEfficient.length > 0) {
      patterns.push({
        patternId: 'budget-efficient',
        pattern: 'Budget Efficient',
        description: 'Strategies with below-average cost but high success rate',
        confidence: this.calculatePatternConfidence(budgetEfficient),
        matches: budgetEfficient,
        successRate: budgetEfficient.filter(r => r.success).length / budgetEfficient.length,
      });
    }

    // Pattern 3: Fast strategies
    const fastStrategies = this.findFastStrategies(records);
    if (fastStrategies.length > 0) {
      patterns.push({
        patternId: 'fast-strategies',
        pattern: 'Fast Execution',
        description: 'Strategies that complete quickly with good success rates',
        confidence: this.calculatePatternConfidence(fastStrategies),
        matches: fastStrategies,
        successRate: fastStrategies.filter(r => r.success).length / fastStrategies.length,
      });
    }

    // Pattern 4: Model effectiveness
    const modelPatterns = this.findModelPatterns(records);
    for (const [model, modelRecords] of Object.entries(modelPatterns)) {
      if (modelRecords.length >= this.config.minSampleSize) {
        patterns.push({
          patternId: `model-${model}`,
          pattern: `Model: ${model}`,
          description: `Performance patterns for model ${model}`,
          confidence: this.calculatePatternConfidence(modelRecords),
          matches: modelRecords,
          successRate: modelRecords.filter(r => r.success).length / modelRecords.length,
        });
      }
    }

    // Update cache
    for (const pattern of patterns) {
      this.patternCache.set(pattern.patternId, pattern);
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  private findHighConfidenceStrategies(records: ImprovementRecord[]): ImprovementRecord[] {
    return records.filter(r => r.confidence > 0.9);
  }

  private findBudgetEfficientStrategies(records: ImprovementRecord[]): ImprovementRecord[] {
    const avgBudget = records.reduce((sum, r) => sum + r.budgetUsed, 0) / records.length;
    return records.filter(r => r.budgetUsed < avgBudget && r.success);
  }

  private findFastStrategies(records: ImprovementRecord[]): ImprovementRecord[] {
    const avgDuration = records.reduce((sum, r) => sum + r.durationMs, 0) / records.length;
    return records.filter(r => r.durationMs < avgDuration && r.success);
  }

  private findModelPatterns(records: ImprovementRecord[]): Record<string, ImprovementRecord[]> {
    const byModel: Record<string, ImprovementRecord[]> = {};
    for (const record of records) {
      const model = record.context.modelUsed;
      if (!byModel[model]) {
        byModel[model] = [];
      }
      byModel[model].push(record);
    }
    return byModel;
  }

  private calculatePatternConfidence(records: ImprovementRecord[]): number {
    if (records.length === 0) return 0;
    
    const successRate = records.filter(r => r.success).length / records.length;
    const sampleSizeFactor = Math.min(records.length / this.config.minSampleSize, 1);
    
    return successRate * sampleSizeFactor;
  }

  // ========================================================================
  // Strategy Prioritization
  // ========================================================================

  /**
   * Get recommended strategies for a given area
   */
  async recommendStrategies(area: string, limit: number = 3): Promise<StrategyRecommendation[]> {
    const recommendations: StrategyRecommendation[] = [];

    // Get all strategies for this area
    const strategies = Array.from(this.strategyCache.values())
      .filter(s => s.area === area)
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    for (const stats of strategies.slice(0, limit * 2)) { // Get more candidates
      // Check if there's an active A/B test for this strategy
      const abTest = this.findABTestForStrategy(stats.strategy);
      
      let predictedSuccessRate = stats.successRate;
      let reasoning = `Historical success rate: ${(stats.successRate * 100).toFixed(1)}%`;

      if (abTest && abTest.winner) {
        // Use A/B test results to refine prediction
        const winningVariant = abTest.winner === 'A' ? abTest.variantA : abTest.variantB;
        if (winningVariant === stats.strategy) {
          predictedSuccessRate = Math.min(predictedSuccessRate * 1.1, 1);
          reasoning += ` (boosted by A/B test win)`;
        }
      }

      // Factor in trend
      if (stats.trend === 'improving') {
        predictedSuccessRate = Math.min(predictedSuccessRate * 1.05, 1);
        reasoning += `, trend: improving`;
      } else if (stats.trend === 'declining') {
        predictedSuccessRate *= 0.9;
        reasoning += `, trend: declining`;
      }

      recommendations.push({
        strategy: stats.strategy,
        area: stats.area,
        confidence: stats.confidenceScore,
        predictedSuccessRate,
        estimatedBudget: stats.avgBudgetUsed,
        estimatedDurationMs: stats.avgDurationMs,
        reasoning,
      });
    }

    // Sort by predicted success rate and confidence
    return recommendations
      .sort((a, b) => {
        const scoreA = a.predictedSuccessRate * a.confidence;
        const scoreB = b.predictedSuccessRate * b.confidence;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * Get the best strategy for an area with no prior knowledge
   */
  async getExplorationStrategy(area: string): Promise<string | null> {
    // Find strategies with low sample size but potential
    const candidates = Array.from(this.strategyCache.values())
      .filter(s => s.area === area && s.totalAttempts < this.config.minSampleSize)
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    if (candidates.length > 0) {
      return candidates[0].strategy;
    }

    // Check for active A/B tests needing more data
    for (const test of Array.from(this.activeABTests.values())) {
      if (test.area === area && !test.winner) {
        // Randomly assign to A or B for exploration
        return Math.random() < 0.5 ? test.variantA : test.variantB;
      }
    }

    return null;
  }

  // ========================================================================
  // A/B Testing Framework
  // ========================================================================

  /**
   * Start an A/B test between two strategies
   */
  async startABTest(
    name: string,
    hypothesis: string,
    variantA: string,
    variantB: string,
    area: string
  ): Promise<string> {
    const id = `ab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const test: ABTest = {
      id,
      name,
      hypothesis,
      variantA,
      variantB,
      area,
      startTime: new Date(),
      status: 'running',
      resultsA: {
        attempts: 0,
        successes: 0,
        failures: 0,
        successRate: 0,
        avgBudgetUsed: 0,
        avgDurationMs: 0,
      },
      resultsB: {
        attempts: 0,
        successes: 0,
        failures: 0,
        successRate: 0,
        avgBudgetUsed: 0,
        avgDurationMs: 0,
      },
      confidence: 0,
    };

    this.activeABTests.set(id, test);

    // Persist to database
    await this.storage.run(`
      INSERT INTO learning_ab_tests (
        id, name, hypothesis, variant_a, variant_b, area, start_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, name, hypothesis, variantA, variantB, area, test.startTime.toISOString(), 'running');

    return id;
  }

  /**
   * Record a result for an A/B test
   */
  async recordABTestResult(testId: string, variant: 'A' | 'B', record: ImprovementRecord): Promise<void> {
    const test = this.activeABTests.get(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    const results = variant === 'A' ? test.resultsA : test.resultsB;
    
    // Update results
    results.attempts++;
    if (record.success) {
      results.successes++;
    } else {
      results.failures++;
    }

    // Update averages
    const n = results.attempts;
    results.successRate = results.successes / n;
    results.avgBudgetUsed = (results.avgBudgetUsed * (n - 1) + record.budgetUsed) / n;
    results.avgDurationMs = Math.round((results.avgDurationMs * (n - 1) + record.durationMs) / n);

    // Check if test should conclude
    await this.checkABTestCompletion(test);

    // Persist results
    const colPrefix = variant === 'A' ? 'results_a' : 'results_b';
    await this.storage.run(`
      UPDATE learning_ab_tests SET
        ${colPrefix}_attempts = ?,
        ${colPrefix}_successes = ?,
        ${colPrefix}_failures = ?,
        ${colPrefix}_success_rate = ?,
        ${colPrefix}_avg_budget_used = ?,
        ${colPrefix}_avg_duration_ms = ?
      WHERE id = ?
    `, results.attempts, results.successes, results.failures, results.successRate,
      results.avgBudgetUsed, results.avgDurationMs, testId);
  }

  private async updateABTests(record: ImprovementRecord): Promise<void> {
    for (const test of Array.from(this.activeABTests.values())) {
      if (test.area === record.area && test.status === 'running') {
        if (record.strategy === test.variantA) {
          await this.recordABTestResult(test.id, 'A', record);
        } else if (record.strategy === test.variantB) {
          await this.recordABTestResult(test.id, 'B', record);
        }
      }
    }
  }

  private async checkABTestCompletion(test: ABTest): Promise<void> {
    const minDuration = Date.now() - test.startTime.getTime() >= this.config.abTestMinDurationMs;
    const minSamples = test.resultsA.attempts >= this.config.abTestMinSamples && 
                       test.resultsB.attempts >= this.config.abTestMinSamples;

    if (!minDuration || !minSamples) {
      return;
    }

    // Calculate statistical significance
    const rateA = test.resultsA.successRate;
    const rateB = test.resultsB.successRate;
    const nA = test.resultsA.attempts;
    const nB = test.resultsB.attempts;

    // Simple confidence calculation (can be enhanced with proper statistical tests)
    const pooledRate = (test.resultsA.successes + test.resultsB.successes) / (nA + nB);
    const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1/nA + 1/nB));
    const zScore = Math.abs(rateA - rateB) / (se || 1);
    
    // 95% confidence requires z > 1.96
    test.confidence = Math.min(zScore / 1.96, 1);

    if (test.confidence >= 0.95) {
      // Determine winner
      if (rateA > rateB + 0.1) {
        test.winner = 'A';
      } else if (rateB > rateA + 0.1) {
        test.winner = 'B';
      } else {
        test.winner = 'tie';
      }
    } else if (test.confidence < 0.5 && minSamples) {
      test.winner = 'inconclusive';
    }

    if (test.winner) {
      test.status = 'completed';
      test.endTime = new Date();
      this.activeABTests.delete(test.id);

      // Persist final results
      await this.storage.run(`
        UPDATE learning_ab_tests SET
          status = ?,
          end_time = ?,
          winner = ?,
          confidence = ?
        WHERE id = ?
      `, test.status, test.endTime!.toISOString(), test.winner, test.confidence, test.id);
    }
  }

  private findABTestForStrategy(strategy: string): ABTest | undefined {
    for (const test of Array.from(this.activeABTests.values())) {
      if (test.variantA === strategy || test.variantB === strategy) {
        return test;
      }
    }
    return undefined;
  }

  /**
   * Get active A/B tests
   */
  getActiveABTests(): ABTest[] {
    return Array.from(this.activeABTests.values());
  }


  /**
   * Cancel an A/B test
   */
  async cancelABTest(testId: string): Promise<void> {
    const test = this.activeABTests.get(testId);
    if (!test) {
      throw new Error(`A/B test ${testId} not found`);
    }

    test.status = 'cancelled';
    test.endTime = new Date();
    this.activeABTests.delete(testId);

    await this.storage.run(`
      UPDATE learning_ab_tests SET status = 'cancelled', end_time = ? WHERE id = ?
    `, test.endTime.toISOString(), testId);
  }

  // ========================================================================
  // Analytics and Reporting
  // ========================================================================

  /**
   * Get learning metrics summary
   */
  async getMetrics(): Promise<{
    totalImprovements: number;
    overallSuccessRate: number;
    totalBudgetSpent: number;
    avgDurationMs: number;
    topStrategies: StrategyStats[];
    activeTests: number;
    patternsIdentified: number;
  }> {
    const totalRow = await this.storage.get(`
      SELECT 
        COUNT(*) as count,
        AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
        SUM(budget_used) as total_budget,
        AVG(duration_ms) as avg_duration
      FROM learning_improvements
    `);

    const topStrategies = Array.from(this.strategyCache.values())
      .filter(s => s.totalAttempts >= this.config.minSampleSize)
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 5);

    const patterns = await this.identifyPatterns();

    return {
      totalImprovements: totalRow?.count || 0,
      overallSuccessRate: totalRow?.success_rate || 0,
      totalBudgetSpent: totalRow?.total_budget || 0,
      avgDurationMs: Math.round(totalRow?.avg_duration || 0),
      topStrategies,
      activeTests: this.activeABTests.size,
      patternsIdentified: patterns.length,
    };
  }

  /**
   * Get learning report for dashboard display
   */
  async getLearningReport(): Promise<string> {
    const metrics = await this.getMetrics();
    const patterns = await this.identifyPatterns();
    const activeTests = this.getActiveABTests();

    let report = '\n';
    report += '╔══════════════════════════════════════════════════════════════╗\n';
    report += '║           GODEL LEARNING LOOP REPORT                          ║\n';
    report += '╠══════════════════════════════════════════════════════════════╣\n';
    report += `║ Total Improvements: ${metrics.totalImprovements.toString().padEnd(40)}║\n`;
    report += `║ Overall Success Rate: ${(metrics.overallSuccessRate * 100).toFixed(1)}%${''.padEnd(36)}║\n`;
    report += `║ Total Budget Spent: $${metrics.totalBudgetSpent.toFixed(2).padEnd(38)}║\n`;
    report += `║ Avg Duration: ${(metrics.avgDurationMs / 1000).toFixed(1)}s${''.padEnd(43)}║\n`;
    report += `║ Active A/B Tests: ${metrics.activeTests.toString().padEnd(39)}║\n`;
    report += `║ Patterns Identified: ${metrics.patternsIdentified.toString().padEnd(36)}║\n`;
    report += '╠══════════════════════════════════════════════════════════════╣\n';
    report += '║ TOP STRATEGIES:\n';

    for (const strategy of metrics.topStrategies) {
      const trend = strategy.trend === 'improving' ? '↑' : strategy.trend === 'declining' ? '↓' : '→';
      report += `║   ${trend} ${strategy.strategy.padEnd(20)} ${(strategy.successRate * 100).toFixed(0)}% (${strategy.totalAttempts})\n`;
    }

    if (patterns.length > 0) {
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ IDENTIFIED PATTERNS:\n';
      for (const pattern of patterns.slice(0, 3)) {
        report += `║   • ${pattern.pattern} (${(pattern.confidence * 100).toFixed(0)}% conf)\n`;
      }
    }

    if (activeTests.length > 0) {
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ ACTIVE A/B TESTS:\n';
      for (const test of activeTests) {
        report += `║   • ${test.name}: ${test.variantA} vs ${test.variantB}\n`;
      }
    }

    report += '╚══════════════════════════════════════════════════════════════╝\n';

    return report;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private rowToRecord(row: any): ImprovementRecord {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      area: row.area,
      strategy: row.strategy,
      success: row.success === 1,
      confidence: row.confidence,
      budgetUsed: row.budget_used,
      durationMs: row.duration_ms,
      changes: row.changes,
      metrics: {
        testCoverageDelta: row.test_coverage_delta,
        bugsFixed: row.bugs_fixed,
        performanceImprovement: row.performance_improvement,
        codeQualityScore: row.code_quality_score,
        documentationCoverage: row.documentation_coverage,
      },
      context: {
        teamId: row.team_id,
        agentCount: row.agent_count,
        modelUsed: row.model_used,
        toolsUsed: JSON.parse(row.tools_used || '[]'),
      },
      errorDetails: row.error_details,
    };
  }

  /**
   * Get all strategies for an area
   */
  getStrategiesForArea(area: string): StrategyStats[] {
    return Array.from(this.strategyCache.values())
      .filter(s => s.area === area);
  }

  /**
   * Get improvement history
   */
  async getHistory(limit: number = 50): Promise<ImprovementRecord[]> {
    const rows = await this.storage.all(`
      SELECT * FROM learning_improvements
      ORDER BY timestamp DESC
      LIMIT ?
    `, limit);

    return rows.map(row => this.rowToRecord(row));
  }

  /**
   * Reset learning data (use with caution)
   */
  async reset(): Promise<void> {
    await this.storage.run(`DELETE FROM learning_improvements`);
    await this.storage.run(`DELETE FROM learning_strategies`);
    await this.storage.run(`DELETE FROM learning_ab_tests`);
    
    this.strategyCache.clear();
    this.patternCache.clear();
    this.activeABTests.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLearningEngine: LearningEngine | null = null;

export function getLearningEngine(storage?: SQLiteStorage, config?: Partial<LearningConfig>): LearningEngine {
  if (!globalLearningEngine) {
    if (!storage) {
      throw new Error('Storage required for LearningEngine initialization');
    }
    globalLearningEngine = new LearningEngine(storage, config);
  }
  return globalLearningEngine;
}

export function resetLearningEngine(): void {
  globalLearningEngine = null;
}

// LearningEngine and LearningConfig already exported above

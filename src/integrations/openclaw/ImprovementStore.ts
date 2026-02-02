/**
 * Improvement Store for Dash Self-Improvement
 * 
 * Stores improvement history, tracks strategy effectiveness,
 * and provides query optimization for learning patterns.
 * 
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section F4.3 Learning Loop
 */

import { SQLiteStorage } from '../../storage/sqlite';

// ============================================================================
// Types
// ============================================================================

export interface ImprovementEntry {
  id: string;
  timestamp: Date;
  area: string;
  strategy: string;
  success: boolean;
  confidence: number;
  budgetUsed: number;
  durationMs: number;
  changes: number;
  metrics: ImprovementMetrics;
  context: ImprovementContext;
  errorDetails?: string;
  tags: string[];
}

export interface ImprovementMetrics {
  testCoverageDelta?: number;
  bugsFixed?: number;
  performanceImprovement?: number;
  codeQualityScore?: number;
  documentationCoverage?: number;
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
}

export interface ImprovementContext {
  swarmId: string;
  agentCount: number;
  modelUsed: string;
  toolsUsed: string[];
  filesAffected?: string[];
  commitHash?: string;
}

export interface StrategyEffectiveness {
  strategy: string;
  area: string;
  totalAttempts: number;
  successes: number;
  failures: number;
  successRate: number;
  avgBudgetUsed: number;
  avgDurationMs: number;
  avgChanges: number;
  costPerSuccess: number;
  timePerSuccess: number;
  firstUsed: Date;
  lastUsed: Date;
  effectivenessScore: number; // 0-1 composite score
}

export interface OptimizationPattern {
  patternId: string;
  name: string;
  description: string;
  query: string;
  parameters: string[];
  sampleResults: unknown[];
  avgExecutionTimeMs: number;
  usageCount: number;
  lastUsed: Date;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  label: string;
}

export interface QueryFilter {
  areas?: string[];
  strategies?: string[];
  startDate?: Date;
  endDate?: Date;
  successOnly?: boolean;
  minConfidence?: number;
  maxBudget?: number;
  tags?: string[];
}

export interface AggregatedStats {
  period: string;
  totalImprovements: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  totalBudget: number;
  avgBudget: number;
  totalDuration: number;
  avgDuration: number;
  totalChanges: number;
}

export interface StoreConfig {
  enableCaching: boolean;
  cacheTTLMs: number;
  maxHistorySize: number;
  compressionEnabled: boolean;
}

// ============================================================================
// Improvement Store
// ============================================================================

export class ImprovementStore {
  private storage: SQLiteStorage;
  private config: StoreConfig;
  private queryCache: Map<string, { result: unknown; timestamp: number }> = new Map();
  private optimizationPatterns: Map<string, OptimizationPattern> = new Map();

  private readonly DEFAULT_CONFIG: StoreConfig = {
    enableCaching: true,
    cacheTTLMs: 300000, // 5 minutes
    maxHistorySize: 10000,
    compressionEnabled: true,
  };

  constructor(storage: SQLiteStorage, config?: Partial<StoreConfig>) {
    this.storage = storage;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<void> {
    await this.initializeTables();
    await this.registerOptimizationPatterns();
  }

  private async initializeTables(): Promise<void> {
    // Main improvements table with full-text search support
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS store_improvements (
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
        lines_added INTEGER,
        lines_removed INTEGER,
        files_changed INTEGER,
        swarm_id TEXT,
        agent_count INTEGER,
        model_used TEXT,
        tools_used TEXT,
        files_affected TEXT,
        commit_hash TEXT,
        error_details TEXT,
        tags TEXT
      )
    `);

    // Strategy effectiveness summary table
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS store_strategy_effectiveness (
        strategy TEXT PRIMARY KEY,
        area TEXT NOT NULL,
        total_attempts INTEGER DEFAULT 0,
        successes INTEGER DEFAULT 0,
        failures INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        avg_budget_used REAL DEFAULT 0,
        avg_duration_ms INTEGER DEFAULT 0,
        avg_changes REAL DEFAULT 0,
        cost_per_success REAL DEFAULT 0,
        time_per_success REAL DEFAULT 0,
        first_used TEXT,
        last_used TEXT,
        effectiveness_score REAL DEFAULT 0
      )
    `);

    // Optimization patterns registry
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS store_optimization_patterns (
        pattern_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        query TEXT NOT NULL,
        parameters TEXT,
        avg_execution_time_ms INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        last_used TEXT
      )
    `);

    // Time-series aggregates for fast queries
    await this.storage.run(`
      CREATE TABLE IF NOT EXISTS store_time_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL,
        period_start TEXT NOT NULL,
        area TEXT,
        strategy TEXT,
        total_improvements INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        total_budget REAL DEFAULT 0,
        avg_budget REAL DEFAULT 0,
        total_duration INTEGER DEFAULT 0,
        avg_duration INTEGER DEFAULT 0,
        total_changes INTEGER DEFAULT 0
      )
    `);

    // Create indexes for common query patterns
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_area ON store_improvements(area)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_strategy ON store_improvements(strategy)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_timestamp ON store_improvements(timestamp)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_success ON store_improvements(success)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_area_strategy ON store_improvements(area, strategy)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_improvements_timestamp_area ON store_improvements(timestamp, area)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_strategy_effectiveness_area ON store_strategy_effectiveness(area)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_strategy_effectiveness_score ON store_strategy_effectiveness(effectiveness_score)`);
    await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_store_time_series_period ON store_time_series(period, period_start)`);
  }

  private async registerOptimizationPatterns(): Promise<void> {
    const patterns: Omit<OptimizationPattern, 'sampleResults' | 'usageCount' | 'lastUsed'>[] = [
      {
        patternId: 'recent_by_area',
        name: 'Recent Improvements by Area',
        description: 'Get recent improvements filtered by area with pagination',
        query: `SELECT * FROM store_improvements WHERE area = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        parameters: ['area', 'limit', 'offset'],
        avgExecutionTimeMs: 10,
      },
      {
        patternId: 'success_by_strategy',
        name: 'Success Rate by Strategy',
        description: 'Calculate success rate for each strategy in an area',
        query: `SELECT strategy, COUNT(*) as attempts, SUM(success) as successes, AVG(success) as success_rate FROM store_improvements WHERE area = ? GROUP BY strategy`,
        parameters: ['area'],
        avgExecutionTimeMs: 15,
      },
      {
        patternId: 'budget_efficiency',
        name: 'Budget Efficiency Analysis',
        description: 'Find most budget-efficient strategies',
        query: `SELECT strategy, AVG(budget_used) as avg_budget, SUM(success) as successes FROM store_improvements WHERE area = ? GROUP BY strategy HAVING successes > 0 ORDER BY avg_budget ASC`,
        parameters: ['area'],
        avgExecutionTimeMs: 20,
      },
      {
        patternId: 'time_series_daily',
        name: 'Daily Time Series',
        description: 'Get daily aggregated statistics',
        query: `SELECT DATE(timestamp) as day, COUNT(*) as count, AVG(success) as success_rate, SUM(budget_used) as budget FROM store_improvements WHERE timestamp >= ? AND timestamp <= ? GROUP BY day ORDER BY day`,
        parameters: ['startDate', 'endDate'],
        avgExecutionTimeMs: 25,
      },
      {
        patternId: 'top_strategies',
        name: 'Top Strategies by Success Rate',
        description: 'Get top N strategies by success rate with minimum sample size',
        query: `SELECT strategy, COUNT(*) as attempts, AVG(success) as success_rate, AVG(budget_used) as avg_budget FROM store_improvements WHERE area = ? GROUP BY strategy HAVING attempts >= ? ORDER BY success_rate DESC LIMIT ?`,
        parameters: ['area', 'minSampleSize', 'limit'],
        avgExecutionTimeMs: 20,
      },
      {
        patternId: 'model_performance',
        name: 'Model Performance Comparison',
        description: 'Compare performance across different models',
        query: `SELECT model_used, COUNT(*) as attempts, AVG(success) as success_rate, AVG(duration_ms) as avg_duration FROM store_improvements GROUP BY model_used ORDER BY success_rate DESC`,
        parameters: [],
        avgExecutionTimeMs: 30,
      },
      {
        patternId: 'trending_strategies',
        name: 'Trending Strategies',
        description: 'Find strategies with improving success rates over time',
        query: `SELECT strategy, AVG(success) as recent_success_rate FROM store_improvements WHERE area = ? AND timestamp >= ? GROUP BY strategy`,
        parameters: ['area', 'since'],
        avgExecutionTimeMs: 25,
      },
    ];

    for (const pattern of patterns) {
      this.optimizationPatterns.set(pattern.patternId, {
        ...pattern,
        sampleResults: [],
        usageCount: 0,
        lastUsed: new Date(),
      });

      // Persist to database
      await this.storage.run(`
        INSERT OR REPLACE INTO store_optimization_patterns (
          pattern_id, name, description, query, parameters, avg_execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        pattern.patternId,
        pattern.name,
        pattern.description,
        pattern.query,
        JSON.stringify(pattern.parameters),
        pattern.avgExecutionTimeMs
      );
    }
  }

  // ========================================================================
  // Store Operations
  // ========================================================================

  /**
   * Store a new improvement entry
   */
  async store(entry: Omit<ImprovementEntry, 'id'>): Promise<string> {
    const id = `store_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await this.storage.run(`
      INSERT INTO store_improvements (
        id, timestamp, area, strategy, success, confidence, budget_used, duration_ms, changes,
        test_coverage_delta, bugs_fixed, performance_improvement, code_quality_score, documentation_coverage,
        lines_added, lines_removed, files_changed, swarm_id, agent_count, model_used, tools_used,
        files_affected, commit_hash, error_details, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      entry.timestamp.toISOString(),
      entry.area,
      entry.strategy,
      entry.success ? 1 : 0,
      entry.confidence,
      entry.budgetUsed,
      entry.durationMs,
      entry.changes,
      entry.metrics.testCoverageDelta ?? null,
      entry.metrics.bugsFixed ?? null,
      entry.metrics.performanceImprovement ?? null,
      entry.metrics.codeQualityScore ?? null,
      entry.metrics.documentationCoverage ?? null,
      entry.metrics.linesAdded ?? null,
      entry.metrics.linesRemoved ?? null,
      entry.metrics.filesChanged ?? null,
      entry.context.swarmId,
      entry.context.agentCount,
      entry.context.modelUsed,
      JSON.stringify(entry.context.toolsUsed),
      entry.context.filesAffected ? JSON.stringify(entry.context.filesAffected) : null,
      entry.context.commitHash ?? null,
      entry.errorDetails ?? null,
      JSON.stringify(entry.tags)
    );

    // Update strategy effectiveness
    await this.updateStrategyEffectiveness(entry.strategy, entry.area, entry);

    // Invalidate cache
    this.invalidateCache();

    return id;
  }

  private async updateStrategyEffectiveness(
    strategy: string,
    area: string,
    entry: Omit<ImprovementEntry, 'id'>
  ): Promise<void> {
    // Get existing stats
    const existing = await this.storage.get(`
      SELECT * FROM store_strategy_effectiveness WHERE strategy = ?
    `, strategy);

    let stats: Partial<StrategyEffectiveness>;

    if (existing) {
      // Update existing
      const totalAttempts = existing.total_attempts + 1;
      const successes = existing.successes + (entry.success ? 1 : 0);
      const failures = existing.failures + (entry.success ? 0 : 1);
      const successRate = successes / totalAttempts;

      // Weighted averages
      const avgBudget = (existing.avg_budget_used * existing.total_attempts + entry.budgetUsed) / totalAttempts;
      const avgDuration = (existing.avg_duration_ms * existing.total_attempts + entry.durationMs) / totalAttempts;
      const avgChanges = (existing.avg_changes * existing.total_attempts + entry.changes) / totalAttempts;

      stats = {
        strategy,
        area,
        totalAttempts,
        successes,
        failures,
        successRate,
        avgBudgetUsed: avgBudget,
        avgDurationMs: avgDuration,
        avgChanges,
        costPerSuccess: successes > 0 ? (existing.cost_per_success * existing.successes + entry.budgetUsed) / successes : 0,
        timePerSuccess: successes > 0 ? (existing.time_per_success * existing.successes + entry.durationMs) / successes : 0,
        firstUsed: new Date(existing.first_used),
        lastUsed: new Date(),
        effectivenessScore: this.calculateEffectivenessScore(successRate, avgBudget, avgDuration),
      };
    } else {
      // Create new
      stats = {
        strategy,
        area,
        totalAttempts: 1,
        successes: entry.success ? 1 : 0,
        failures: entry.success ? 0 : 1,
        successRate: entry.success ? 1 : 0,
        avgBudgetUsed: entry.budgetUsed,
        avgDurationMs: entry.durationMs,
        avgChanges: entry.changes,
        costPerSuccess: entry.success ? entry.budgetUsed : 0,
        timePerSuccess: entry.success ? entry.durationMs : 0,
        firstUsed: new Date(),
        lastUsed: new Date(),
        effectivenessScore: this.calculateEffectivenessScore(entry.success ? 1 : 0, entry.budgetUsed, entry.durationMs),
      };
    }

    await this.storage.run(`
      INSERT INTO store_strategy_effectiveness (
        strategy, area, total_attempts, successes, failures, success_rate,
        avg_budget_used, avg_duration_ms, avg_changes, cost_per_success, time_per_success,
        first_used, last_used, effectiveness_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(strategy) DO UPDATE SET
        total_attempts = excluded.total_attempts,
        successes = excluded.successes,
        failures = excluded.failures,
        success_rate = excluded.success_rate,
        avg_budget_used = excluded.avg_budget_used,
        avg_duration_ms = excluded.avg_duration_ms,
        avg_changes = excluded.avg_changes,
        cost_per_success = excluded.cost_per_success,
        time_per_success = excluded.time_per_success,
        last_used = excluded.last_used,
        effectiveness_score = excluded.effectiveness_score
    `,
      strategy, area, stats.totalAttempts, stats.successes, stats.failures, stats.successRate,
      stats.avgBudgetUsed, stats.avgDurationMs, stats.avgChanges, stats.costPerSuccess, stats.timePerSuccess,
      stats.firstUsed!.toISOString(), stats.lastUsed!.toISOString(), stats.effectivenessScore
    );
  }

  private calculateEffectivenessScore(successRate: number, avgBudget: number, avgDuration: number): number {
    // Composite score: success rate weighted by efficiency
    const budgetEfficiency = Math.max(0, 1 - avgBudget / 10); // Normalize to 0-1 (assuming $10 is high)
    const timeEfficiency = Math.max(0, 1 - avgDuration / 300000); // Normalize to 0-1 (assuming 5min is high)
    
    return (successRate * 0.6) + (budgetEfficiency * 0.2) + (timeEfficiency * 0.2);
  }

  // ========================================================================
  // Query Operations
  // ========================================================================

  /**
   * Query improvements with filters
   */
  async query(filters: QueryFilter, limit: number = 50, offset: number = 0): Promise<ImprovementEntry[]> {
    const cacheKey = this.getCacheKey('query', filters, limit, offset);
    
    if (this.config.enableCaching) {
      const cached = this.getCached(cacheKey);
      if (cached) return cached as ImprovementEntry[];
    }

    let query = `SELECT * FROM store_improvements WHERE 1=1`;
    const params: unknown[] = [];

    if (filters.areas?.length) {
      query += ` AND area IN (${filters.areas.map(() => '?').join(',')})`;
      params.push(...filters.areas);
    }

    if (filters.strategies?.length) {
      query += ` AND strategy IN (${filters.strategies.map(() => '?').join(',')})`;
      params.push(...filters.strategies);
    }

    if (filters.startDate) {
      query += ` AND timestamp >= ?`;
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query += ` AND timestamp <= ?`;
      params.push(filters.endDate.toISOString());
    }

    if (filters.successOnly) {
      query += ` AND success = 1`;
    }

    if (filters.minConfidence !== undefined) {
      query += ` AND confidence >= ?`;
      params.push(filters.minConfidence);
    }

    if (filters.maxBudget !== undefined) {
      query += ` AND budget_used <= ?`;
      params.push(filters.maxBudget);
    }

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await this.storage.all(query, ...params);
    const results = rows.map(row => this.rowToEntry(row));

    if (this.config.enableCaching) {
      this.setCached(cacheKey, results);
    }

    return results;
  }

  /**
   * Get strategy effectiveness data
   */
  async getStrategyEffectiveness(
    area?: string,
    minAttempts: number = 5
  ): Promise<StrategyEffectiveness[]> {
    const cacheKey = this.getCacheKey('effectiveness', area, minAttempts);
    
    if (this.config.enableCaching) {
      const cached = this.getCached(cacheKey);
      if (cached) return cached as StrategyEffectiveness[];
    }

    let query = `SELECT * FROM store_strategy_effectiveness WHERE total_attempts >= ?`;
    const params: unknown[] = [minAttempts];

    if (area) {
      query += ` AND area = ?`;
      params.push(area);
    }

    query += ` ORDER BY effectiveness_score DESC`;

    const rows = await this.storage.all(query, ...params);
    const results = rows.map(row => this.rowToEffectiveness(row));

    if (this.config.enableCaching) {
      this.setCached(cacheKey, results);
    }

    return results;
  }

  /**
   * Get aggregated statistics over time
   */
  async getTimeSeries(
    period: 'hour' | 'day' | 'week' | 'month',
    area?: string,
    limit: number = 30
  ): Promise<AggregatedStats[]> {
    const cacheKey = this.getCacheKey('timeseries', period, area, limit);
    
    if (this.config.enableCaching) {
      const cached = this.getCached(cacheKey);
      if (cached) return cached as AggregatedStats[];
    }

    let query: string;
    let params: unknown[] = [];

    switch (period) {
      case 'hour':
        query = `SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as period_start`;
        break;
      case 'day':
        query = `SELECT DATE(timestamp) as period_start`;
        break;
      case 'week':
        query = `SELECT strftime('%Y-%W', timestamp) as period_start`;
        break;
      case 'month':
        query = `SELECT strftime('%Y-%m', timestamp) as period_start`;
        break;
    }

    query += `, COUNT(*) as total_improvements, SUM(success) as success_count, 
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count,
                AVG(success) as success_rate, SUM(budget_used) as total_budget,
                AVG(budget_used) as avg_budget, SUM(duration_ms) as total_duration,
                AVG(duration_ms) as avg_duration, SUM(changes) as total_changes
                FROM store_improvements WHERE 1=1`;

    if (area) {
      query += ` AND area = ?`;
      params.push(area);
    }

    query += ` GROUP BY period_start ORDER BY period_start DESC LIMIT ?`;
    params.push(limit);

    const rows = await this.storage.all(query, ...params);
    const results = rows.map(row => ({
      period: row.period_start,
      totalImprovements: row.total_improvements,
      successCount: row.success_count,
      failureCount: row.failure_count,
      successRate: row.success_rate,
      totalBudget: row.total_budget,
      avgBudget: row.avg_budget,
      totalDuration: row.total_duration,
      avgDuration: row.avg_duration,
      totalChanges: row.total_changes,
    }));

    if (this.config.enableCaching) {
      this.setCached(cacheKey, results);
    }

    return results;
  }

  /**
   * Execute an optimized query pattern
   */
  async executePattern(
    patternId: string,
    parameters: Record<string, unknown>
  ): Promise<unknown[]> {
    const pattern = this.optimizationPatterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const startTime = Date.now();

    // Build query with parameters
    let query = pattern.query;
    const params: unknown[] = [];

    for (const paramName of pattern.parameters) {
      if (parameters[paramName] === undefined) {
        throw new Error(`Missing parameter: ${paramName}`);
      }
      params.push(parameters[paramName]);
    }

    const results = await this.storage.all(query, ...params);

    // Update pattern stats
    const executionTime = Date.now() - startTime;
    pattern.avgExecutionTimeMs = (pattern.avgExecutionTimeMs * pattern.usageCount + executionTime) / (pattern.usageCount + 1);
    pattern.usageCount++;
    pattern.lastUsed = new Date();

    await this.storage.run(`
      UPDATE store_optimization_patterns SET
        avg_execution_time_ms = ?,
        usage_count = ?,
        last_used = ?
      WHERE pattern_id = ?
    `, pattern.avgExecutionTimeMs, pattern.usageCount, pattern.lastUsed.toISOString(), patternId);

    return results;
  }

  /**
   * Get the most effective strategies for an area
   */
  async getMostEffectiveStrategies(area: string, limit: number = 5): Promise<StrategyEffectiveness[]> {
    return this.getStrategyEffectiveness(area, 3).then(results => results.slice(0, limit));
  }

  /**
   * Get comparison between two strategies
   */
  async compareStrategies(strategyA: string, strategyB: string): Promise<{
    strategyA: StrategyEffectiveness | null;
    strategyB: StrategyEffectiveness | null;
    winner: string | null;
    confidence: number;
  }> {
    const [effA, effB] = await Promise.all([
      this.storage.get(`SELECT * FROM store_strategy_effectiveness WHERE strategy = ?`, strategyA),
      this.storage.get(`SELECT * FROM store_strategy_effectiveness WHERE strategy = ?`, strategyB),
    ]);

    const statsA = effA ? this.rowToEffectiveness(effA) : null;
    const statsB = effB ? this.rowToEffectiveness(effB) : null;

    if (!statsA || !statsB) {
      return { strategyA: statsA, strategyB: statsB, winner: null, confidence: 0 };
    }

    // Calculate confidence based on sample sizes and difference
    const minSample = Math.min(statsA.totalAttempts, statsB.totalAttempts);
    const sampleConfidence = Math.min(minSample / 10, 1); // Max confidence at 10+ samples
    const performanceDiff = Math.abs(statsA.successRate - statsB.successRate);
    
    let winner: string | null = null;
    if (statsA.effectivenessScore > statsB.effectivenessScore * 1.1) {
      winner = strategyA;
    } else if (statsB.effectivenessScore > statsA.effectivenessScore * 1.1) {
      winner = strategyB;
    }

    const confidence = sampleConfidence * Math.min(performanceDiff * 2, 1);

    return { strategyA: statsA, strategyB: statsB, winner, confidence };
  }

  // ========================================================================
  // Analytics
  // ========================================================================

  /**
   * Get comprehensive analytics summary
   */
  async getAnalytics(): Promise<{
    totalImprovements: number;
    overallSuccessRate: number;
    totalBudgetSpent: number;
    uniqueStrategies: number;
    uniqueAreas: number;
    avgImprovementDuration: number;
    topStrategy: string | null;
    bestArea: string | null;
  }> {
    const summary = await this.storage.get(`
      SELECT 
        COUNT(*) as total,
        AVG(success) as success_rate,
        SUM(budget_used) as total_budget,
        COUNT(DISTINCT strategy) as unique_strategies,
        COUNT(DISTINCT area) as unique_areas,
        AVG(duration_ms) as avg_duration
      FROM store_improvements
    `);

    const topStrategy = await this.storage.get(`
      SELECT strategy FROM store_strategy_effectiveness
      ORDER BY effectiveness_score DESC LIMIT 1
    `);

    const bestArea = await this.storage.get(`
      SELECT area, AVG(success) as rate FROM store_improvements
      GROUP BY area ORDER BY rate DESC LIMIT 1
    `);

    return {
      totalImprovements: summary?.total || 0,
      overallSuccessRate: summary?.success_rate || 0,
      totalBudgetSpent: summary?.total_budget || 0,
      uniqueStrategies: summary?.unique_strategies || 0,
      uniqueAreas: summary?.unique_areas || 0,
      avgImprovementDuration: summary?.avg_duration || 0,
      topStrategy: topStrategy?.strategy || null,
      bestArea: bestArea?.area || null,
    };
  }

  /**
   * Export data for analysis
   */
  async exportData(filters?: QueryFilter): Promise<ImprovementEntry[]> {
    if (filters) {
      return this.query(filters, 10000, 0);
    }

    const rows = await this.storage.all(`
      SELECT * FROM store_improvements ORDER BY timestamp DESC LIMIT 10000
    `);

    return rows.map(row => this.rowToEntry(row));
  }

  // ========================================================================
  // Cache Management
  // ========================================================================

  private getCacheKey(...parts: unknown[]): string {
    return parts.map(p => JSON.stringify(p)).join(':');
  }

  private getCached(key: string): unknown | null {
    const entry = this.queryCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTTLMs) {
      this.queryCache.delete(key);
      return null;
    }

    return entry.result;
  }

  private setCached(key: string, result: unknown): void {
    if (!this.config.enableCaching) return;

    this.queryCache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Limit cache size
    if (this.queryCache.size > 100) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
  }

  private invalidateCache(): void {
    this.queryCache.clear();
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private rowToEntry(row: any): ImprovementEntry {
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
        linesAdded: row.lines_added,
        linesRemoved: row.lines_removed,
        filesChanged: row.files_changed,
      },
      context: {
        swarmId: row.swarm_id,
        agentCount: row.agent_count,
        modelUsed: row.model_used,
        toolsUsed: JSON.parse(row.tools_used || '[]'),
        filesAffected: row.files_affected ? JSON.parse(row.files_affected) : undefined,
        commitHash: row.commit_hash,
      },
      errorDetails: row.error_details,
      tags: JSON.parse(row.tags || '[]'),
    };
  }

  private rowToEffectiveness(row: any): StrategyEffectiveness {
    return {
      strategy: row.strategy,
      area: row.area,
      totalAttempts: row.total_attempts,
      successes: row.successes,
      failures: row.failures,
      successRate: row.success_rate,
      avgBudgetUsed: row.avg_budget_used,
      avgDurationMs: row.avg_duration_ms,
      avgChanges: row.avg_changes,
      costPerSuccess: row.cost_per_success,
      timePerSuccess: row.time_per_success,
      firstUsed: new Date(row.first_used),
      lastUsed: new Date(row.last_used),
      effectivenessScore: row.effectiveness_score,
    };
  }

  /**
   * Get store statistics
   */
  async getStoreStats(): Promise<{
    totalEntries: number;
    totalStrategies: number;
    storageSizeEstimate: number;
    cacheHitRate: number;
  }> {
    const counts = await this.storage.get(`
      SELECT 
        (SELECT COUNT(*) FROM store_improvements) as entries,
        (SELECT COUNT(*) FROM store_strategy_effectiveness) as strategies
    `);

    return {
      totalEntries: counts?.entries || 0,
      totalStrategies: counts?.strategies || 0,
      storageSizeEstimate: (counts?.entries || 0) * 500, // Rough estimate: 500 bytes per entry
      cacheHitRate: 0, // Would need tracking
    };
  }

  /**
   * Reset store data (use with caution)
   */
  async reset(): Promise<void> {
    await this.storage.run(`DELETE FROM store_improvements`);
    await this.storage.run(`DELETE FROM store_strategy_effectiveness`);
    await this.storage.run(`DELETE FROM store_time_series`);
    this.queryCache.clear();
  }

  /**
   * Clean old data beyond max history size
   */
  async cleanup(): Promise<number> {
    const count = await this.storage.get(`
      SELECT COUNT(*) as count FROM store_improvements
    `);

    if (count.count <= this.config.maxHistorySize) {
      return 0;
    }

    const toDelete = count.count - this.config.maxHistorySize;

    await this.storage.run(`
      DELETE FROM store_improvements
      WHERE id IN (
        SELECT id FROM store_improvements
        ORDER BY timestamp ASC
        LIMIT ?
      )
    `, toDelete);

    this.invalidateCache();

    return toDelete;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalImprovementStore: ImprovementStore | null = null;

export function getImprovementStore(storage?: SQLiteStorage, config?: Partial<StoreConfig>): ImprovementStore {
  if (!globalImprovementStore) {
    if (!storage) {
      throw new Error('Storage required for ImprovementStore initialization');
    }
    globalImprovementStore = new ImprovementStore(storage, config);
  }
  return globalImprovementStore;
}

export function resetImprovementStore(): void {
  globalImprovementStore = null;
}

// ImprovementStore already exported above

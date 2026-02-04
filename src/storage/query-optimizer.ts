/**
 * Query Optimization Utilities
 * 
 * Provides optimized query patterns, index hints, and query builders
 * for efficient database operations.
 */

import { Pool } from 'pg';

// ============================================================================
// Index Definitions
// ============================================================================

export interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  ifNotExists?: boolean;
  comment?: string;
}

export const OPTIMIZED_INDEXES: IndexDefinition[] = [
  // Agent table indexes
  {
    name: 'idx_agents_swarm_id',
    table: 'agents',
    columns: ['swarm_id'],
    ifNotExists: true,
    comment: 'Fast lookup of agents by swarm',
  },
  {
    name: 'idx_agents_status',
    table: 'agents',
    columns: ['status'],
    ifNotExists: true,
    comment: 'Filter agents by status',
  },
  {
    name: 'idx_agents_lifecycle_state',
    table: 'agents',
    columns: ['lifecycle_state'],
    ifNotExists: true,
    comment: 'Filter agents by lifecycle state',
  },
  {
    name: 'idx_agents_swarm_status',
    table: 'agents',
    columns: ['swarm_id', 'status'],
    ifNotExists: true,
    comment: 'Composite index for swarm+status queries',
  },
  {
    name: 'idx_agents_spawned_at',
    table: 'agents',
    columns: ['spawned_at DESC'],
    ifNotExists: true,
    comment: 'Order agents by spawn time',
  },

  // Session table indexes
  {
    name: 'idx_sessions_expires_at',
    table: 'sessions',
    columns: ['expires_at'],
    ifNotExists: true,
    comment: 'Filter expired sessions efficiently',
  },
  {
    name: 'idx_sessions_current_branch',
    table: 'sessions',
    columns: ['current_branch'],
    ifNotExists: true,
    comment: 'Find session by branch',
  },
  {
    name: 'idx_sessions_updated_at',
    table: 'sessions',
    columns: ['updated_at DESC'],
    ifNotExists: true,
    comment: 'Order sessions by update time',
  },

  // Event table indexes
  {
    name: 'idx_events_type',
    table: 'events',
    columns: ['type'],
    ifNotExists: true,
    comment: 'Filter events by type',
  },
  {
    name: 'idx_events_entity',
    table: 'events',
    columns: ['entity_type', 'entity_id'],
    ifNotExists: true,
    comment: 'Find events for entity',
  },
  {
    name: 'idx_events_correlation_id',
    table: 'events',
    columns: ['correlation_id'],
    ifNotExists: true,
    comment: 'Find correlated events',
  },
  {
    name: 'idx_events_timestamp',
    table: 'events',
    columns: ['timestamp DESC'],
    ifNotExists: true,
    comment: 'Order events by time',
  },

  // Workflow execution indexes
  {
    name: 'idx_workflow_executions_workflow_status',
    table: 'workflow_executions',
    columns: ['workflow_id', 'status'],
    ifNotExists: true,
    comment: 'Filter executions by workflow and status',
  },
  {
    name: 'idx_workflow_executions_created_at',
    table: 'workflow_executions',
    columns: ['created_at DESC'],
    ifNotExists: true,
    comment: 'Order executions by creation time',
  },
];

// ============================================================================
// Query Builder
// ============================================================================

export interface QueryPart {
  text: string;
  values: unknown[];
}

/**
 * Safe query builder with parameter escaping
 */
export class QueryBuilder {
  private parts: QueryPart[] = [];
  private paramIndex = 1;

  /**
   * Add a WHERE condition with AND
   */
  where(column: string, operator: string, value: unknown): this {
    this.parts.push({
      text: `${column} ${operator} $${this.paramIndex++}`,
      values: [value],
    });
    return this;
  }

  /**
   * Add a WHERE IN condition
   */
  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.parts.push({ text: '1=0', values: [] });
      return this;
    }
    const placeholders = values.map(() => `$${this.paramIndex++}`).join(', ');
    this.parts.push({
      text: `${column} IN (${placeholders})`,
      values,
    });
    return this;
  }

  /**
   * Add a WHERE NULL condition
   */
  whereNull(column: string): this {
    this.parts.push({ text: `${column} IS NULL`, values: [] });
    return this;
  }

  /**
   * Add a WHERE NOT NULL condition
   */
  whereNotNull(column: string): this {
    this.parts.push({ text: `${column} IS NOT NULL`, values: [] });
    return this;
  }

  /**
   * Add a raw WHERE condition
   */
  whereRaw(sql: string, values?: unknown[]): this {
    this.parts.push({ text: sql, values: values || [] });
    return this;
  }

  /**
   * Add ORDER BY
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    const last = this.parts[this.parts.length - 1];
    if (last && last.text.startsWith('ORDER BY')) {
      last.text += `, ${column} ${direction}`;
    } else {
      this.parts.push({ text: `ORDER BY ${column} ${direction}`, values: [] });
    }
    return this;
  }

  /**
   * Add LIMIT
   */
  limit(count: number): this {
    this.parts.push({ text: `LIMIT $${this.paramIndex++}`, values: [count] });
    return this;
  }

  /**
   * Add OFFSET
   */
  offset(count: number): this {
    this.parts.push({ text: `OFFSET $${this.paramIndex++}`, values: [count] });
    return this;
  }

  /**
   * Build the final query
   */
  build(baseQuery: string): { text: string; values: unknown[] } {
    const whereClauses = this.parts
      .filter(p => !p.text.startsWith('ORDER BY') && !p.text.startsWith('LIMIT') && !p.text.startsWith('OFFSET'))
      .map(p => p.text);
    
    const orderBy = this.parts.find(p => p.text.startsWith('ORDER BY'));
    const limit = this.parts.find(p => p.text.startsWith('LIMIT'));
    const offset = this.parts.find(p => p.text.startsWith('OFFSET'));

    let query = baseQuery;
    const values: unknown[] = [];

    // Add WHERE clause
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    // Collect values in order
    for (const part of this.parts) {
      values.push(...part.values);
    }

    // Add ORDER BY, LIMIT, OFFSET
    if (orderBy) query += ' ' + orderBy.text;
    if (limit) query += ' ' + limit.text;
    if (offset) query += ' ' + offset.text;

    return { text: query, values };
  }
}

// ============================================================================
// Optimized Query Templates
// ============================================================================

export const OPTIMIZED_QUERIES = {
  /**
   * Get paginated results with total count in a single query
   */
  PAGINATE_WITH_COUNT: `
    WITH count_query AS (
      SELECT COUNT(*) as total FROM ({base_query}) as subquery
    )
    SELECT *, (SELECT total FROM count_query) as total_count
    FROM ({base_query}) as data
    ORDER BY {order_by}
    LIMIT $1 OFFSET $2
  `,

  /**
   * Upsert pattern for PostgreSQL
   */
  UPSERT: `
    INSERT INTO {table} ({columns})
    VALUES ({placeholders})
    ON CONFLICT ({conflict_columns})
    DO UPDATE SET {update_columns}
    RETURNING *
  `,

  /**
   * Bulk upsert pattern
   */
  BULK_UPSERT: `
    INSERT INTO {table} ({columns})
    VALUES {value_groups}
    ON CONFLICT ({conflict_columns})
    DO UPDATE SET {update_columns}
  `,

  /**
   * Find with FOR UPDATE SKIP LOCKED (for concurrent processing)
   */
  FIND_FOR_UPDATE_SKIP_LOCKED: `
    SELECT * FROM {table}
    WHERE {conditions}
    ORDER BY {order_by}
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,

  /**
   * Count with grouping
   */
  COUNT_WITH_GROUPING: `
    SELECT {group_columns}, COUNT(*) as count
    FROM {table}
    {where_clause}
    GROUP BY {group_columns}
    ORDER BY {order_by}
  `,
};

// ============================================================================
// Index Manager
// ============================================================================

export class IndexManager {
  constructor(private pool: Pool) {}

  /**
   * Create all optimized indexes
   */
  async createAllIndexes(): Promise<void> {
    for (const index of OPTIMIZED_INDEXES) {
      await this.createIndex(index);
    }
  }

  /**
   * Create a single index
   */
  async createIndex(index: IndexDefinition): Promise<void> {
    const columns = index.columns.join(', ');
    const unique = index.unique ? 'UNIQUE' : '';
    const ifNotExists = index.ifNotExists ? 'IF NOT EXISTS' : '';
    const comment = index.comment ? `COMMENT ON INDEX ${index.name} IS '${index.comment}'` : '';

    const query = `
      CREATE ${unique} INDEX ${ifNotExists} ${index.name}
      ON ${index.table} (${columns})
    `;

    await this.pool.query(query);

    if (comment) {
      await this.pool.query(comment);
    }
  }

  /**
   * Drop all optimized indexes
   */
  async dropAllIndexes(): Promise<void> {
    for (const index of OPTIMIZED_INDEXES) {
      await this.dropIndex(index.name);
    }
  }

  /**
   * Drop a single index
   */
  async dropIndex(indexName: string): Promise<void> {
    await this.pool.query(`DROP INDEX IF EXISTS ${indexName}`);
  }

  /**
   * Check if an index exists
   */
  async indexExists(indexName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName]
    );
    return result.rows.length > 0;
  }

  /**
   * Get index size and statistics
   */
  async getIndexStats(): Promise<Array<{
    indexName: string;
    tableName: string;
    sizeBytes: number;
    indexDef: string;
  }>> {
    const result = await this.pool.query(`
      SELECT
        i.relname as index_name,
        t.relname as table_name,
        pg_total_relation_size(i.oid) as size_bytes,
        pg_get_indexdef(i.oid) as index_def
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      WHERE t.relname LIKE 'dash_%' OR t.relname = 'agents' OR t.relname = 'sessions'
      ORDER BY size_bytes DESC
    `);

    return result.rows.map(row => ({
      indexName: row.index_name,
      tableName: row.table_name,
      sizeBytes: parseInt(row.size_bytes, 10),
      indexDef: row.index_def,
    }));
  }
}

// ============================================================================
// Query Analyzer
// ============================================================================

export interface QueryAnalysis {
  query: string;
  estimatedCost: number;
  plan: unknown;
  suggestions: string[];
}

/**
 * Analyze a query and provide optimization suggestions
 */
export async function analyzeQuery(
  pool: Pool,
  query: string,
  params: unknown[] = []
): Promise<QueryAnalysis> {
  // Get the query plan
  const explainResult = await pool.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    params
  );

  const plan = explainResult.rows[0]['QUERY PLAN'];
  const suggestions: string[] = [];

  // Analyze plan and generate suggestions
  if (plan && typeof plan === 'object') {
    const planObj = plan as Record<string, unknown>;
    
    // Check for sequential scans
    const plans = getAllPlans(planObj);
    const hasSeqScan = plans.some((p: Record<string, unknown>) => 
      p['Node Type'] === 'Seq Scan'
    );

    if (hasSeqScan) {
      suggestions.push('Consider adding an index to avoid sequential scan');
    }

    // Check for high cost
    const totalCost = getTotalCost(planObj);
    if (totalCost > 10000) {
      suggestions.push('Query has high estimated cost. Consider optimizing with indexes or query restructuring.');
    }

    // Check for large row counts
    const planRows = getPlanRows(planObj);
    if (planRows > 10000) {
      suggestions.push(`Query returns many rows (${planRows}). Consider pagination or limiting results.`);
    }
  }

  return {
    query,
    estimatedCost: getTotalCost(plan as Record<string, unknown>),
    plan,
    suggestions,
  };
}

// Helper function to extract all plans from nested plans
function getAllPlans(plan: Record<string, unknown>): Record<string, unknown>[] {
  const plans: Record<string, unknown>[] = [];
  
  function extract(p: Record<string, unknown>) {
    plans.push(p);
    const children = p['Plans'] as Record<string, unknown>[] | undefined;
    if (children) {
      for (const child of children) {
        extract(child);
      }
    }
  }
  
  extract(plan);
  return plans;
}

// Helper function to get total cost from plan
function getTotalCost(plan: Record<string, unknown>): number {
  const startup = parseFloat(String(plan['Startup Cost'] || 0));
  const total = parseFloat(String(plan['Total Cost'] || 0));
  return startup + total;
}

// Helper function to get row count from plan
function getPlanRows(plan: Record<string, unknown>): number {
  return parseInt(String(plan['Plan Rows'] || 0), 10);
}

// ============================================================================
// Query Hint Utilities
// ============================================================================

/**
 * Add index hint to query (PostgreSQL ignores hints but this documents intent)
 */
export function withIndexHint(query: string, indexName: string): string {
  return `-- Using index: ${indexName}\n${query}`;
}

/**
 * Add parallel hint to query
 */
export function withParallelHint(query: string, workers: number): string {
  return `-- Parallel workers: ${workers}\nSET max_parallel_workers_per_gather = ${workers};\n${query}`;
}

// ============================================================================
// Prepared Statement Caching
// ============================================================================

interface PreparedStatement {
  name: string;
  query: string;
  lastUsed: number;
}

const preparedStatements = new Map<string, PreparedStatement>();
const MAX_PREPARED_STATEMENTS = 100;

/**
 * Get or create a prepared statement
 */
export async function getPreparedStatement(
  pool: Pool,
  name: string,
  query: string
): Promise<void> {
  // Check if already prepared
  if (preparedStatements.has(name)) {
    const stmt = preparedStatements.get(name)!;
    stmt.lastUsed = Date.now();
    return;
  }

  // Prepare the statement
  await pool.query(`PREPARE ${name} AS ${query}`);

  // Manage cache size
  if (preparedStatements.size >= MAX_PREPARED_STATEMENTS) {
    // Remove least recently used
    let oldestName: string | null = null;
    let oldestTime = Infinity;
    
    for (const [stmtName, stmt] of preparedStatements) {
      if (stmt.lastUsed < oldestTime) {
        oldestTime = stmt.lastUsed;
        oldestName = stmtName;
      }
    }

    if (oldestName) {
      await pool.query(`DEALLOCATE ${oldestName}`);
      preparedStatements.delete(oldestName);
    }
  }

  // Cache the statement
  preparedStatements.set(name, {
    name,
    query,
    lastUsed: Date.now(),
  });
}

/**
 * Execute a prepared statement
 */
export async function executePrepared<T = unknown>(
  pool: Pool,
  name: string,
  params: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await pool.query(`EXECUTE ${name}(${params.map((_, i) => `$${i + 1}`).join(', ')})`, params);
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount || 0,
  };
}

/**
 * Clear all prepared statements
 */
export async function clearPreparedStatements(pool: Pool): Promise<void> {
  for (const name of preparedStatements.keys()) {
    try {
      await pool.query(`DEALLOCATE ${name}`);
    } catch {
      // Ignore errors
    }
  }
  preparedStatements.clear();
}

export default {
  OPTIMIZED_INDEXES,
  OPTIMIZED_QUERIES,
  QueryBuilder,
  IndexManager,
  analyzeQuery,
  withIndexHint,
  withParallelHint,
};

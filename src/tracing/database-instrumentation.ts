/**
 * Database Tracing Instrumentation
 * 
 * Instruments database operations for distributed tracing.
 * Tracks query execution with detailed attributes.
 */

import { logger } from '../utils/logger';
import { SpanKind } from '@opentelemetry/api';
import { 
  withSpan, 
  getCurrentTraceId,
  setBaggage,
  getBaggage,
} from './opentelemetry';

// ============================================================================
// Span Names
// ============================================================================

const SPAN_NAMES = {
  DB_QUERY: 'db.query',
  DB_TRANSACTION: 'db.transaction',
  DB_POOL_ACQUIRE: 'db.pool.acquire',
  DB_POOL_RELEASE: 'db.pool.release',
  DB_MIGRATION: 'db.migration',
} as const;

// ============================================================================
// Query Instrumentation
// ============================================================================

/**
 * Instrument SQL query execution
 */
export async function instrumentQuery<T>(
  sql: string,
  params: unknown[],
  fn: () => Promise<T>,
  options?: {
    table?: string;
    operation?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'ALTER' | 'DROP';
    database?: string;
  }
): Promise<T> {
  // Sanitize and truncate SQL for attributes
  const sanitizedSql = sanitizeSql(sql);
  const operation = options?.operation || detectOperation(sql);
  const table = options?.table || detectTable(sql);

  const attributes = {
    'db.system': 'postgresql',
    'db.name': options?.database || getBaggage('db.name') || 'dash',
    'db.statement': sanitizedSql,
    'db.operation': operation,
    'db.sql.table': table,
    'db.sql.parameter_count': params.length,
  };

  return withSpan(SPAN_NAMES.DB_QUERY, async (span) => {
    span.setAttributes(attributes);

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      // Extract row count from result if possible
      const rowCount = extractRowCount(result);
      
      span.setAttributes({
        'db.query_duration_ms': duration,
        'db.rows_affected': rowCount,
        'db.query_success': true,
      });
      
      // Log slow queries
      if (duration > 1000) {
        logger.warn(`[DBTracing] Slow query detected (${duration}ms): ${sanitizedSql.slice(0, 100)}`);
        span.setAttribute('db.slow_query', true);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'db.query_duration_ms': duration,
        'db.query_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
        'error.message': error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
      
      throw error;
    }
  }, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

/**
 * Instrument database transaction
 */
export async function instrumentTransaction<T>(
  fn: () => Promise<T>,
  options?: {
    isolationLevel?: string;
    readonly?: boolean;
    database?: string;
  }
): Promise<T> {
  const attributes = {
    'db.system': 'postgresql',
    'db.name': options?.database || getBaggage('db.name') || 'dash',
    'db.transaction.isolation_level': options?.isolationLevel || 'default',
    'db.transaction.readonly': options?.readonly || false,
  };

  return withSpan(SPAN_NAMES.DB_TRANSACTION, async (span) => {
    span.setAttributes(attributes);

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'transaction.duration_ms': duration,
        'transaction.success': true,
        'transaction.committed': true,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'transaction.duration_ms': duration,
        'transaction.success': false,
        'transaction.committed': false,
        'transaction.rolled_back': true,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  });
}

/**
 * Instrument connection pool acquire
 */
export async function instrumentPoolAcquire<T>(
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.DB_POOL_ACQUIRE, async (span) => {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'pool.acquire_duration_ms': duration,
        'pool.acquire_success': true,
      });
      
      // Log slow pool acquires
      if (duration > 100) {
        span.setAttribute('pool.slow_acquire', true);
        logger.warn(`[DBTracing] Slow pool acquire (${duration}ms)`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'pool.acquire_duration_ms': duration,
        'pool.acquire_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  });
}

/**
 * Instrument connection pool release
 */
export function instrumentPoolRelease(fn: () => void): void {
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer('dash-database');
  
  const span = tracer.startSpan(SPAN_NAMES.DB_POOL_RELEASE, {
    kind: SpanKind.CLIENT,
  });
  
  try {
    fn();
    span.setAttribute('pool.release_success', true);
  } catch (error) {
    span.setAttributes({
      'pool.release_success': false,
      'error.type': error instanceof Error ? error.name : 'Unknown',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Instrument database migration
 */
export async function instrumentMigration<T>(
  migrationName: string,
  direction: 'up' | 'down',
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.DB_MIGRATION, async (span) => {
    span.setAttributes({
      'migration.name': migrationName,
      'migration.direction': direction,
    });

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'migration.duration_ms': duration,
        'migration.success': true,
      });
      
      logger.info(`[DBTracing] Migration ${migrationName} ${direction} completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'migration.duration_ms': duration,
        'migration.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  });
}

// ============================================================================
// Repository Instrumentation
// ============================================================================

/**
 * Create traced repository method
 */
export function createTracedRepositoryMethod<T extends (...args: unknown[]) => Promise<unknown>>(
  method: T,
  tableName: string,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
): T {
  return (async (...args: unknown[]) => {
    return instrumentQuery(
      `${operation} ${tableName}`,
      args,
      async () => method(...args) as Promise<unknown>,
      { table: tableName, operation }
    );
  }) as T;
}

/**
 * Instrument repository operations
 */
export function instrumentRepository<T extends Record<string, unknown>>(
  repository: T,
  tableName: string
): T {
  const instrumented = { ...repository };
  
  const operationMap: Record<string, 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'> = {
    'findById': 'SELECT',
    'findAll': 'SELECT',
    'findOne': 'SELECT',
    'create': 'INSERT',
    'update': 'UPDATE',
    'delete': 'DELETE',
    'deleteById': 'DELETE',
    'save': 'INSERT',
    'upsert': 'UPDATE',
  };
  
  for (const [key, value] of Object.entries(repository)) {
    if (typeof value === 'function') {
      const operation = operationMap[key] || 'SELECT';
      (instrumented as Record<string, unknown>)[key] = createTracedRepositoryMethod(
        value as (...args: unknown[]) => Promise<unknown>,
        tableName,
        operation
      );
    }
  }
  
  return instrumented;
}

// ============================================================================
// PostgreSQL Pool Wrapper
// ============================================================================

/**
 * Wrap PostgreSQL pool query method with tracing
 */
export function wrapPostgresPool(pool: { query: Function }): { query: Function } {
  const originalQuery = pool.query.bind(pool);
  
  return {
    query: async (sql: string, params?: unknown[]) => {
      return instrumentQuery(sql, params || [], async () => {
        return originalQuery(sql, params);
      });
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize SQL for span attributes
 */
function sanitizeSql(sql: string): string {
  // Remove excessive whitespace
  let sanitized = sql.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long
  if (sanitized.length > 2000) {
    sanitized = sanitized.slice(0, 2000) + '...';
  }
  
  return sanitized;
}

/**
 * Detect SQL operation type
 */
function detectOperation(sql: string): string {
  const firstWord = sql.trim().split(/\s+/)[0]?.toUpperCase();
  return firstWord || 'UNKNOWN';
}

/**
 * Detect table name from SQL
 */
function detectTable(sql: string): string {
  const sqlUpper = sql.toUpperCase();
  
  // Try to extract table name from various SQL patterns
  const patterns = [
    /FROM\s+(\w+)/i,
    /INTO\s+(\w+)/i,
    /UPDATE\s+(\w+)/i,
    /TABLE\s+(\w+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) {
      return match[1] || 'unknown';
    }
  }
  
  return 'unknown';
}

/**
 * Extract row count from query result
 */
function extractRowCount(result: unknown): number {
  if (!result) return 0;
  
  const r = result as { 
    rowCount?: number; 
    rows?: unknown[];
    length?: number;
  };
  
  return r.rowCount ?? r.rows?.length ?? r.length ?? 0;
}

// ============================================================================
// Logging with Trace Correlation
// ============================================================================

/**
 * Log database event with trace correlation
 */
export function logDatabaseEvent(
  eventType: string,
  operation: string,
  table: string,
  data?: Record<string, unknown>
): void {
  const traceId = getCurrentTraceId();
  const dbName = getBaggage('db.name') || 'dash';
  
  logger.info(`[DBTracing] ${eventType}`, {
    event: eventType,
    db_operation: operation,
    db_table: table,
    db_name: dbName,
    trace_id: traceId,
    ...data,
  });
}

// ============================================================================
// Exports
// ============================================================================

export { SPAN_NAMES };

/**
 * Transaction Manager - Advanced Transaction Handling
 * 
 * Provides:
 * - Transaction management with savepoint support
 * - Optimistic locking for concurrent updates
 * - Retry logic for serialization failures
 * - Race condition prevention
 */

import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface TransactionOptions {
  /** Transaction isolation level */
  isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  /** Read-only transaction */
  readOnly?: boolean;
  /** Maximum retry attempts for serialization failures */
  maxRetries?: number;
  /** Base delay between retries in ms */
  retryDelayMs?: number;
  /** Transaction timeout in ms */
  timeoutMs?: number;
}

export interface SavepointOptions {
  /** Auto-rollback on error */
  autoRollback?: boolean;
}

export interface OptimisticLockOptions {
  /** Version column name (default: 'version') */
  versionColumn?: string;
  /** Updated at column name (default: 'updated_at') */
  updatedAtColumn?: string;
  /** Auto-increment version on update */
  autoIncrementVersion?: boolean;
}

export interface TransactionContext {
  client: PoolClient;
  id: string;
  startTime: Date;
  options: TransactionOptions;
  savepoints: string[];
  isActive: boolean;
}

export class OptimisticLockError extends Error {
  constructor(
    message: string = 'Record was modified by another transaction',
    public readonly table?: string,
    public readonly id?: string,
    public readonly expectedVersion?: number,
    public readonly actualVersion?: number
  ) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export class TransactionTimeoutError extends Error {
  constructor(message: string = 'Transaction timed out') {
    super(message);
    this.name = 'TransactionTimeoutError';
  }
}

export class TransactionRollbackError extends Error {
  constructor(
    message: string = 'Transaction was rolled back',
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TransactionRollbackError';
  }
}

// ============================================================================
// Transaction Manager
// ============================================================================

export class TransactionManager {
  private pool: Pool | null = null;
  private activeTransactions: Map<string, TransactionContext> = new Map();
  private transactionIdCounter = 0;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${++this.transactionIdCounter}`;
  }

  /**
   * Execute an operation within a transaction
   * Provides automatic retry for serialization failures
   */
  async withTransaction<T>(
    operation: (client: PoolClient, context: TransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const {
      isolationLevel = 'READ COMMITTED',
      readOnly = false,
      maxRetries = 3,
      retryDelayMs = 100,
      timeoutMs = 30000,
    } = options;

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const client = await this.pool!.connect();
      const txId = this.generateTransactionId();
      const startTime = Date.now();
      
      const context: TransactionContext = {
        client,
        id: txId,
        startTime: new Date(),
        options,
        savepoints: [],
        isActive: true,
      };

      this.activeTransactions.set(txId, context);

      try {
        // Set isolation level
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        
        if (readOnly) {
          await client.query('SET TRANSACTION READ ONLY');
        }

        // Set statement timeout
        await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);

        logger.debug(`[Transaction] Started ${txId} (${isolationLevel})`);

        // Execute operation with timeout
        const result = await Promise.race([
          operation(client, context),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new TransactionTimeoutError()), timeoutMs)
          ),
        ]);

        await client.query('COMMIT');
        logger.debug(`[Transaction] Committed ${txId} (${Date.now() - startTime}ms)`);
        
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable (serialization failure or deadlock)
        if (this.isRetryableError(lastError) && attempt < maxRetries - 1) {
          const delay = retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          logger.warn(
            `[Transaction] ${txId} failed with retryable error, ` +
            `retrying (${attempt + 1}/${maxRetries}) in ${delay}ms...`
          );
          await this.delay(delay);
          continue;
        }
        
        throw lastError;
      } finally {
        context.isActive = false;
        this.activeTransactions.delete(txId);
        client.release();
      }
    }

    throw lastError || new Error('Transaction failed after max retries');
  }

  /**
   * Create a savepoint within a transaction
   */
  async withSavepoint<T>(
    context: TransactionContext,
    name: string,
    operation: () => Promise<T>,
    options: SavepointOptions = {}
  ): Promise<T> {
    const { autoRollback = true } = options;
    const savepointName = `sp_${name}_${Date.now()}`;
    
    if (!context.isActive) {
      throw new Error('Transaction is not active');
    }

    try {
      await context.client.query(`SAVEPOINT ${savepointName}`);
      context.savepoints.push(savepointName);
      
      logger.debug(`[Transaction] Created savepoint ${savepointName} in ${context.id}`);

      const result = await operation();
      
      await context.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      context.savepoints = context.savepoints.filter(sp => sp !== savepointName);
      
      return result;
    } catch (error) {
      if (autoRollback) {
        await context.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`).catch(() => {});
        context.savepoints = context.savepoints.filter(sp => sp !== savepointName);
        logger.debug(`[Transaction] Rolled back to savepoint ${savepointName}`);
      }
      throw error;
    }
  }

  /**
   * Execute operations in parallel within the same transaction
   * All operations share the same transaction context
   */
  async parallelInTransaction<T>(
    context: TransactionContext,
    operations: Array<() => Promise<T>>
  ): Promise<T[]> {
    if (!context.isActive) {
      throw new Error('Transaction is not active');
    }

    // Execute operations in parallel - they share the same client/transaction
    return Promise.all(operations.map(op => op()));
  }

  /**
   * Update a record with optimistic locking
   * Prevents lost updates in concurrent scenarios
   */
  async updateWithOptimisticLock<T extends Record<string, unknown>>(
    context: TransactionContext | PoolClient,
    table: string,
    id: string,
    updates: Record<string, unknown>,
    expectedVersion: number,
    options: OptimisticLockOptions = {}
  ): Promise<T> {
    const {
      versionColumn = 'version',
      updatedAtColumn = 'updated_at',
      autoIncrementVersion = true,
    } = options;

    const client = context instanceof Object && 'client' in context 
      ? context.client 
      : context;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build SET clauses for updates
    for (const [key, value] of Object.entries(updates)) {
      if (key !== versionColumn && key !== updatedAtColumn) {
        setClauses.push(`${this.toSnakeCase(key)} = $${paramIndex++}`);
        values.push(this.serializeValue(value));
      }
    }

    // Add version increment
    if (autoIncrementVersion) {
      setClauses.push(`${versionColumn} = ${versionColumn} + 1`);
    }

    // Add updated_at timestamp
    setClauses.push(`${updatedAtColumn} = NOW()`);

    // Add id and expected version to values
    values.push(id, expectedVersion);

    const query = `
      UPDATE ${table} 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex} 
        AND ${versionColumn} = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      // Get current version for error details
      const currentResult = await client.query(
        `SELECT ${versionColumn} FROM ${table} WHERE id = $1`,
        [id]
      );
      
      const actualVersion = currentResult.rows[0]?.[versionColumn] as number | undefined;
      
      throw new OptimisticLockError(
        `Record ${table}.${id} was modified by another transaction. ` +
        `Expected version ${expectedVersion}, found ${actualVersion ?? 'none'}`,
        table,
        id,
        expectedVersion,
        actualVersion
      );
    }

    return result.rows[0] as T;
  }

  /**
   * Batch update with optimistic locking
   * Updates multiple records atomically, all must succeed or none
   */
  async batchUpdateWithOptimisticLock<T extends Record<string, unknown>>(
    context: TransactionContext,
    table: string,
    items: Array<{
      id: string;
      updates: Record<string, unknown>;
      expectedVersion: number;
    }>,
    options: OptimisticLockOptions = {}
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (const item of items) {
      const result = await this.updateWithOptimisticLock<T>(
        context,
        table,
        item.id,
        item.updates,
        item.expectedVersion,
        options
      );
      results.push(result);
    }
    
    return results;
  }

  /**
   * Atomic increment operation
   * Safely increment a counter without race conditions
   */
  async atomicIncrement(
    context: TransactionContext | PoolClient,
    table: string,
    id: string,
    column: string,
    amount: number = 1
  ): Promise<number> {
    const client = context instanceof Object && 'client' in context 
      ? context.client 
      : context;

    const result = await client.query(
      `UPDATE ${table} 
       SET ${column} = ${column} + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING ${column}`,
      [amount, id]
    );

    if (result.rowCount === 0) {
      throw new Error(`Record ${table}.${id} not found`);
    }

    return result.rows[0][column] as number;
  }

  /**
   * Atomic compare-and-swap operation
   * Only updates if current value matches expected value
   */
  async compareAndSwap<T extends Record<string, unknown>>(
    context: TransactionContext | PoolClient,
    table: string,
    id: string,
    column: string,
    expectedValue: unknown,
    newValue: unknown
  ): Promise<T | null> {
    const client = context instanceof Object && 'client' in context 
      ? context.client 
      : context;

    const result = await client.query(
      `UPDATE ${table} 
       SET ${column} = $1,
           updated_at = NOW()
       WHERE id = $2 
         AND ${column} = $3
       RETURNING *`,
      [this.serializeValue(newValue), id, this.serializeValue(expectedValue)]
    );

    return result.rowCount && result.rowCount > 0 ? (result.rows[0] as T) : null;
  }

  /**
   * Get active transaction count
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Get active transaction details (for monitoring)
   */
  getActiveTransactions(): Array<{
    id: string;
    startTime: Date;
    durationMs: number;
    savepointCount: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeTransactions.values()).map(tx => ({
      id: tx.id,
      startTime: tx.startTime,
      durationMs: now - tx.startTime.getTime(),
      savepointCount: tx.savepoints.length,
    }));
  }

  /**
   * Force rollback of a specific transaction (emergency use)
   */
  async forceRollback(transactionId: string): Promise<boolean> {
    const context = this.activeTransactions.get(transactionId);
    if (!context || !context.isActive) {
      return false;
    }

    try {
      await context.client.query('ROLLBACK');
      context.isActive = false;
      this.activeTransactions.delete(transactionId);
      logger.warn(`[Transaction] Force rolled back ${transactionId}`);
      return true;
    } catch (error) {
      logger.error(`[Transaction] Failed to force rollback ${transactionId}:`, error);
      return false;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableCodes = [
      '40001', // serialization_failure
      '40P01', // deadlock_detected
      '55P03', // lock_not_available
    ];
    
    const code = (error as { code?: string }).code;
    const message = error.message.toLowerCase();
    
    return (
      retryableCodes.includes(code || '') ||
      message.includes('serialization') ||
      message.includes('deadlock') ||
      message.includes('lock timeout') ||
      message.includes('could not serialize')
    );
  }

  /**
   * Serialize value for database
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return JSON.stringify(value);
    }
    return value;
  }

  /**
   * Convert camelCase to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a transaction manager from a pool
 */
export function createTransactionManager(pool: Pool): TransactionManager {
  return new TransactionManager(pool);
}

/**
 * Execute within a transaction (standalone helper)
 */
export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const manager = new TransactionManager(pool);
  return manager.withTransaction((client) => operation(client), options);
}

/**
 * Update with optimistic locking (standalone helper)
 */
export async function updateWithOptimisticLock<T extends Record<string, unknown>>(
  pool: Pool,
  table: string,
  id: string,
  updates: Record<string, unknown>,
  expectedVersion: number,
  options?: TransactionOptions & OptimisticLockOptions
): Promise<T> {
  const manager = new TransactionManager(pool);
  return manager.withTransaction(async (client, context) => {
    return manager.updateWithOptimisticLock<T>(
      context,
      table,
      id,
      updates,
      expectedVersion,
      options
    );
  }, options);
}

export default TransactionManager;

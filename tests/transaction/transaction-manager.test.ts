/**
 * Transaction Manager Tests
 * 
 * Tests for:
 * - Basic transaction operations
 * - Optimistic locking
 * - Race condition prevention
 * - Serialization failure handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  TransactionManager,
  OptimisticLockError,
  TransactionTimeoutError,
  withTransaction,
  updateWithOptimisticLock,
} from '../../src/storage/transaction';

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env['TEST_DB_HOST'] || 'localhost',
  port: parseInt(process.env['TEST_DB_PORT'] || '5432', 10),
  database: process.env['TEST_DB_NAME'] || 'dash_test',
  user: process.env['TEST_DB_USER'] || 'dash',
  password: process.env['TEST_DB_PASSWORD'] || 'dash',
};

describe('TransactionManager', () => {
  let pool: Pool;
  let txManager: TransactionManager;

  beforeAll(async () => {
    pool = new Pool(TEST_DB_CONFIG);
    txManager = new TransactionManager(pool);

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER DEFAULT 0,
        version INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS test_items');
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE test_items RESTART IDENTITY');
  });

  describe('Basic Transactions', () => {
    it('should execute operations within a transaction', async () => {
      const result = await txManager.withTransaction(async (client) => {
        await client.query(
          'INSERT INTO test_items (id, name, value) VALUES ($1, $2, $3)',
          ['item1', 'Test Item', 100]
        );
        
        const { rows } = await client.query(
          'SELECT * FROM test_items WHERE id = $1',
          ['item1']
        );
        
        return rows[0];
      });

      expect(result).toBeDefined();
      expect(result['name']).toBe('Test Item');
      expect(result['value']).toBe(100);
    });

    it('should rollback on error', async () => {
      await expect(
        txManager.withTransaction(async (client) => {
          await client.query(
            'INSERT INTO test_items (id, name) VALUES ($1, $2)',
            ['item1', 'Test']
          );
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');

      // Verify item was not persisted
      const { rows } = await pool.query(
        'SELECT * FROM test_items WHERE id = $1',
        ['item1']
      );
      expect(rows).toHaveLength(0);
    });

    it('should support different isolation levels', async () => {
      await txManager.withTransaction(
        async (client) => {
          await client.query(
            'INSERT INTO test_items (id, name) VALUES ($1, $2)',
            ['item1', 'Test']
          );
        },
        { isolationLevel: 'SERIALIZABLE' }
      );

      const { rows } = await pool.query(
        'SELECT * FROM test_items WHERE id = $1',
        ['item1']
      );
      expect(rows).toHaveLength(1);
    });

    it('should timeout long-running transactions', async () => {
      await expect(
        txManager.withTransaction(
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
          },
          { timeoutMs: 50 }
        )
      ).rejects.toThrow(TransactionTimeoutError);
    });
  });

  describe('Optimistic Locking', () => {
    beforeEach(async () => {
      await pool.query(
        'INSERT INTO test_items (id, name, value, version) VALUES ($1, $2, $3, $4)',
        ['item1', 'Test Item', 100, 1]
      );
    });

    it('should update with matching version', async () => {
      const result = await txManager.withTransaction(async (client, context) => {
        return txManager.updateWithOptimisticLock(
          context,
          'test_items',
          'item1',
          { name: 'Updated Item', value: 200 },
          1
        );
      });

      expect(result['name']).toBe('Updated Item');
      expect(result['value']).toBe(200);
      expect(result['version']).toBe(2);
    });

    it('should throw OptimisticLockError on version mismatch', async () => {
      // Simulate concurrent update
      await pool.query(
        'UPDATE test_items SET version = 2, name = $1 WHERE id = $2',
        ['Concurrent Update', 'item1']
      );

      await expect(
        txManager.withTransaction(async (client, context) => {
          return txManager.updateWithOptimisticLock(
            context,
            'test_items',
            'item1',
            { name: 'Should Fail' },
            1 // Old version
          );
        })
      ).rejects.toThrow(OptimisticLockError);
    });

    it('should include version details in error', async () => {
      await pool.query(
        'UPDATE test_items SET version = 5 WHERE id = $1',
        ['item1']
      );

      try {
        await txManager.withTransaction(async (client, context) => {
          return txManager.updateWithOptimisticLock(
            context,
            'test_items',
            'item1',
            { name: 'Should Fail' },
            1
          );
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OptimisticLockError);
        expect((error as OptimisticLockError).table).toBe('test_items');
        expect((error as OptimisticLockError).id).toBe('item1');
        expect((error as OptimisticLockError).expectedVersion).toBe(1);
        expect((error as OptimisticLockError).actualVersion).toBe(5);
      }
    });
  });

  describe('Savepoints', () => {
    beforeEach(async () => {
      await pool.query(
        'INSERT INTO test_items (id, name) VALUES ($1, $2)',
        ['item1', 'Original']
      );
    });

    it('should create and release savepoint on success', async () => {
      const result = await txManager.withTransaction(async (client, context) => {
        return txManager.withSavepoint(context, 'update_sp', async () => {
          await client.query(
            'UPDATE test_items SET name = $1 WHERE id = $2',
            ['Updated', 'item1']
          );
          return 'success';
        });
      });

      expect(result).toBe('success');
      
      const { rows } = await pool.query(
        'SELECT name FROM test_items WHERE id = $1',
        ['item1']
      );
      expect(rows[0]['name']).toBe('Updated');
    });

    it('should rollback to savepoint on error', async () => {
      await txManager.withTransaction(async (client, context) => {
        // First savepoint - should succeed
        await txManager.withSavepoint(context, 'first', async () => {
          await client.query(
            'UPDATE test_items SET name = $1 WHERE id = $2',
            ['First Update', 'item1']
          );
        });

        // Second savepoint - should fail
        try {
          await txManager.withSavepoint(context, 'second', async () => {
            await client.query(
              'UPDATE test_items SET name = $1 WHERE id = $2',
              ['Second Update', 'item1']
            );
            throw new Error('Intentional error');
          });
        } catch {
          // Expected
        }
      });

      // First update should persist, second should not
      const { rows } = await pool.query(
        'SELECT name FROM test_items WHERE id = $1',
        ['item1']
      );
      expect(rows[0]['name']).toBe('First Update');
    });
  });

  describe('Atomic Operations', () => {
    beforeEach(async () => {
      await pool.query(
        'INSERT INTO test_items (id, name, value, version) VALUES ($1, $2, $3, $4)',
        ['counter1', 'Counter', 0, 1]
      );
    });

    it('should atomically increment counter', async () => {
      const result = await txManager.withTransaction(async (client, context) => {
        return txManager.atomicIncrement(context, 'test_items', 'counter1', 'value', 5);
      });

      expect(result).toBe(5);

      const { rows } = await pool.query(
        'SELECT value FROM test_items WHERE id = $1',
        ['counter1']
      );
      expect(rows[0]['value']).toBe(5);
    });

    it('should handle concurrent increments correctly', async () => {
      // Simulate 10 concurrent increments
      const promises = Array(10).fill(null).map(() =>
        txManager.withTransaction(async (client, context) => {
          return txManager.atomicIncrement(context, 'test_items', 'counter1', 'value', 1);
        })
      );

      await Promise.all(promises);

      const { rows } = await pool.query(
        'SELECT value FROM test_items WHERE id = $1',
        ['counter1']
      );
      expect(rows[0]['value']).toBe(10);
    });

    it('should support compare-and-swap', async () => {
      const result = await txManager.withTransaction(async (client, context) => {
        return txManager.compareAndSwap(
          context,
          'test_items',
          'counter1',
          'value',
          0, // expected
          100 // new
        );
      });

      expect(result).not.toBeNull();
      expect(result!['value']).toBe(100);
    });

    it('should return null on compare-and-swap mismatch', async () => {
      const result = await txManager.withTransaction(async (client, context) => {
        return txManager.compareAndSwap(
          context,
          'test_items',
          'counter1',
          'value',
          999, // wrong expected
          100
        );
      });

      expect(result).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 3; i++) {
        await pool.query(
          'INSERT INTO test_items (id, name, value, version) VALUES ($1, $2, $3, $4)',
          [`item${i}`, `Item ${i}`, i * 10, 1]
        );
      }
    });

    it('should batch update with optimistic locking', async () => {
      const results = await txManager.withTransaction(async (client, context) => {
        return txManager.batchUpdateWithOptimisticLock(
          context,
          'test_items',
          [
            { id: 'item1', updates: { value: 100 }, expectedVersion: 1 },
            { id: 'item2', updates: { value: 200 }, expectedVersion: 1 },
            { id: 'item3', updates: { value: 300 }, expectedVersion: 1 },
          ]
        );
      });

      expect(results).toHaveLength(3);
      expect(results[0]['value']).toBe(100);
      expect(results[1]['value']).toBe(200);
      expect(results[2]['value']).toBe(300);
    });

    it('should rollback entire batch on any conflict', async () => {
      // Update item2 to change its version
      await pool.query(
        'UPDATE test_items SET version = 2 WHERE id = $1',
        ['item2']
      );

      await expect(
        txManager.withTransaction(async (client, context) => {
          return txManager.batchUpdateWithOptimisticLock(
            context,
            'test_items',
            [
              { id: 'item1', updates: { value: 100 }, expectedVersion: 1 },
              { id: 'item2', updates: { value: 200 }, expectedVersion: 1 }, // Will fail
              { id: 'item3', updates: { value: 300 }, expectedVersion: 1 },
            ]
          );
        })
      ).rejects.toThrow(OptimisticLockError);

      // Verify no changes were made
      const { rows } = await pool.query(
        'SELECT value FROM test_items ORDER BY id'
      );
      expect(rows[0]['value']).toBe(10);
      expect(rows[1]['value']).toBe(20);
      expect(rows[2]['value']).toBe(30);
    });
  });

  describe('Monitoring', () => {
    it('should track active transactions', async () => {
      const initialCount = txManager.getActiveTransactionCount();
      
      let duringTransactionCount = 0;
      
      await txManager.withTransaction(async () => {
        duringTransactionCount = txManager.getActiveTransactionCount();
      });

      expect(duringTransactionCount).toBe(initialCount + 1);
      expect(txManager.getActiveTransactionCount()).toBe(initialCount);
    });

    it('should return transaction details', async () => {
      await txManager.withTransaction(async () => {
        const transactions = txManager.getActiveTransactions();
        expect(transactions.length).toBeGreaterThan(0);
        expect(transactions[0]).toHaveProperty('id');
        expect(transactions[0]).toHaveProperty('startTime');
        expect(transactions[0]).toHaveProperty('durationMs');
      });
    });
  });

  describe('Standalone Helpers', () => {
    it('should support withTransaction helper', async () => {
      const result = await withTransaction(pool, async (client) => {
        await client.query(
          'INSERT INTO test_items (id, name) VALUES ($1, $2)',
          ['helper-test', 'Helper Test']
        );
        return 'done';
      });

      expect(result).toBe('done');

      const { rows } = await pool.query(
        'SELECT * FROM test_items WHERE id = $1',
        ['helper-test']
      );
      expect(rows).toHaveLength(1);
    });

    it('should support updateWithOptimisticLock helper', async () => {
      await pool.query(
        'INSERT INTO test_items (id, name, version) VALUES ($1, $2, $3)',
        ['lock-test', 'Lock Test', 1]
      );

      const result = await updateWithOptimisticLock(
        pool,
        'test_items',
        'lock-test',
        { name: 'Updated' },
        1
      );

      expect(result['name']).toBe('Updated');
      expect(result['version']).toBe(2);
    });
  });
});

// Integration test with actual concurrency
describe('TransactionManager Concurrency', () => {
  let pool: Pool;
  let txManager: TransactionManager;

  beforeAll(async () => {
    pool = new Pool({ ...TEST_DB_CONFIG, max: 20 });
    txManager = new TransactionManager(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS concurrent_test (
        id TEXT PRIMARY KEY,
        counter INTEGER DEFAULT 0,
        version INTEGER DEFAULT 0
      )
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS concurrent_test');
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE concurrent_test RESTART IDENTITY');
    await pool.query(
      'INSERT INTO concurrent_test (id, counter, version) VALUES ($1, $2, $3)',
      ['test', 0, 1]
    );
  });

  it('should handle 50 concurrent increments correctly', async () => {
    const CONCURRENT_OPERATIONS = 50;
    
    const promises = Array(CONCURRENT_OPERATIONS).fill(null).map((_, i) =>
      txManager.withTransaction(
        async (client) => {
          // Read current value
          const { rows } = await client.query(
            'SELECT counter FROM concurrent_test WHERE id = $1',
            ['test']
          );
          const current = rows[0]['counter'] as number;
          
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          
          // Update
          await client.query(
            'UPDATE concurrent_test SET counter = $1 WHERE id = $2',
            [current + 1, 'test']
          );
          
          return i;
        },
        { 
          isolationLevel: 'SERIALIZABLE',
          maxRetries: 5,
          retryDelayMs: 10,
        }
      )
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    
    // With SERIALIZABLE isolation, some may fail and retry
    expect(succeeded).toBeGreaterThan(0);

    // But the final counter should reflect all successful increments
    const { rows } = await pool.query(
      'SELECT counter FROM concurrent_test WHERE id = $1',
      ['test']
    );
    
    // With proper serialization, counter should equal successful operations
    expect(rows[0]['counter']).toBe(succeeded);
  });

  it('should prevent lost updates with optimistic locking', async () => {
    // Insert test record
    await pool.query(
      'INSERT INTO concurrent_test (id, counter, version) VALUES ($1, $2, $3)',
      ['opt-test', 100, 1]
    );

    // Simulate two concurrent updates trying to increment from the same base
    const promise1 = txManager.withTransaction(async (client, context) => {
      // Small delay to interleave with promise2
      await new Promise(resolve => setTimeout(resolve, 50));
      
      return txManager.updateWithOptimisticLock(
        context,
        'concurrent_test',
        'opt-test',
        { counter: 200 },
        1
      );
    });

    const promise2 = txManager.withTransaction(async (client, context) => {
      return txManager.updateWithOptimisticLock(
        context,
        'concurrent_test',
        'opt-test',
        { counter: 300 },
        1
      );
    });

    const results = await Promise.allSettled([promise1, promise2]);
    
    // One should succeed, one should fail with OptimisticLockError
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);

    // Verify final state
    const { rows } = await pool.query(
      'SELECT counter, version FROM concurrent_test WHERE id = $1',
      ['opt-test']
    );
    
    // Counter should be either 200 or 300, not some intermediate value
    expect([200, 300]).toContain(rows[0]['counter']);
    expect(rows[0]['version']).toBe(2);
  });
});

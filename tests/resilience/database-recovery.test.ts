/**
 * Resilience: Database Recovery Tests
 * 
 * Tests for database connection recovery, transaction rollback,
 * and handling of transient database errors.
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { withRetry, tryWithRetry, isTransientError, isPermanentError } from '../../src/storage/postgres/retry';
import { CircuitBreaker } from '../../src/storage/postgres/retry';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Resilience: Database Recovery', () => {
  let mockClient: MockDatabaseClient;

  beforeEach(() => {
    mockClient = new MockDatabaseClient();
  });

  afterEach(() => {
    mockClient.reset();
    jest.clearAllMocks();
  });

  /**
   * Mock database client for testing
   */
  class MockDatabaseClient {
    private connected = true;
    private queryResults: Map<string, unknown[]> = new Map();
    private shouldFailNext = false;
    private failCount = 0;
    private transactionActive = false;
    private transactionData: Map<string, unknown[]> = new Map();

    reset() {
      this.connected = true;
      this.queryResults.clear();
      this.shouldFailNext = false;
      this.failCount = 0;
      this.transactionActive = false;
      this.transactionData.clear();
    }

    setQueryResult(query: string, result: unknown[]) {
      this.queryResults.set(query, result);
    }

    simulateDisconnect() {
      this.connected = false;
    }

    simulateReconnect() {
      this.connected = true;
    }

    setFailNext(count: number) {
      this.failCount = count;
    }

    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      if (!this.connected) {
        const error = new Error('Connection lost') as Error & { code: string };
        error.code = '08006'; // connection_failure
        throw error;
      }

      if (this.failCount > 0) {
        this.failCount--;
        const error = new Error('Temporary failure') as Error & { code: string };
        error.code = '40001'; // serialization_failure
        throw error;
      }

      const result = this.queryResults.get(sql) || [];
      return { rows: result, rowCount: result.length };
    }

    async beginTransaction() {
      if (!this.connected) {
        throw new Error('Cannot begin transaction: not connected');
      }
      this.transactionActive = true;
      this.transactionData = new Map(this.queryResults);
    }

    async commit() {
      if (!this.transactionActive) {
        throw new Error('No active transaction');
      }
      this.transactionActive = false;
    }

    async rollback() {
      this.queryResults = new Map(this.transactionData);
      this.transactionActive = false;
    }

    isConnected() {
      return this.connected;
    }

    isTransactionActive() {
      return this.transactionActive;
    }
  }

  /**
   * Helper to run transaction with rollback on error
   */
  async function transaction<T>(
    client: MockDatabaseClient,
    callback: (c: MockDatabaseClient) => Promise<T>
  ): Promise<T> {
    await client.beginTransaction();
    try {
      const result = await callback(client);
      await client.commit();
      return result;
    } catch (error) {
      await client.rollback();
      throw error;
    }
  }

  /**
   * Helper to simulate database disconnect
   */
  async function simulateDatabaseDisconnect(client: MockDatabaseClient) {
    client.simulateDisconnect();
  }

  describe('Connection Recovery', () => {
    it('should reconnect after connection loss', async () => {
      // Set up initial query result
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);
      
      // Simulate disconnect
      await simulateDatabaseDisconnect(mockClient);
      
      // Operation should eventually succeed after reconnect
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts === 2) {
            mockClient.simulateReconnect();
          }
          return mockClient.query('SELECT 1');
        },
        {
          maxRetries: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          jitterFactor: 0,
        }
      );

      expect(result).toBeDefined();
      expect(result.rows).toEqual([{ value: 1 }]);
      expect(attempts).toBe(2);
    });

    it('should handle transient connection errors', async () => {
      mockClient.setQueryResult('SELECT data', [{ id: 1, data: 'test' }]);
      
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error = new Error('Connection reset') as Error & { code: string };
            error.code = 'ECONNRESET';
            throw error;
          }
          return mockClient.query('SELECT data');
        },
        {
          maxRetries: 5,
          initialDelayMs: 10,
          maxDelayMs: 100,
          jitterFactor: 0,
        }
      );

      expect(result.rows).toHaveLength(1);
      expect(attempts).toBe(3);
    });

    it('should detect transient errors correctly', () => {
      const transientErrors = [
        { code: 'ECONNRESET', message: 'Connection reset' },
        { code: 'ETIMEDOUT', message: 'Connection timeout' },
        { code: '08006', message: 'Connection failure' },
        { code: '40001', message: 'Serialization failure' },
        { code: '40P01', message: 'Deadlock detected' },
      ];

      for (const err of transientErrors) {
        const error = new Error(err.message) as Error & { code: string };
        error.code = err.code;
        expect(isTransientError(error)).toBe(true);
      }
    });

    it('should detect permanent errors correctly', () => {
      const permanentErrors = [
        { code: '23505', message: 'Unique violation' },
        { code: '23503', message: 'Foreign key violation' },
        { code: '42P01', message: 'Undefined table' },
        { code: '42601', message: 'Syntax error' },
        { code: '28000', message: 'Invalid authorization' },
      ];

      for (const err of permanentErrors) {
        const error = new Error(err.message) as Error & { code: string };
        error.code = err.code;
        expect(isPermanentError(error)).toBe(true);
      }
    });

    it('should not retry permanent errors', async () => {
      let attempts = 0;
      
      await expect(
        withRetry(
          async () => {
            attempts++;
            const error = new Error('Unique violation') as Error & { code: string };
            error.code = '23505';
            throw error;
          },
          { maxRetries: 5, initialDelayMs: 10, jitterFactor: 0 }
        )
      ).rejects.toThrow('Unique violation');

      expect(attempts).toBe(1); // Should not retry
    });

    it('should track retry attempts in result', async () => {
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);
      
      const result = await tryWithRetry(
        async () => mockClient.query('SELECT 1'),
        { maxRetries: 3, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback transaction on error', async () => {
      mockClient.setQueryResult('SELECT * FROM agents WHERE id = 1', []);
      
      await expect(
        transaction(mockClient, async (client) => {
          await client.query('INSERT INTO agents (id) VALUES (1)');
          throw new Error('Simulated error');
        })
      ).rejects.toThrow('Simulated error');

      // Verify no data was committed
      const result = await mockClient.query('SELECT * FROM agents WHERE id = 1');
      expect(result.rows).toHaveLength(0);
    });

    it('should commit successful transactions', async () => {
      mockClient.setQueryResult('INSERT INTO agents (id) VALUES (1)', []);
      mockClient.setQueryResult('SELECT * FROM agents', [{ id: 1 }]);
      
      await transaction(mockClient, async (client) => {
        await client.query('INSERT INTO agents (id) VALUES (1)');
        return 'success';
      });

      // Transaction should be committed
      expect(mockClient.isTransactionActive()).toBe(false);
    });

    it('should handle rollback after multiple operations', async () => {
      let operationCount = 0;
      
      await expect(
        transaction(mockClient, async (client) => {
          await client.query('INSERT INTO agents (id) VALUES (1)');
          operationCount++;
          await client.query('INSERT INTO agents (id) VALUES (2)');
          operationCount++;
          await client.query('INSERT INTO agents (id) VALUES (3)');
          operationCount++;
          throw new Error('Rollback now');
        })
      ).rejects.toThrow('Rollback now');

      expect(operationCount).toBe(3);
    });

    it('should handle nested transaction errors gracefully', async () => {
      const result = await tryWithRetry(
        async () => {
          return transaction(mockClient, async (client) => {
            await client.query('SELECT 1');
            return 'completed';
          });
        },
        { maxRetries: 2, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should use circuit breaker for database operations', async () => {
      const breaker = new CircuitBreaker(3, 1000);
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);

      const result = await breaker.execute(async () => {
        return mockClient.query('SELECT 1');
      });

      expect(result.rows).toHaveLength(1);
      expect(breaker.getState()).toBe('closed');
    });

    it('should open circuit after repeated database failures', async () => {
      const breaker = new CircuitBreaker(3, 100);
      
      // Cause 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            const error = new Error('DB failure') as Error & { code: string };
            error.code = 'ECONNREFUSED';
            throw error;
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should recover from open circuit after timeout', async () => {
      const breaker = new CircuitBreaker(1, 50); // Very short timeout
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);

      // Open circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be able to execute again
      const result = await breaker.execute(async () => {
        return mockClient.query('SELECT 1');
      });

      expect(result.rows).toHaveLength(1);
    });
  });

  describe('Retry Delay Calculation', () => {
    it('should calculate exponential backoff', () => {
      const options = {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      // Import the function from the module
      const { calculateDelay } = require('../../src/storage/postgres/retry');

      const delay0 = calculateDelay(0, options);
      const delay1 = calculateDelay(1, options);
      const delay2 = calculateDelay(2, options);

      expect(delay0).toBe(100); // 100 * 2^0
      expect(delay1).toBe(200); // 100 * 2^1
      expect(delay2).toBe(400); // 100 * 2^2
    });

    it('should cap delay at maxDelayMs', () => {
      const options = {
        maxRetries: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      const { calculateDelay } = require('../../src/storage/postgres/retry');

      // At attempt 5, exponential would be 1000 * 2^5 = 32000, but capped at 5000
      const delay = calculateDelay(5, options);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe('Error Classification', () => {
    it('should classify connection errors as transient', () => {
      const connectionErrors = [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EPIPE',
      ];

      for (const code of connectionErrors) {
        const error = new Error('Connection error') as Error & { code: string };
        error.code = code;
        expect(isTransientError(error)).toBe(true);
      }
    });

    it('should classify PostgreSQL transient errors correctly', () => {
      const pgTransientCodes = [
        '08000', // connection_exception
        '08003', // connection_does_not_exist
        '08006', // connection_failure
        '40001', // serialization_failure
        '40P01', // deadlock_detected
        '55P03', // lock_not_available
      ];

      for (const code of pgTransientCodes) {
        const error = new Error('PG error') as Error & { code: string };
        error.code = code;
        expect(isTransientError(error)).toBe(true);
      }
    });

    it('should handle errors without codes', () => {
      const error = new Error('Connection timeout');
      expect(isTransientError(error)).toBe(true); // Message contains 'timeout'
    });

    it('should handle non-error objects', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
      expect(isTransientError('string error')).toBe(false);
      expect(isTransientError(123)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query results', async () => {
      mockClient.setQueryResult('SELECT * FROM empty_table', []);
      
      const result = await withRetry(
        async () => mockClient.query('SELECT * FROM empty_table'),
        { maxRetries: 2, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should handle concurrent retry operations', async () => {
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);
      
      const promises = Array(5).fill(null).map(() =>
        withRetry(
          async () => mockClient.query('SELECT 1'),
          { maxRetries: 2, initialDelayMs: 5, jitterFactor: 0 }
        )
      );

      const results = await Promise.all(promises);
      expect(results.every(r => r.rows.length === 1)).toBe(true);
    });

    it('should preserve error context through retries', async () => {
      let attempt = 0;
      
      await expect(
        withRetry(
          async () => {
            attempt++;
            const error = new Error(`Attempt ${attempt} failed`) as Error & { 
              code: string; 
              attempt: number;
            };
            error.code = 'ECONNRESET';
            error.attempt = attempt;
            throw error;
          },
          { maxRetries: 2, initialDelayMs: 10, jitterFactor: 0 }
        )
      ).rejects.toThrow('Attempt 3 failed');

      expect(attempt).toBe(3);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      let connected = false;
      
      const result = await withRetry(
        async () => {
          if (!connected) {
            connected = !connected;
            const error = new Error('Not connected') as Error & { code: string };
            error.code = '08003'; // connection_does_not_exist
            throw error;
          }
          return { rows: [{ connected: true }], rowCount: 1 };
        },
        { maxRetries: 3, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.rows[0]).toEqual({ connected: true });
    });
  });

  describe('tryWithRetry Result Tracking', () => {
    it('should return detailed success result', async () => {
      mockClient.setQueryResult('SELECT 1', [{ value: 42 }]);
      
      const startTime = Date.now();
      const result = await tryWithRetry(
        async () => mockClient.query('SELECT 1'),
        { maxRetries: 2, initialDelayMs: 10, jitterFactor: 0 }
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.result?.rows[0]).toEqual({ value: 42 });
      expect(result.attempts).toBe(1);
      expect(result.totalTimeMs).toBeLessThanOrEqual(endTime - startTime + 10);
    });

    it('should return detailed failure result', async () => {
      const result = await tryWithRetry(
        async () => {
          const error = new Error('Permanent failure') as Error & { code: string };
          error.code = '23505'; // unique_violation - permanent
          throw error;
        },
        { maxRetries: 3, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Permanent failure');
      expect(result.attempts).toBe(1); // Should not retry
    });

    it('should track multiple attempts in result', async () => {
      let attempts = 0;
      mockClient.setQueryResult('SELECT 1', [{ value: 1 }]);
      
      const result = await tryWithRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error = new Error('Transient') as Error & { code: string };
            error.code = '40001'; // serialization_failure
            throw error;
          }
          return mockClient.query('SELECT 1');
        },
        { maxRetries: 5, initialDelayMs: 10, jitterFactor: 0 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
  });
});

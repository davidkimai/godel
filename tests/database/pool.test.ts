/**
 * PostgreSQL Connection Pool Tests
 * 
 * Tests for connection pool optimization including:
 * - Pool sizing for 50+ concurrent agents
 * - Health monitoring
 * - Retry logic
 * - Connection stability
 */

import { PostgresPool, getPool, resetPool } from '../../src/storage/postgres/pool';
import { createHealthMonitor, PoolHealthMonitor } from '../../src/storage/postgres/health';
import { withRetry, isTransientError, CircuitBreaker } from '../../src/storage/postgres/retry';
import { optimizedPoolConfig } from '../../src/storage/postgres/config';

describe.skip('PostgreSQL Connection Pool', () => {
  let pool: PostgresPool;

  beforeEach(async () => {
    await resetPool();
  });

  afterEach(async () => {
    await resetPool();
  });

  describe('Pool Configuration', () => {
    it('should have optimized settings for 50+ concurrent agents', () => {
      // Verify optimized configuration values
      expect(optimizedPoolConfig.max).toBe(50);
      expect(optimizedPoolConfig.min).toBe(5);
      expect(optimizedPoolConfig.acquireTimeoutMillis).toBe(30000);
      expect(optimizedPoolConfig.idleTimeoutMillis).toBe(300000);
    });

    it('should support custom pool configuration', async () => {
      const customPool = new PostgresPool({
        host: 'localhost',
        port: 5432,
        database: 'dash_test',
        user: 'dash',
        password: 'dash',
        maxPoolSize: 50,
        minPoolSize: 5,
      });

      expect(customPool).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    it('should initialize pool successfully', async () => {
      pool = await getPool();
      expect(pool).toBeDefined();
      
      const stats = pool.getStats();
      expect(stats.isConnected).toBe(true);
    });

    it('should execute basic queries', async () => {
      pool = await getPool();
      
      const result = await pool.query('SELECT 1 as num');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ num: 1 });
    });

    it('should handle parameterized queries', async () => {
      pool = await getPool();
      
      const result = await pool.query('SELECT $1::int as value', [42]);
      expect(result.rows[0]).toEqual({ value: 42 });
    });

    it('should track query statistics', async () => {
      pool = await getPool();
      
      // Execute some queries
      await pool.query('SELECT 1');
      await pool.query('SELECT 2');
      await pool.query('SELECT 3');
      
      const stats = pool.getQueryStats();
      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.successRate).toBe(100);
    });
  });

  describe('Concurrent Access (50+ agents)', () => {
    it('should handle 50 concurrent queries', async () => {
      pool = await getPool();
      
      const promises: Promise<unknown>[] = [];
      
      // Spawn 50 concurrent queries
      for (let i = 0; i < 50; i++) {
        promises.push(pool.query('SELECT $1::int as id', [i]));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      results.forEach((result: any, index: number) => {
        expect(result.rows[0]).toEqual({ id: index });
      });
      
      // Check pool handled it without errors
      const stats = pool.getQueryStats();
      expect(stats.failed).toBe(0);
    });

    it('should handle concurrent transactions', async () => {
      pool = await getPool();
      
      const transactionPromises: Promise<unknown>[] = [];
      
      // Run 20 concurrent transactions
      for (let i = 0; i < 20; i++) {
        transactionPromises.push(
          pool.withTransaction(async (client) => {
            await client.query('SELECT $1::int as tx_id', [i]);
            return i;
          })
        );
      }
      
      const results = await Promise.all(transactionPromises);
      expect(results).toHaveLength(20);
    });

    it('should report pool statistics under load', async () => {
      pool = await getPool();
      
      // Create load
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 30; i++) {
        promises.push(
          pool.query('SELECT pg_sleep(0.01), $1::int as id', [i])
        );
      }
      
      // Check stats during load
      const stats = pool.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.isConnected).toBe(true);
      
      await Promise.all(promises);
    });
  });

  describe('Health Monitoring', () => {
    it('should create health monitor', async () => {
      pool = await getPool();
      const healthMonitor = createHealthMonitor(pool);
      
      expect(healthMonitor).toBeDefined();
      
      const health = await healthMonitor.getHealth();
      expect(health).toHaveProperty('total');
      expect(health).toHaveProperty('idle');
      expect(health).toHaveProperty('waiting');
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('utilizationPercent');
    });

    it('should perform comprehensive health check', async () => {
      pool = await getPool();
      const healthMonitor = createHealthMonitor(pool);
      
      const result = await healthMonitor.checkHealth();
      
      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result).toHaveProperty('pool');
      expect(result).toHaveProperty('message');
    });

    it('should track health history', async () => {
      pool = await getPool();
      const healthMonitor = createHealthMonitor(pool);
      
      // Record multiple health checks
      await healthMonitor.getHealth();
      await healthMonitor.getHealth();
      await healthMonitor.getHealth();
      
      const history = healthMonitor.getHealthHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    it('should enable/disable monitoring', async () => {
      pool = await getPool();
      
      pool.enableHealthMonitoring(100);
      expect(pool.getHealthMonitor()).toBeDefined();
      
      // Let it run briefly
      await new Promise(resolve => setTimeout(resolve, 250));
      
      pool.disableHealthMonitoring();
    });
  });

  describe('Retry Logic', () => {
    it('should retry transient errors', async () => {
      let attempts = 0;
      
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Connection reset');
          (error as any).code = 'ECONNRESET';
          throw error;
        }
        return 'success';
      };
      
      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry permanent errors', async () => {
      let attempts = 0;
      
      const operation = async () => {
        attempts++;
        const error = new Error('Syntax error');
        (error as any).code = '42601'; // syntax_error
        throw error;
      };
      
      await expect(
        withRetry(operation, { maxRetries: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Syntax error');
      
      expect(attempts).toBe(1);
    });

    it('should identify transient errors correctly', () => {
      const transientError = new Error('Connection reset');
      (transientError as any).code = 'ECONNRESET';
      expect(isTransientError(transientError)).toBe(true);
      
      const permanentError = new Error('Syntax error');
      (permanentError as any).code = '42601';
      expect(isTransientError(permanentError)).toBe(false);
    });

    it('should use circuit breaker pattern', async () => {
      const breaker = new CircuitBreaker(3, 100);
      
      // Should work initially
      const result1 = await breaker.execute(async () => 'success');
      expect(result1).toBe('success');
      
      // Force failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }
      
      // Circuit should be open now
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Transactions', () => {
    it('should execute transactions', async () => {
      pool = await getPool();
      
      const result = await pool.withTransaction(async (client) => {
        await client.query('SELECT 1');
        return 'committed';
      });
      
      expect(result).toBe('committed');
    });

    it('should rollback on error', async () => {
      pool = await getPool();
      
      await expect(
        pool.withTransaction(async () => {
          throw new Error('Rollback test');
        })
      ).rejects.toThrow('Rollback test');
    });
  });

  describe('Bulk Operations', () => {
    it('should execute batch queries', async () => {
      pool = await getPool();
      
      const queries = [
        { text: 'SELECT 1 as a' },
        { text: 'SELECT 2 as b' },
        { text: 'SELECT 3 as c' },
      ];
      
      const results = await pool.batch(queries);
      
      expect(results).toHaveLength(3);
      expect(results[0].rows[0]).toEqual({ a: 1 });
      expect(results[1].rows[0]).toEqual({ b: 2 });
      expect(results[2].rows[0]).toEqual({ c: 3 });
    });

    it('should execute queries in parallel', async () => {
      pool = await getPool();
      
      const queries = [
        { text: 'SELECT 1 as val' },
        { text: 'SELECT 2 as val' },
        { text: 'SELECT 3 as val' },
      ];
      
      const results = await pool.parallel(queries);
      
      expect(results).toHaveLength(3);
    });
  });

  describe('Pool Lifecycle', () => {
    it('should close gracefully', async () => {
      pool = await getPool();
      
      await pool.query('SELECT 1');
      
      await pool.close();
      
      const stats = pool.getStats();
      expect(stats.isConnected).toBe(false);
    });

    it('should reset global pool', async () => {
      const pool1 = await getPool();
      await resetPool();
      
      // After reset, should create new pool
      const pool2 = await getPool();
      expect(pool1).not.toBe(pool2);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same pool instance', async () => {
      const pool1 = await getPool();
      const pool2 = await getPool();
      
      expect(pool1).toBe(pool2);
    });
  });
});

// Stress test for 50+ concurrent agents (run separately)
describe('Connection Pool Stress Test', () => {
  beforeEach(async () => {
    await resetPool();
  });

  afterEach(async () => {
    await resetPool();
  });

  it('should sustain 50 concurrent agents for 5 seconds', async () => {
    const pool = await getPool();
    const healthMonitor = createHealthMonitor(pool);
    
    // Enable monitoring
    pool.enableHealthMonitoring(500);
    
    const startTime = Date.now();
    const duration = 5000; // 5 seconds
    const agentCount = 50;
    
    // Create 50 agents that continuously query
    const agents: Promise<void>[] = [];
    
    for (let i = 0; i < agentCount; i++) {
      agents.push(
        (async () => {
          while (Date.now() - startTime < duration) {
            try {
              await pool.query('SELECT $1::int as agent_id, NOW() as time', [i]);
              await new Promise(r => setTimeout(r, 10)); // Small delay between queries
            } catch (error) {
              // Track but don't fail immediately
              console.error(`Agent ${i} error:`, error);
            }
          }
        })()
      );
    }
    
    await Promise.all(agents);
    
    pool.disableHealthMonitoring();
    
    // Verify pool health
    const health = await healthMonitor.checkHealth();
    const stats = pool.getQueryStats();
    
    console.log('Stress test results:', {
      health: health.status,
      pool: health.pool,
      queries: stats,
    });
    
    // Should not have failures
    expect(stats.failed).toBe(0);
    expect(health.status).not.toBe('unhealthy');
  }, 30000); // 30 second timeout
});

/**
 * Integration Test Harness
 * 
 * Comprehensive test harness for end-to-end integration testing.
 * Manages test environment, agents, resources, and cleanup.
 * 
 * @example
 * ```typescript
 * import { IntegrationHarness } from '../utils/integration-harness';
 * 
 * const harness = new IntegrationHarness();
 * 
 * beforeAll(async () => {
 *   await harness.setup();
 * });
 * 
 * afterAll(async () => {
 *   await harness.cleanup();
 * });
 * 
 * test('spawn agent', async () => {
 *   const agent = await harness.spawnAgent({ model: 'claude-sonnet-4-5' });
 *   expect(agent.status).toBe('running');
 * });
 * ```
 */

import type { AgentRuntime, SpawnConfig, Agent } from '../../src/runtime/types';
import type { RuntimeRegistry } from '../../src/runtime/registry';
import type { PiClient } from '../../src/integrations/pi/client';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

// ============================================================================
// Configuration Types
// ============================================================================

export interface HarnessConfig {
  /** Default runtime to use */
  defaultRuntime: string;
  /** Whether to use real database (false = mock) */
  useRealDatabase: boolean;
  /** Whether to use real Redis (false = mock) */
  useRealRedis: boolean;
  /** Test database URL */
  databaseUrl?: string;
  /** Test Redis URL */
  redisUrl?: string;
  /** Cleanup agents on teardown */
  cleanupAgents: boolean;
  /** Maximum agents to allow */
  maxAgents: number;
  /** Default timeout for operations */
  timeout: number;
}

export interface HarnessState {
  /** IDs of spawned agents */
  agentIds: string[];
  /** IDs of created tasks */
  taskIds: string[];
  /** Temporary files created */
  tempFiles: string[];
  /** Active connections */
  connections: Array<{ type: string; close: () => Promise<void> }>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HarnessConfig = {
  defaultRuntime: 'mock',
  useRealDatabase: false,
  useRealRedis: false,
  cleanupAgents: true,
  maxAgents: 10,
  timeout: 30000,
};

// ============================================================================
// Integration Harness Class
// ============================================================================

export class IntegrationHarness {
  private config: HarnessConfig;
  private state: HarnessState;
  private runtimeRegistry: RuntimeRegistry | null = null;
  private database: Pool | null = null;
  private redis: Redis | null = null;
  private runtimes: Map<string, AgentRuntime> = new Map();
  private isSetup = false;

  constructor(config: Partial<HarnessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      agentIds: [],
      taskIds: [],
      tempFiles: [],
      connections: [],
    };
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Sets up the test environment
   * 
   * @example
   * ```typescript
   * beforeAll(async () => {
   *   await harness.setup();
   * });
   * ```
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      throw new Error('Harness already setup');
    }

    // Initialize runtime registry
    await this.initializeRuntimes();

    // Initialize database if using real one
    if (this.config.useRealDatabase) {
      await this.initializeDatabase();
    }

    // Initialize Redis if using real one
    if (this.config.useRealRedis) {
      await this.initializeRedis();
    }

    this.isSetup = true;
  }

  /**
   * Cleans up all resources
   * 
   * @example
   * ```typescript
   * afterAll(async () => {
   *   await harness.cleanup();
   * });
   * ```
   */
  async cleanup(): Promise<void> {
    if (!this.isSetup) {
      return;
    }

    try {
      // Kill all agents
      if (this.config.cleanupAgents) {
        await this.killAllAgents();
      }

      // Close database connection
      if (this.database) {
        await this.database.end();
        this.database = null;
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
      }

      // Close all tracked connections
      for (const conn of this.state.connections) {
        try {
          await conn.close();
        } catch (error) {
          console.warn(`Failed to close ${conn.type} connection:`, error);
        }
      }

      // Clean up temp files
      await this.cleanupTempFiles();

      // Reset runtimes
      this.runtimes.clear();
      this.runtimeRegistry = null;
    } finally {
      this.isSetup = false;
    }
  }

  /**
   * Resets the harness state without full cleanup
   * Useful between tests in the same suite
   * 
   * @example
   * ```typescript
   * afterEach(async () => {
   *   await harness.reset();
   * });
   * ```
   */
  async reset(): Promise<void> {
    // Kill agents but keep connections
    if (this.config.cleanupAgents) {
      await this.killAllAgents();
    }

    // Reset state
    this.state.agentIds = [];
    this.state.taskIds = [];
    
    // Clear temp files
    await this.cleanupTempFiles();
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Spawns a new agent using the configured runtime
   * 
   * @example
   * ```typescript
   * const agent = await harness.spawnAgent({
   *   name: 'my-agent',
   *   model: 'claude-sonnet-4-5'
   * });
   * ```
   */
  async spawnAgent(config: SpawnConfig): Promise<Agent> {
    this.ensureSetup();

    if (this.state.agentIds.length >= this.config.maxAgents) {
      throw new Error(`Max agents (${this.config.maxAgents}) reached`);
    }

    const runtime = this.getRuntime(this.config.defaultRuntime);
    const agent = await runtime.spawn(config);
    
    this.state.agentIds.push(agent.id);
    this.runtimes.set(agent.id, runtime);

    return agent;
  }

  /**
   * Kills a specific agent
   * 
   * @example
   * ```typescript
   * await harness.killAgent(agent.id);
   * ```
   */
  async killAgent(agentId: string): Promise<void> {
    this.ensureSetup();

    const runtime = this.runtimes.get(agentId);
    if (!runtime) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await runtime.kill(agentId);
    
    this.state.agentIds = this.state.agentIds.filter(id => id !== agentId);
    this.runtimes.delete(agentId);
  }

  /**
   * Kills all spawned agents
   * 
   * @example
   * ```typescript
   * await harness.killAllAgents();
   * ```
   */
  async killAllAgents(): Promise<void> {
    const promises = this.state.agentIds.map(async (agentId) => {
      const runtime = this.runtimes.get(agentId);
      if (runtime) {
        try {
          await runtime.kill(agentId);
        } catch (error) {
          console.warn(`Failed to kill agent ${agentId}:`, error);
        }
      }
    });

    await Promise.all(promises);
    
    this.state.agentIds = [];
    this.runtimes.clear();
  }

  /**
   * Gets the status of an agent
   * 
   * @example
   * ```typescript
   * const status = await harness.getAgentStatus(agent.id);
   * expect(status).toBe('running');
   * ```
   */
  async getAgentStatus(agentId: string): Promise<string> {
    this.ensureSetup();

    const runtime = this.runtimes.get(agentId);
    if (!runtime) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return runtime.status(agentId);
  }

  /**
   * Executes a command on an agent
   * 
   * @example
   * ```typescript
   * const result = await harness.execOnAgent(agent.id, 'Implement feature X');
   * expect(result.exitCode).toBe(0);
   * ```
   */
  async execOnAgent(agentId: string, command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
  }> {
    this.ensureSetup();

    const runtime = this.runtimes.get(agentId);
    if (!runtime) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return runtime.exec(agentId, command);
  }

  /**
   * Lists all spawned agents
   * 
   * @example
   * ```typescript
   * const agents = await harness.listAgents();
   * expect(agents).toHaveLength(2);
   * ```
   */
  async listAgents(): Promise<Agent[]> {
    this.ensureSetup();

    const allAgents: Agent[] = [];
    const seenIds = new Set<string>();

    for (const [agentId, runtime] of Array.from(this.runtimes.entries())) {
      if (!seenIds.has(agentId)) {
        try {
          const agents = await runtime.list();
          for (const agent of agents) {
            if (!seenIds.has(agent.id)) {
              allAgents.push(agent);
              seenIds.add(agent.id);
            }
          }
        } catch (error) {
          console.warn(`Failed to list agents from runtime:`, error);
        }
      }
    }

    return allAgents;
  }

  // ============================================================================
  // Runtime Operations
  // ============================================================================

  /**
   * Gets a runtime by ID
   */
  private getRuntime(runtimeId: string): AgentRuntime {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new Error(`Runtime '${runtimeId}' not found. Available: ${Array.from(this.runtimes.keys()).join(', ')}`);
    }
    return runtime;
  }

  /**
   * Registers a custom runtime
   * 
   * @example
   * ```typescript
   * harness.registerRuntime('custom', customRuntime);
   * ```
   */
  registerRuntime(runtimeId: string, runtime: AgentRuntime): void {
    this.runtimes.set(runtimeId, runtime);
  }

  // ============================================================================
  // Database Operations
  // ============================================================================

  /**
   * Gets the database pool (if using real database)
   * 
   * @example
   * ```typescript
   * const result = await harness.query('SELECT * FROM agents');
   * ```
   */
  async query(sql: string, values?: unknown[]): Promise<unknown> {
    if (!this.database) {
      throw new Error('Database not initialized');
    }

    const result = await this.database.query(sql, values);
    return result.rows;
  }

  /**
   * Executes a transaction
   * 
   * @example
   * ```typescript
   * await harness.transaction(async (client) => {
   *   await client.query('INSERT INTO agents ...');
   * });
   * ```
   */
  async transaction<T>(fn: (client: Pool) => Promise<T>): Promise<T> {
    if (!this.database) {
      throw new Error('Database not initialized');
    }

    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(this.database!);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clears all test data from database
   * 
   * @example
   * ```typescript
   * await harness.clearDatabase();
   * ```
   */
  async clearDatabase(): Promise<void> {
    if (!this.database) {
      return;
    }

    // Clear tables in dependency order
    const tables = ['events', 'tasks', 'agents', 'swarms'];
    for (const table of tables) {
      try {
        await this.database.query(`TRUNCATE TABLE ${table} CASCADE`);
      } catch (error) {
        console.warn(`Failed to clear table ${table}:`, error);
      }
    }
  }

  // ============================================================================
  // Redis Operations
  // ============================================================================

  /**
   * Sets a value in Redis
   * 
   * @example
   * ```typescript
   * await harness.redisSet('key', 'value', 3600);
   * ```
   */
  async redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Gets a value from Redis
   * 
   * @example
   * ```typescript
   * const value = await harness.redisGet('key');
   * ```
   */
  async redisGet(key: string): Promise<string | null> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    return this.redis.get(key);
  }

  /**
   * Deletes a key from Redis
   * 
   * @example
   * ```typescript
   * await harness.redisDel('key');
   * ```
   */
  async redisDel(key: string): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    await this.redis.del(key);
  }

  /**
   * Flushes all data from Redis
   * 
   * @example
   * ```typescript
   * await harness.flushRedis();
   * ```
   */
  async flushRedis(): Promise<void> {
    if (!this.redis) {
      return;
    }

    await this.redis.flushdb();
  }

  // ============================================================================
  // State Tracking
  // ============================================================================

  /**
   * Gets the current harness state
   * 
   * @example
   * ```typescript
   * const { agentIds } = harness.getState();
   * ```
   */
  getState(): Readonly<HarnessState> {
    return {
      agentIds: [...this.state.agentIds],
      taskIds: [...this.state.taskIds],
      tempFiles: [...this.state.tempFiles],
      connections: [...this.state.connections],
    };
  }

  /**
   * Adds a temporary file for cleanup
   * 
   * @example
   * ```typescript
   * harness.trackTempFile('/tmp/test-file');
   * ```
   */
  trackTempFile(filePath: string): void {
    this.state.tempFiles.push(filePath);
  }

  /**
   * Adds a connection for cleanup
   * 
   * @example
   * ```typescript
   * harness.trackConnection('websocket', async () => ws.close());
   * ```
   */
  trackConnection(type: string, closeFn: () => Promise<void>): void {
    this.state.connections.push({ type, close: closeFn });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureSetup(): void {
    if (!this.isSetup) {
      throw new Error('Harness not setup. Call setup() first.');
    }
  }

  private async initializeRuntimes(): Promise<void> {
    // Import runtime modules
    const { createMockRuntime } = await import('../mocks/runtime');

    // Register mock runtimes
    this.runtimes.set('mock', createMockRuntime('mock'));
    this.runtimes.set('pi', createMockRuntime('pi'));
    this.runtimes.set('native', createMockRuntime('native'));
  }

  private async initializeDatabase(): Promise<void> {
    const { Pool } = await import('pg');
    
    this.database = new Pool({
      connectionString: this.config.databaseUrl,
    });

    // Test connection
    await this.database.query('SELECT 1');
  }

  private async initializeRedis(): Promise<void> {
    const Redis = (await import('ioredis')).default;
    
    this.redis = new Redis(this.config.redisUrl);

    // Test connection
    await this.redis.ping();
  }

  private async cleanupTempFiles(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    for (const filePath of this.state.tempFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const stats = await fs.promises.stat(filePath);
          if (stats.isDirectory()) {
            await fs.promises.rmdir(filePath, { recursive: true });
          } else {
            await fs.promises.unlink(filePath);
          }
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
    }

    this.state.tempFiles = [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a pre-configured integration harness
 * 
 * @example
 * ```typescript
 * const harness = createIntegrationHarness({
 *   useRealDatabase: true,
 *   databaseUrl: process.env.TEST_DATABASE_URL
 * });
 * ```
 */
export function createIntegrationHarness(config?: Partial<HarnessConfig>): IntegrationHarness {
  return new IntegrationHarness(config);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  IntegrationHarness,
  createIntegrationHarness,
};

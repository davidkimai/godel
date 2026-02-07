/**
 * Database Mock
 * 
 * Comprehensive mock for PostgreSQL database operations.
 * Supports query mocking, transaction simulation, and connection pooling.
 * 
 * @example
 * ```typescript
 * import { mockPool, setupMockDatabase, resetMockDbState } from '../mocks/database';
 * 
 * beforeEach(() => {
 *   setupMockDatabase();
 *   resetMockDbState();
 * });
 * 
 * // Configure query response
 * mockPool.query.mockResolvedValue({
 *   rows: [{ id: 'agent-1', name: 'Test Agent' }],
 *   rowCount: 1
 * });
 * ```
 */

import type { Pool, PoolClient, QueryResult, QueryConfig } from 'pg';

// ============================================================================
// Types
// ============================================================================

interface MockQuery {
  sql: string;
  values?: unknown[];
  result: QueryResult;
}

interface MockDbState {
  queries: MockQuery[];
  queryHistory: string[];
  inTransaction: boolean;
  transactionQueries: string[];
  connected: boolean;
  simulatedDelay: number;
}

// ============================================================================
// State Management
// ============================================================================

const mockDbState: MockDbState = {
  queries: [],
  queryHistory: [],
  inTransaction: false,
  transactionQueries: [],
  connected: false,
  simulatedDelay: 0,
};

// ============================================================================
// Mock Client
// ============================================================================

/**
 * Creates a mock database client for transaction handling
 */
export function createMockClient(): jest.Mocked<PoolClient> {
  const client = {
    query: jest.fn().mockImplementation(async (query: string | QueryConfig, values?: unknown[]): Promise<QueryResult> => {
      const sql = typeof query === 'string' ? query : query.text;
      const params = typeof query === 'string' ? values : query.values;
      
      // Simulate delay if configured
      if (mockDbState.simulatedDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, mockDbState.simulatedDelay));
      }
      
      // Track in transaction
      if (mockDbState.inTransaction) {
        mockDbState.transactionQueries.push(sql);
      }
      
      // Find matching mock query
      const mockQuery = mockDbState.queries.find(q => 
        q.sql === sql || sql.toLowerCase().includes(q.sql.toLowerCase())
      );
      
      if (mockQuery) {
        mockDbState.queryHistory.push(sql);
        return { ...mockQuery.result };
      }
      
      // Default empty response
      mockDbState.queryHistory.push(sql);
      return {
        rows: [],
        rowCount: 0,
        command: sql.split(' ')[0],
        oid: 0,
        fields: [],
      };
    }),
    
    release: jest.fn(),
    
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    
    // Transaction methods
    begin: jest.fn().mockImplementation(async () => {
      mockDbState.inTransaction = true;
      mockDbState.transactionQueries = [];
    }),
    
    commit: jest.fn().mockImplementation(async () => {
      mockDbState.inTransaction = false;
      mockDbState.transactionQueries = [];
    }),
    
    rollback: jest.fn().mockImplementation(async () => {
      mockDbState.inTransaction = false;
      mockDbState.transactionQueries = [];
    }),
  } as unknown as jest.Mocked<PoolClient>;
  
  return client;
}

// ============================================================================
// Mock Pool
// ============================================================================

/**
 * Mock PostgreSQL connection pool
 */
export const mockPool: jest.Mocked<Partial<Pool>> = {
  query: jest.fn().mockImplementation(async (query: string | QueryConfig, values?: unknown[]): Promise<QueryResult> => {
    const sql = typeof query === 'string' ? query : query.text;
    const params = typeof query === 'string' ? values : query.values;
    
    // Simulate delay if configured
    if (mockDbState.simulatedDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, mockDbState.simulatedDelay));
    }
    
    // Find matching mock query
    const mockQuery = mockDbState.queries.find(q => 
      q.sql === sql || sql.toLowerCase().includes(q.sql.toLowerCase())
    );
    
    if (mockQuery) {
      mockDbState.queryHistory.push(sql);
      return { ...mockQuery.result };
    }
    
    // Handle specific SQL patterns
    if (sql.toLowerCase().startsWith('select')) {
      return createMockQueryResult([]);
    }
    
    if (sql.toLowerCase().startsWith('insert')) {
      return createMockQueryResult([{ id: `id-${Date.now()}` }]);
    }
    
    if (sql.toLowerCase().startsWith('update')) {
      return createMockQueryResult([], 1);
    }
    
    if (sql.toLowerCase().startsWith('delete')) {
      return createMockQueryResult([], 1);
    }
    
    // Default empty response
    mockDbState.queryHistory.push(sql);
    return createMockQueryResult([]);
  }),
  
  connect: jest.fn().mockImplementation(async () => createMockClient()),
  
  end: jest.fn().mockImplementation(async () => {
    mockDbState.connected = false;
  }),
  
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
};

// ============================================================================
// Module Mock Setup
// ============================================================================

/**
 * Sets up Jest to mock the pg module
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockDatabase();
 * });
 * ```
 */
export function setupMockDatabase(): void {
  jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => mockPool),
    Client: jest.fn().mockImplementation(() => createMockClient()),
  }));
}

/**
 * Sets up Jest to mock the postgres pool module
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   setupMockPostgresPool();
 * });
 * ```
 */
export function setupMockPostgresPool(): void {
  jest.mock('../../src/storage/postgres/pool', () => ({
    PostgresPool: jest.fn().mockImplementation(() => ({
      query: mockPool.query,
      connect: mockPool.connect,
      end: mockPool.end,
    })),
    getPool: jest.fn().mockReturnValue(mockPool),
    resetPool: jest.fn(),
  }));
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Resets the mock database state
 * Call this in afterEach to ensure test isolation
 * 
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetMockDbState();
 * });
 * ```
 */
export function resetMockDbState(): void {
  mockDbState.queries = [];
  mockDbState.queryHistory = [];
  mockDbState.inTransaction = false;
  mockDbState.transactionQueries = [];
  mockDbState.connected = true;
  mockDbState.simulatedDelay = 0;
  
  // Clear all mocks
  Object.values(mockPool).forEach(fn => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      fn.mockClear();
    }
  });
}

/**
 * Registers a mock query response
 * 
 * @example
 * ```typescript
 * mockQueryResponse(
 *   'SELECT * FROM agents WHERE id = $1',
 *   [{ id: 'agent-1', name: 'Test Agent' }]
 * );
 * ```
 */
export function mockQueryResponse(sql: string, rows: unknown[], rowCount?: number): void {
  mockDbState.queries.push({
    sql,
    result: {
      rows,
      rowCount: rowCount ?? rows.length,
      command: sql.split(' ')[0],
      oid: 0,
      fields: Object.keys(rows[0] || {}).map(name => ({
        name,
        tableID: 0,
        columnID: 0,
        dataTypeID: 0,
        dataTypeSize: 0,
        dataTypeModifier: 0,
        format: 'text' as const,
      })),
    },
  });
}

/**
 * Gets the query history for assertions
 * 
 * @example
 * ```typescript
 * expect(getQueryHistory()).toContain('SELECT * FROM agents');
 * ```
 */
export function getQueryHistory(): string[] {
  return [...mockDbState.queryHistory];
}

/**
 * Gets transaction queries
 * 
 * @example
 * ```typescript
 * expect(getTransactionQueries()).toHaveLength(2);
 * ```
 */
export function getTransactionQueries(): string[] {
  return [...mockDbState.transactionQueries];
}

/**
 * Sets simulated query delay
 * 
 * @example
 * ```typescript
 * setSimulatedDelay(100); // 100ms delay
 * ```
 */
export function setSimulatedDelay(ms: number): void {
  mockDbState.simulatedDelay = ms;
}

/**
 * Simulates a database connection error
 * 
 * @example
 * ```typescript
 * simulateDbConnectionError('Connection refused');
 * ```
 */
export function simulateDbConnectionError(message = 'Connection failed'): void {
  (mockPool.connect as jest.Mock).mockRejectedValueOnce(new Error(message));
}

/**
 * Simulates a query error
 * 
 * @example
 * ```typescript
 * simulateQueryError('SELECT * FROM agents', 'Table not found');
 * ```
 */
export function simulateQueryError(sqlPattern: string, message: string): void {
  mockPool.query.mockImplementationOnce(async (query: string | QueryConfig) => {
    const querySql = typeof query === 'string' ? query : (query as QueryConfig).text;
    if (querySql.includes(sqlPattern) || sqlPattern === '*') {
      throw new Error(message);
    }
    return createMockQueryResult([]);
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a mock query result
 */
export function createMockQueryResult(rows: unknown[], rowCount?: number): QueryResult {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: Object.keys(rows[0] || {}).map(name => ({
      name,
      tableID: 0,
      columnID: 0,
      dataTypeID: 0,
      dataTypeSize: 0,
      dataTypeModifier: 0,
      format: 'text' as const,
    })),
  };
}

/**
 * Creates a mock agent row
 */
export function createMockAgentRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `agent-${Date.now()}`,
    label: 'Test Agent',
    status: 'running',
    model: 'claude-sonnet-4-5',
    task: 'Test task',
    team_id: null;
    parent_id: null,
    child_ids: [],
    spawned_at: new Date(),
    runtime: 0,
    retry_count: 0,
    max_retries: 3,
    budget_limit: null,
    last_error: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock task row
 */
export function createMockTaskRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `task-${Date.now()}`,
    title: 'Test Task',
    description: 'Test description',
    status: 'pending',
    assignee_id: null,
    depends_on: [],
    blocks: [],
    priority: 'medium',
    created_at: new Date(),
    updated_at: new Date(),
    completed_at: null,
    metadata: {},
    ...overrides,
  };
}

/**
 * Creates a mock event row
 */
export function createMockEventRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `event-${Date.now()}`,
    type: 'agent.spawned',
    agent_id: `agent-${Date.now()}`,
    task_id: null,
    team_id: null;
    severity: 'info',
    message: 'Test event',
    details: {},
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockPool,
  createMockClient,
  setupMockDatabase,
  setupMockPostgresPool,
  resetMockDbState,
  mockQueryResponse,
  getQueryHistory,
  getTransactionQueries,
  setSimulatedDelay,
  simulateDbConnectionError,
  simulateQueryError,
  createMockQueryResult,
  createMockAgentRow,
  createMockTaskRow,
  createMockEventRow,
};

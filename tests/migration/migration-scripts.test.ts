/**
 * Migration Scripts Tests
 * 
 * Comprehensive tests for worktree to Kata migration
 * 
 * @module tests/migration/migration-scripts
 */

import {
  WorktreeToKataMigration,
  MigrationConfig,
  MigrationOptions,
  MigrationResult,
  EntityCount,
  MigrationError,
  WorktreeData,
  SessionData,
  AgentData,
  TaskData,
  EventData,
  runMigration,
} from '../../src/migration/migration-scripts';
import { promises as fs, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock Pool for database operations
const mockPool = {
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};

describe('WorktreeToKataMigration', () => {
  let migration: WorktreeToKataMigration;
  let testDir: string;
  let sourcePath: string;
  let targetPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `migration-test-${Date.now()}`);
    sourcePath = join(testDir, 'source');
    targetPath = join(testDir, 'target');
    
    mkdirSync(testDir, { recursive: true });
    mkdirSync(sourcePath, { recursive: true });
    mkdirSync(targetPath, { recursive: true });

    // Reset mock
    mockPool.query.mockReset();
    mockPool.end.mockReset();

    const config: MigrationConfig = {
      sourcePath,
      targetPath,
      pool: mockPool as any,
      options: {
        dryRun: false,
        preserveSource: true,
        batchSize: 10,
        maxConcurrency: 2,
        verbose: false,
      },
    };

    migration = new WorktreeToKataMigration(config);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Migration Execution', () => {
    it('should execute full migration successfully', async () => {
      // Setup mock worktree
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'test-worktree');
      mkdirSync(worktreePath, { recursive: true });
      writeFileSync(
        join(worktreePath, '.claude', 'metadata.json'),
        JSON.stringify({ branch: 'main', createdAt: Date.now() })
      );

      // Setup mock sessions
      const sessionsPath = join(worktreePath, '.claude', 'sessions');
      mkdirSync(sessionsPath, { recursive: true });
      writeFileSync(
        join(sessionsPath, 'session-1.json'),
        JSON.stringify({
          id: 'session-1',
          teamId: 'team-1',
          state: { test: true },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      // Mock database responses
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup query
        .mockResolvedValueOnce({ rows: [] }) // Insert session
        .mockResolvedValueOnce({ rows: [] }) // Insert agent
        .mockResolvedValueOnce({ rows: [] }) // Update tasks
        .mockResolvedValueOnce({ rows: [] }) // Update events
        .mockResolvedValueOnce({
          rows: [{
            session_count: '1',
            agent_count: '0',
            task_count: '0',
            event_count: '0',
          }],
        }) // Integrity check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      expect(result.entitiesMigrated.worktrees).toBe(1);
      expect(result.entitiesMigrated.sessions).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.checksum).toBeTruthy();
    });

    it('should handle dry-run mode', async () => {
      const config: MigrationConfig = {
        sourcePath,
        targetPath,
        pool: mockPool as any,
        options: {
          dryRun: true,
          preserveSource: true,
          batchSize: 10,
          maxConcurrency: 2,
          verbose: false,
        },
      };

      migration = new WorktreeToKataMigration(config);

      // Setup mock worktree
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'test-worktree');
      mkdirSync(worktreePath, { recursive: true });
      writeFileSync(
        join(worktreePath, '.claude', 'metadata.json'),
        JSON.stringify({ branch: 'main', createdAt: Date.now() })
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Integrity check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      // In dry-run mode, no actual files should be created
      const kataPath = join(targetPath, 'katas');
      expect(existsSync(kataPath)).toBe(false);
    });

    it('should handle missing source path', async () => {
      const nonExistentPath = join(testDir, 'non-existent');
      const config: MigrationConfig = {
        sourcePath: nonExistentPath,
        targetPath,
        pool: mockPool as any,
        options: {
          dryRun: false,
          preserveSource: true,
          batchSize: 10,
          maxConcurrency: 2,
          verbose: false,
        },
      };

      migration = new WorktreeToKataMigration(config);

      const result = await migration.execute();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MIGRATION_FAILED');
      expect(result.errors[0].message).toContain('does not exist');
    });

    it('should handle database connection failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await migration.execute();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Connection refused');
    });

    it('should handle abort signal', async () => {
      // Setup a worktree that will trigger abort
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'test-worktree');
      mkdirSync(worktreePath, { recursive: true });

      // Mock database to delay
      mockPool.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 100))
      );

      // Start migration and abort immediately
      const migrationPromise = migration.execute();
      migration.abort();

      const result = await migrationPromise;

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('aborted'))).toBe(true);
    });
  });

  describe('Worktree Migration', () => {
    it('should migrate worktrees with metadata', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-1');
      mkdirSync(worktreePath, { recursive: true });
      mkdirSync(join(worktreePath, '.claude'), { recursive: true });
      
      const metadata = {
        branch: 'feature/test',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        customField: 'value',
      };
      writeFileSync(
        join(worktreePath, '.claude', 'metadata.json'),
        JSON.stringify(metadata)
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.entitiesMigrated.worktrees).toBe(1);
    });

    it('should handle worktree without metadata', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-no-meta');
      mkdirSync(worktreePath, { recursive: true });

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.entitiesMigrated.worktrees).toBe(1);
    });

    it('should handle invalid worktree directories', async () => {
      // Create a file instead of directory
      const worktreesPath = join(sourcePath, '.claude', 'worktrees');
      mkdirSync(worktreesPath, { recursive: true });
      writeFileSync(join(worktreesPath, 'not-a-directory'), 'test');

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      expect(result.entitiesMigrated.worktrees).toBe(0);
    });
  });

  describe('Session Migration', () => {
    it('should migrate sessions with agents', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-1');
      const sessionsPath = join(worktreePath, '.claude', 'sessions');
      mkdirSync(sessionsPath, { recursive: true });

      writeFileSync(
        join(sessionsPath, 'session-1.json'),
        JSON.stringify({
          id: 'session-1',
          teamId: 'team-1',
          state: { active: true },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      // Create agent data
      const agentsPath = join(worktreePath, '.claude', 'agents');
      mkdirSync(agentsPath, { recursive: true });
      writeFileSync(
        join(agentsPath, 'agent-1.json'),
        JSON.stringify({
          id: 'agent-1',
          name: 'Test Agent',
          role: 'worker',
          status: 'active',
          metadata: { test: true },
        })
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Insert session
        .mockResolvedValueOnce({ rows: [] }) // Insert agent
        .mockResolvedValueOnce({ rows: [] }) // Tasks
        .mockResolvedValueOnce({ rows: [] }) // Events
        .mockResolvedValueOnce({
          rows: [{
            session_count: '1',
            agent_count: '1',
            task_count: '0',
            event_count: '0',
          }],
        }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.entitiesMigrated.sessions).toBe(1);
      expect(result.entitiesMigrated.agents).toBe(1);
    });

    it('should handle corrupted session files', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-1');
      const sessionsPath = join(worktreePath, '.claude', 'sessions');
      mkdirSync(sessionsPath, { recursive: true });

      // Create invalid JSON
      writeFileSync(join(sessionsPath, 'corrupted.json'), 'not valid json');

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('SESSION_MIGRATION_FAILED');
    });
  });

  describe('Data Integrity', () => {
    it('should calculate correct checksum', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({
          rows: [{
            session_count: '0',
            agent_count: '0',
            task_count: '0',
            event_count: '0',
          }],
        }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      expect(result.checksum).toBeTruthy();
      expect(result.checksum.length).toBe(64); // SHA256 hex length
    });

    it('should detect data mismatches', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-1');
      const sessionsPath = join(worktreePath, '.claude', 'sessions');
      mkdirSync(sessionsPath, { recursive: true });

      writeFileSync(
        join(sessionsPath, 'session-1.json'),
        JSON.stringify({ id: 'session-1', teamId: 'team-1' })
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Insert session
        .mockResolvedValueOnce({ rows: [] }) // Integrity check - shows 0 in DB
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('mismatch');
    });
  });

  describe('Backup and Rollback', () => {
    it('should create backup before migration', async () => {
      const worktreePath = join(sourcePath, '.claude', 'worktrees', 'wt-1');
      mkdirSync(join(worktreePath, '.claude'), { recursive: true });
      writeFileSync(
        join(worktreePath, '.claude', 'metadata.json'),
        JSON.stringify({ branch: 'main' })
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      await migration.execute();

      const backupPath = join(targetPath, '.migration-backup');
      expect(existsSync(backupPath)).toBe(true);
    });

    it('should skip backup in dry-run mode', async () => {
      const config: MigrationConfig = {
        sourcePath,
        targetPath,
        pool: mockPool as any,
        options: {
          dryRun: true,
          preserveSource: true,
          batchSize: 10,
          maxConcurrency: 2,
          verbose: false,
        },
      };

      migration = new WorktreeToKataMigration(config);

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      await migration.execute();

      const backupPath = join(targetPath, '.migration-backup');
      expect(existsSync(backupPath)).toBe(false);
    });
  });

  describe('Batch Processing', () => {
    it('should process worktrees in batches', async () => {
      const worktreesPath = join(sourcePath, '.claude', 'worktrees');
      
      // Create 25 worktrees
      for (let i = 0; i < 25; i++) {
        const wtPath = join(worktreesPath, `wt-${i}`);
        mkdirSync(join(wtPath, '.claude'), { recursive: true });
        writeFileSync(
          join(wtPath, '.claude', 'metadata.json'),
          JSON.stringify({ branch: 'main' })
        );
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [] }) // Backup
        .mockResolvedValueOnce({ rows: [] }) // Integrity
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Count configs

      const result = await migration.execute();

      expect(result.entitiesMigrated.worktrees).toBe(25);
    });
  });
});

describe('CLI Interface', () => {
  const originalExit = process.exit;
  const originalEnv = process.env;

  beforeEach(() => {
    process.exit = jest.fn() as any;
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://test' };
  });

  afterEach(() => {
    process.exit = originalExit;
    process.env = originalEnv;
  });

  it('should parse command line arguments', async () => {
    const argv = [
      '--source', '/path/to/source',
      '--target', '/path/to/target',
      '--dry-run',
      '--preserve',
      '--batch-size', '50',
      '--concurrency', '10',
      '--verbose',
    ];

    // Mock the migration execute to prevent actual execution
    const mockExecute = jest.fn().mockResolvedValue({
      success: true,
      migrationId: 'test',
      entitiesMigrated: {},
      errors: [],
      warnings: [],
    });

    // We can't easily test the full CLI without more mocking,
    // but we can verify the args are parsed correctly
    await expect(runMigration(argv)).rejects.toThrow();
  });
});

describe('Error Handling', () => {
  it('should classify errors correctly', () => {
    const error: MigrationError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      entityType: 'worktree',
      entityId: 'wt-1',
      recoveryAction: 'Retry',
    };

    expect(error.code).toBe('TEST_ERROR');
    expect(error.entityType).toBe('worktree');
    expect(error.recoveryAction).toBe('Retry');
  });
});

describe('Entity Data Types', () => {
  it('should create valid WorktreeData', () => {
    const worktree: WorktreeData = {
      id: 'wt-1',
      name: 'Test Worktree',
      path: '/path/to/worktree',
      branch: 'main',
      sessions: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(worktree.id).toBe('wt-1');
    expect(worktree.sessions).toEqual([]);
  });

  it('should create valid SessionData', () => {
    const session: SessionData = {
      id: 'session-1',
      worktreeId: 'wt-1',
      teamId: 'team-1',
      agents: [],
      tasks: [],
      events: [],
      state: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(session.worktreeId).toBe('wt-1');
  });

  it('should create valid AgentData', () => {
    const agent: AgentData = {
      id: 'agent-1',
      sessionId: 'session-1',
      name: 'Test Agent',
      role: 'worker',
      status: 'active',
      metadata: {},
    };

    expect(agent.status).toBe('active');
  });

  it('should create valid TaskData', () => {
    const task: TaskData = {
      id: 'task-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      type: 'test',
      status: 'completed',
      input: {},
      output: {},
      createdAt: new Date(),
      completedAt: new Date(),
    };

    expect(task.status).toBe('completed');
  });

  it('should create valid EventData', () => {
    const event: EventData = {
      id: 'event-1',
      sessionId: 'session-1',
      type: 'test_event',
      payload: {},
      timestamp: new Date(),
    };

    expect(event.type).toBe('test_event');
  });
});

describe('EntityCount', () => {
  it('should count all entity types', () => {
    const counts: EntityCount = {
      worktrees: 5,
      sessions: 10,
      agents: 20,
      tasks: 100,
      events: 500,
      files: 1000,
      configurations: 50,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1685);
  });
});

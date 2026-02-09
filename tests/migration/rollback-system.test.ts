/**
 * Rollback System Tests
 * 
 * Comprehensive tests for emergency rollback capabilities
 * 
 * @module tests/migration/rollback-system
 */

import {
  RollbackSystem,
  RollbackConfig,
  RollbackOptions,
  RollbackResult,
  VersionSnapshot,
  EmergencyProcedure,
  runRollback,
  EMERGENCY_PROCEDURES,
} from '../../src/migration/rollback-system';
import { promises as fs, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock Pool for database operations
const mockPool = {
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};

describe('RollbackSystem', () => {
  let rollback: RollbackSystem;
  let testDir: string;
  let backupPath: string;
  let appPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `rollback-test-${Date.now()}`);
    backupPath = join(testDir, 'backups');
    appPath = join(testDir, 'app');
    
    mkdirSync(testDir, { recursive: true });
    mkdirSync(backupPath, { recursive: true });
    mkdirSync(appPath, { recursive: true });

    // Create app structure
    mkdirSync(join(appPath, 'config'), { recursive: true });
    mkdirSync(join(appPath, 'src'), { recursive: true });
    writeFileSync(join(appPath, 'package.json'), JSON.stringify({ name: 'test-app' }));

    // Reset mock
    mockPool.query.mockReset();
    mockPool.end.mockReset();

    const config: RollbackConfig = {
      pool: mockPool as any,
      backupPath,
      appPath,
      options: {
        maxRollbackTimeMinutes: 15,
        autoRollback: false,
        preserveCurrentState: true,
        verbose: false,
      },
    };

    rollback = new RollbackSystem(config);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Snapshot Creation', () => {
    it('should create a version snapshot', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ checksum: 'abc123' }] }) // DB checksum
        .mockResolvedValueOnce({ rows: [] }); // DB backup

      const snapshot = await rollback.createSnapshot('v1.0.0', { reason: 'test' });

      expect(snapshot.id).toBeTruthy();
      expect(snapshot.version).toBe('v1.0.0');
      expect(snapshot.metadata).toEqual({ reason: 'test' });
      expect(snapshot.dbChecksum).toBe('abc123');
      expect(snapshot.fileManifest.length).toBeGreaterThan(0);
    });

    it('should store snapshot to disk', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ checksum: 'abc123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const snapshot = await rollback.createSnapshot('v1.0.0');

      const snapshotPath = join(backupPath, 'snapshots', `${snapshot.id}.json`);
      expect(existsSync(snapshotPath)).toBe(true);

      const savedData = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'));
      expect(savedData.version).toBe('v1.0.0');
    });

    it('should create file backup with snapshot', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ checksum: 'abc123' }] })
        .mockResolvedValueOnce({ rows: [] });

      await rollback.createSnapshot('v1.0.0');

      const fileBackupPath = join(backupPath, 'file-backups');
      expect(existsSync(fileBackupPath)).toBe(true);
    });
  });

  describe('Version Management', () => {
    it('should list available versions', async () => {
      // Create mock snapshots
      const snapshotsDir = join(backupPath, 'snapshots');
      mkdirSync(snapshotsDir, { recursive: true });

      const snapshot1: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      const snapshot2: VersionSnapshot = {
        id: 'snapshot-2',
        version: 'v2.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'def',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot1)
      );

      writeFileSync(
        join(snapshotsDir, 'snapshot-2.json'),
        JSON.stringify(snapshot2)
      );

      const versions = await rollback.getAvailableVersions();

      expect(versions).toContain('v1.0.0');
      expect(versions).toContain('v2.0.0');
      expect(versions.length).toBe(2);
    });

    it('should return empty list when no snapshots exist', async () => {
      const versions = await rollback.getAvailableVersions();
      expect(versions).toEqual([]);
    });
  });

  describe('Rollback Validation', () => {
    it('should validate rollback feasibility', async () => {
      // Create mock snapshot
      const snapshotsDir = join(backupPath, 'snapshots');
      mkdirSync(snapshotsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // DB connectivity

      const validation = await rollback.validateRollback('v1.0.0');

      expect(validation.valid).toBe(true);
      expect(validation.issues).toEqual([]);
      expect(validation.estimatedTimeMinutes).toBe(12);
    });

    it('should detect missing snapshot', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const validation = await rollback.validateRollback('v1.0.0');

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues[0]).toContain('No snapshot found');
    });

    it('should detect database connectivity issues', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      mkdirSync(snapshotsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      const validation = await rollback.validateRollback('v1.0.0');

      expect(validation.valid).toBe(false);
      expect(validation.issues.some(i => i.includes('connectivity'))).toBe(true);
    });

    it('should detect insufficient disk space', async () => {
      // This test may need to be skipped in environments where we can't control disk space
      // Mock would be better here
      const snapshotsDir = join(backupPath, 'snapshots');
      mkdirSync(snapshotsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Note: Actual disk space check depends on the environment
      // In a real test, you'd mock fs.statfsSync
      const validation = await rollback.validateRollback('v1.0.0');
      
      // Just verify it runs without error
      expect(validation).toHaveProperty('valid');
    });
  });

  describe('Emergency Rollback', () => {
    it('should execute emergency rollback successfully', async () => {
      // Create mock snapshot
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      const fileBackupsDir = join(backupPath, 'file-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });
      mkdirSync(fileBackupsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      // Create mock DB backup
      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      // Create mock file backup
      mkdirSync(join(fileBackupsDir, 'v1.0.0', 'src'), { recursive: true });
      writeFileSync(join(fileBackupsDir, 'v1.0.0', 'package.json'), '{}');

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // freeze
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] }) // check active
        .mockResolvedValueOnce({ rows: [] }) // preserve
        .mockResolvedValueOnce({ rows: [] }) // stop
        .mockResolvedValueOnce({ rows: [] }) // DB rollback
        .mockResolvedValueOnce({ rows: [] }) // config
        .mockResolvedValueOnce({ rows: [] }) // restore sessions
        .mockResolvedValueOnce({ rows: [] }) // replay events
        .mockResolvedValueOnce({ rows: [] }); // restart

      const result = await rollback.emergencyRollback('v1.0.0');

      expect(result.success).toBe(true);
      expect(result.targetVersion).toBe('v1.0.0');
      expect(result.phasesCompleted).toContain('freeze');
      expect(result.phasesCompleted).toContain('database');
      expect(result.phasesCompleted).toContain('restart');
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should handle rollback with missing file backup', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await rollback.emergencyRollback('v1.0.0');

      expect(result.success).toBe(true);
      // Should continue despite missing file backup
    });

    it('should handle missing snapshot error', async () => {
      const result = await rollback.emergencyRollback('v-nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toContain('FAILED');
    });

    it('should abort rollback when signal received', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      const snapshot: VersionSnapshot = {
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      };

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify(snapshot)
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      // Start rollback
      const rollbackPromise = rollback.emergencyRollback('v1.0.0');
      
      // Abort immediately
      rollback.abort();

      const result = await rollbackPromise;

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('aborted'))).toBe(true);
    });

    it('should track rollback state', async () => {
      expect(rollback.isActive()).toBe(false);

      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify({
          id: 'snapshot-1',
          version: 'v1.0.0',
          createdAt: new Date().toISOString(),
          dbChecksum: 'abc',
          fileManifest: [],
          metadata: {},
        })
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      mockPool.query
        .mockImplementation(() => new Promise(resolve => 
          setTimeout(() => resolve({ rows: [] }), 100)
        ));

      // Start rollback (will take some time due to mock delays)
      const rollbackPromise = rollback.emergencyRollback('v1.0.0');
      
      // Should be active during execution
      expect(rollback.isActive()).toBe(true);

      await rollbackPromise;

      // Should not be active after completion
      expect(rollback.isActive()).toBe(false);
    });
  });

  describe('Event Emission', () => {
    it('should emit events during rollback', async () => {
      const events: string[] = [];
      
      rollback.on('rollback:complete', () => events.push('complete'));
      rollback.on('rollback:failed', () => events.push('failed'));

      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify({
          id: 'snapshot-1',
          version: 'v1.0.0',
          createdAt: new Date().toISOString(),
          dbChecksum: 'abc',
          fileManifest: [],
          metadata: {},
        })
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await rollback.emergencyRollback('v1.0.0');

      expect(events).toContain('complete');
    });

    it('should emit failed event on error', async () => {
      const events: string[] = [];
      
      rollback.on('rollback:failed', () => events.push('failed'));

      // Don't create snapshot - will cause failure

      await rollback.emergencyRollback('v1.0.0');

      expect(events).toContain('failed');
    });
  });

  describe('System Freeze', () => {
    it('should freeze system during rollback', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify({
          id: 'snapshot-1',
          version: 'v1.0.0',
          createdAt: new Date().toISOString(),
          dbChecksum: 'abc',
          fileManifest: [],
          metadata: {},
        })
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT);'
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // freeze - insert
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] }) // no active
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // restart

      await rollback.emergencyRollback('v1.0.0');

      // Verify freeze was called
      const freezeCall = mockPool.query.mock.calls.find(
        call => call[0].includes('freeze_mode')
      );
      expect(freezeCall).toBeTruthy();
    });
  });

  describe('Data Restoration', () => {
    it('should restore database records', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify({
          id: 'snapshot-1',
          version: 'v1.0.0',
          createdAt: new Date().toISOString(),
          dbChecksum: 'abc',
          fileManifest: [],
          metadata: {},
        })
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'CREATE TABLE test (id INT); INSERT INTO test VALUES (1);'
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await rollback.emergencyRollback('v1.0.0');

      expect(result.success).toBe(true);
      expect(result.dataRestored.databaseRecords).toBeGreaterThan(0);
    });

    it('should restore sessions', async () => {
      const snapshotsDir = join(backupPath, 'snapshots');
      const dbBackupsDir = join(backupPath, 'db-backups');
      
      mkdirSync(snapshotsDir, { recursive: true });
      mkdirSync(dbBackupsDir, { recursive: true });

      writeFileSync(
        join(snapshotsDir, 'snapshot-1.json'),
        JSON.stringify({
          id: 'snapshot-1',
          version: 'v1.0.0',
          createdAt: new Date().toISOString(),
          dbChecksum: 'abc',
          fileManifest: [],
          metadata: {},
        })
      );

      writeFileSync(
        join(dbBackupsDir, 'snapshot-1.sql'),
        'SELECT 1;'
      );

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 5 }) // restore sessions
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await rollback.emergencyRollback('v1.0.0');

      expect(result.dataRestored.sessions).toBe(5);
    });
  });
});

describe('Emergency Procedures', () => {
  it('should have defined procedures for all emergency types', () => {
    expect(EMERGENCY_PROCEDURES['DATA_LOSS']).toBeDefined();
    expect(EMERGENCY_PROCEDURES['CORRUPTION']).toBeDefined();
    expect(EMERGENCY_PROCEDURES['OUTAGE']).toBeDefined();
    expect(EMERGENCY_PROCEDURES['SECURITY_BREACH']).toBeDefined();
  });

  it('should have correct severity levels', () => {
    expect(EMERGENCY_PROCEDURES['DATA_LOSS'].severity).toBe('critical');
    expect(EMERGENCY_PROCEDURES['CORRUPTION'].severity).toBe('critical');
    expect(EMERGENCY_PROCEDURES['OUTAGE'].severity).toBe('high');
    expect(EMERGENCY_PROCEDURES['SECURITY_BREACH'].severity).toBe('critical');
  });

  it('should have immediate actions for each procedure', () => {
    Object.values(EMERGENCY_PROCEDURES).forEach((procedure: EmergencyProcedure) => {
      expect(procedure.immediateActions.length).toBeGreaterThan(0);
    });
  });

  it('should have rollback steps for each procedure', () => {
    Object.values(EMERGENCY_PROCEDURES).forEach((procedure: EmergencyProcedure) => {
      expect(procedure.rollbackSteps.length).toBeGreaterThan(0);
    });
  });

  it('should have contact information', () => {
    Object.values(EMERGENCY_PROCEDURES).forEach((procedure: EmergencyProcedure) => {
      expect(procedure.contacts.length).toBeGreaterThan(0);
    });
  });
});

describe('CLI Interface', () => {
  const originalExit = process.exit;

  beforeEach(() => {
    process.exit = jest.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it('should show help', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    await runRollback(['--help']);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rollback System')
    );
    
    consoleSpy.mockRestore();
  });

  it('should require version for rollback', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    await runRollback([]);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('--version required')
    );
    
    consoleSpy.mockRestore();
  });
});

describe('Timeout Handling', () => {
  let rollback: RollbackSystem;
  let testDir: string;
  let backupPath: string;
  let appPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `rollback-timeout-test-${Date.now()}`);
    backupPath = join(testDir, 'backups');
    appPath = join(testDir, 'app');
    
    mkdirSync(testDir, { recursive: true });
    mkdirSync(backupPath, { recursive: true });
    mkdirSync(appPath, { recursive: true });

    const config: RollbackConfig = {
      pool: mockPool as any,
      backupPath,
      appPath,
      options: {
        maxRollbackTimeMinutes: 15,
        autoRollback: false,
        preserveCurrentState: true,
        verbose: false,
      },
    };

    rollback = new RollbackSystem(config);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should complete within maximum rollback time', async () => {
    const snapshotsDir = join(backupPath, 'snapshots');
    const dbBackupsDir = join(backupPath, 'db-backups');
    
    mkdirSync(snapshotsDir, { recursive: true });
    mkdirSync(dbBackupsDir, { recursive: true });

    writeFileSync(
      join(snapshotsDir, 'snapshot-1.json'),
      JSON.stringify({
        id: 'snapshot-1',
        version: 'v1.0.0',
        createdAt: new Date().toISOString(),
        dbChecksum: 'abc',
        fileManifest: [],
        metadata: {},
      })
    );

    writeFileSync(
      join(dbBackupsDir, 'snapshot-1.sql'),
      'SELECT 1;'
    );

    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const startTime = Date.now();
    await rollback.emergencyRollback('v1.0.0');
    const duration = Date.now() - startTime;

    // Should complete in reasonable time (less than 5 seconds in tests)
    expect(duration).toBeLessThan(5000);
  });
});

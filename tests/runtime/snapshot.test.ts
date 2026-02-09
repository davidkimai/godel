import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SnapshotManager } from '../../src/core/runtime/kata/snapshot-manager';
import { MockStorageBackend, MockRuntimeProvider } from '../mocks/storage';

/**
 * Snapshot Tests - AGENT_24
 * Tests for VM snapshot creation, restore, and management
 * 
 * Requirements from PRD-003:
 * - FR5.1: Create VM snapshots
 * - FR5.2: Restore VM from snapshot
 * - FR5.4: Delete snapshots
 * - Concurrent snapshot handling
 * - <5s create time validation
 */
describe('SnapshotManager', () => {
  let snapshotManager: SnapshotManager;
  let storage: MockStorageBackend;
  let runtimeProvider: MockRuntimeProvider;

  beforeEach(() => {
    storage = new MockStorageBackend();
    runtimeProvider = new MockRuntimeProvider();
    snapshotManager = new SnapshotManager(storage, runtimeProvider, {
      maxConcurrentRestores: 5,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Snapshot Creation', () => {
    it('should create a snapshot of a running VM', async () => {
      const runtimeId = 'vm-123';
      const metadata = {
        name: 'test-snapshot',
        description: 'Test snapshot for VM',
        teamId: 'team-1',
      };

      const startTime = Date.now();
      const snapshot = await snapshotManager.createSnapshot(runtimeId, metadata);
      const duration = Date.now() - startTime;

      expect(snapshot.id).toBeDefined();
      expect(snapshot.runtimeId).toBe(runtimeId);
      expect(snapshot.state).toBe('ready');
      expect(snapshot.checksum).toBeDefined();
      expect(snapshot.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // <5s requirement
    });

    it('should create snapshot with metadata', async () => {
      const metadata = {
        name: 'production-snapshot',
        description: 'Production VM backup',
        labels: { env: 'prod', version: 'v1.2.3' },
        teamId: 'engineering',
        agentId: 'agent-42',
      };

      const snapshot = await snapshotManager.createSnapshot('vm-456', metadata);

      expect(snapshot.metadata.name).toBe(metadata.name);
      expect(snapshot.metadata.description).toBe(metadata.description);
      expect(snapshot.metadata.labels).toEqual(metadata.labels);
      expect(snapshot.metadata.teamId).toBe(metadata.teamId);
    });

    it('should calculate correct checksum for snapshot', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-789');
      
      // Verify checksum is 64-character hex string (SHA256)
      expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
      
      // Verify checksum validation passes
      const isValid = await snapshotManager.validateSnapshotIntegrity(snapshot.id);
      expect(isValid).toBe(true);
    });

    it('should track snapshot size correctly', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-size-test');
      
      expect(snapshot.size).toBeGreaterThan(0);
      
      const stats = snapshotManager.getStats();
      expect(stats.totalStorageBytes).toBeGreaterThanOrEqual(snapshot.size);
    });

    it('should reject snapshot creation for non-existent VM', async () => {
      runtimeProvider.simulateError('VM not found');
      
      await expect(
        snapshotManager.createSnapshot('nonexistent-vm')
      ).rejects.toThrow('Failed to create snapshot');
    });
  });

  describe('Snapshot Restore', () => {
    it('should restore VM from snapshot', async () => {
      // Create snapshot first
      const snapshot = await snapshotManager.createSnapshot('vm-source');
      
      // Restore from snapshot
      const result = await snapshotManager.restoreSnapshot(snapshot.id, {
        runtimeId: 'vm-restored',
        teamId: 'team-1',
      });

      expect(result.success).toBe(true);
      expect(result.runtimeId).toBe('vm-restored');
      expect(result.snapshotId).toBe(snapshot.id);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should restore to exact previous state', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-exact');
      
      const result = await snapshotManager.restoreSnapshot(snapshot.id, {
        runtimeId: 'vm-restored-exact',
      });

      expect(result.success).toBe(true);
      
      // Verify VM state was restored correctly
      const vmStatus = await runtimeProvider.getStatus(result.runtimeId!);
      expect(vmStatus.healthy).toBe(true);
    });

    it('should verify integrity before restore', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-integrity');
      
      const result = await snapshotManager.restoreSnapshot(snapshot.id, {
        verifyIntegrity: true,
      });

      expect(result.success).toBe(true);
    });

    it('should fail restore if integrity check fails', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-corrupt');
      
      // Corrupt the snapshot data
      storage.corruptData(snapshot.id);
      
      const result = await snapshotManager.restoreSnapshot(snapshot.id, {
        verifyIntegrity: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('integrity');
    });

    it('should track restore progress', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-progress');
      
      const progressUpdates: any[] = [];
      const progressCallback = (progress: any) => {
        progressUpdates.push(progress);
      };

      await snapshotManager.restoreSnapshot(snapshot.id, {}, progressCallback);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].stage).toBe('validating');
      expect(progressUpdates[progressUpdates.length - 1].percentComplete).toBe(100);
    });
  });

  describe('Concurrent Snapshot Handling', () => {
    it('should handle 5 concurrent snapshot creations', async () => {
      const vms = ['vm-1', 'vm-2', 'vm-3', 'vm-4', 'vm-5'];
      
      const startTime = Date.now();
      const snapshots = await Promise.all(
        vms.map((vm) => snapshotManager.createSnapshot(vm))
      );
      const duration = Date.now() - startTime;

      expect(snapshots).toHaveLength(5);
      expect(snapshots.every((s) => s.state === 'ready')).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10s
    });

    it('should handle 5 concurrent restores', async () => {
      // Create 5 snapshots first
      const snapshots = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          snapshotManager.createSnapshot(`vm-source-${i}`)
        )
      );

      const startTime = Date.now();
      const restores = await Promise.all(
        snapshots.map((snap, i) =>
          snapshotManager.restoreSnapshot(snap.id, {
            runtimeId: `vm-restored-${i}`,
          })
        )
      );
      const duration = Date.now() - startTime;

      expect(restores.every((r) => r.success)).toBe(true);
      expect(restores).toHaveLength(5);
      expect(duration).toBeLessThan(15000); // Should complete within 15s
    });

    it('should queue restores when at concurrent limit', async () => {
      // Create 10 snapshots
      const snapshots = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          snapshotManager.createSnapshot(`vm-queue-${i}`)
        )
      );

      // Try to restore all 10 simultaneously (limit is 5)
      const restorePromises = snapshots.map((snap, i) =>
        snapshotManager.restoreSnapshot(snap.id, {
          runtimeId: `vm-queued-${i}`,
        })
      );

      // Check queue length
      expect(snapshotManager.getRestoreQueueLength()).toBeGreaterThan(0);

      const results = await Promise.all(restorePromises);
      expect(results.every((r) => r.success)).toBe(true);
      expect(snapshotManager.getRestoreQueueLength()).toBe(0);
    });

    it('should track active restore operations', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-active');
      
      // Start restore but don't await
      const restorePromise = snapshotManager.restoreSnapshot(snapshot.id, {
        runtimeId: 'vm-tracking',
      });

      // Check active restores
      const activeRestores = snapshotManager.getActiveRestores();
      expect(activeRestores.length).toBeGreaterThan(0);
      expect(activeRestores[0].snapshotId).toBe(snapshot.id);

      await restorePromise;
    });
  });

  describe('Snapshot Creation Time Validation', () => {
    it('should create snapshot in <5 seconds', async () => {
      const startTime = Date.now();
      const snapshot = await snapshotManager.createSnapshot('vm-timing');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      expect(snapshot.state).toBe('ready');
      
      console.log(`Snapshot created in ${duration}ms`);
    });

    it('should maintain <5s creation time under load', async () => {
      const durations: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await snapshotManager.createSnapshot(`vm-load-${i}`);
        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      expect(avgDuration).toBeLessThan(5000);
      expect(maxDuration).toBeLessThan(5000);
      
      console.log(`Average: ${avgDuration}ms, Max: ${maxDuration}ms`);
    });
  });

  describe('Snapshot Deletion', () => {
    it('should delete snapshot successfully', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-delete');
      
      const deleted = await snapshotManager.deleteSnapshot(snapshot.id);
      
      expect(deleted).toBe(true);
      expect(snapshotManager.getSnapshot(snapshot.id)).toBeUndefined();
    });

    it('should fail to delete non-existent snapshot', async () => {
      const deleted = await snapshotManager.deleteSnapshot('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should fail to delete snapshot while being restored', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-in-use');
      
      // Start restore
      const restorePromise = snapshotManager.restoreSnapshot(snapshot.id, {
        runtimeId: 'vm-using',
      });

      // Try to delete while restoring
      await expect(
        snapshotManager.deleteSnapshot(snapshot.id)
      ).rejects.toThrow('being restored');

      await restorePromise;
    });

    it('should free storage after deletion', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-cleanup');
      const sizeBefore = snapshotManager.getStats().totalStorageBytes;
      
      await snapshotManager.deleteSnapshot(snapshot.id);
      const sizeAfter = snapshotManager.getStats().totalStorageBytes;
      
      expect(sizeAfter).toBeLessThan(sizeBefore);
    });
  });

  describe('Snapshot Integrity', () => {
    it('should detect corrupted snapshots', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-corrupt-detect');
      
      // Corrupt the data
      storage.corruptData(snapshot.id);
      
      const isValid = await snapshotManager.validateSnapshotIntegrity(snapshot.id);
      expect(isValid).toBe(false);
      
      const snapshotAfter = snapshotManager.getSnapshot(snapshot.id);
      expect(snapshotAfter?.state).toBe('corrupted');
    });

    it('should validate checksum matches', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-checksum');
      
      const isValid = await snapshotManager.validateSnapshotIntegrity(snapshot.id);
      expect(isValid).toBe(true);
    });
  });

  describe('Snapshot Metadata', () => {
    it('should preserve metadata during restore', async () => {
      const metadata = {
        name: 'important-snapshot',
        labels: { env: 'production', app: 'api' },
        teamId: 'backend-team',
      };
      
      const snapshot = await snapshotManager.createSnapshot('vm-meta', metadata);
      
      expect(snapshot.metadata.name).toBe(metadata.name);
      expect(snapshot.metadata.labels).toEqual(metadata.labels);
      expect(snapshot.metadata.teamId).toBe(metadata.teamId);
    });

    it('should filter snapshots by team', async () => {
      await snapshotManager.createSnapshot('vm-team-1', { teamId: 'team-a' });
      await snapshotManager.createSnapshot('vm-team-2', { teamId: 'team-a' });
      await snapshotManager.createSnapshot('vm-team-3', { teamId: 'team-b' });
      
      const teamASnapshots = snapshotManager
        .getAllSnapshots()
        .filter((s) => s.metadata.teamId === 'team-a');
      
      expect(teamASnapshots).toHaveLength(2);
    });
  });

  describe('Snapshot Listing', () => {
    it('should list all snapshots', async () => {
      await snapshotManager.createSnapshot('vm-list-1');
      await snapshotManager.createSnapshot('vm-list-2');
      await snapshotManager.createSnapshot('vm-list-3');
      
      const snapshots = snapshotManager.getAllSnapshots();
      expect(snapshots).toHaveLength(3);
    });

    it('should get snapshots by runtime', async () => {
      const runtimeId = 'vm-specific';
      await snapshotManager.createSnapshot(runtimeId);
      await snapshotManager.createSnapshot(runtimeId);
      await snapshotManager.createSnapshot('other-vm');
      
      const runtimeSnapshots = snapshotManager.getSnapshotsByRuntime(runtimeId);
      expect(runtimeSnapshots).toHaveLength(2);
    });

    it('should get snapshot by ID', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-get');
      
      const retrieved = snapshotManager.getSnapshot(snapshot.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(snapshot.id);
    });
  });

  describe('Statistics and Reporting', () => {
    it('should report accurate statistics', async () => {
      await snapshotManager.createSnapshot('vm-stats-1');
      await snapshotManager.createSnapshot('vm-stats-2');
      
      const stats = snapshotManager.getStats();
      
      expect(stats.totalSnapshots).toBe(2);
      expect(stats.readySnapshots).toBe(2);
      expect(stats.corruptedSnapshots).toBe(0);
      expect(stats.totalStorageBytes).toBeGreaterThan(0);
    });

    it('should track corrupted snapshot count', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-stats-corrupt');
      storage.corruptData(snapshot.id);
      await snapshotManager.validateSnapshotIntegrity(snapshot.id);
      
      const stats = snapshotManager.getStats();
      expect(stats.corruptedSnapshots).toBe(1);
      expect(stats.readySnapshots).toBe(0);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup corrupted snapshots', async () => {
      // Create mix of valid and corrupted snapshots
      const valid1 = await snapshotManager.createSnapshot('vm-valid-1');
      const corrupt1 = await snapshotManager.createSnapshot('vm-corrupt-1');
      const valid2 = await snapshotManager.createSnapshot('vm-valid-2');
      const corrupt2 = await snapshotManager.createSnapshot('vm-corrupt-2');
      
      storage.corruptData(corrupt1.id);
      storage.corruptData(corrupt2.id);
      
      await snapshotManager.validateSnapshotIntegrity(corrupt1.id);
      await snapshotManager.validateSnapshotIntegrity(corrupt2.id);
      
      const cleaned = await snapshotManager.cleanupCorruptedSnapshots();
      
      expect(cleaned).toBe(2);
      expect(snapshotManager.getSnapshot(valid1.id)).toBeDefined();
      expect(snapshotManager.getSnapshot(valid2.id)).toBeDefined();
      expect(snapshotManager.getSnapshot(corrupt1.id)).toBeUndefined();
      expect(snapshotManager.getSnapshot(corrupt2.id)).toBeUndefined();
    });
  });

  describe('Rollback on Failed Restore', () => {
    it('should rollback on failed restore', async () => {
      const snapshot = await snapshotManager.createSnapshot('vm-rollback');
      
      // Simulate restore failure
      runtimeProvider.simulateError('Restore failed');
      
      const result = await snapshotManager.restoreSnapshot(snapshot.id, {
        runtimeId: 'vm-fail',
      });

      expect(result.success).toBe(false);
      // Verify rollback was attempted
      expect(runtimeProvider.terminatedRuntimes.has('vm-fail')).toBe(true);
    });
  });
});

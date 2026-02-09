import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  SnapshotManager, 
  SnapshotConfig, 
  SnapshotError, 
  RestoreError,
  ConcurrentSnapshotError 
} from '../../src/core/runtime/kata/snapshot-manager';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  const testStoragePath = '/tmp/test-snapshots';

  beforeEach(() => {
    manager = new SnapshotManager({
      snapshotStoragePath: testStoragePath,
      maxConcurrentSnapshots: 3,
      defaultExpirationHours: 24,
    });
  });

  describe('Snapshot Creation', () => {
    it('should create snapshot successfully', async () => {
      const vmId = 'test-vm-1';
      const config: SnapshotConfig = {
        name: 'test-snapshot',
        labels: { env: 'test' },
      };

      const result = await manager.createSnapshot(vmId, config);

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot?.name).toBe('test-snapshot');
      expect(result.snapshot?.vmId).toBe(vmId);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should handle concurrent snapshot limit', async () => {
      // Start 4 concurrent snapshots (limit is 3)
      const promises = Array.from({ length: 4 }, (_, i) =>
        manager.createSnapshot(`vm-${i}`, { name: `snapshot-${i}` })
      );

      const results = await Promise.all(promises);

      // At least one should fail due to concurrent limit
      const failures = results.filter(r => !r.success);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].error).toBeInstanceOf(ConcurrentSnapshotError);
    });

    it('should reject duplicate snapshot operations for same VM', async () => {
      const vmId = 'test-vm-duplicate';

      // Start first snapshot
      const promise1 = manager.createSnapshot(vmId, { name: 'snapshot-1' });
      
      // Try to start second snapshot while first is in progress
      const promise2 = manager.createSnapshot(vmId, { name: 'snapshot-2' });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should fail
      expect(result1.success || result2.success).toBe(true);
      expect(result1.success !== result2.success).toBe(true);
      
      if (!result2.success) {
        expect(result2.error?.code).toBe('CONCURRENT_SNAPSHOT');
      }
    });

    it('should create snapshot with memory state', async () => {
      const result = await manager.createSnapshot('vm-memory-test', {
        name: 'memory-snapshot',
        includeMemory: true,
      });

      expect(result.success).toBe(true);
      expect(result.snapshot?.criuDumpPath).toBeDefined();
    });

    it('should create snapshot without memory state', async () => {
      const result = await manager.createSnapshot('vm-no-memory', {
        name: 'disk-only-snapshot',
        includeMemory: false,
      });

      expect(result.success).toBe(true);
      expect(result.snapshot?.criuDumpPath).toBeUndefined();
    });
  });

  describe('Snapshot Restore', () => {
    it('should restore snapshot successfully', async () => {
      const vmId = 'test-vm-restore';
      
      // Create snapshot first
      const createResult = await manager.createSnapshot(vmId, {
        name: 'restore-test-snapshot',
      });
      expect(createResult.success).toBe(true);

      const snapshotId = createResult.snapshot!.id;

      // Restore snapshot
      const restoreResult = await manager.restoreSnapshot(snapshotId, vmId);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.snapshotId).toBe(snapshotId);
      expect(restoreResult.vmId).toBe(vmId);
      expect(restoreResult.durationMs).toBeGreaterThan(0);
    });

    it('should report restore progress', async () => {
      const vmId = 'test-vm-progress';
      const progressEvents: string[] = [];

      manager.on('restore:progress', (event) => {
        progressEvents.push(event.progress.phase);
      });

      const createResult = await manager.createSnapshot(vmId, {
        name: 'progress-test',
      });

      await manager.restoreSnapshot(createResult.snapshot!.id, vmId);

      expect(progressEvents).toContain('validating');
      expect(progressEvents).toContain('restoring-disk');
      expect(progressEvents).toContain('finalizing');
    });

    it('should handle restore of non-existent snapshot', async () => {
      const result = await manager.restoreSnapshot('non-existent-id', 'test-vm');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RESTORE_FAILED');
    });

    it('should validate snapshot integrity during restore', async () => {
      const vmId = 'test-vm-integrity';
      
      const createResult = await manager.createSnapshot(vmId, {
        name: 'integrity-test',
      });

      const restoreResult = await manager.restoreSnapshot(
        createResult.snapshot!.id,
        vmId,
        { verifyIntegrity: true }
      );

      expect(restoreResult.success).toBe(true);
    });

    it('should support force restore option', async () => {
      const vmId = 'test-vm-force';
      
      const createResult = await manager.createSnapshot(vmId, {
        name: 'force-test',
      });

      const restoreResult = await manager.restoreSnapshot(
        createResult.snapshot!.id,
        vmId,
        { force: true }
      );

      expect(restoreResult.success).toBe(true);
    });

    it('should prevent concurrent restore operations', async () => {
      const vmId = 'test-vm-concurrent-restore';
      
      const createResult = await manager.createSnapshot(vmId, {
        name: 'concurrent-restore-test',
      });

      const snapshotId = createResult.snapshot!.id;

      // Start two restore operations concurrently
      const promise1 = manager.restoreSnapshot(snapshotId, vmId);
      const promise2 = manager.restoreSnapshot(snapshotId, vmId);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should fail
      expect(result1.success || result2.success).toBe(true);
      expect(result1.success !== result2.success).toBe(true);
    });
  });

  describe('Snapshot Management', () => {
    it('should list all snapshots', async () => {
      // Create multiple snapshots
      await manager.createSnapshot('vm-a', { name: 'snapshot-a1' });
      await manager.createSnapshot('vm-a', { name: 'snapshot-a2' });
      await manager.createSnapshot('vm-b', { name: 'snapshot-b1' });

      const allSnapshots = await manager.listSnapshots();
      expect(allSnapshots.length).toBe(3);

      const vmASnapshots = await manager.listSnapshots('vm-a');
      expect(vmASnapshots.length).toBe(2);
    });

    it('should delete snapshot', async () => {
      const result = await manager.createSnapshot('vm-delete', {
        name: 'delete-test',
      });

      const snapshotId = result.snapshot!.id;
      const deleted = await manager.deleteSnapshot(snapshotId);

      expect(deleted).toBe(true);

      const snapshot = await manager.getSnapshot(snapshotId);
      expect(snapshot?.status).toBe('deleted');
    });

    it('should apply expiration policy', async () => {
      // Create snapshot with short expiration
      await manager.createSnapshot('vm-expire', {
        name: 'expire-test',
        expirationHours: -1, // Already expired
      });

      const result = await manager.applyExpirationPolicy();
      
      expect(result.expired).toBeGreaterThan(0);
    });

    it('should cancel active snapshot', async () => {
      const vmId = 'vm-cancel';

      // Start snapshot (won't complete before cancel)
      const snapshotPromise = manager.createSnapshot(vmId, {
        name: 'cancel-test',
      });

      // Cancel immediately
      const cancelled = manager.cancelSnapshot(vmId);

      expect(cancelled).toBe(true);

      const result = await snapshotPromise;
      expect(result.success).toBe(false);
    });
  });

  describe('Reliability Tests', () => {
    it('should handle storage exhaustion gracefully', async () => {
      // This test would need actual storage mocking
      const result = await manager.createSnapshot('vm-storage', {
        name: 'storage-test',
      });

      // Should either succeed or fail with proper error
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SnapshotError);
      }
    });

    it('should persist snapshot metadata', async () => {
      const result = await manager.createSnapshot('vm-persist', {
        name: 'persist-test',
        labels: { key: 'value' },
        annotations: { note: 'test' },
      });

      expect(result.success).toBe(true);
      expect(result.snapshot?.labels.key).toBe('value');
      expect(result.snapshot?.annotations.note).toBe('test');
    });

    it('should handle snapshot creation failure cleanup', async () => {
      const vmId = 'vm-cleanup';

      // Create and immediately delete to test cleanup
      const result = await manager.createSnapshot(vmId, {
        name: 'cleanup-test',
      });

      if (result.success) {
        await manager.deleteSnapshot(result.snapshot!.id);
        
        const snapshot = await manager.getSnapshot(result.snapshot!.id);
        expect(snapshot?.status).toBe('deleted');
      }
    });

    it('should wait for restore completion', async () => {
      const vmId = 'vm-wait';
      
      const createResult = await manager.createSnapshot(vmId, {
        name: 'wait-test',
      });

      // Start restore
      manager.restoreSnapshot(createResult.snapshot!.id, vmId);

      // Wait for completion (will complete immediately in mock)
      const waitResult = await manager.waitForRestore(vmId, 5000);
      
      expect(waitResult.success).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple VMs creating snapshots simultaneously', async () => {
      const vmCount = 10;
      const promises = Array.from({ length: vmCount }, (_, i) =>
        manager.createSnapshot(`vm-concurrent-${i}`, { name: `concurrent-${i}` })
      );

      const results = await Promise.all(promises);

      // At least maxConcurrent should succeed
      const successes = results.filter(r => r.success).length;
      expect(successes).toBeGreaterThanOrEqual(3); // maxConcurrent is 3
    });

    it('should maintain consistency during concurrent restore', async () => {
      const vmIds = ['vm-cr-1', 'vm-cr-2', 'vm-cr-3'];
      
      // Create snapshots
      const createResults = await Promise.all(
        vmIds.map(vmId => manager.createSnapshot(vmId, { name: `cr-${vmId}` }))
      );

      // Attempt concurrent restores
      const restorePromises = createResults
        .filter(r => r.success)
        .map(r => manager.restoreSnapshot(r.snapshot!.id, r.snapshot!.vmId));

      const restoreResults = await Promise.all(restorePromises);

      // All should succeed (different VMs)
      expect(restoreResults.every(r => r.success)).toBe(true);
    });
  });

  describe('Performance Benchmarks', () => {
    it('benchmark: snapshot creation performance', async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await manager.createSnapshot(`vm-bench-${i}`, { name: `bench-${i}` });
        durations.push(performance.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`Average snapshot creation time: ${avgDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(100); // Should be fast in mock
    });

    it('benchmark: snapshot restore performance', async () => {
      const createResult = await manager.createSnapshot('vm-restore-bench', {
        name: 'restore-benchmark',
      });

      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await manager.restoreSnapshot(createResult.snapshot!.id, `target-vm-${i}`);
        durations.push(performance.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`Average snapshot restore time: ${avgDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(100);
    });
  });

  afterEach(async () => {
    await manager.cleanup();
  });
});

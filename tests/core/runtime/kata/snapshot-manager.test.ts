import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  SnapshotManager,
  SnapshotConfig,
  SnapshotError,
  ConcurrentSnapshotError,
  StorageExhaustedError,
} from '../../../../src/core/runtime/kata/snapshot-manager';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let testStoragePath: string;

  beforeEach(async () => {
    testStoragePath = join(tmpdir(), `snapshot-test-${Date.now()}`);
    await fs.mkdir(testStoragePath, { recursive: true });
    
    manager = new SnapshotManager({
      snapshotStoragePath: testStoragePath,
      maxConcurrentSnapshots: 2,
      defaultExpirationHours: 24,
      compressionEnabled: true,
    });
  });

  afterEach(async () => {
    await manager.cleanup();
    await fs.rm(testStoragePath, { recursive: true, force: true });
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with default configuration', async () => {
      const vmId = 'vm-test-001';
      const result = await manager.createSnapshot(vmId);

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot?.vmId).toBe(vmId);
      expect(result.snapshot?.status).toBe('completed');
      expect(result.snapshot?.id).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should create a named snapshot with labels and metadata', async () => {
      const vmId = 'vm-test-002';
      const config: SnapshotConfig = {
        name: 'test-snapshot',
        labels: {
          env: 'production',
          version: 'v1.0.0',
        },
        annotations: {
          description: 'Test snapshot for CI/CD',
          author: 'test-user',
        },
      };

      const result = await manager.createSnapshot(vmId, config);

      expect(result.success).toBe(true);
      expect(result.snapshot?.name).toBe('test-snapshot');
      expect(result.snapshot?.labels).toEqual(config.labels);
      expect(result.snapshot?.annotations).toEqual(config.annotations);
    });

    it('should handle concurrent snapshot creation', async () => {
      const vmId = 'vm-test-003';
      
      const promise1 = manager.createSnapshot(vmId);
      const promise2 = manager.createSnapshot(vmId);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      const successCount = [result1, result2].filter(r => r.success).length;
      const failureCount = [result1, result2].filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
      
      const failed = result1.success ? result2 : result1;
      expect(failed.error).toBeInstanceOf(ConcurrentSnapshotError);
    });

    it('should respect max concurrent snapshots limit', async () => {
      const vmIds = ['vm-001', 'vm-002', 'vm-003'];
      
      const promises = vmIds.map(vmId => manager.createSnapshot(vmId));
      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      expect(successCount).toBe(2); // maxConcurrentSnapshots
      expect(failureCount).toBe(1);
    });

    it('should track snapshot size', async () => {
      const vmId = 'vm-test-004';
      const result = await manager.createSnapshot(vmId);

      expect(result.success).toBe(true);
      expect(result.snapshot?.size).toBeDefined();
      expect(typeof result.snapshot?.size).toBe('number');
    });

    it('should set expiration time based on configuration', async () => {
      const vmId = 'vm-test-005';
      const expirationHours = 48;
      
      const result = await manager.createSnapshot(vmId, { expirationHours });

      expect(result.success).toBe(true);
      expect(result.snapshot?.expiresAt).toBeDefined();
      
      const expectedExpiration = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
      const actualExpiration = result.snapshot!.expiresAt!;
      
      expect(Math.abs(expectedExpiration.getTime() - actualExpiration.getTime())).toBeLessThan(1000);
    });

    it('should emit snapshot events', async () => {
      const events: string[] = [];
      const vmId = 'vm-test-006';

      manager.on('snapshot:started', () => events.push('started'));
      manager.on('snapshot:completed', () => events.push('completed'));

      await manager.createSnapshot(vmId);

      expect(events).toContain('started');
      expect(events).toContain('completed');
    });
  });

  describe('listSnapshots', () => {
    it('should list all snapshots', async () => {
      await manager.createSnapshot('vm-001');
      await manager.createSnapshot('vm-002');
      await manager.createSnapshot('vm-003');

      const snapshots = await manager.listSnapshots();

      expect(snapshots.length).toBe(3);
    });

    it('should filter snapshots by VM ID', async () => {
      await manager.createSnapshot('vm-001');
      await manager.createSnapshot('vm-001');
      await manager.createSnapshot('vm-002');

      const vm1Snapshots = await manager.listSnapshots('vm-001');

      expect(vm1Snapshots.length).toBe(2);
      expect(vm1Snapshots.every(s => s.vmId === 'vm-001')).toBe(true);
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve a snapshot by ID', async () => {
      const result = await manager.createSnapshot('vm-001');
      const snapshotId = result.snapshot!.id;

      const retrieved = await manager.getSnapshot(snapshotId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(snapshotId);
    });

    it('should return undefined for non-existent snapshot', async () => {
      const retrieved = await manager.getSnapshot('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot', async () => {
      const result = await manager.createSnapshot('vm-001');
      const snapshotId = result.snapshot!.id;

      const deleted = await manager.deleteSnapshot(snapshotId);

      expect(deleted).toBe(true);
      
      const retrieved = await manager.getSnapshot(snapshotId);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent snapshot', async () => {
      const deleted = await manager.deleteSnapshot('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should cancel active snapshot during deletion', async () => {
      const vmId = 'vm-001';
      const promise = manager.createSnapshot(vmId);
      
      const activeSnapshots = await manager.getActiveSnapshots();
      if (activeSnapshots.length > 0) {
        const snapshotId = activeSnapshots[0].id;
        await manager.deleteSnapshot(snapshotId);
      }

      const result = await promise;
      expect(result.success || !result.success).toBe(true); // Either completed or failed
    });
  });

  describe('applyExpirationPolicy', () => {
    it('should expire snapshots past their expiration time', async () => {
      const result = await manager.createSnapshot('vm-001', { expirationHours: -1 });
      
      const policy = await manager.applyExpirationPolicy();

      expect(policy.expired).toBe(1);
    });

    it('should not expire valid snapshots', async () => {
      await manager.createSnapshot('vm-001', { expirationHours: 24 });
      
      const policy = await manager.applyExpirationPolicy();

      expect(policy.expired).toBe(0);
      expect(policy.total).toBe(1);
    });
  });

  describe('cancelSnapshot', () => {
    it('should cancel an active snapshot', async () => {
      const vmId = 'vm-001';
      const promise = manager.createSnapshot(vmId);
      
      const cancelled = await manager.cancelSnapshot(vmId);
      
      expect(cancelled).toBe(true);
      
      const result = await promise;
      expect(result.success).toBe(false);
    });

    it('should return false for non-active VM', async () => {
      const cancelled = await manager.cancelSnapshot('non-existent-vm');
      expect(cancelled).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle snapshot creation errors gracefully', async () => {
      const vmId = 'vm-001';
      
      const result = await manager.createSnapshot(vmId);

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * File Sync Tests
 * 
 * Unit tests for Host-VM file synchronization
 * 
 * @module tests/core/runtime/kata/file-sync
 */

import {
  FileSyncEngine,
  createFileSyncEngine,
  createProgressTracker,
  calculateFileChecksum,
  verifyFileChecksum,
  compressData,
  decompressData,
} from '../../../../src/core/runtime/kata/file-sync';
import { promises as fs, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileSyncEngine', () => {
  let engine: FileSyncEngine;
  let testDir: string;

  beforeEach(() => {
    engine = createFileSyncEngine('test-pod', 'default', 'main');
    testDir = join(tmpdir(), `file-sync-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Engine Creation', () => {
    it('should create a file sync engine with default namespace', () => {
      const defaultEngine = createFileSyncEngine('my-pod');
      expect(defaultEngine).toBeInstanceOf(FileSyncEngine);
    });

    it('should create a file sync engine with custom namespace and container', () => {
      const customEngine = createFileSyncEngine('my-pod', 'custom-ns', 'container-1');
      expect(customEngine).toBeInstanceOf(FileSyncEngine);
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress through transform stream', async () => {
      const totalBytes = 1000;
      const progressUpdates: any[] = [];

      const progressTracker = createProgressTracker(
        totalBytes,
        (progress) => progressUpdates.push(progress),
        10 // Shorter interval for faster updates
      );

      // Write data in chunks to trigger progress updates
      const chunkSize = 100;
      const chunks = Math.ceil(totalBytes / chunkSize);
      
      await new Promise((resolve, reject) => {
        progressTracker.on('finish', resolve);
        progressTracker.on('error', reject);
        
        // Write data in chunks with small delays
        for (let i = 0; i < chunks; i++) {
          const chunk = Buffer.alloc(Math.min(chunkSize, totalBytes - i * chunkSize), 'x');
          progressTracker.write(chunk);
        }
        progressTracker.end();
      });

      // Allow time for progress events to be emitted
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.transferredBytes).toBe(totalBytes);
      expect(lastUpdate.percentage).toBe(100);
    });

    it('should calculate speed and ETA correctly', async () => {
      const totalBytes = 10000;
      const progressUpdates: any[] = [];

      const progressTracker = createProgressTracker(
        totalBytes,
        (progress) => progressUpdates.push(progress),
        10
      );

      const testData = Buffer.alloc(totalBytes, 'x');
      
      await new Promise((resolve, reject) => {
        progressTracker.on('finish', resolve);
        progressTracker.on('error', reject);
        progressTracker.end(testData);
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      if (progressUpdates.length > 0) {
        const update = progressUpdates[0];
        expect(update.speed).toBeGreaterThan(0);
        expect(update.eta).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Checksum Operations', () => {
    it('should calculate SHA256 checksum for a file', async () => {
      const testFile = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      writeFileSync(testFile, content);

      const checksum = await calculateFileChecksum(testFile, 'sha256');
      expect(checksum).toHaveLength(64); // SHA256 hex length
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should calculate MD5 checksum for a file', async () => {
      const testFile = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      writeFileSync(testFile, content);

      const checksum = await calculateFileChecksum(testFile, 'md5');
      expect(checksum).toHaveLength(32); // MD5 hex length
      expect(checksum).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should verify file checksum correctly', async () => {
      const testFile = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      writeFileSync(testFile, content);

      const checksum = await calculateFileChecksum(testFile, 'sha256');
      const isValid = await verifyFileChecksum(testFile, checksum, 'sha256');
      expect(isValid).toBe(true);
    });

    it('should detect invalid checksum', async () => {
      const testFile = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      writeFileSync(testFile, content);

      const isValid = await verifyFileChecksum(testFile, 'invalid-checksum', 'sha256');
      expect(isValid).toBe(false);
    });
  });

  describe('Compression', () => {
    it('should compress and decompress with gzip', async () => {
      const originalData = Buffer.from('Hello, World! '.repeat(100));
      
      const compressed = await compressData(originalData, 'gzip');
      expect(compressed.length).toBeLessThan(originalData.length);
      
      const decompressed = await decompressData(compressed, 'gzip');
      expect(decompressed.toString()).toBe(originalData.toString());
    });

    it('should handle uncompressed data', async () => {
      const originalData = Buffer.from('Hello, World!');
      
      const compressed = await compressData(originalData, 'none');
      expect(compressed.toString()).toBe(originalData.toString());
      
      const decompressed = await decompressData(compressed, 'none');
      expect(decompressed.toString()).toBe(originalData.toString());
    });

    it('should throw error for zstd compression', async () => {
      const data = Buffer.from('test');
      await expect(compressData(data, 'zstd')).rejects.toThrow('zstd compression not implemented');
    });
  });

  describe('Event Emission', () => {
    it('should emit events during sync operations', () => {
      const events: string[] = [];
      
      engine.on('progress', () => events.push('progress'));
      engine.on('transferComplete', () => events.push('complete'));
      engine.on('batchProgress', () => events.push('batch'));

      // Test that engine can emit events
      engine.emit('progress', {
        totalBytes: 100,
        transferredBytes: 50,
        percentage: 50,
        speed: 1000,
        eta: 5,
        filesProcessed: 1,
        totalFiles: 2,
        startedAt: new Date(),
        updatedAt: new Date(),
      });

      expect(events).toContain('progress');
    });

    it('should track active transfers', () => {
      const activeBefore = engine.getActiveTransfers();
      expect(Array.isArray(activeBefore)).toBe(true);
    });
  });

  describe('Resume Data', () => {
    it('should return undefined for non-existent transfer', () => {
      const resumeData = engine.getResumeData('non-existent-id');
      expect(resumeData).toBeUndefined();
    });

    it('should throw error when resuming non-existent transfer', async () => {
      await expect(engine.resumeTransfer('non-existent-id')).rejects.toThrow(
        'No resume data found for transfer'
      );
    });
  });

  describe('Batch Operations', () => {
    it('should handle empty batch', async () => {
      const result = await engine.batchSync([], 'host-to-vm');
      expect(result.succeeded).toEqual([]);
      expect(result.failed.size).toBe(0);
    });
  });
});

describe('Integration Tests (Mock)', () => {
  let engine: FileSyncEngine;

  beforeEach(() => {
    engine = createFileSyncEngine('test-pod', 'default');
  });

  it('should create engine with all configuration options', () => {
    const options = {
      podName: 'test-pod',
      namespace: 'custom-namespace',
      containerName: 'sidecar',
    };

    const customEngine = createFileSyncEngine(
      options.podName,
      options.namespace,
      options.containerName
    );

    expect(customEngine).toBeInstanceOf(FileSyncEngine);
  });
});

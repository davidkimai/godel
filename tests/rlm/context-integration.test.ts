/**
 * Agent 43: Context Integration Tests
 * Tests for 10GB+ file lazy loading, byte-range accuracy, and all storage connectors
 * Target: 20+ integration tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { GCSConnector } from '../../src/core/rlm/storage/gcs-connector';
import { S3Connector } from '../../src/core/rlm/storage/s3-connector';
import { LocalStorageConnector, type ByteRangeResponse } from '../../src/core/rlm/storage/local-connector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Context Integration Tests', () => {
  const tempDir = path.join(os.tmpdir(), 'rlm-context-tests');
  
  // Test file sizes
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  
  let localConnector: LocalStorageConnector;

  beforeAll(async () => {
    // Create temp directory
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    localConnector = new LocalStorageConnector({
      basePath: tempDir,
      useMmap: true,
      useDirectIO: true,
    });
  });

  afterAll(async () => {
    await localConnector.close();
    // Cleanup temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean up test files before each test
    const files = await fs.promises.readdir(tempDir).catch(() => []);
    await Promise.all(
      files.map(f => fs.promises.unlink(path.join(tempDir, f)).catch(() => {}))
    );
  });

  describe('Byte-Range Accuracy', () => {
    it('should read exact byte range from small file', async () => {
      const testData = Buffer.from('Hello World! This is a test string.');
      await localConnector.writeFile('small.txt', testData);
      
      const result = await localConnector.readByteRange({
        key: 'small.txt',
        start: 0,
        end: 5,
      });
      
      expect(result.data.toString()).toBe('Hello');
      expect(result.data.length).toBe(5);
    });

    it('should read exact byte range from middle of file', async () => {
      const testData = Buffer.alloc(1024);
      testData.fill('A', 0, 100);
      testData.fill('B', 100, 200);
      testData.fill('C', 200, 1024);
      
      await localConnector.writeFile('middle.txt', testData);
      
      const result = await localConnector.readByteRange({
        key: 'middle.txt',
        start: 100,
        end: 200,
      });
      
      expect(result.data.length).toBe(100);
      expect(result.data.toString()).toBe('B'.repeat(100));
    });

    it('should read exact byte range from end of file', async () => {
      const testData = Buffer.alloc(1000);
      testData.fill('X', 0, 900);
      testData.fill('Z', 900, 1000);
      
      await localConnector.writeFile('end.txt', testData);
      
      const result = await localConnector.readByteRange({
        key: 'end.txt',
        start: 950,
        end: 1000,
      });
      
      expect(result.data.length).toBe(50);
      expect(result.data.toString()).toBe('Z'.repeat(50));
    });

    it('should handle empty range at end of file', async () => {
      const testData = Buffer.alloc(100);
      await localConnector.writeFile('empty.txt', testData);
      
      const result = await localConnector.readByteRange({
        key: 'empty.txt',
        start: 100,
        end: 200,
      });
      
      expect(result.data.length).toBe(0);
    });

    it('should handle overlapping ranges correctly', async () => {
      const testData = Buffer.from('ABCDEFGHIJ');
      await localConnector.writeFile('overlap.txt', testData);
      
      const range1 = await localConnector.readByteRange({
        key: 'overlap.txt',
        start: 0,
        end: 5,
      });
      
      const range2 = await localConnector.readByteRange({
        key: 'overlap.txt',
        start: 3,
        end: 8,
      });
      
      expect(range1.data.toString()).toBe('ABCDE');
      expect(range2.data.toString()).toBe('DEFGH');
    });

    it('should read 1MB range accurately', async () => {
      const testData = cryptoRandomBytes(10 * MB);
      await localConnector.writeFile('1mb-test.bin', testData);
      
      const result = await localConnector.readByteRange({
        key: '1mb-test.bin',
        start: 5 * MB,
        end: 6 * MB,
      });
      
      const expected = testData.slice(5 * MB, 6 * MB);
      expect(result.data.equals(expected)).toBe(true);
      expect(result.data.length).toBe(MB);
    });

    it('should read 10MB range accurately', async () => {
      const testData = cryptoRandomBytes(100 * MB);
      await localConnector.writeFile('10mb-test.bin', testData);
      
      const result = await localConnector.readByteRange({
        key: '10mb-test.bin',
        start: 50 * MB,
        end: 60 * MB,
      });
      
      const expected = testData.slice(50 * MB, 60 * MB);
      expect(result.data.equals(expected)).toBe(true);
      expect(result.data.length).toBe(10 * MB);
    });
  });

  describe('Large File Lazy Loading', () => {
    it('should handle 1GB file with byte-range reads', async () => {
      // Create 1GB file
      const chunkSize = 10 * MB;
      const totalChunks = 100;
      const filePath = path.join(tempDir, '1gb-file.bin');
      
      // Write file in chunks to avoid memory issues
      const writeStream = fs.createWriteStream(filePath);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = cryptoRandomBytes(chunkSize);
        writeStream.write(chunk);
      }
      writeStream.end();
      await new Promise<void>((resolve) => writeStream.on('finish', resolve));
      
      // Read random byte ranges
      const reads: Promise<ByteRangeResponse>[] = [];
      for (let i = 0; i < 10; i++) {
        const start = Math.floor(Math.random() * (totalChunks - 1)) * chunkSize;
        reads.push(
          localConnector.readByteRange({
            key: '1gb-file.bin',
            start,
            end: start + MB,
          })
        );
      }
      
      const results = await Promise.all(reads);
      results.forEach(result => {
        expect(result.data.length).toBe(MB);
        expect(result.latencyMs).toBeLessThan(100);
      });
    }, 30000);

    it('should handle 10GB file metadata without loading', async () => {
      // Simulate 10GB file by creating sparse file
      const filePath = path.join(tempDir, '10gb-file.bin');
      const fd = await fs.promises.open(filePath, 'w');
      await fd.truncate(10 * GB);
      await fd.close();
      
      const size = await localConnector.getFileSize('10gb-file.bin');
      expect(size).toBe(10 * GB);
    }, 10000);

    it('should read from 10GB file at various offsets', async () => {
      const filePath = path.join(tempDir, '10gb-sparse.bin');
      const fd = await fs.promises.open(filePath, 'w');
      
      // Write data at specific offsets in 10GB file
      const offsets = [0, 1 * GB, 5 * GB, 9 * GB];
      const markerData = Buffer.from('MARKER_DATA_12345');
      
      for (const offset of offsets) {
        await fd.write(markerData, 0, markerData.length, offset);
      }
      await fd.close();
      
      // Read back from each offset
      for (const offset of offsets) {
        const result = await localConnector.readByteRange({
          key: '10gb-sparse.bin',
          start: offset,
          end: offset + markerData.length,
        });
        
        expect(result.data.toString()).toBe('MARKER_DATA_12345');
      }
    }, 30000);
  });

  describe('Storage Connector Interface', () => {
    it('should provide consistent interface across all connectors', () => {
      // Verify all connectors have required methods
      const requiredMethods = ['readByteRange', 'getMetrics', 'close'];
      
      const gcs = new GCSConnector({
        projectId: 'test',
        bucketName: 'test',
      });
      
      const s3 = new S3Connector({
        region: 'us-east-1',
        bucketName: 'test',
      });
      
      const local = new LocalStorageConnector({
        basePath: tempDir,
      });
      
      for (const method of requiredMethods) {
        expect(typeof (gcs as any)[method]).toBe('function');
        expect(typeof (s3 as any)[method]).toBe('function');
        expect(typeof (local as any)[method]).toBe('function');
      }
      
      gcs.close();
      s3.close();
      local.close();
    });

    it('should emit events for monitoring', async () => {
      const events: string[] = [];
      
      localConnector.on('latency:warning', () => events.push('latency:warning'));
      localConnector.on('read:error', () => events.push('read:error'));
      
      // Trigger a warning by reading from non-existent file
      try {
        await localConnector.readByteRange({
          key: 'non-existent-file.bin',
          start: 0,
          end: 100,
        });
      } catch {
        // Expected to fail
      }
      
      expect(events).toContain('read:error');
    });
  });

  describe('Performance Targets', () => {
    it('should achieve <10ms latency for local small reads', async () => {
      const testData = cryptoRandomBytes(100 * KB);
      await localConnector.writeFile('perf-test.bin', testData);
      
      const latencies: number[] = [];
      
      // Warm up
      for (let i = 0; i < 5; i++) {
        await localConnector.readByteRange({
          key: 'perf-test.bin',
          start: 0,
          end: 4 * KB,
        });
      }
      
      // Measure
      for (let i = 0; i < 20; i++) {
        const result = await localConnector.readByteRange({
          key: 'perf-test.bin',
          start: i * 4 * KB,
          end: (i + 1) * 4 * KB,
        });
        latencies.push(result.latencyMs);
      }
      
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(10);
    });

    it('should handle concurrent reads efficiently', async () => {
      const testData = cryptoRandomBytes(10 * MB);
      await localConnector.writeFile('concurrent-test.bin', testData);
      
      const startTime = Date.now();
      
      const reads = Array.from({ length: 50 }, (_, i) =>
        localConnector.readByteRange({
          key: 'concurrent-test.bin',
          start: (i * 100) % (10 * MB),
          end: (i * 100 + 1000) % (10 * MB),
        })
      );
      
      await Promise.all(reads);
      const totalTime = Date.now() - startTime;
      
      // 50 concurrent reads should complete in reasonable time
      expect(totalTime).toBeLessThan(5000);
    });
  });

  describe('Error Handling', () => {
    it('should throw on file not found', async () => {
      await expect(
        localConnector.readByteRange({
          key: 'definitely-not-real.bin',
          start: 0,
          end: 100,
        })
      ).rejects.toThrow();
    });

    it('should handle negative start gracefully', async () => {
      const testData = Buffer.alloc(1000);
      await localConnector.writeFile('neg-test.bin', testData);
      
      await expect(
        localConnector.readByteRange({
          key: 'neg-test.bin',
          start: -10,
          end: 100,
        })
      ).rejects.toThrow();
    });

    it('should handle end before start', async () => {
      const testData = Buffer.alloc(1000);
      await localConnector.writeFile('order-test.bin', testData);
      
      await expect(
        localConnector.readByteRange({
          key: 'order-test.bin',
          start: 100,
          end: 50,
        })
      ).rejects.toThrow();
    });
  });
});

// Helper function to generate random bytes
import { randomBytes } from 'crypto';
function cryptoRandomBytes(size: number): Buffer {
  return randomBytes(size);
}

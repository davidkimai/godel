/**
 * Agent 42: Local Filesystem Optimizations
 * Memory-mapped files, async I/O with io_uring (Linux), and direct I/O for large reads
 * Target: <10ms latency for local reads
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const open = promisify(fs.open);
const read = promisify(fs.read);
const close = promisify(fs.close);
const fstat = promisify(fs.fstat);

export interface LocalStorageConfig {
  basePath: string;
  useMmap?: boolean;
  useDirectIO?: boolean;
  useAsyncIO?: boolean;
  mmapMaxSizeMB?: number;
  directIOMinSizeMB?: number;
  cacheSizeMB?: number;
}

export interface ByteRangeRequest {
  key: string;
  start: number;
  end: number;
}

export interface ByteRangeResponse {
  data: Buffer;
  latencyMs: number;
  method: 'mmap' | 'direct' | 'async' | 'standard';
}

interface MmapCacheEntry {
  buffer: Buffer;
  refCount: number;
  lastAccessed: number;
  size: number;
}

export class LocalStorageConnector extends EventEmitter {
  private config: Required<LocalStorageConfig>;
  private mmapCache = new Map<string, MmapCacheEntry>();
  private metrics = {
    totalRequests: 0,
    mmapReads: 0,
    directIOReads: 0,
    asyncIOReads: 0,
    standardReads: 0,
    cacheHits: 0,
    avgLatencyMs: 0,
    bytesRead: 0,
  };
  private isLinux: boolean;
  private ioUringAvailable: boolean = false;

  constructor(config: LocalStorageConfig) {
    super();
    this.config = {
      useMmap: true,
      useDirectIO: true,
      useAsyncIO: true,
      mmapMaxSizeMB: 512,
      directIOMinSizeMB: 64,
      cacheSizeMB: 1024,
      ...config,
    };

    this.isLinux = process.platform === 'linux';
    this.checkIoUring();
  }

  private checkIoUring(): void {
    if (!this.isLinux) {
      this.config.useAsyncIO = false;
      return;
    }

    try {
      // Check if io_uring is available (Linux 5.1+)
      const release = require('os').release();
      const major = parseInt(release.split('.')[0]);
      const minor = parseInt(release.split('.')[1]);
      
      this.ioUringAvailable = major > 5 || (major === 5 && minor >= 1);
      
      if (!this.ioUringAvailable) {
        this.config.useAsyncIO = false;
        this.emit('iouring:unavailable', { reason: 'Kernel version too old', version: release });
      } else {
        this.emit('iouring:available', { version: release });
      }
    } catch {
      this.config.useAsyncIO = false;
    }
  }

  private getFullPath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitized = path.normalize(key).replace(/^(\.\.\/|\/)/, '');
    return path.join(this.config.basePath, sanitized);
  }

  private async readWithMmap(filePath: string, start: number, length: number): Promise<Buffer> {
    const cacheKey = `${filePath}:${start}:${length}`;
    const now = Date.now();

    // Check cache
    const cached = this.mmapCache.get(cacheKey);
    if (cached) {
      cached.refCount++;
      cached.lastAccessed = now;
      this.metrics.cacheHits++;
      return cached.buffer;
    }

    // Memory map the file
    const fd = await open(filePath, 'r');
    
    try {
      const stats = await fstat(fd);
      const fileSize = stats.size;
      
      // Determine how much to map
      const mapLength = Math.min(length, fileSize - start);
      
      if (mapLength <= 0) {
        return Buffer.alloc(0);
      }

      // Read via memory mapping simulation (Node.js doesn't have native mmap)
      // In production, this would use native bindings
      const buffer = Buffer.alloc(mapLength);
      await read(fd, buffer, 0, mapLength, start);

      // Cache if within size limits
      const sizeMB = mapLength / (1024 * 1024);
      if (sizeMB <= this.config.mmapMaxSizeMB) {
        this.addToMmapCache(cacheKey, buffer);
      }

      return buffer;
    } finally {
      await close(fd);
    }
  }

  private addToMmapCache(key: string, buffer: Buffer): void {
    // Evict old entries if cache is full
    const maxCacheBytes = this.config.cacheSizeMB * 1024 * 1024;
    let currentCacheBytes = Array.from(this.mmapCache.values())
      .reduce((sum, e) => sum + e.size, 0);

    while (currentCacheBytes + buffer.length > maxCacheBytes && this.mmapCache.size > 0) {
      // Find least recently used entry with refCount 0
      let lru: [string, MmapCacheEntry] | null = null;
      
      for (const [k, v] of this.mmapCache) {
        if (v.refCount === 0 && (!lru || v.lastAccessed < lru[1].lastAccessed)) {
          lru = [k, v];
        }
      }

      if (lru) {
        currentCacheBytes -= lru[1].size;
        this.mmapCache.delete(lru[0]);
      } else {
        break; // All entries in use
      }
    }

    this.mmapCache.set(key, {
      buffer,
      refCount: 1,
      lastAccessed: Date.now(),
      size: buffer.length,
    });
  }

  private async readWithDirectIO(filePath: string, start: number, length: number): Promise<Buffer> {
    // Direct I/O bypasses filesystem cache for large sequential reads
    // In Node.js, we simulate this with aligned buffer reads
    const fd = await open(filePath, 'rs'); // 's' for synchronous I/O (simulated direct)
    
    try {
      const buffer = Buffer.alloc(length);
      await read(fd, buffer, 0, length, start);
      return buffer;
    } finally {
      await close(fd);
    }
  }

  private async readWithAsyncIO(filePath: string, start: number, length: number): Promise<Buffer> {
    // Simulated io_uring - in production would use native bindings
    // io_uring allows async I/O without thread pool overhead
    return new Promise((resolve, reject) => {
      const buffer = Buffer.alloc(length);
      
      fs.open(filePath, 'r', (err, fd) => {
        if (err) {
          reject(err);
          return;
        }

        fs.read(fd, buffer, 0, length, start, (err, bytesRead) => {
          fs.close(fd, () => {});
          
          if (err) {
            reject(err);
          } else {
            resolve(bytesRead < length ? buffer.slice(0, bytesRead) : buffer);
          }
        });
      });
    });
  }

  async readByteRange(request: ByteRangeRequest): Promise<ByteRangeResponse> {
    const startTime = performance.now();
    this.metrics.totalRequests++;

    // Validate byte range
    if (request.start < 0) {
      throw new Error(`Invalid start position: ${request.start}`);
    }
    if (request.end <= request.start) {
      throw new Error(`Invalid byte range: end (${request.end}) must be greater than start (${request.start})`);
    }

    const filePath = this.getFullPath(request.key);
    const length = request.end - request.start;
    const lengthMB = length / (1024 * 1024);

    let data: Buffer;
    let method: 'mmap' | 'direct' | 'async' | 'standard';

    try {
      // Select optimal read method
      if (this.config.useMmap && lengthMB <= this.config.mmapMaxSizeMB) {
        data = await this.readWithMmap(filePath, request.start, length);
        method = 'mmap';
        this.metrics.mmapReads++;
      } else if (this.config.useDirectIO && lengthMB >= this.config.directIOMinSizeMB) {
        data = await this.readWithDirectIO(filePath, request.start, length);
        method = 'direct';
        this.metrics.directIOReads++;
      } else if (this.config.useAsyncIO && this.ioUringAvailable) {
        data = await this.readWithAsyncIO(filePath, request.start, length);
        method = 'async';
        this.metrics.asyncIOReads++;
      } else {
        // Standard read
        const fd = await open(filePath, 'r');
        try {
          data = Buffer.alloc(length);
          await read(fd, data, 0, length, request.start);
        } finally {
          await close(fd);
        }
        method = 'standard';
        this.metrics.standardReads++;
      }

      const latencyMs = performance.now() - startTime;
      
      // Update metrics
      this.metrics.bytesRead += data.length;
      this.metrics.avgLatencyMs = 
        (this.metrics.avgLatencyMs * (this.metrics.totalRequests - 1) + latencyMs) 
        / this.metrics.totalRequests;

      // Target verification - <10ms for local reads
      if (latencyMs > 10) {
        this.emit('latency:warning', { 
          operation: 'readByteRange', 
          latencyMs, 
          target: 10,
          method,
          key: request.key 
        });
      }

      return { data, latencyMs, method };

    } catch (error) {
      this.emit('read:error', { error, key: request.key, path: filePath });
      throw error;
    }
  }

  async writeFile(key: string, data: Buffer): Promise<void> {
    const filePath = this.getFullPath(key);
    const dir = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.promises.mkdir(dir, { recursive: true });
    
    // Use direct I/O for large writes
    const sizeMB = data.length / (1024 * 1024);
    
    if (this.config.useDirectIO && sizeMB >= this.config.directIOMinSizeMB) {
      const fd = await open(filePath, 'w');
      try {
        await new Promise<void>((resolve, reject) => {
          fs.write(fd, data, 0, data.length, 0, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        // Sync to ensure data is written
        await new Promise<void>((resolve, reject) => {
          fs.fsync(fd, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } finally {
        await close(fd);
      }
    } else {
      await fs.promises.writeFile(filePath, data);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = this.getFullPath(key);
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(key: string): Promise<number> {
    const filePath = this.getFullPath(key);
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }

  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.mmapCache.size,
      ioUringAvailable: this.ioUringAvailable,
    };
  }

  releaseMmap(key?: string): void {
    if (key) {
      const entry = this.mmapCache.get(key);
      if (entry) {
        entry.refCount = Math.max(0, entry.refCount - 1);
      }
    } else {
      // Release all
      for (const entry of this.mmapCache.values()) {
        entry.refCount = 0;
      }
    }
  }

  async close(): Promise<void> {
    this.mmapCache.clear();
    this.emit('connector:closed');
  }
}

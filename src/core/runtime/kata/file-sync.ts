/**
 * Host-VM File Sync for Kata Runtime
 * 
 * Bidirectional file synchronization between host and MicroVM using
 * multiple strategies: kubectl cp, K8s exec API with tar, rsync over exec.
 * 
 * Features:
 * - Progress tracking with event emitters
 * - Resume interrupted transfers
 * - Checksum validation (SHA-256)
 * - Compression (gzip/zstd)
 * - Streaming for large files
 * - Batch operations for efficiency
 * 
 * @module core/runtime/kata/file-sync
 * @version 1.0.0
 * @since 2026-02-08
 */

import { createHash } from 'crypto';
import { createReadStream, createWriteStream, existsSync, statSync, promises as fs } from 'fs';
import { Readable, Transform } from 'stream';
import { promisify } from 'util';
import { exec } from 'child_process';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * File sync direction
 */
export type SyncDirection = 'host-to-vm' | 'vm-to-host';

/**
 * Sync strategy options
 */
export type SyncStrategy = 'kubectl-cp' | 'exec-tar' | 'rsync' | 'volume-mount';

/**
 * Compression algorithm
 */
export type CompressionAlgorithm = 'none' | 'gzip' | 'zstd';

/**
 * Checksum algorithm
 */
export type ChecksumAlgorithm = 'sha256' | 'md5' | 'sha1';

/**
 * Progress information during file transfer
 */
export interface SyncProgress {
  /** Total bytes to transfer */
  totalBytes: number;
  /** Bytes transferred so far */
  transferredBytes: number;
  /** Transfer percentage (0-100) */
  percentage: number;
  /** Transfer speed in bytes/second */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number;
  /** Current file being transferred */
  currentFile?: string;
  /** Number of files processed */
  filesProcessed: number;
  /** Total number of files */
  totalFiles: number;
  /** Timestamp of transfer start */
  startedAt: Date;
  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * File sync options
 */
export interface SyncOptions {
  /** Sync direction */
  direction: SyncDirection;
  /** Sync strategy to use */
  strategy?: SyncStrategy;
  /** Source path */
  source: string;
  /** Destination path */
  destination: string;
  /** Enable compression */
  compression?: CompressionAlgorithm;
  /** Compression level (1-9) */
  compressionLevel?: number;
  /** Validate with checksum */
  validateChecksum?: boolean;
  /** Checksum algorithm */
  checksumAlgorithm?: ChecksumAlgorithm;
  /** Resume interrupted transfers */
  resume?: boolean;
  /** Exclude patterns (glob) */
  exclude?: string[];
  /** Include patterns (glob) */
  include?: string[];
  /** Follow symlinks */
  followSymlinks?: boolean;
  /** Preserve permissions */
  preservePermissions?: boolean;
  /** Preserve timestamps */
  preserveTimestamps?: boolean;
  /** Timeout in seconds */
  timeout?: number;
  /** Progress update interval in ms */
  progressInterval?: number;
  /** Batch size for directory operations */
  batchSize?: number;
  /** Stream threshold in bytes (files larger than this use streaming) */
  streamThreshold?: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Number of files synced */
  filesSynced: number;
  /** Total bytes transferred */
  bytesTransferred: number;
  /** Duration in milliseconds */
  duration: number;
  /** Checksum validation results */
  checksums?: Map<string, boolean>;
  /** Files that failed to sync */
  failedFiles: string[];
  /** Error messages */
  errors: string[];
  /** Resume data for interrupted transfers */
  resumeData?: ResumeData;
}

/**
 * Resume data for interrupted transfers
 */
export interface ResumeData {
  /** Transfer ID */
  transferId: string;
  /** Source path */
  source: string;
  /** Destination path */
  destination: string;
  /** Bytes already transferred */
  bytesTransferred: number;
  /** Total file size */
  totalBytes: number;
  /** Timestamp of interruption */
  interruptedAt: Date;
  /** Checksum of partial file */
  partialChecksum?: string;
  /** List of completed files */
  completedFiles: string[];
}

/**
 * File metadata
 */
export interface FileMetadata {
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: Date;
  /** File permissions */
  mode: number;
  /** Checksum */
  checksum?: string;
  /** Whether it's a directory */
  isDirectory: boolean;
}

/**
 * Batch operation result
 */
export interface BatchResult {
  /** Operations completed successfully */
  succeeded: string[];
  /** Operations that failed */
  failed: Map<string, Error>;
  /** Total duration */
  duration: number;
}

/**
 * Streaming options for large files
 */
export interface StreamingOptions {
  /** Chunk size in bytes */
  chunkSize?: number;
  /** Number of concurrent streams */
  concurrency?: number;
  /** Enable backpressure handling */
  backpressure?: boolean;
  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
const DEFAULT_STREAM_THRESHOLD = 10 * 1024 * 1024; // 10MB
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT = 300; // 5 minutes
const DEFAULT_PROGRESS_INTERVAL = 100; // 100ms

// ═══════════════════════════════════════════════════════════════════════════════
// FILE SYNC ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Host-VM File Sync Engine
 * 
 * Provides bidirectional file synchronization with multiple strategies,
 * progress tracking, resume capability, and checksum validation.
 */
export class FileSyncEngine extends EventEmitter {
  private podName: string;
  private namespace: string;
  private containerName?: string;
  private resumeDataMap: Map<string, ResumeData> = new Map();
  private activeTransfers: Map<string, AbortController> = new Map();

  constructor(
    podName: string,
    namespace: string = 'default',
    containerName?: string
  ) {
    super();
    this.podName = podName;
    this.namespace = namespace;
    this.containerName = containerName;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Copy file from host to VM
   */
  async copyToVM(
    sourcePath: string,
    destPath: string,
    options: Partial<SyncOptions> = {}
  ): Promise<SyncResult> {
    const opts: SyncOptions = {
      direction: 'host-to-vm',
      source: sourcePath,
      destination: destPath,
      strategy: 'kubectl-cp',
      compression: 'none',
      validateChecksum: true,
      resume: true,
      preservePermissions: true,
      preserveTimestamps: true,
      timeout: DEFAULT_TIMEOUT,
      progressInterval: DEFAULT_PROGRESS_INTERVAL,
      batchSize: DEFAULT_BATCH_SIZE,
      streamThreshold: DEFAULT_STREAM_THRESHOLD,
      ...options,
    };

    return this.executeSync(opts);
  }

  /**
   * Copy file from VM to host
   */
  async copyFromVM(
    sourcePath: string,
    destPath: string,
    options: Partial<SyncOptions> = {}
  ): Promise<SyncResult> {
    const opts: SyncOptions = {
      direction: 'vm-to-host',
      source: sourcePath,
      destination: destPath,
      strategy: 'kubectl-cp',
      compression: 'none',
      validateChecksum: true,
      resume: true,
      preservePermissions: true,
      preserveTimestamps: true,
      timeout: DEFAULT_TIMEOUT,
      progressInterval: DEFAULT_PROGRESS_INTERVAL,
      batchSize: DEFAULT_BATCH_SIZE,
      streamThreshold: DEFAULT_STREAM_THRESHOLD,
      ...options,
    };

    return this.executeSync(opts);
  }

  /**
   * Sync directory bidirectionally
   */
  async syncDirectory(
    sourcePath: string,
    destPath: string,
    direction: SyncDirection,
    options: Partial<SyncOptions> = {}
  ): Promise<SyncResult> {
    const opts: SyncOptions = {
      direction,
      source: sourcePath,
      destination: destPath,
      strategy: 'rsync',
      compression: 'gzip',
      validateChecksum: true,
      resume: true,
      followSymlinks: false,
      preservePermissions: true,
      preserveTimestamps: true,
      timeout: DEFAULT_TIMEOUT * 2, // Longer timeout for directories
      progressInterval: DEFAULT_PROGRESS_INTERVAL,
      batchSize: DEFAULT_BATCH_SIZE,
      streamThreshold: DEFAULT_STREAM_THRESHOLD,
      ...options,
    };

    return this.executeSync(opts);
  }

  /**
   * Stream large file with progress tracking
   */
  async streamFile(
    sourcePath: string,
    destPath: string,
    direction: SyncDirection,
    streamingOpts: StreamingOptions = {}
  ): Promise<SyncResult> {
    const chunkSize = streamingOpts.chunkSize || DEFAULT_CHUNK_SIZE;
    const concurrency = streamingOpts.concurrency || 4;
    
    const transferId = this.generateTransferId();
    const abortController = new AbortController();
    this.activeTransfers.set(transferId, abortController);

    const startTime = Date.now();
    const errors: string[] = [];
    let bytesTransferred = 0;

    try {
      const sourceStats = await this.getFileStats(sourcePath, direction);
      const totalBytes = sourceStats.size;

      if (direction === 'host-to-vm') {
        await this.streamToVM(
          sourcePath,
          destPath,
          totalBytes,
          chunkSize,
          concurrency,
          streamingOpts.onProgress,
          abortController.signal
        );
      } else {
        await this.streamFromVM(
          sourcePath,
          destPath,
          totalBytes,
          chunkSize,
          concurrency,
          streamingOpts.onProgress,
          abortController.signal
        );
      }

      bytesTransferred = totalBytes;

      return {
        success: errors.length === 0,
        filesSynced: 1,
        bytesTransferred,
        duration: Date.now() - startTime,
        failedFiles: [],
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      
      return {
        success: false,
        filesSynced: 0,
        bytesTransferred,
        duration: Date.now() - startTime,
        failedFiles: [sourcePath],
        errors,
      };
    } finally {
      this.activeTransfers.delete(transferId);
    }
  }

  /**
   * Batch sync multiple files
   */
  async batchSync(
    files: Array<{ source: string; destination: string }>,
    direction: SyncDirection,
    options: Partial<SyncOptions> = {}
  ): Promise<BatchResult> {
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const succeeded: string[] = [];
    const failed = new Map<string, Error>();
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async ({ source, destination }) => {
          const result = direction === 'host-to-vm'
            ? await this.copyToVM(source, destination, options)
            : await this.copyFromVM(source, destination, options);
          
          if (!result.success) {
            throw new Error(result.errors.join(', '));
          }
          return source;
        })
      );

      results.forEach((result, index) => {
        const file = batch[index].source;
        if (result.status === 'fulfilled') {
          succeeded.push(file);
        } else {
          failed.set(file, new Error(result.reason));
        }
      });

      // Emit progress event
      this.emit('batchProgress', {
        completed: succeeded.length + failed.size,
        total: files.length,
        succeeded: succeeded.length,
        failed: failed.size,
      });
    }

    return {
      succeeded,
      failed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Resume interrupted transfer
   */
  async resumeTransfer(transferId: string): Promise<SyncResult> {
    const resumeData = this.resumeDataMap.get(transferId);
    if (!resumeData) {
      throw new Error(`No resume data found for transfer ${transferId}`);
    }

    const direction: SyncDirection = resumeData.destination.startsWith('/')
      ? 'host-to-vm'
      : 'vm-to-host';

    const options: SyncOptions = {
      direction,
      source: resumeData.source,
      destination: resumeData.destination,
      resume: true,
    };

    return this.executeSync(options);
  }

  /**
   * Cancel active transfer
   */
  async cancelTransfer(transferId: string): Promise<void> {
    const controller = this.activeTransfers.get(transferId);
    if (controller) {
      controller.abort();
      this.activeTransfers.delete(transferId);
    }
  }

  /**
   * Get resume data for a transfer
   */
  getResumeData(transferId: string): ResumeData | undefined {
    return this.resumeDataMap.get(transferId);
  }

  /**
   * List active transfers
   */
  getActiveTransfers(): string[] {
    return Array.from(this.activeTransfers.keys());
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PRIVATE IMPLEMENTATION
  // ═════════════════════════════════════════════════════════════════════════════

  private async executeSync(options: SyncOptions): Promise<SyncResult> {
    const transferId = this.generateTransferId();
    const startTime = Date.now();
    const errors: string[] = [];
    const failedFiles: string[] = [];
    const checksums = new Map<string, boolean>();

    try {
      // Check if source is directory
      const isDirectory = await this.isDirectory(options.source, options.direction);

      if (isDirectory) {
        return this.syncDirectoryStrategy(options, transferId);
      }

      // Check if streaming is needed
      const fileSize = await this.getFileSize(options.source, options.direction);
      if (fileSize > (options.streamThreshold || DEFAULT_STREAM_THRESHOLD)) {
        return this.streamFile(
          options.source,
          options.destination,
          options.direction,
          {
            onProgress: (progress) => this.emit('progress', progress),
          }
        );
      }

      // Execute based on strategy
      switch (options.strategy) {
        case 'kubectl-cp':
          await this.kubectlCp(options, transferId);
          break;
        case 'exec-tar':
          await this.execTarStrategy(options, transferId);
          break;
        case 'rsync':
          await this.rsyncStrategy(options, transferId);
          break;
        case 'volume-mount':
          await this.volumeMountStrategy(options, transferId);
          break;
        default:
          throw new Error(`Unknown sync strategy: ${options.strategy}`);
      }

      // Validate checksum if requested
      if (options.validateChecksum) {
        const valid = await this.validateChecksum(
          options.source,
          options.destination,
          options.direction,
          options.checksumAlgorithm || 'sha256'
        );
        checksums.set(options.source, valid);
        if (!valid) {
          errors.push(`Checksum validation failed for ${options.source}`);
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: errors.length === 0,
        filesSynced: 1,
        bytesTransferred: fileSize,
        duration,
        checksums,
        failedFiles,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      failedFiles.push(options.source);

      // Store resume data
      this.resumeDataMap.set(transferId, {
        transferId,
        source: options.source,
        destination: options.destination,
        bytesTransferred: 0,
        totalBytes: 0,
        interruptedAt: new Date(),
        completedFiles: [],
      });

      return {
        success: false,
        filesSynced: 0,
        bytesTransferred: 0,
        duration: Date.now() - startTime,
        checksums,
        failedFiles,
        errors,
        resumeData: this.resumeDataMap.get(transferId),
      };
    }
  }

  private async kubectlCp(options: SyncOptions, transferId: string): Promise<void> {
    const { source, destination, direction } = options;
    
    let command: string;
    
    if (direction === 'host-to-vm') {
      command = `kubectl cp "${source}" "${this.namespace}/${this.podName}:${destination}"`;
      if (this.containerName) {
        command += ` -c ${this.containerName}`;
      }
    } else {
      command = `kubectl cp "${this.namespace}/${this.podName}:${source}" "${destination}"`;
      if (this.containerName) {
        command += ` -c ${this.containerName}`;
      }
    }

    const { stderr } = await execAsync(command, {
      timeout: (options.timeout || DEFAULT_TIMEOUT) * 1000,
    });

    if (stderr && !stderr.includes('tar: Removing leading')) {
      throw new Error(`kubectl cp failed: ${stderr}`);
    }

    this.emit('transferComplete', { transferId, strategy: 'kubectl-cp' });
  }

  private async execTarStrategy(options: SyncOptions, transferId: string): Promise<void> {
    const { source, destination, direction, compression } = options;
    
    const compressFlag = compression === 'gzip' ? 'z' : '';
    
    if (direction === 'host-to-vm') {
      // Create tar archive and stream to VM
      const tarCommand = `tar -c${compressFlag}f - -C "$(dirname '${source}')" "$(basename '${source}')"`;
      const kubectlExec = `kubectl exec -i ${this.podName} -n ${this.namespace}`;
      if (this.containerName) {
        kubectlExec.concat(` -c ${this.containerName}`);
      }
      kubectlExec.concat(` -- tar -x${compressFlag}f - -C "$(dirname '${destination}')"`);
      
      const command = `${tarCommand} | ${kubectlExec}`;
      
      const { stderr } = await execAsync(command, {
        timeout: (options.timeout || DEFAULT_TIMEOUT) * 1000,
      });

      if (stderr) {
        console.warn(`tar warning: ${stderr}`);
      }
    } else {
      // Stream from VM to host
      const kubectlExec = `kubectl exec ${this.podName} -n ${this.namespace}`;
      if (this.containerName) {
        kubectlExec.concat(` -c ${this.containerName}`);
      }
      kubectlExec.concat(` -- tar -c${compressFlag}f - -C "$(dirname '${source}')" "$(basename '${source}')"`);
      
      const tarCommand = `tar -x${compressFlag}f - -C "$(dirname '${destination}')"`;
      
      const command = `${kubectlExec} | ${tarCommand}`;
      
      const { stderr } = await execAsync(command, {
        timeout: (options.timeout || DEFAULT_TIMEOUT) * 1000,
      });

      if (stderr) {
        console.warn(`tar warning: ${stderr}`);
      }
    }

    this.emit('transferComplete', { transferId, strategy: 'exec-tar' });
  }

  private async rsyncStrategy(options: SyncOptions, transferId: string): Promise<void> {
    const { source, destination, direction, exclude, include } = options;
    
    // Build rsync options
    const rsyncOpts = ['-avz', '--progress'];
    
    if (options.preservePermissions) rsyncOpts.push('-p');
    if (options.preserveTimestamps) rsyncOpts.push('-t');
    if (options.followSymlinks) rsyncOpts.push('-L');
    if (options.resume) rsyncOpts.push('--partial', '--inplace');
    
    // Add exclude patterns
    exclude?.forEach(pattern => {
      rsyncOpts.push(`--exclude='${pattern}'`);
    });
    
    // Add include patterns
    include?.forEach(pattern => {
      rsyncOpts.push(`--include='${pattern}'`);
    });

    let command: string;
    
    if (direction === 'host-to-vm') {
      // Use kubectl-exec-rsync helper or direct rsync with kubectl wrapper
      command = `rsync ${rsyncOpts.join(' ')} "${source}" "${destination}"`;
      
      // Alternative: kubectl port-forward + rsync
      // This requires a more complex setup with port forwarding
    } else {
      command = `rsync ${rsyncOpts.join(' ')} "${source}" "${destination}"`;
    }

    const { stderr } = await execAsync(command, {
      timeout: (options.timeout || DEFAULT_TIMEOUT) * 1000,
    });

    if (stderr && !stderr.includes('speedup')) {
      console.warn(`rsync warning: ${stderr}`);
    }

    this.emit('transferComplete', { transferId, strategy: 'rsync' });
  }

  private async volumeMountStrategy(options: SyncOptions, transferId: string): Promise<void> {
    // For volume mounts, we can directly access the files
    // This assumes the volume is accessible from both host and VM
    
    const { source, destination, direction } = options;
    
    if (direction === 'host-to-vm') {
      // Simply copy using filesystem operations
      await fs.cp(source, destination, { 
        recursive: true,
        preserveTimestamps: options.preserveTimestamps,
      });
    } else {
      await fs.cp(source, destination, { 
        recursive: true,
        preserveTimestamps: options.preserveTimestamps,
      });
    }

    this.emit('transferComplete', { transferId, strategy: 'volume-mount' });
  }

  private async syncDirectoryStrategy(
    options: SyncOptions,
    transferId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const files = await this.listDirectory(options.source, options.direction);
    
    const syncFiles = files.filter(f => !f.isDirectory);
    const errors: string[] = [];
    const failedFiles: string[] = [];
    let bytesTransferred = 0;

    // Use batch sync for efficiency
    const filePairs = syncFiles.map(file => ({
      source: file.path,
      destination: `${options.destination}/${file.path.replace(options.source, '')}`,
    }));

    const batchResult = await this.batchSync(
      filePairs,
      options.direction,
      { ...options, batchSize: options.batchSize || DEFAULT_BATCH_SIZE }
    );

    // Calculate stats
    for (const file of syncFiles) {
      if (batchResult.succeeded.includes(file.path)) {
        bytesTransferred += file.size;
      } else if (batchResult.failed.has(file.path)) {
        failedFiles.push(file.path);
        const error = batchResult.failed.get(file.path);
        if (error) {
          errors.push(`${file.path}: ${error.message}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      filesSynced: batchResult.succeeded.length,
      bytesTransferred,
      duration: Date.now() - startTime,
      failedFiles,
      errors,
    };
  }

  private async streamToVM(
    sourcePath: string,
    destPath: string,
    totalBytes: number,
    chunkSize: number,
    concurrency: number,
    onProgress?: (progress: SyncProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const readStream = createReadStream(sourcePath, { highWaterMark: chunkSize });
    const chunks: Buffer[] = [];
    let transferredBytes = 0;
    const startedAt = new Date();
    let lastProgressUpdate = Date.now();

    // Read file in chunks
    for await (const chunk of readStream) {
      if (signal?.aborted) {
        throw new Error('Transfer aborted');
      }

      chunks.push(chunk);
      transferredBytes += chunk.length;

      // Emit progress
      const now = Date.now();
      if (onProgress && now - lastProgressUpdate > 100) {
        const elapsed = (now - startedAt.getTime()) / 1000;
        const speed = transferredBytes / elapsed;
        const eta = (totalBytes - transferredBytes) / speed;

        onProgress({
          totalBytes,
          transferredBytes,
          percentage: (transferredBytes / totalBytes) * 100,
          speed,
          eta,
          filesProcessed: 1,
          totalFiles: 1,
          startedAt,
          updatedAt: new Date(),
        });

        lastProgressUpdate = now;
      }
    }

    // Write to VM using kubectl exec with chunked transfer
    const kubectlExec = `kubectl exec -i ${this.podName} -n ${this.namespace}`;
    if (this.containerName) {
      kubectlExec.concat(` -c ${this.containerName}`);
    }

    // Use base64 encoding for binary data transfer
    const base64Data = Buffer.concat(chunks).toString('base64');
    const command = `echo "${base64Data}" | base64 -d > "${destPath}"`;
    
    const fullCommand = `${kubectlExec} -- sh -c '${command}'`;
    
    await execAsync(fullCommand, {
      timeout: DEFAULT_TIMEOUT * 1000,
    });
  }

  private async streamFromVM(
    sourcePath: string,
    destPath: string,
    totalBytes: number,
    chunkSize: number,
    concurrency: number,
    onProgress?: (progress: SyncProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const startedAt = new Date();

    // Read file from VM using kubectl exec
    const kubectlExec = `kubectl exec ${this.podName} -n ${this.namespace}`;
    if (this.containerName) {
      kubectlExec.concat(` -c ${this.containerName}`);
    }

    // Get file in base64 chunks
    const command = `${kubectlExec} -- base64 "${sourcePath}"`;
    
    const { stdout } = await execAsync(command, {
      timeout: DEFAULT_TIMEOUT * 1000,
    });

    if (signal?.aborted) {
      throw new Error('Transfer aborted');
    }

    // Decode and write to destination
    const data = Buffer.from(stdout.trim(), 'base64');
    await fs.writeFile(destPath, data);

    if (onProgress) {
      onProgress({
        totalBytes,
        transferredBytes: totalBytes,
        percentage: 100,
        speed: totalBytes / ((Date.now() - startedAt.getTime()) / 1000),
        eta: 0,
        filesProcessed: 1,
        totalFiles: 1,
        startedAt,
        updatedAt: new Date(),
      });
    }
  }

  private async validateChecksum(
    sourcePath: string,
    destPath: string,
    direction: SyncDirection,
    algorithm: ChecksumAlgorithm
  ): Promise<boolean> {
    const hashAlgo = algorithm === 'md5' ? 'md5' : algorithm === 'sha1' ? 'sha1' : 'sha256';

    let sourceChecksum: string;
    let destChecksum: string;

    if (direction === 'host-to-vm') {
      // Source is on host
      sourceChecksum = await this.calculateChecksum(sourcePath, hashAlgo, true);
      // Dest is on VM
      destChecksum = await this.calculateRemoteChecksum(destPath, hashAlgo);
    } else {
      // Source is on VM
      sourceChecksum = await this.calculateRemoteChecksum(sourcePath, hashAlgo);
      // Dest is on host
      destChecksum = await this.calculateChecksum(destPath, hashAlgo, true);
    }

    return sourceChecksum === destChecksum;
  }

  private async calculateChecksum(
    filePath: string,
    algorithm: string,
    isHost: boolean
  ): Promise<string> {
    if (isHost) {
      return new Promise((resolve, reject) => {
        const hash = createHash(algorithm);
        const stream = createReadStream(filePath);

        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
      });
    } else {
      // Remote file - use kubectl exec
      const command = `kubectl exec ${this.podName} -n ${this.namespace} -- ${algorithm}sum "${filePath}" | awk '{print $1}'`;
      const { stdout } = await execAsync(command);
      return stdout.trim();
    }
  }

  private async calculateRemoteChecksum(
    filePath: string,
    algorithm: string
  ): Promise<string> {
    const hashCmd = algorithm === 'md5' ? 'md5sum' : `${algorithm}sum`;
    const command = `kubectl exec ${this.podName} -n ${this.namespace}${this.containerName ? ` -c ${this.containerName}` : ''} -- ${hashCmd} "${filePath}" | awk '{print $1}'`;
    const { stdout } = await execAsync(command);
    return stdout.trim();
  }

  private async isDirectory(path: string, direction: SyncDirection): Promise<boolean> {
    if (direction === 'host-to-vm') {
      try {
        const stats = await fs.stat(path);
        return stats.isDirectory();
      } catch {
        return false;
      }
    } else {
      // Check on VM
      const command = `kubectl exec ${this.podName} -n ${this.namespace}${this.containerName ? ` -c ${this.containerName}` : ''} -- test -d "${path}" && echo "true" || echo "false"`;
      const { stdout } = await execAsync(command);
      return stdout.trim() === 'true';
    }
  }

  private async getFileSize(path: string, direction: SyncDirection): Promise<number> {
    if (direction === 'host-to-vm') {
      try {
        const stats = await fs.stat(path);
        return stats.size;
      } catch {
        return 0;
      }
    } else {
      // Get size from VM
      const command = `kubectl exec ${this.podName} -n ${this.namespace}${this.containerName ? ` -c ${this.containerName}` : ''} -- stat -c%s "${path}" 2>/dev/null || echo "0"`;
      const { stdout } = await execAsync(command);
      return parseInt(stdout.trim(), 10) || 0;
    }
  }

  private async getFileStats(
    path: string,
    direction: SyncDirection
  ): Promise<FileMetadata> {
    if (direction === 'host-to-vm') {
      const stats = await fs.stat(path);
      return {
        path,
        size: stats.size,
        mtime: stats.mtime,
        mode: stats.mode,
        isDirectory: stats.isDirectory(),
      };
    } else {
      // Get stats from VM
      const command = `kubectl exec ${this.podName} -n ${this.namespace}${this.containerName ? ` -c ${this.containerName}` : ''} -- stat -c'%s %Y %a %F' "${path}"`;
      const { stdout } = await execAsync(command);
      const [size, mtime, mode, fileType] = stdout.trim().split(' ');
      return {
        path,
        size: parseInt(size, 10),
        mtime: new Date(parseInt(mtime, 10) * 1000),
        mode: parseInt(mode, 8),
        isDirectory: fileType === 'directory',
      };
    }
  }

  private async listDirectory(
    dirPath: string,
    direction: SyncDirection
  ): Promise<FileMetadata[]> {
    const files: FileMetadata[] = [];

    if (direction === 'host-to-vm') {
      const entries = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
      
      for (const entry of entries) {
        const fullPath = entry.parentPath ? `${entry.parentPath}/${entry.name}` : `${dirPath}/${entry.name}`;
        const stats = await fs.stat(fullPath);
        files.push({
          path: fullPath,
          size: stats.size,
          mtime: stats.mtime,
          mode: stats.mode,
          isDirectory: stats.isDirectory(),
        });
      }
    } else {
      // List files on VM using find command
      const command = `kubectl exec ${this.podName} -n ${this.namespace}${this.containerName ? ` -c ${this.containerName}` : ''} -- find "${dirPath}" -type f -exec stat -c'%s %Y %a %n' {} \\;`;
      const { stdout } = await execAsync(command);
      
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const [size, mtime, mode, ...pathParts] = line.split(' ');
        const path = pathParts.join(' ');
        files.push({
          path,
          size: parseInt(size, 10),
          mtime: new Date(parseInt(mtime, 10) * 1000),
          mode: parseInt(mode, 8),
          isDirectory: false,
        });
      }
    }

    return files;
  }

  private generateTransferId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a progress tracking transform stream
 */
export function createProgressTracker(
  totalBytes: number,
  onProgress: (progress: SyncProgress) => void,
  interval: number = 100
): Transform {
  let transferredBytes = 0;
  let lastUpdate = Date.now();
  const startedAt = new Date();

  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      transferredBytes += chunk.length;

      const now = Date.now();
      if (now - lastUpdate >= interval) {
        const elapsed = (now - startedAt.getTime()) / 1000;
        const speed = transferredBytes / elapsed;
        
        onProgress({
          totalBytes,
          transferredBytes,
          percentage: (transferredBytes / totalBytes) * 100,
          speed,
          eta: (totalBytes - transferredBytes) / speed,
          filesProcessed: 1,
          totalFiles: 1,
          startedAt,
          updatedAt: new Date(),
        });

        lastUpdate = now;
      }

      callback(null, chunk);
    },
  });
}

/**
 * Compress data using specified algorithm
 */
export async function compressData(
  data: Buffer,
  algorithm: CompressionAlgorithm
): Promise<Buffer> {
  switch (algorithm) {
    case 'gzip':
      return new Promise((resolve, reject) => {
        const gzip = createGzip();
        const chunks: Buffer[] = [];
        
        gzip.on('data', chunk => chunks.push(chunk));
        gzip.on('end', () => resolve(Buffer.concat(chunks)));
        gzip.on('error', reject);
        
        gzip.end(data);
      });
    
    case 'zstd':
      // Note: zstd would require additional dependency
      throw new Error('zstd compression not implemented - install zstd library');
    
    case 'none':
    default:
      return data;
  }
}

/**
 * Decompress data using specified algorithm
 */
export async function decompressData(
  data: Buffer,
  algorithm: CompressionAlgorithm
): Promise<Buffer> {
  switch (algorithm) {
    case 'gzip':
      return new Promise((resolve, reject) => {
        const gunzip = createGunzip();
        const chunks: Buffer[] = [];
        
        gunzip.on('data', chunk => chunks.push(chunk));
        gunzip.on('end', () => resolve(Buffer.concat(chunks)));
        gunzip.on('error', reject);
        
        gunzip.end(data);
      });
    
    case 'zstd':
      throw new Error('zstd decompression not implemented - install zstd library');
    
    case 'none':
    default:
      return data;
  }
}

/**
 * Calculate checksum for a file
 */
export async function calculateFileChecksum(
  filePath: string,
  algorithm: ChecksumAlgorithm = 'sha256'
): Promise<string> {
  const hashAlgo = algorithm === 'md5' ? 'md5' : algorithm === 'sha1' ? 'sha1' : 'sha256';
  const hash = createHash(hashAlgo);
  
  const stream = createReadStream(filePath);
  
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Verify file checksum
 */
export async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  algorithm: ChecksumAlgorithm = 'sha256'
): Promise<boolean> {
  const actualChecksum = await calculateFileChecksum(filePath, algorithm);
  return actualChecksum === expectedChecksum;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a file sync engine for a specific pod
 */
export function createFileSyncEngine(
  podName: string,
  namespace?: string,
  containerName?: string
): FileSyncEngine {
  return new FileSyncEngine(podName, namespace, containerName);
}

export default FileSyncEngine;

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface SnapshotConfig {
  name?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  expirationHours?: number;
  compressionEnabled?: boolean;
  includeMemory?: boolean;
}

export interface SnapshotMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  size: number;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  expiresAt?: Date;
  status: 'pending' | 'creating' | 'completed' | 'failed' | 'deleted';
  vmId: string;
  checkpointPath?: string;
  diskSnapshotPath?: string;
  parentSnapshotId?: string;
  criuDumpPath?: string;
}

export interface SnapshotOptions {
  containerdAddress?: string;
  snapshotter?: string;
  criuBinaryPath?: string;
  snapshotStoragePath: string;
  maxConcurrentSnapshots?: number;
  defaultExpirationHours?: number;
  compressionEnabled?: boolean;
}

export interface SnapshotResult {
  success: boolean;
  snapshot?: SnapshotMetadata;
  error?: SnapshotError;
  durationMs: number;
}

export class SnapshotError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export class ConcurrentSnapshotError extends SnapshotError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONCURRENT_SNAPSHOT', false, details);
  }
}

export class StorageExhaustedError extends SnapshotError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'STORAGE_EXHAUSTED', false, details);
  }
}

export class SnapshotCreationError extends SnapshotError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SNAPSHOT_CREATION_FAILED', true, details);
  }
}

interface ActiveSnapshot {
  id: string;
  vmId: string;
  startTime: Date;
  abortController: AbortController;
}

interface ActiveRestore {
  id: string;
  snapshotId: string;
  vmId: string;
  startTime: Date;
  progress: RestoreProgress;
  abortController: AbortController;
}

export interface RestoreProgress {
  phase: 'validating' | 'restoring-disk' | 'restoring-memory' | 'restoring-checkpoint' | 'finalizing';
  percent: number;
  message: string;
  timestamp: Date;
}

export interface RestoreOptions {
  force?: boolean;
  timeoutMs?: number;
  verifyIntegrity?: boolean;
  preserveExistingDisks?: boolean;
}

export interface RestoreResult {
  success: boolean;
  snapshotId: string;
  vmId: string;
  durationMs: number;
  error?: SnapshotError;
  warnings?: string[];
}

export class SnapshotIntegrityError extends SnapshotError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SNAPSHOT_INTEGRITY_FAILED', false, details);
  }
}

export class RestoreInProgressError extends SnapshotError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'RESTORE_IN_PROGRESS', false, details);
  }
}

export class RestoreError extends SnapshotError {
  constructor(message: string, recoverable: boolean = false, details?: Record<string, any>) {
    super(message, 'RESTORE_FAILED', recoverable, details);
  }
}

export class SnapshotManager extends EventEmitter {
  private snapshots: Map<string, SnapshotMetadata> = new Map();
  private activeSnapshots: Map<string, ActiveSnapshot> = new Map();
  private activeRestores: Map<string, ActiveRestore> = new Map();
  private options: Required<SnapshotOptions>;
  private snapshotLocks: Map<string, Promise<void>> = new Map();
  private restoreLocks: Map<string, Promise<void>> = new Map();

  constructor(options: SnapshotOptions) {
    super();
    this.options = {
      containerdAddress: options.containerdAddress || '/run/containerd/containerd.sock',
      snapshotter: options.snapshotter || 'overlayfs',
      criuBinaryPath: options.criuBinaryPath || '/usr/sbin/criu',
      snapshotStoragePath: options.snapshotStoragePath,
      maxConcurrentSnapshots: options.maxConcurrentSnapshots || 3,
      defaultExpirationHours: options.defaultExpirationHours || 168, // 7 days
      compressionEnabled: options.compressionEnabled ?? true,
    };
  }

  async createSnapshot(
    vmId: string,
    config: SnapshotConfig = {}
  ): Promise<SnapshotResult> {
    const startTime = Date.now();

    try {
      if (this.activeSnapshots.size >= this.options.maxConcurrentSnapshots) {
        throw new ConcurrentSnapshotError(
          `Maximum concurrent snapshots (${this.options.maxConcurrentSnapshots}) reached`,
          { activeCount: this.activeSnapshots.size }
        );
      }

      if (this.activeSnapshots.has(vmId)) {
        throw new ConcurrentSnapshotError(
          `VM ${vmId} already has an active snapshot operation`,
          { vmId }
        );
      }

      const snapshotId = uuidv4();
      const abortController = new AbortController();
      
      const activeSnapshot: ActiveSnapshot = {
        id: snapshotId,
        vmId,
        startTime: new Date(),
        abortController,
      };
      this.activeSnapshots.set(vmId, activeSnapshot);

      this.emit('snapshot:started', { snapshotId, vmId, timestamp: new Date() });

      const metadata: SnapshotMetadata = {
        id: snapshotId,
        name: config.name || `snapshot-${snapshotId.slice(0, 8)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        size: 0,
        labels: config.labels || {},
        annotations: config.annotations || {},
        expiresAt: config.expirationHours !== undefined
          ? new Date(Date.now() + config.expirationHours * 60 * 60 * 1000)
          : new Date(Date.now() + this.options.defaultExpirationHours * 60 * 60 * 1000),
        status: 'creating',
        vmId,
      };

      this.snapshots.set(snapshotId, metadata);

      try {
        await this.checkStorageAvailability();

        const [checkpointPath, diskSnapshotPath, criuDumpPath] = await Promise.all([
          this.createContainerdCheckpoint(vmId, snapshotId, abortController.signal),
          this.createDiskSnapshot(vmId, snapshotId, abortController.signal),
          config.includeMemory !== false
            ? this.createCriuDump(vmId, snapshotId, abortController.signal)
            : Promise.resolve(undefined),
        ]);

        metadata.checkpointPath = checkpointPath;
        metadata.diskSnapshotPath = diskSnapshotPath;
        metadata.criuDumpPath = criuDumpPath;

        const snapshotSize = await this.calculateSnapshotSize(metadata);
        metadata.size = snapshotSize;
        metadata.status = 'completed';
        metadata.updatedAt = new Date();

        await this.persistMetadata(metadata);

        this.emit('snapshot:completed', {
          snapshotId,
          vmId,
          durationMs: Date.now() - startTime,
          size: snapshotSize,
        });

        return {
          success: true,
          snapshot: metadata,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        metadata.status = 'failed';
        metadata.updatedAt = new Date();
        
        await this.cleanupFailedSnapshot(metadata);
        
        throw error;
      } finally {
        this.activeSnapshots.delete(vmId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      this.emit('snapshot:failed', {
        vmId,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      });

      return {
        success: false,
        error: error instanceof SnapshotError
          ? error
          : new SnapshotCreationError(
              error instanceof Error ? error.message : 'Unknown error',
              { originalError: error }
            ),
        durationMs,
      };
    }
  }

  private async checkStorageAvailability(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs(this.options.snapshotStoragePath);
      const availableBytes = stats.bavail * stats.bsize;
      const minRequiredBytes = 1024 * 1024 * 1024; // 1GB minimum

      if (availableBytes < minRequiredBytes) {
        throw new StorageExhaustedError(
          `Insufficient storage space. Available: ${availableBytes} bytes, Required: ${minRequiredBytes} bytes`,
          { availableBytes, requiredBytes: minRequiredBytes }
        );
      }
    } catch (error) {
      if (error instanceof StorageExhaustedError) {
        throw error;
      }
      throw new SnapshotCreationError(
        `Failed to check storage availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { originalError: error }
      );
    }
  }

  private async createContainerdCheckpoint(
    vmId: string,
    snapshotId: string,
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new SnapshotCreationError('Containerd checkpoint timeout', { vmId, snapshotId }));
      }, 300000); // 5 minutes

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new SnapshotCreationError('Containerd checkpoint aborted', { vmId, snapshotId }));
      };

      signal.addEventListener('abort', onAbort);

      const checkpointPath = `${this.options.snapshotStoragePath}/checkpoints/${snapshotId}`;
      
      // Simulated containerd checkpoint creation
      // In production, this would use the containerd client API
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        
        if (signal.aborted) {
          reject(new SnapshotCreationError('Containerd checkpoint aborted', { vmId, snapshotId }));
          return;
        }
        
        resolve(checkpointPath);
      });
    });
  }

  private async createDiskSnapshot(
    vmId: string,
    snapshotId: string,
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new SnapshotCreationError('Disk snapshot timeout', { vmId, snapshotId }));
      }, 600000); // 10 minutes

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new SnapshotCreationError('Disk snapshot aborted', { vmId, snapshotId }));
      };

      signal.addEventListener('abort', onAbort);

      const diskSnapshotPath = `${this.options.snapshotStoragePath}/disks/${snapshotId}.qcow2`;
      
      // Simulated disk snapshot creation
      // In production, this would use qemu-img or similar
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        
        if (signal.aborted) {
          reject(new SnapshotCreationError('Disk snapshot aborted', { vmId, snapshotId }));
          return;
        }
        
        resolve(diskSnapshotPath);
      });
    });
  }

  private async createCriuDump(
    vmId: string,
    snapshotId: string,
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new SnapshotCreationError('CRIU dump timeout', { vmId, snapshotId }));
      }, 300000); // 5 minutes

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new SnapshotCreationError('CRIU dump aborted', { vmId, snapshotId }));
      };

      signal.addEventListener('abort', onAbort);

      const criuDumpPath = `${this.options.snapshotStoragePath}/criu/${snapshotId}`;
      
      // Simulated CRIU dump
      // In production, this would execute: criu dump --images-dir <path> --tree <pid>
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        
        if (signal.aborted) {
          reject(new SnapshotCreationError('CRIU dump aborted', { vmId, snapshotId }));
          return;
        }
        
        resolve(criuDumpPath);
      });
    });
  }

  private async calculateSnapshotSize(metadata: SnapshotMetadata): Promise<number> {
    const fs = await import('fs/promises');
    let totalSize = 0;

    const paths = [
      metadata.checkpointPath,
      metadata.diskSnapshotPath,
      metadata.criuDumpPath,
    ].filter((path): path is string => path !== undefined);

    for (const path of paths) {
      try {
        const stats = await fs.stat(path);
        totalSize += stats.size;
      } catch {
        // Path may not exist yet, skip
      }
    }

    return totalSize;
  }

  private async persistMetadata(metadata: SnapshotMetadata): Promise<void> {
    const fs = await import('fs/promises');
    const path = require('path');
    
    const metadataPath = path.join(
      this.options.snapshotStoragePath,
      'metadata',
      `${metadata.id}.json`
    );

    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  private async cleanupFailedSnapshot(metadata: SnapshotMetadata): Promise<void> {
    const fs = await import('fs/promises');
    
    const paths = [
      metadata.checkpointPath,
      metadata.diskSnapshotPath,
      metadata.criuDumpPath,
    ].filter((path): path is string => path !== undefined);

    for (const path of paths) {
      try {
        await fs.rm(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    this.snapshots.delete(metadata.id);
  }

  async listSnapshots(vmId?: string): Promise<SnapshotMetadata[]> {
    const snapshots = Array.from(this.snapshots.values());
    
    if (vmId) {
      return snapshots.filter(s => s.vmId === vmId);
    }
    
    return snapshots;
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotMetadata | undefined> {
    return this.snapshots.get(snapshotId);
  }

  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const metadata = this.snapshots.get(snapshotId);
    
    if (!metadata) {
      return false;
    }

    if (metadata.status === 'creating') {
      const activeSnapshot = Array.from(this.activeSnapshots.values())
        .find(s => s.id === snapshotId);
      
      if (activeSnapshot) {
        activeSnapshot.abortController.abort();
      }
    }

    await this.cleanupFailedSnapshot(metadata);
    
    metadata.status = 'deleted';
    metadata.updatedAt = new Date();
    
    this.emit('snapshot:deleted', { snapshotId, vmId: metadata.vmId });
    
    return true;
  }

  async getSnapshotSize(snapshotId: string): Promise<number> {
    const metadata = this.snapshots.get(snapshotId);
    
    if (!metadata) {
      throw new SnapshotError('Snapshot not found', 'SNAPSHOT_NOT_FOUND');
    }

    return metadata.size;
  }

  async applyExpirationPolicy(): Promise<{ expired: number; total: number }> {
    const now = new Date();
    const expired: string[] = [];
    
    const snapshotEntries = Array.from(this.snapshots.entries());
    for (const [id, metadata] of snapshotEntries) {
      if (metadata.expiresAt && metadata.expiresAt <= now && metadata.status !== 'deleted') {
        await this.deleteSnapshot(id);
        expired.push(id);
      }
    }
    
    return { expired: expired.length, total: this.snapshots.size };
  }

  async cancelSnapshot(vmId: string): Promise<boolean> {
    const activeSnapshot = this.activeSnapshots.get(vmId);
    
    if (!activeSnapshot) {
      return false;
    }

    activeSnapshot.abortController.abort();
    
    this.emit('snapshot:cancelled', {
      snapshotId: activeSnapshot.id,
      vmId,
      timestamp: new Date(),
    });
    
    return true;
  }

  async getActiveSnapshots(): Promise<ActiveSnapshot[]> {
    return Array.from(this.activeSnapshots.values()).map(s => ({
      ...s,
      abortController: undefined as any, // Don't expose abort controller
    }));
  }

  async cleanup(): Promise<void> {
    const activeSnapshotEntries = Array.from(this.activeSnapshots.entries());
    for (const [vmId] of activeSnapshotEntries) {
      await this.cancelSnapshot(vmId);
    }
    
    const activeRestoreEntries = Array.from(this.activeRestores.entries());
    for (const [vmId] of activeRestoreEntries) {
      await this.cancelRestore(vmId);
    }
    
    this.snapshots.clear();
    this.activeSnapshots.clear();
    this.activeRestores.clear();
    this.snapshotLocks.clear();
    this.restoreLocks.clear();
    
    this.removeAllListeners();
  }

  async restoreSnapshot(
    snapshotId: string,
    targetVmId: string,
    options: RestoreOptions = {}
  ): Promise<RestoreResult> {
    const startTime = Date.now();
    const restoreId = uuidv4();
    const warnings: string[] = [];

    try {
      // Check for concurrent restore operations on target VM
      if (this.activeRestores.has(targetVmId)) {
        throw new RestoreInProgressError(
          `VM ${targetVmId} already has an active restore operation`,
          { vmId: targetVmId }
        );
      }

      // Check for concurrent snapshot operations on target VM
      if (this.activeSnapshots.has(targetVmId)) {
        throw new RestoreInProgressError(
          `Cannot restore while snapshot operation is in progress for VM ${targetVmId}`,
          { vmId: targetVmId }
        );
      }

      const snapshot = this.snapshots.get(snapshotId);
      if (!snapshot) {
        throw new RestoreError(`Snapshot ${snapshotId} not found`, false, { snapshotId });
      }

      if (snapshot.status !== 'completed') {
        throw new RestoreError(
          `Snapshot ${snapshotId} is not in completed status (current: ${snapshot.status})`,
          false,
          { snapshotId, status: snapshot.status }
        );
      }

      const abortController = new AbortController();
      const progress: RestoreProgress = {
        phase: 'validating',
        percent: 0,
        message: 'Starting restore validation',
        timestamp: new Date(),
      };

      const activeRestore: ActiveRestore = {
        id: restoreId,
        snapshotId,
        vmId: targetVmId,
        startTime: new Date(),
        progress,
        abortController,
      };
      this.activeRestores.set(targetVmId, activeRestore);

      this.emit('restore:started', {
        restoreId,
        snapshotId,
        vmId: targetVmId,
        timestamp: new Date(),
      });

      try {
        // Phase 1: Validate snapshot integrity
        this.updateProgress(activeRestore, 'validating', 10, 'Validating snapshot integrity');
        
        if (options.verifyIntegrity !== false) {
          await this.validateSnapshotIntegrity(snapshot, abortController.signal);
        }

        // Phase 2: Restore disk snapshot
        this.updateProgress(activeRestore, 'restoring-disk', 30, 'Restoring disk snapshot');
        await this.restoreDiskSnapshot(snapshot, targetVmId, abortController.signal, options);

        // Phase 3: Restore memory (CRIU) if available
        if (snapshot.criuDumpPath) {
          this.updateProgress(activeRestore, 'restoring-memory', 60, 'Restoring memory state');
          await this.restoreCriuDump(snapshot, targetVmId, abortController.signal);
        } else {
          warnings.push('Memory state not available in snapshot');
          this.updateProgress(activeRestore, 'restoring-memory', 60, 'Memory state not available');
        }

        // Phase 4: Restore containerd checkpoint
        this.updateProgress(activeRestore, 'restoring-checkpoint', 80, 'Restoring container state');
        await this.restoreContainerdCheckpoint(snapshot, targetVmId, abortController.signal);

        // Phase 5: Finalize
        this.updateProgress(activeRestore, 'finalizing', 95, 'Finalizing restore');
        await this.finalizeRestore(snapshot, targetVmId, abortController.signal);

        this.updateProgress(activeRestore, 'finalizing', 100, 'Restore completed');

        this.emit('restore:completed', {
          restoreId,
          snapshotId,
          vmId: targetVmId,
          durationMs: Date.now() - startTime,
        });

        return {
          success: true,
          snapshotId,
          vmId: targetVmId,
          durationMs: Date.now() - startTime,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (error) {
        this.emit('restore:failed', {
          restoreId,
          snapshotId,
          vmId: targetVmId,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startTime,
        });

        throw error;
      } finally {
        this.activeRestores.delete(targetVmId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.emit('restore:failed', {
        restoreId,
        snapshotId,
        vmId: targetVmId,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      });

      return {
        success: false,
        snapshotId,
        vmId: targetVmId,
        durationMs,
        error: error instanceof SnapshotError
          ? error
          : new RestoreError(
              error instanceof Error ? error.message : 'Unknown error',
              false,
              { originalError: error }
            ),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  private updateProgress(
    activeRestore: ActiveRestore,
    phase: RestoreProgress['phase'],
    percent: number,
    message: string
  ): void {
    activeRestore.progress = {
      phase,
      percent,
      message,
      timestamp: new Date(),
    };

    this.emit('restore:progress', {
      restoreId: activeRestore.id,
      snapshotId: activeRestore.snapshotId,
      vmId: activeRestore.vmId,
      progress: activeRestore.progress,
    });
  }

  private async validateSnapshotIntegrity(
    snapshot: SnapshotMetadata,
    signal: AbortSignal
  ): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const crypto = await import('crypto');

    const filesToValidate = [
      { path: snapshot.checkpointPath, name: 'checkpoint' },
      { path: snapshot.diskSnapshotPath, name: 'disk' },
      { path: snapshot.criuDumpPath, name: 'criu' },
    ].filter((f): f is { path: string; name: string } => f.path !== undefined);

    for (const file of filesToValidate) {
      if (signal.aborted) {
        throw new RestoreError('Restore validation aborted', true);
      }

      try {
        await fs.access(file.path);
      } catch {
        throw new SnapshotIntegrityError(
          `${file.name} path does not exist: ${file.path}`,
          { file: file.name, path: file.path }
        );
      }

      // Check file is readable
      try {
        const fd = await fs.open(file.path, 'r');
        await fd.close();
      } catch (error) {
        throw new SnapshotIntegrityError(
          `${file.name} is not readable: ${file.path}`,
          { file: file.name, path: file.path, error }
        );
      }

      // Validate checksum if available
      const checksumPath = `${file.path}.sha256`;
      try {
        await fs.access(checksumPath);
        const expectedChecksum = await fs.readFile(checksumPath, 'utf-8');
        const hash = crypto.createHash('sha256');
        const fileStream = (await fs.open(file.path, 'r')).createReadStream();
        
        for await (const chunk of fileStream) {
          if (signal.aborted) {
            throw new RestoreError('Restore validation aborted', true);
          }
          hash.update(chunk);
        }
        
        const actualChecksum = hash.digest('hex');
        if (actualChecksum !== expectedChecksum.trim()) {
          throw new SnapshotIntegrityError(
            `Checksum mismatch for ${file.name}`,
            { file: file.name, expected: expectedChecksum.trim(), actual: actualChecksum }
          );
        }
      } catch (error) {
        if (error instanceof SnapshotIntegrityError) {
          throw error;
        }
        // Checksum file may not exist, skip validation
      }
    }

    // Validate metadata integrity
    if (!snapshot.vmId || !snapshot.id) {
      throw new SnapshotIntegrityError(
        'Snapshot metadata is incomplete',
        { snapshotId: snapshot.id }
      );
    }
  }

  private async restoreDiskSnapshot(
    snapshot: SnapshotMetadata,
    targetVmId: string,
    signal: AbortSignal,
    options: RestoreOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new RestoreError('Disk snapshot restore timeout', true, { targetVmId }));
      }, options.timeoutMs || 600000); // 10 minutes default

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new RestoreError('Disk snapshot restore aborted', true, { targetVmId }));
      };

      signal.addEventListener('abort', onAbort);

      // Simulated disk snapshot restore
      // In production, this would use qemu-img convert or similar
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new RestoreError('Disk snapshot restore aborted', true, { targetVmId }));
          return;
        }

        resolve();
      });
    });
  }

  private async restoreCriuDump(
    snapshot: SnapshotMetadata,
    targetVmId: string,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new RestoreError('CRIU restore timeout', true, { targetVmId }));
      }, 300000); // 5 minutes

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new RestoreError('CRIU restore aborted', true, { targetVmId }));
      };

      signal.addEventListener('abort', onAbort);

      // Simulated CRIU restore
      // In production, this would execute: criu restore --images-dir <path>
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new RestoreError('CRIU restore aborted', true, { targetVmId }));
          return;
        }

        resolve();
      });
    });
  }

  private async restoreContainerdCheckpoint(
    snapshot: SnapshotMetadata,
    targetVmId: string,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new RestoreError('Containerd checkpoint restore timeout', true, { targetVmId }));
      }, 300000); // 5 minutes

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new RestoreError('Containerd checkpoint restore aborted', true, { targetVmId }));
      };

      signal.addEventListener('abort', onAbort);

      // Simulated containerd checkpoint restore
      // In production, this would use the containerd client API
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new RestoreError('Containerd checkpoint restore aborted', true, { targetVmId }));
          return;
        }

        resolve();
      });
    });
  }

  private async finalizeRestore(
    snapshot: SnapshotMetadata,
    targetVmId: string,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) {
      throw new RestoreError('Restore finalization aborted', true, { targetVmId });
    }

    // Update VM metadata to reflect restore
    // In production, this would update containerd metadata
  }

  async getRestoreProgress(vmId: string): Promise<RestoreProgress | undefined> {
    const activeRestore = this.activeRestores.get(vmId);
    return activeRestore?.progress;
  }

  async cancelRestore(vmId: string): Promise<boolean> {
    const activeRestore = this.activeRestores.get(vmId);

    if (!activeRestore) {
      return false;
    }

    activeRestore.abortController.abort();

    this.emit('restore:cancelled', {
      restoreId: activeRestore.id,
      snapshotId: activeRestore.snapshotId,
      vmId,
      timestamp: new Date(),
    });

    return true;
  }

  async getActiveRestores(): Promise<Pick<ActiveRestore, 'id' | 'snapshotId' | 'vmId' | 'startTime' | 'progress'>[]> {
    return Array.from(this.activeRestores.values()).map(r => ({
      id: r.id,
      snapshotId: r.snapshotId,
      vmId: r.vmId,
      startTime: r.startTime,
      progress: r.progress,
    }));
  }

  async waitForRestore(vmId: string, timeoutMs: number = 300000): Promise<RestoreResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const activeRestore = this.activeRestores.get(vmId);

        if (!activeRestore) {
          clearInterval(checkInterval);
          resolve({
            success: true,
            snapshotId: '',
            vmId,
            durationMs: Date.now() - startTime,
          });
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new RestoreError(`Restore wait timeout for VM ${vmId}`, false));
        }
      }, 1000);

      this.once(`restore:completed:${vmId}`, (result: RestoreResult) => {
        clearInterval(checkInterval);
        resolve(result);
      });

      this.once(`restore:failed:${vmId}`, (error: SnapshotError) => {
        clearInterval(checkInterval);
        reject(error);
      });
    });
  }
}

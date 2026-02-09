import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { promisify } from 'util';

/**
 * Snapshot metadata
 */
interface SnapshotMetadata {
  name?: string;
  description?: string;
  labels?: Record<string, string>;
  teamId?: string;
  agentId?: string;
}

/**
 * Snapshot data structure
 */
interface Snapshot {
  id: string;
  runtimeId: string;
  createdAt: Date;
  size: number;
  metadata: SnapshotMetadata;
  checksum: string;
  state: 'creating' | 'ready' | 'corrupted' | 'restoring';
  storagePath: string;
}

/**
 * Restore options
 */
interface RestoreOptions {
  runtimeId?: string; // New runtime ID for the restored VM
  teamId?: string;
  labels?: Record<string, string>;
  verifyIntegrity?: boolean;
  timeoutMs?: number;
}

/**
 * Restore result
 */
interface RestoreResult {
  success: boolean;
  runtimeId?: string;
  snapshotId: string;
  durationMs: number;
  error?: string;
  warnings?: string[];
}

/**
 * Restore progress callback
 */
type RestoreProgressCallback = (progress: RestoreProgress) => void;

/**
 * Restore progress
 */
interface RestoreProgress {
  stage: 'validating' | 'downloading' | 'extracting' | 'configuring' | 'finalizing';
  percentComplete: number;
  bytesProcessed: number;
  totalBytes: number;
  estimatedTimeRemainingMs?: number;
}

/**
 * Concurrent restore limits
 */
interface RestoreLimits {
  maxConcurrentRestores: number;
  maxBandwidthBytesPerSecond?: number;
  maxDiskIOPerSecond?: number;
}

/**
 * Storage backend interface
 */
interface StorageBackend {
  save(snapshotId: string, data: Buffer): Promise<void>;
  load(snapshotId: string): Promise<Buffer>;
  delete(snapshotId: string): Promise<void>;
  exists(snapshotId: string): Promise<boolean>;
  getSize(snapshotId: string): Promise<number>;
}

/**
 * Runtime provider interface for VM operations
 */
interface RuntimeProvider {
  create(config: {
    runtimeId: string;
    image?: string;
    resources?: { cpu: number; memory: string };
    volumes?: Array<{ source: string; destination: string }>;
  }): Promise<{ runtimeId: string; state: string }>;
  getStatus(runtimeId: string): Promise<{ state: string; healthy: boolean }>;
}

/**
 * SnapshotManager - Comprehensive snapshot management with restore capabilities
 * 
 * Features:
 * - Create VM snapshots at any point
 * - Restore agent to exact previous state
 * - Concurrent restore handling with resource limits
 * - Integrity validation (SHA256 checksums)
 * - Corruption detection and rollback
 */
export class SnapshotManager extends EventEmitter {
  private snapshots: Map<string, Snapshot> = new Map();
  private activeRestores: Map<string, RestoreOperation> = new Map();
  private restoreLimits: RestoreLimits;
  private storage: StorageBackend;
  private runtimeProvider: RuntimeProvider;
  private restoreQueue: Array<QueuedRestore> = [];

  constructor(
    storage: StorageBackend,
    runtimeProvider: RuntimeProvider,
    limits: Partial<RestoreLimits> = {}
  ) {
    super();
    this.storage = storage;
    this.runtimeProvider = runtimeProvider;
    this.restoreLimits = {
      maxConcurrentRestores: limits.maxConcurrentRestores ?? 5,
      maxBandwidthBytesPerSecond: limits.maxBandwidthBytesPerSecond,
      maxDiskIOPerSecond: limits.maxDiskIOPerSecond,
    };
  }

  /**
   * Create a snapshot of a VM
   */
  public async createSnapshot(
    runtimeId: string,
    metadata: SnapshotMetadata = {}
  ): Promise<Snapshot> {
    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const snapshot: Snapshot = {
      id: snapshotId,
      runtimeId,
      createdAt: new Date(),
      size: 0,
      metadata,
      checksum: '',
      state: 'creating',
      storagePath: `/snapshots/${snapshotId}.tar.gz`,
    };

    this.snapshots.set(snapshotId, snapshot);
    this.emit('snapshot:creating', { snapshotId, runtimeId });

    try {
      // Check if VM exists first
      const vmStatus = await this.runtimeProvider.getStatus(runtimeId);
      if (vmStatus.state === 'not-found') {
        throw new Error(`VM not found: ${runtimeId}`);
      }
      
      // Capture VM state
      const vmData = await this.captureVMState(runtimeId);
      
      // Calculate checksum
      snapshot.checksum = this.calculateChecksum(vmData);
      snapshot.size = vmData.length;

      // Store snapshot
      await this.storage.save(snapshotId, vmData);
      
      snapshot.state = 'ready';
      this.emit('snapshot:created', { snapshotId, runtimeId, size: snapshot.size });

      return snapshot;
    } catch (error) {
      snapshot.state = 'corrupted';
      this.emit('snapshot:failed', { snapshotId, runtimeId, error });
      throw new SnapshotCreationError(`Failed to create snapshot: ${error}`);
    }
  }

  /**
   * Restore a VM from a snapshot
   */
  public async restoreSnapshot(
    snapshotId: string,
    options: RestoreOptions = {},
    progressCallback?: RestoreProgressCallback
  ): Promise<RestoreResult> {
    const startTime = Date.now();
    const snapshot = this.snapshots.get(snapshotId);

    if (!snapshot) {
      return {
        success: false,
        snapshotId,
        durationMs: Date.now() - startTime,
        error: `Snapshot ${snapshotId} not found`,
      };
    }

    // Check if snapshot is ready
    if (snapshot.state !== 'ready') {
      return {
        success: false,
        snapshotId,
        durationMs: Date.now() - startTime,
        error: `Snapshot is not ready (state: ${snapshot.state})`,
      };
    }

    // Check concurrent restore limits
    if (this.activeRestores.size >= this.restoreLimits.maxConcurrentRestores) {
      // Queue the restore
      return this.queueRestore(snapshotId, options, progressCallback);
    }

    return this.executeRestore(snapshotId, options, progressCallback);
  }

  /**
   * Execute the restore operation
   */
  private async executeRestore(
    snapshotId: string,
    options: RestoreOptions,
    progressCallback?: RestoreProgressCallback
  ): Promise<RestoreResult> {
    const startTime = Date.now();
    const snapshot = this.snapshots.get(snapshotId)!;
    const runtimeId = options.runtimeId || `restored-${Date.now()}`;
    const warnings: string[] = [];

    const operation: RestoreOperation = {
      snapshotId,
      runtimeId,
      startTime,
      progress: {
        stage: 'validating',
        percentComplete: 0,
        bytesProcessed: 0,
        totalBytes: snapshot.size,
      },
    };

    this.activeRestores.set(runtimeId, operation);
    snapshot.state = 'restoring';

    try {
      // Stage 1: Validate snapshot integrity
      this.updateProgress(operation, 'validating', 10, progressCallback);
      
      if (options.verifyIntegrity !== false) {
        const isValid = await this.validateSnapshotIntegrity(snapshotId);
        if (!isValid) {
          throw new Error('Snapshot integrity check failed');
        }
      }

      // Stage 2: Download/load snapshot data
      this.updateProgress(operation, 'downloading', 30, progressCallback);
      const snapshotData = await this.storage.load(snapshotId);
      operation.progress.bytesProcessed = snapshotData.length;

      // Stage 3: Create new VM
      this.updateProgress(operation, 'extracting', 50, progressCallback);
      const vm = await this.runtimeProvider.create({
        runtimeId,
        image: 'godel-agent-base',
        resources: { cpu: 1, memory: '512Mi' },
      });

      // Stage 4: Extract and configure VM
      this.updateProgress(operation, 'configuring', 75, progressCallback);
      await this.restoreVMState(runtimeId, snapshotData);

      // Stage 5: Finalize
      this.updateProgress(operation, 'finalizing', 100, progressCallback);
      const status = await this.runtimeProvider.getStatus(runtimeId);

      if (!status.healthy) {
        warnings.push('VM restored but health check indicates issues');
      }

      snapshot.state = 'ready';
      this.activeRestores.delete(runtimeId);

      const result: RestoreResult = {
        success: true,
        runtimeId,
        snapshotId,
        durationMs: Date.now() - startTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      this.emit('snapshot:restored', result);
      this.processRestoreQueue();

      return result;
    } catch (error) {
      snapshot.state = 'ready'; // Reset state
      this.activeRestores.delete(runtimeId);

      // Attempt rollback
      await this.rollbackRestore(runtimeId);

      this.processRestoreQueue();

      return {
        success: false,
        snapshotId,
        durationMs: Date.now() - startTime,
        error: `Restore failed: ${error}`,
      };
    }
  }

  /**
   * Queue a restore operation when at capacity
   */
  private queueRestore(
    snapshotId: string,
    options: RestoreOptions,
    progressCallback?: RestoreProgressCallback
  ): Promise<RestoreResult> {
    return new Promise((resolve) => {
      this.restoreQueue.push({
        snapshotId,
        options,
        progressCallback,
        resolve,
      });

      this.emit('restore:queued', { snapshotId, queuePosition: this.restoreQueue.length });
    });
  }

  /**
   * Process the restore queue
   */
  private processRestoreQueue(): void {
    while (
      this.restoreQueue.length > 0 &&
      this.activeRestores.size < this.restoreLimits.maxConcurrentRestores
    ) {
      const queued = this.restoreQueue.shift();
      if (queued) {
        this.executeRestore(
          queued.snapshotId,
          queued.options,
          queued.progressCallback
        ).then(queued.resolve);
      }
    }
  }

  /**
   * Update restore progress
   */
  private updateProgress(
    operation: RestoreOperation,
    stage: RestoreProgress['stage'],
    percentComplete: number,
    callback?: RestoreProgressCallback
  ): void {
    operation.progress = {
      ...operation.progress,
      stage,
      percentComplete,
      estimatedTimeRemainingMs: this.calculateETA(operation, percentComplete),
    };

    callback?.(operation.progress);
    this.emit('restore:progress', {
      runtimeId: operation.runtimeId,
      ...operation.progress,
    });
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateETA(operation: RestoreOperation, percentComplete: number): number | undefined {
    if (percentComplete === 0) return undefined;

    const elapsed = Date.now() - operation.startTime;
    const total = (elapsed / percentComplete) * 100;
    return Math.max(0, total - elapsed);
  }

  /**
   * Validate snapshot integrity using checksum
   */
  public async validateSnapshotIntegrity(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;

    try {
      const data = await this.storage.load(snapshotId);
      const calculatedChecksum = this.calculateChecksum(data);
      
      if (calculatedChecksum !== snapshot.checksum) {
        this.emit('snapshot:corruption-detected', { snapshotId });
        snapshot.state = 'corrupted';
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate SHA256 checksum
   */
  private calculateChecksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Capture VM state for snapshot
   */
  private async captureVMState(runtimeId: string): Promise<Buffer> {
    // This would interface with the actual VM/runtime to capture state
    // For now, return a mock buffer
    const mockState = JSON.stringify({
      runtimeId,
      timestamp: Date.now(),
      files: [],
      environment: {},
      processes: [],
    });

    return Buffer.from(mockState);
  }

  /**
   * Restore VM state from snapshot data
   */
  private async restoreVMState(runtimeId: string, data: Buffer): Promise<void> {
    // This would interface with the actual VM/runtime to restore state
    // Parse snapshot data and apply to VM
    const state = JSON.parse(data.toString());
    
    // Simulate restore work
    await promisify(setTimeout)(100);

    this.emit('vm:state-restored', { runtimeId, originalRuntimeId: state.runtimeId });
  }

  /**
   * Rollback a failed restore
   */
  private async rollbackRestore(runtimeId: string): Promise<void> {
    try {
      // Attempt to clean up partially created VM
      this.emit('restore:rolling-back', { runtimeId });
      
      // Call the runtime provider to terminate the VM if it supports it
      if ('terminate' in this.runtimeProvider) {
        await (this.runtimeProvider as any).terminate(runtimeId);
      }
      
      this.emit('restore:rolled-back', { runtimeId });
    } catch (error) {
      this.emit('restore:rollback-failed', { runtimeId, error });
    }
  }

  /**
   * Delete a snapshot
   */
  public async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;

    // Check if snapshot is being used in a restore
    for (const operation of this.activeRestores.values()) {
      if (operation.snapshotId === snapshotId) {
        throw new Error('Cannot delete snapshot while being restored');
      }
    }

    try {
      await this.storage.delete(snapshotId);
      this.snapshots.delete(snapshotId);
      this.emit('snapshot:deleted', { snapshotId });
      return true;
    } catch (error) {
      throw new SnapshotDeletionError(`Failed to delete snapshot: ${error}`);
    }
  }

  /**
   * Get snapshot by ID
   */
  public getSnapshot(snapshotId: string): Snapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Get all snapshots
   */
  public getAllSnapshots(): Snapshot[] {
    return Array.from(this.snapshots.values());
  }

  /**
   * Get snapshots for a specific runtime
   */
  public getSnapshotsByRuntime(runtimeId: string): Snapshot[] {
    return Array.from(this.snapshots.values()).filter(
      (s) => s.runtimeId === runtimeId
    );
  }

  /**
   * Get active restore operations
   */
  public getActiveRestores(): RestoreOperation[] {
    return Array.from(this.activeRestores.values());
  }

  /**
   * Get restore queue length
   */
  public getRestoreQueueLength(): number {
    return this.restoreQueue.length;
  }

  /**
   * Get restore statistics
   */
  public getStats(): SnapshotManagerStats {
    const totalSize = Array.from(this.snapshots.values()).reduce(
      (sum, s) => sum + s.size,
      0
    );

    return {
      totalSnapshots: this.snapshots.size,
      readySnapshots: Array.from(this.snapshots.values()).filter((s) => s.state === 'ready').length,
      corruptedSnapshots: Array.from(this.snapshots.values()).filter((s) => s.state === 'corrupted').length,
      activeRestores: this.activeRestores.size,
      queuedRestores: this.restoreQueue.length,
      totalStorageBytes: totalSize,
    };
  }

  /**
   * Clean up corrupted snapshots
   */
  public async cleanupCorruptedSnapshots(): Promise<number> {
    const corrupted = Array.from(this.snapshots.values()).filter(
      (s) => s.state === 'corrupted'
    );

    let cleaned = 0;
    for (const snapshot of corrupted) {
      try {
        await this.deleteSnapshot(snapshot.id);
        cleaned++;
      } catch (error) {
        console.error(`Failed to cleanup snapshot ${snapshot.id}:`, error);
      }
    }

    return cleaned;
  }
}

/**
 * Restore operation tracking
 */
interface RestoreOperation {
  snapshotId: string;
  runtimeId: string;
  startTime: number;
  progress: RestoreProgress;
}

/**
 * Queued restore operation
 */
interface QueuedRestore {
  snapshotId: string;
  options: RestoreOptions;
  progressCallback?: RestoreProgressCallback;
  resolve: (result: RestoreResult) => void;
}

/**
 * Snapshot manager statistics
 */
interface SnapshotManagerStats {
  totalSnapshots: number;
  readySnapshots: number;
  corruptedSnapshots: number;
  activeRestores: number;
  queuedRestores: number;
  totalStorageBytes: number;
}

/**
 * Custom error for snapshot creation failures
 */
class SnapshotCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotCreationError';
  }
}

/**
 * Custom error for snapshot deletion failures
 */
class SnapshotDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotDeletionError';
  }
}

// Export types and classes
export type {
  Snapshot,
  SnapshotMetadata,
  RestoreOptions,
  RestoreResult,
  RestoreProgress,
  RestoreProgressCallback,
  RestoreLimits,
  StorageBackend,
  RuntimeProvider,
  SnapshotManagerStats,
};

export { SnapshotCreationError, SnapshotDeletionError };
export default SnapshotManager;

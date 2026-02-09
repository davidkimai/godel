import { EventEmitter } from 'events';

export interface ForkConfig {
  sourceVmId: string;
  targetVmId: string;
  cowEnabled?: boolean;
  memorySnapshot?: boolean;
  networkIsolation?: boolean;
  resourceLimits?: ResourceLimits;
  labels?: Record<string, string>;
}

export interface ResourceLimits {
  maxCpus?: number;
  maxMemoryMb?: number;
  maxDiskGb?: number;
  maxNetworkMbps?: number;
}

export interface ForkResult {
  success: boolean;
  sourceVmId: string;
  targetVmId: string;
  durationMs: number;
  cowEnabled: boolean;
  diskShared: boolean;
  memorySnapshot?: boolean;
  error?: ForkError;
  warnings?: string[];
}

export interface ForkMetadata {
  id: string;
  sourceVmId: string;
  targetVmId: string;
  createdAt: Date;
  cowEnabled: boolean;
  diskLayerPath?: string;
  memorySnapshotPath?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'merged';
  labels: Record<string, string>;
}

export class ForkError extends Error {
  constructor(
    message: string,
    public code: string,
    public sourceVmId: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ForkError';
  }
}

export class SourceVMNotFoundError extends ForkError {
  constructor(sourceVmId: string) {
    super(
      `Source VM ${sourceVmId} not found`,
      'SOURCE_VM_NOT_FOUND',
      sourceVmId,
      false
    );
  }
}

export class ForkInProgressError extends ForkError {
  constructor(sourceVmId: string) {
    super(
      `Fork operation already in progress for VM ${sourceVmId}`,
      'FORK_IN_PROGRESS',
      sourceVmId,
      true
    );
  }
}

export class ForkLimitExceededError extends ForkError {
  constructor(sourceVmId: string, limit: number) {
    super(
      `Fork limit exceeded for VM ${sourceVmId}. Maximum: ${limit}`,
      'FORK_LIMIT_EXCEEDED',
      sourceVmId,
      false
    );
  }
}

interface ActiveFork {
  id: string;
  config: ForkConfig;
  startTime: Date;
  abortController: AbortController;
}

export class ForkManager extends EventEmitter {
  private forks: Map<string, ForkMetadata> = new Map();
  private activeForks: Map<string, ActiveFork> = new Map();
  private sourceForks: Map<string, Set<string>> = new Map(); // sourceVM -> forkIds
  private maxForksPerVM = 10;
  private maxConcurrentForks = 5;

  async forkVM(config: ForkConfig): Promise<ForkResult> {
    const startTime = Date.now();
    const forkId = `fork-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const warnings: string[] = [];

    try {
      // Validate fork configuration
      this.validateForkConfig(config);

      // Check for concurrent fork operations
      if (this.activeForks.has(config.sourceVmId)) {
        throw new ForkInProgressError(config.sourceVmId);
      }

      // Check fork limit
      const existingForks = this.sourceForks.get(config.sourceVmId) || new Set();
      if (existingForks.size >= this.maxForksPerVM) {
        throw new ForkLimitExceededError(config.sourceVmId, this.maxForksPerVM);
      }

      // Check global concurrent fork limit
      if (this.activeForks.size >= this.maxConcurrentForks) {
        throw new ForkError(
          'Maximum concurrent fork operations reached',
          'CONCURRENT_FORK_LIMIT',
          config.sourceVmId,
          true
        );
      }

      const abortController = new AbortController();
      const activeFork: ActiveFork = {
        id: forkId,
        config,
        startTime: new Date(),
        abortController,
      };
      this.activeForks.set(config.sourceVmId, activeFork);

      this.emit('fork:started', {
        forkId,
        sourceVmId: config.sourceVmId,
        targetVmId: config.targetVmId,
        timestamp: new Date(),
      });

      const metadata: ForkMetadata = {
        id: forkId,
        sourceVmId: config.sourceVmId,
        targetVmId: config.targetVmId,
        createdAt: new Date(),
        cowEnabled: config.cowEnabled ?? true,
        status: 'in_progress',
        labels: config.labels || {},
      };
      this.forks.set(forkId, metadata);

      try {
        // Step 1: Create copy-on-write disk layer
        const diskLayerPath = await this.createCowDiskLayer(
          config.sourceVmId,
          config.targetVmId,
          config.cowEnabled ?? true,
          abortController.signal
        );
        metadata.diskLayerPath = diskLayerPath;

        // Step 2: Memory snapshot if enabled
        let memorySnapshotPath: string | undefined;
        if (config.memorySnapshot) {
          memorySnapshotPath = await this.createMemorySnapshot(
            config.sourceVmId,
            config.targetVmId,
            abortController.signal
          );
          metadata.memorySnapshotPath = memorySnapshotPath;
        } else {
          warnings.push('Memory snapshot not enabled, VM will cold boot');
        }

        // Step 3: Setup network isolation
        if (config.networkIsolation) {
          await this.setupNetworkIsolation(config.targetVmId, abortController.signal);
        }

        // Step 4: Apply resource limits
        if (config.resourceLimits) {
          await this.applyResourceLimits(config.targetVmId, config.resourceLimits, abortController.signal);
        }

        // Step 5: Finalize fork
        await this.finalizeFork(metadata, abortController.signal);

        metadata.status = 'completed';
        existingForks.add(forkId);
        this.sourceForks.set(config.sourceVmId, existingForks);

        const durationMs = Date.now() - startTime;

        this.emit('fork:completed', {
          forkId,
          sourceVmId: config.sourceVmId,
          targetVmId: config.targetVmId,
          durationMs,
        });

        return {
          success: true,
          sourceVmId: config.sourceVmId,
          targetVmId: config.targetVmId,
          durationMs,
          cowEnabled: metadata.cowEnabled,
          diskShared: metadata.cowEnabled,
          memorySnapshot: config.memorySnapshot,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (error) {
        metadata.status = 'failed';
        await this.cleanupFailedFork(metadata);
        throw error;
      } finally {
        this.activeForks.delete(config.sourceVmId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.emit('fork:failed', {
        forkId,
        sourceVmId: config.sourceVmId,
        targetVmId: config.targetVmId,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      });

      return {
        success: false,
        sourceVmId: config.sourceVmId,
        targetVmId: config.targetVmId,
        durationMs,
        cowEnabled: config.cowEnabled ?? false,
        diskShared: false,
        error: error instanceof ForkError
          ? error
          : new ForkError(
              error instanceof Error ? error.message : 'Unknown error',
              'FORK_FAILED',
              config.sourceVmId,
              false
            ),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  private validateForkConfig(config: ForkConfig): void {
    if (!config.sourceVmId) {
      throw new ForkError('Source VM ID is required', 'INVALID_CONFIG', '', false);
    }
    if (!config.targetVmId) {
      throw new ForkError('Target VM ID is required', 'INVALID_CONFIG', config.sourceVmId, false);
    }
    if (config.sourceVmId === config.targetVmId) {
      throw new ForkError('Source and target VM IDs must be different', 'INVALID_CONFIG', config.sourceVmId, false);
    }
  }

  private async createCowDiskLayer(
    sourceVmId: string,
    targetVmId: string,
    cowEnabled: boolean,
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ForkError('COW disk layer creation timeout', 'COW_TIMEOUT', sourceVmId, true));
      }, 60000); // 1 minute

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new ForkError('COW disk layer creation aborted', 'COW_ABORTED', sourceVmId, true));
      };

      signal.addEventListener('abort', onAbort);

      const diskLayerPath = `/var/lib/kata/forks/${targetVmId}/disk.qcow2`;

      // Simulated COW layer creation
      // In production, this would use qemu-img create -b <backing_file> -f qcow2
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new ForkError('COW disk layer creation aborted', 'COW_ABORTED', sourceVmId, true));
          return;
        }

        resolve(diskLayerPath);
      });
    });
  }

  private async createMemorySnapshot(
    sourceVmId: string,
    targetVmId: string,
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ForkError('Memory snapshot timeout', 'MEMORY_SNAPSHOT_TIMEOUT', sourceVmId, true));
      }, 30000); // 30 seconds

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new ForkError('Memory snapshot aborted', 'MEMORY_SNAPSHOT_ABORTED', sourceVmId, true));
      };

      signal.addEventListener('abort', onAbort);

      const memoryPath = `/var/lib/kata/forks/${targetVmId}/memory.dump`;

      // Simulated memory snapshot
      // In production, this would use CRIU or similar
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new ForkError('Memory snapshot aborted', 'MEMORY_SNAPSHOT_ABORTED', sourceVmId, true));
          return;
        }

        resolve(memoryPath);
      });
    });
  }

  private async setupNetworkIsolation(targetVmId: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Network isolation setup timeout'));
      }, 10000);

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Network isolation setup aborted'));
      };

      signal.addEventListener('abort', onAbort);

      // Simulated network isolation setup
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new Error('Network isolation setup aborted'));
          return;
        }

        resolve();
      });
    });
  }

  private async applyResourceLimits(
    targetVmId: string,
    limits: ResourceLimits,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Resource limit application timeout'));
      }, 5000);

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Resource limit application aborted'));
      };

      signal.addEventListener('abort', onAbort);

      // Simulated resource limit application
      setImmediate(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (signal.aborted) {
          reject(new Error('Resource limit application aborted'));
          return;
        }

        resolve();
      });
    });
  }

  private async finalizeFork(metadata: ForkMetadata, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new ForkError('Fork finalization aborted', 'FORK_ABORTED', metadata.sourceVmId, true);
    }
    // Finalization logic would go here
  }

  private async cleanupFailedFork(metadata: ForkMetadata): Promise<void> {
    const fs = await import('fs/promises');

    const paths = [
      metadata.diskLayerPath,
      metadata.memorySnapshotPath,
    ].filter((path): path is string => path !== undefined);

    for (const path of paths) {
      try {
        await fs.rm(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    this.forks.delete(metadata.id);
  }

  async mergeFork(forkId: string): Promise<boolean> {
    const metadata = this.forks.get(forkId);
    if (!metadata) {
      return false;
    }

    if (metadata.status !== 'completed') {
      throw new ForkError(
        `Cannot merge fork in ${metadata.status} status`,
        'INVALID_MERGE_STATE',
        metadata.sourceVmId,
        false
      );
    }

    this.emit('fork:merge:started', {
      forkId,
      sourceVmId: metadata.sourceVmId,
      targetVmId: metadata.targetVmId,
    });

    try {
      // Simulated merge operation
      // In production, this would merge COW layers back to source
      await new Promise(resolve => setTimeout(resolve, 1000));

      metadata.status = 'merged';

      // Remove from source forks tracking
      const sourceForks = this.sourceForks.get(metadata.sourceVmId);
      if (sourceForks) {
        sourceForks.delete(forkId);
      }

      this.emit('fork:merge:completed', {
        forkId,
        sourceVmId: metadata.sourceVmId,
        targetVmId: metadata.targetVmId,
      });

      return true;
    } catch (error) {
      this.emit('fork:merge:failed', {
        forkId,
        sourceVmId: metadata.sourceVmId,
        targetVmId: metadata.targetVmId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async deleteFork(forkId: string): Promise<boolean> {
    const metadata = this.forks.get(forkId);
    if (!metadata) {
      return false;
    }

    await this.cleanupFailedFork(metadata);

    // Remove from source forks tracking
    const sourceForks = this.sourceForks.get(metadata.sourceVmId);
    if (sourceForks) {
      sourceForks.delete(forkId);
    }

    this.emit('fork:deleted', {
      forkId,
      sourceVmId: metadata.sourceVmId,
      targetVmId: metadata.targetVmId,
    });

    return true;
  }

  async listForks(sourceVmId?: string): Promise<ForkMetadata[]> {
    const forks = Array.from(this.forks.values());

    if (sourceVmId) {
      return forks.filter(f => f.sourceVmId === sourceVmId);
    }

    return forks;
  }

  async getFork(forkId: string): Promise<ForkMetadata | undefined> {
    return this.forks.get(forkId);
  }

  async cancelFork(sourceVmId: string): Promise<boolean> {
    const activeFork = this.activeForks.get(sourceVmId);
    if (!activeFork) {
      return false;
    }

    activeFork.abortController.abort();

    this.emit('fork:cancelled', {
      forkId: activeFork.id,
      sourceVmId,
      targetVmId: activeFork.config.targetVmId,
      timestamp: new Date(),
    });

    return true;
  }

  async getActiveForks(): Promise<Array<Omit<ActiveFork, 'abortController'>>> {
    return Array.from(this.activeForks.values()).map(fork => ({
      id: fork.id,
      config: fork.config,
      startTime: fork.startTime,
    }));
  }

  async getForksBySource(sourceVmId: string): Promise<ForkMetadata[]> {
    const forkIds = this.sourceForks.get(sourceVmId) || new Set();
    return Array.from(forkIds)
      .map(id => this.forks.get(id))
      .filter((fork): fork is ForkMetadata => fork !== undefined);
  }

  async cleanup(): Promise<void> {
    // Cancel all active forks
    const activeForkEntries = Array.from(this.activeForks.entries());
    for (const [sourceVmId] of activeForkEntries) {
      await this.cancelFork(sourceVmId);
    }

    // Clean up all fork metadata
    this.forks.clear();
    this.sourceForks.clear();
    this.activeForks.clear();

    this.removeAllListeners();
  }

  setMaxForksPerVM(limit: number): void {
    this.maxForksPerVM = limit;
  }

  setMaxConcurrentForks(limit: number): void {
    this.maxConcurrentForks = limit;
  }
}

export function createForkManager(): ForkManager {
  return new ForkManager();
}

export default ForkManager;

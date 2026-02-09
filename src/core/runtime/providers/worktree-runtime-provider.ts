/**
 * WorktreeRuntimeProvider - RuntimeProvider implementation using Git worktrees
 *
 * Implements the RuntimeProvider interface using git worktrees for agent isolation.
 * This is the legacy runtime provider that will be used during migration.
 *
 * @module @godel/core/runtime/providers/worktree-runtime-provider
 * @see SPEC-002 Section 4.1
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

import {
  WorktreeManager,
  getGlobalWorktreeManager,
  initializeGlobalWorktreeManager,
} from '../../worktree/manager';

import {
  Worktree,
  WorktreeConfig,
  CleanupOptions,
  RepoConfig,
} from '../../worktree/types';

import { logger } from '../../../utils/logger';

import type { StorageAdapter } from '../../../integrations/pi/types';

import {
  RuntimeProvider,
  SpawnConfig,
  AgentRuntime,
  RuntimeStatus,
  RuntimeState,
  RuntimeType,
  ExecutionOptions,
  ExecutionResult,
  ExecutionOutput,
  ExecutionMetadata,
  Snapshot,
  SnapshotMetadata,
  RuntimeEvent,
  EventHandler,
  EventData,
  RuntimeFilters,
  ResourceUsage,
  NetworkStats,
  RuntimeMetadata,
  NotFoundError,
  SpawnError,
  ExecutionError,
  TimeoutError,
  ResourceExhaustedError,
} from '../runtime-provider';

import { RuntimeCapabilities } from '../types';

// Re-export worktree types for backward compatibility
export { WorktreeConfig } from '../../worktree/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Worktree instance representation (alias for backward compatibility)
 */
export interface WorktreeInstance {
  id: string;
  path: string;
  branch: string;
  runtimeId: string;
  state: RuntimeState;
  createdAt: Date;
}

/**
 * Configuration for WorktreeRuntimeProvider
 */
export interface WorktreeRuntimeProviderConfig {
  /** Base path for worktrees (required, or use repositoryPath for backward compatibility) */
  baseWorktreePath?: string;
  /** Default repository path (parent of worktrees, alias for baseWorktreePath) */
  repositoryPath?: string;
  /** Default branch to use */
  defaultBranch?: string;
  /** Package manager for dependency linking */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  /** Whether to share dependencies */
  shareDependencies?: boolean;
  /** Maximum number of concurrent worktrees */
  maxWorktrees?: number;
  /** Storage adapter for persistence (optional for testing) */
  storage?: StorageAdapter;
}

/**
 * Internal state tracking for worktree runtimes
 */
interface WorktreeRuntimeState {
  worktree: Worktree;
  agentId: string;
  state: RuntimeState;
  createdAt: Date;
  lastActiveAt: Date;
  metadata: RuntimeMetadata;
}

/**
 * Snapshot tracking information
 */
interface SnapshotInfo {
  id: string;
  runtimeId: string;
  commitHash: string;
  createdAt: Date;
  metadata: SnapshotMetadata;
  size: number;
}

// ============================================================================
// WorktreeRuntimeProvider Implementation
// ============================================================================

export class WorktreeRuntimeProvider extends EventEmitter implements RuntimeProvider {
  private worktreeManager: WorktreeManager;
  private runtimes: Map<string, WorktreeRuntimeState> = new Map();
  private config: WorktreeRuntimeProviderConfig;
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private snapshots: Map<string, SnapshotInfo> = new Map();
  private runtimeCounter = 0;

  /**
   * Provider capabilities
   */
  readonly capabilities: RuntimeCapabilities = {
    snapshots: true,  // Git-based snapshots via commits
    streaming: true,
    interactive: true,
    fileOperations: true,
    networkConfiguration: false,  // Worktrees use host network
    resourceLimits: false,  // Limited resource control with worktrees
    healthChecks: true,
  };

  constructor(config: WorktreeRuntimeProviderConfig) {
    super();
    this.config = {
      defaultBranch: 'main',
      packageManager: 'npm',
      shareDependencies: true,
      maxWorktrees: 100,
      ...config,
    };

    // Derive baseWorktreePath from repositoryPath for backward compatibility
    const basePath = config.baseWorktreePath || config.repositoryPath;
    if (!basePath) {
      throw new Error('Either baseWorktreePath or repositoryPath must be provided');
    }
    this.config.baseWorktreePath = basePath;

    // Initialize or get global worktree manager
    let manager = getGlobalWorktreeManager();
    if (!manager) {
      // Create a mock storage adapter if none provided (for testing)
      const storage = config.storage || this.createMockStorageAdapter();
      manager = initializeGlobalWorktreeManager(basePath, storage);
    }
    this.worktreeManager = manager;
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Spawn a new agent runtime using git worktree
   */
  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    // Check resource limits
    if (this.config.maxWorktrees && this.runtimes.size >= this.config.maxWorktrees) {
      throw new ResourceExhaustedError(
        `Maximum number of worktrees (${this.config.maxWorktrees}) reached`,
        'agents'
      );
    }

    const runtimeId = `worktree-${Date.now()}-${++this.runtimeCounter}`;
    const agentId = config.labels?.['agentId'] || runtimeId;

    logger.info('[WorktreeRuntimeProvider] Spawning worktree runtime', {
      runtimeId,
      agentId,
      repositoryPath: this.config.repositoryPath || this.config.baseWorktreePath,
    });

    try {
      // Update state to creating
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'pending',
        currentState: 'creating',
      });

      // Create worktree configuration
      const worktreeConfig: WorktreeConfig = {
        repository: this.config.repositoryPath || this.config.baseWorktreePath,
        baseBranch: this.config.defaultBranch!,
        sessionId: runtimeId,
        dependencies: {
          shared: this.config.shareDependencies ? ['node_modules', '.venv'] : [],
          isolated: ['.env', 'dist', 'build'],
        },
        cleanup: 'delayed',
      };

      // Create the worktree
      const worktree = await this.worktreeManager.createWorktree(worktreeConfig);

      // Track runtime state
      const runtimeState: WorktreeRuntimeState = {
        worktree,
        agentId,
        state: 'running',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        metadata: {
          type: 'worktree',
          agentId,
          teamId: config.labels?.['teamId'] as string,
          createdAt: new Date(),
          labels: config.labels,
        },
      };

      this.runtimes.set(runtimeId, runtimeState);

      // Create AgentRuntime object
      const agentRuntime: AgentRuntime = {
        id: runtimeId,
        runtime: 'worktree' as RuntimeType,
        state: 'running',
        resources: this.getDefaultResourceUsage(),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'running',
      });

      logger.info('[WorktreeRuntimeProvider] Worktree runtime spawned successfully', {
        runtimeId,
        worktreePath: worktree.path,
      });

      return agentRuntime;
    } catch (error) {
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'error',
      });

      logger.error('[WorktreeRuntimeProvider] Failed to spawn worktree runtime', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ResourceExhaustedError) {
        throw error;
      }

      throw new SpawnError(
        `Failed to spawn worktree runtime: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Terminate a running runtime
   */
  async terminate(runtimeId: string): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    logger.info('[WorktreeRuntimeProvider] Terminating worktree runtime', {
      runtimeId,
      worktreeId: runtimeState.worktree.id,
    });

    // Update state
    const previousState = runtimeState.state;
    runtimeState.state = 'terminating';

    try {
      // Remove the worktree
      const cleanupOptions: CleanupOptions = {
        removeBranch: false,
        force: false,
        preserveChanges: false,
      };

      await this.worktreeManager.removeWorktree(runtimeState.worktree, cleanupOptions);

      // Update state to terminated
      runtimeState.state = 'terminated';
      this.runtimes.delete(runtimeId);

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState,
        currentState: 'terminated',
      });

      logger.info('[WorktreeRuntimeProvider] Worktree runtime terminated successfully', {
        runtimeId,
      });
    } catch (error) {
      runtimeState.state = 'error';
      logger.error('[WorktreeRuntimeProvider] Failed to terminate worktree runtime', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExecutionError(
        `Failed to terminate runtime: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Get current status of a runtime
   */
  async getStatus(runtimeId: string): Promise<RuntimeStatus> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    // Update activity timestamp
    runtimeState.lastActiveAt = new Date();
    await this.worktreeManager.updateActivity(runtimeState.worktree.id);

    const uptime = Date.now() - runtimeState.createdAt.getTime();

    return {
      id: runtimeId,
      state: runtimeState.state,
      resources: this.getDefaultResourceUsage(),
      health: runtimeState.state === 'running' ? 'healthy' : 'unhealthy',
      uptime,
    };
  }

  /**
   * List all runtimes with optional filtering
   */
  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    const runtimes: AgentRuntime[] = [];

    for (const [runtimeId, runtimeState] of this.runtimes) {
      // Apply filters
      if (filters?.runtime && runtimeState.metadata.type !== filters.runtime) {
        continue;
      }

      if (filters?.state && runtimeState.state !== filters.state) {
        continue;
      }

      if (filters?.teamId && runtimeState.metadata.teamId !== filters.teamId) {
        continue;
      }

      if (filters?.labels) {
        const labelsMatch = Object.entries(filters.labels).every(
          ([key, value]) => runtimeState.metadata.labels?.[key] === value
        );
        if (!labelsMatch) {
          continue;
        }
      }

      runtimes.push({
        id: runtimeId,
        runtime: 'worktree' as RuntimeType,
        state: runtimeState.state,
        resources: this.getDefaultResourceUsage(),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      });
    }

    return runtimes;
  }

  // ============================================================================
  // Execution
  // ============================================================================

  /**
   * Execute a command in a runtime
   */
  async execute(
    runtimeId: string,
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${runtimeState.state}`, runtimeId);
    }

    logger.debug('[WorktreeRuntimeProvider] Executing command in worktree', {
      runtimeId,
      command,
      worktreePath: runtimeState.worktree.path,
    });

    const startTime = Date.now();
    const timeout = (options?.timeout || 300) * 1000;

    try {
      const execOptions = {
        cwd: options?.cwd || runtimeState.worktree.path,
        timeout,
        env: { ...process.env, ...options?.env },
      };

      const { stdout, stderr } = await execAsync(command, execOptions);
      const duration = Date.now() - startTime;

      // Update activity
      runtimeState.lastActiveAt = new Date();
      await this.worktreeManager.updateActivity(runtimeState.worktree.id);

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: 0,
        stdout: stdout || '',
        stderr: stderr || '',
        duration,
        metadata,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Check if it's a timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new TimeoutError(`Command timed out after ${timeout}ms`, timeout, command, runtimeId);
      }

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };
        return {
          exitCode: execError.code || 1,
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          duration,
          metadata,
        };
      }

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration,
        metadata,
      };
    }
  }

  /**
   * Execute a command with streaming output
   */
  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${runtimeState.state}`, runtimeId);
    }

    const child = spawn(command, {
      cwd: runtimeState.worktree.path,
      shell: true,
    });

    let sequence = 0;
    let exitCode: number | null = null;
    let exitResolved = false;

    // Setup exit listener
    const exitPromise = new Promise<number>((resolve) => {
      child.on('close', (code) => {
        exitCode = code || 0;
        exitResolved = true;
        resolve(exitCode);
      });
    });

    // Yield stdout chunks
    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        // Data will be yielded through the async generator
      });

      for await (const chunk of child.stdout) {
        yield {
          type: 'stdout',
          data: chunk.toString(),
          timestamp: new Date(),
          sequence: sequence++,
        };
      }
    }

    // Yield stderr chunks
    if (child.stderr) {
      for await (const chunk of child.stderr) {
        yield {
          type: 'stderr',
          data: chunk.toString(),
          timestamp: new Date(),
          sequence: sequence++,
        };
      }
    }

    // Wait for process to complete
    const finalExitCode = await exitPromise;

    // Note: ExecutionOutput type only allows 'stdout' | 'stderr', not 'exit'
    // We'll emit the exit code as stderr for now to comply with the interface
    yield {
      type: 'stderr',
      data: `__EXIT_CODE__:${finalExitCode}`,
      timestamp: new Date(),
      sequence: sequence++,
    };

    // Update activity
    runtimeState.lastActiveAt = new Date();
    await this.worktreeManager.updateActivity(runtimeState.worktree.id);
  }

  /**
   * Execute a command with interactive input
   */
  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    // For worktrees, interactive execution is similar to regular execution
    // but with stdin piped through
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${runtimeState.state}`, runtimeId);
    }

    const startTime = Date.now();

    try {
      const child = spawn(command, {
        cwd: runtimeState.worktree.path,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Pipe stdin to child process
      const reader = stdin.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              child.stdin?.end();
              break;
            }
            child.stdin?.write(value);
          }
        } catch (error) {
          logger.error('[WorktreeRuntimeProvider] Error pumping stdin', { error });
        }
      };

      pump();

      // Collect output
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => resolve(code || 0));
      });

      const duration = Date.now() - startTime;

      // Update activity
      runtimeState.lastActiveAt = new Date();
      await this.worktreeManager.updateActivity(runtimeState.worktree.id);

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode,
        stdout,
        stderr,
        duration,
        metadata,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration,
        metadata,
      };
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Read a file from the runtime
   */
  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const fullPath = path.join(runtimeState.worktree.path, filePath);

    try {
      const content = await fs.promises.readFile(fullPath);

      // Update activity
      runtimeState.lastActiveAt = new Date();
      await this.worktreeManager.updateActivity(runtimeState.worktree.id);

      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(`File not found: ${filePath}`, 'file', filePath, runtimeId);
      }
      throw error;
    }
  }

  /**
   * Write a file to the runtime
   */
  async writeFile(runtimeId: string, filePath: string, data: Buffer): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const fullPath = path.join(runtimeState.worktree.path, filePath);

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    await fs.promises.writeFile(fullPath, data);

    // Update activity
    runtimeState.lastActiveAt = new Date();
    await this.worktreeManager.updateActivity(runtimeState.worktree.id);
  }

  /**
   * Upload a directory to the runtime
   */
  async uploadDirectory(
    runtimeId: string,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const targetPath = path.join(runtimeState.worktree.path, remotePath);

    // Simple recursive copy implementation
    await this.copyDirectory(localPath, targetPath);

    // Update activity
    runtimeState.lastActiveAt = new Date();
    await this.worktreeManager.updateActivity(runtimeState.worktree.id);

    logger.info('[WorktreeRuntimeProvider] Directory uploaded', {
      runtimeId,
      localPath,
      remotePath,
    });
  }

  /**
   * Download a directory from the runtime
   */
  async downloadDirectory(
    runtimeId: string,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const sourcePath = path.join(runtimeState.worktree.path, remotePath);

    // Simple recursive copy implementation
    await this.copyDirectory(sourcePath, localPath);

    // Update activity
    runtimeState.lastActiveAt = new Date();
    await this.worktreeManager.updateActivity(runtimeState.worktree.id);

    logger.info('[WorktreeRuntimeProvider] Directory downloaded', {
      runtimeId,
      remotePath,
      localPath,
    });
  }

  // ============================================================================
  // State Management (Git-based Snapshots)
  // ============================================================================

  /**
   * Create a snapshot of runtime state using git commit
   */
  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const worktreePath = runtimeState.worktree.path;

    try {
      // Stage all changes
      await execAsync('git add -A', { cwd: worktreePath });

      // Create commit with metadata
      const commitMessage = metadata?.name || `Snapshot ${snapshotId}`;
      const description = metadata?.description ? `\n\n${metadata.description}` : '';
      await execAsync(`git commit -m "${commitMessage}"${description} --allow-empty`, { cwd: worktreePath });

      // Get commit hash
      const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });

      // Calculate approximate size
      const { stdout: sizeOutput } = await execAsync('du -sb .', { cwd: worktreePath }).catch(() => ({ stdout: '0' }));
      const size = parseInt(sizeOutput.split('\t')[0], 10) || 0;

      // Store snapshot info
      const snapshotInfo: SnapshotInfo = {
        id: snapshotId,
        runtimeId,
        commitHash: commitHash.trim(),
        createdAt: new Date(),
        metadata: metadata || {},
        size,
      };

      this.snapshots.set(snapshotId, snapshotInfo);

      logger.info('[WorktreeRuntimeProvider] Snapshot created', {
        snapshotId,
        runtimeId,
        commitHash: snapshotInfo.commitHash,
      });

      return {
        id: snapshotId,
        runtimeId,
        createdAt: snapshotInfo.createdAt,
        size,
        metadata: metadata || {},
      };
    } catch (error) {
      logger.error('[WorktreeRuntimeProvider] Failed to create snapshot', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExecutionError(
        `Failed to create snapshot: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Restore a runtime from a snapshot
   */
  async restore(snapshotId: string): Promise<AgentRuntime> {
    const snapshotInfo = this.snapshots.get(snapshotId);
    if (!snapshotInfo) {
      throw new NotFoundError(`Snapshot not found: ${snapshotId}`, 'snapshot', snapshotId);
    }

    const runtimeState = this.runtimes.get(snapshotInfo.runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(
        `Runtime not found for snapshot: ${snapshotInfo.runtimeId}`,
        'runtime',
        snapshotInfo.runtimeId
      );
    }

    const worktreePath = runtimeState.worktree.path;

    try {
      // Reset to the snapshot commit
      await execAsync(`git reset --hard ${snapshotInfo.commitHash}`, { cwd: worktreePath });

      logger.info('[WorktreeRuntimeProvider] Runtime restored from snapshot', {
        snapshotId,
        runtimeId: snapshotInfo.runtimeId,
        commitHash: snapshotInfo.commitHash,
      });

      // Update activity
      runtimeState.lastActiveAt = new Date();
      await this.worktreeManager.updateActivity(runtimeState.worktree.id);

      return {
        id: snapshotInfo.runtimeId,
        runtime: 'worktree',
        state: runtimeState.state,
        resources: this.getDefaultResourceUsage(),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };
    } catch (error) {
      logger.error('[WorktreeRuntimeProvider] Failed to restore snapshot', {
        snapshotId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExecutionError(
        `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`,
        snapshotInfo.runtimeId
      );
    }
  }

  /**
   * List snapshots for a runtime or all snapshots
   */
  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    const snapshots: Snapshot[] = [];

    for (const [id, info] of this.snapshots) {
      if (runtimeId && info.runtimeId !== runtimeId) {
        continue;
      }

      snapshots.push({
        id,
        runtimeId: info.runtimeId,
        createdAt: info.createdAt,
        size: info.size,
        metadata: info.metadata,
      });
    }

    return snapshots;
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshotInfo = this.snapshots.get(snapshotId);
    if (!snapshotInfo) {
      throw new NotFoundError(`Snapshot not found: ${snapshotId}`, 'snapshot', snapshotId);
    }

    // Remove from memory (git commit remains in history)
    this.snapshots.delete(snapshotId);

    logger.info('[WorktreeRuntimeProvider] Snapshot deleted', { snapshotId });
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Subscribe to runtime events
   */
  on(event: RuntimeEvent, handler: EventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Wait for a runtime to reach a specific state
   */
  async waitForState(
    runtimeId: string,
    state: RuntimeState,
    timeout?: number
  ): Promise<boolean> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      return false;
    }

    // If already in target state, return immediately
    if (runtimeState.state === state) {
      return true;
    }

    // Wait for state change
    const timeoutMs = timeout || 30000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentState = this.runtimes.get(runtimeId);
        if (!currentState) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        if (currentState.state === state) {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getDefaultResourceUsage(): ResourceUsage {
    return {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0,
      },
    };
  }

  private emitRuntimeEvent(
    event: RuntimeEvent,
    runtimeId: string,
    data: Partial<EventData>
  ): void {
    const eventData: EventData = {
      timestamp: new Date(),
      runtimeId,
      event,
      ...data,
    };

    // Emit to EventEmitter
    this.emit(event, eventData);

    // Call registered handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event, eventData);
        } catch (error) {
          logger.error('[WorktreeRuntimeProvider] Error in event handler', { error });
        }
      });
    }
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });
    const entries = await fs.promises.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.promises.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Create a mock storage adapter for testing purposes
   */
  private createMockStorageAdapter(): StorageAdapter {
    const hotStorage = new Map<string, { data: unknown; expiresAt: number }>();
    const coldStorage = new Map<string, Map<string, unknown>>();

    return {
      loadHot: async <T>(key: string): Promise<T | null> => {
        const item = hotStorage.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          hotStorage.delete(key);
          return null;
        }
        return item.data as T;
      },

      saveHot: async <T>(key: string, data: T, ttlMs: number): Promise<void> => {
        hotStorage.set(key, { data, expiresAt: Date.now() + ttlMs });
      },

      saveCold: async (table: string, data: unknown): Promise<string> => {
        if (!coldStorage.has(table)) {
          coldStorage.set(table, new Map());
        }
        const id = (data as Record<string, unknown>)['id'] as string || `id-${Date.now()}`;
        coldStorage.get(table)!.set(id, data);
        return id;
      },

      loadCold: async <T>(table: string, id: string): Promise<T | null> => {
        const tableData = coldStorage.get(table);
        if (!tableData) return null;
        return tableData.get(id) as T || null;
      },

      delete: async (key: string): Promise<void> => {
        hotStorage.delete(key);
        // Note: cold storage deletion not implemented for mock
      },
    };
  }

  /**
   * Dispose of the provider and cleanup resources
   */
  dispose(): void {
    // Stop auto cleanup
    this.worktreeManager.stopAutoCleanup();
    
    // Remove all listeners
    this.removeAllListeners();
    
    // Clear runtime mappings
    this.runtimes.clear();
    this.snapshots.clear();
    this.eventHandlers.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalWorktreeRuntimeProvider: WorktreeRuntimeProvider | null = null;

/**
 * Get or create the global WorktreeRuntimeProvider instance
 * 
 * @param config - Provider configuration (only used on first call)
 * @returns WorktreeRuntimeProvider instance
 */
export function getGlobalWorktreeRuntimeProvider(
  config?: WorktreeRuntimeProviderConfig
): WorktreeRuntimeProvider {
  if (!globalWorktreeRuntimeProvider && config) {
    globalWorktreeRuntimeProvider = new WorktreeRuntimeProvider(config);
  }

  if (!globalWorktreeRuntimeProvider) {
    throw new Error(
      'Global WorktreeRuntimeProvider not initialized. Call with config first.'
    );
  }

  return globalWorktreeRuntimeProvider;
}

/**
 * Initialize the global WorktreeRuntimeProvider
 * 
 * @param config - Provider configuration
 * @returns Initialized WorktreeRuntimeProvider
 */
export function initializeGlobalWorktreeRuntimeProvider(
  config: WorktreeRuntimeProviderConfig
): WorktreeRuntimeProvider {
  if (globalWorktreeRuntimeProvider) {
    globalWorktreeRuntimeProvider.dispose();
  }

  globalWorktreeRuntimeProvider = new WorktreeRuntimeProvider(config);
  return globalWorktreeRuntimeProvider;
}

/**
 * Reset the global WorktreeRuntimeProvider (primarily for testing)
 */
export function resetGlobalWorktreeRuntimeProvider(): void {
  if (globalWorktreeRuntimeProvider) {
    globalWorktreeRuntimeProvider.dispose();
    globalWorktreeRuntimeProvider = null;
  }
}

/**
 * Check if global WorktreeRuntimeProvider is initialized
 * @returns True if initialized
 */
export function hasGlobalWorktreeRuntimeProvider(): boolean {
  return globalWorktreeRuntimeProvider !== null;
}

// ============================================================================
// Default Export
// ============================================================================

export default WorktreeRuntimeProvider;

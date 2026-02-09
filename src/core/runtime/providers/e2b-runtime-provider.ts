/**
 * E2BRuntimeProvider - RuntimeProvider implementation using E2B sandboxes
 *
 * Implements the RuntimeProvider interface using E2B (https://e2b.dev) cloud sandboxes
 * for agent isolation and execution. E2B provides secure, sandboxed environments
 * that can run code in multiple languages.
 *
 * @module @godel/core/runtime/providers/e2b-runtime-provider
 * @see SPEC-002 Section 4.2
 * @see PRD-003 FR3
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { logger } from '../../../utils/logger';

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

// ═══════════════════════════════════════════════════════════════════════════════
// E2B SDK Types (Mocked for development - replace with actual SDK when available)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * E2B Sandbox interface
 * This is a mock interface that mirrors the E2B SDK structure.
 * When the actual E2B SDK is available, replace this with: import { Sandbox } from 'e2b'
 */
interface E2BSandbox {
  id: string;
  getHostname(): string;
  kill(): Promise<void>;
  process: {
    start(options: {
      cmd: string;
      cwd?: string;
      env?: Record<string, string>;
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
      onExit?: (code: number) => void;
    }): Promise<E2BProcess>;
  };
  files: {
    read(path: string): Promise<Uint8Array>;
    write(path: string, content: Uint8Array | string): Promise<void>;
    list(path: string): Promise<E2BFileInfo[]>;
  };
  snapshot(): Promise<E2BSnapshot>;
  restore(snapshotId: string): Promise<void>;
}

interface E2BProcess {
  processId: string;
  wait(): Promise<{ exitCode: number }>;
  sendStdin(data: string): Promise<void>;
  kill(): Promise<void>;
}

interface E2BFileInfo {
  name: string;
  isDir: boolean;
}

interface E2BSnapshot {
  snapshotId: string;
}

/**
 * E2B Sandbox static interface
 */
interface E2BSandboxStatic {
  create(options: {
    template?: string;
    timeout?: number;
    envs?: Record<string, string>;
    apiKey?: string;
  }): Promise<E2BSandbox>;
  list(options?: { apiKey?: string }): Promise<E2BSandboxInfo[]>;
}

interface E2BSandboxInfo {
  id: string;
  templateId: string;
  status: 'running' | 'paused' | 'error';
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for E2BRuntimeProvider
 */
export interface E2BRuntimeProviderConfig {
  /** E2B API key */
  apiKey: string;
  /** Default template ID to use for sandboxes */
  defaultTemplate?: string;
  /** Default sandbox timeout in milliseconds */
  defaultTimeout?: number;
  /** Maximum number of concurrent sandboxes */
  maxSandboxes?: number;
  /** Alias for maxSandboxes (for backward compatibility) */
  maxConcurrentSandboxes?: number;
  /** Base URL for E2B API (optional, for custom deployments) */
  baseUrl?: string;
}

/**
 * Internal state tracking for E2B runtimes
 */
interface E2BRuntimeState {
  sandbox: E2BSandbox;
  agentId: string;
  state: RuntimeState;
  createdAt: Date;
  lastActiveAt: Date;
  metadata: RuntimeMetadata;
  resourceUsage: ResourceUsage;
}

/**
 * Snapshot tracking information
 */
interface SnapshotInfo {
  id: string;
  runtimeId: string;
  e2bSnapshotId: string;
  createdAt: Date;
  metadata: SnapshotMetadata;
  size: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mock E2B SDK Implementation (for development)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock E2B Sandbox implementation for development
 * Replace this with actual SDK import when available
 */
class MockSandbox implements E2BSandbox {
  id: string;
  private hostname: string;
  private filesMap: Map<string, Uint8Array> = new Map();
  private isKilled = false;

  constructor(id: string) {
    this.id = id;
    this.hostname = `${id}.sandbox.e2b.dev`;
  }

  static async create(options: {
    template?: string;
    timeout?: number;
    envs?: Record<string, string>;
    apiKey?: string;
  }): Promise<MockSandbox> {
    const id = `e2b-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const sandbox = new MockSandbox(id);
    
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.info('[MockSandbox] Created', { id, template: options.template });
    return sandbox;
  }

  getHostname(): string {
    return this.hostname;
  }

  async kill(): Promise<void> {
    this.isKilled = true;
    logger.info('[MockSandbox] Killed', { id: this.id });
  }

  process = {
    start: async (options: {
      cmd: string;
      cwd?: string;
      env?: Record<string, string>;
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
      onExit?: (code: number) => void;
    }): Promise<E2BProcess> => {
      if (this.isKilled) {
        throw new Error('Sandbox has been killed');
      }

      const processId = `proc-${Date.now()}`;
      
      // Mock process execution
      const mockProcess: E2BProcess = {
        processId,
        wait: async () => {
          // Simulate command execution
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Simulate output
          if (options.onStdout) {
            options.onStdout('Mock stdout output\n');
          }
          
          return { exitCode: 0 };
        },
        sendStdin: async (data: string) => {
          logger.debug('[MockSandbox] Received stdin', { processId, dataLength: data.length });
        },
        kill: async () => {
          logger.debug('[MockSandbox] Process killed', { processId });
        },
      };

      return mockProcess;
    },
  };

  files = {
    read: async (filePath: string): Promise<Uint8Array> => {
      if (this.isKilled) {
        throw new Error('Sandbox has been killed');
      }

      const content = this.filesMap.get(filePath);
      if (!content) {
        const error = new Error(`File not found: ${filePath}`);
        (error as NodeJS.ErrnoException).code = 'ENOENT';
        throw error;
      }
      return content;
    },

    write: async (filePath: string, content: Uint8Array | string): Promise<void> => {
      if (this.isKilled) {
        throw new Error('Sandbox has been killed');
      }

      const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      this.filesMap.set(filePath, data);
    },

    list: async (dirPath: string): Promise<E2BFileInfo[]> => {
      if (this.isKilled) {
        throw new Error('Sandbox has been killed');
      }

      // Simple mock implementation
      const files: E2BFileInfo[] = [];
      const seen = new Set<string>();
      
      for (const key of this.filesMap.keys()) {
        if (key.startsWith(dirPath)) {
          const relative = key.slice(dirPath.length).replace(/^\//, '');
          const firstSegment = relative.split('/')[0];
          if (firstSegment && !seen.has(firstSegment)) {
            seen.add(firstSegment);
            files.push({
              name: firstSegment,
              isDir: relative.includes('/'),
            });
          }
        }
      }

      return files;
    },
  };

  async snapshot(): Promise<E2BSnapshot> {
    if (this.isKilled) {
      throw new Error('Sandbox has been killed');
    }

    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    logger.info('[MockSandbox] Snapshot created', { id: this.id, snapshotId });
    
    return { snapshotId };
  }

  async restore(snapshotId: string): Promise<void> {
    if (this.isKilled) {
      throw new Error('Sandbox has been killed');
    }

    logger.info('[MockSandbox] Restored from snapshot', { id: this.id, snapshotId });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// E2BRuntimeProvider Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export class E2BRuntimeProvider extends EventEmitter implements RuntimeProvider {
  private runtimes: Map<string, E2BRuntimeState> = new Map();
  private config: E2BRuntimeProviderConfig;
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private snapshots: Map<string, SnapshotInfo> = new Map();
  private runtimeCounter = 0;

  /**
   * Provider capabilities
   */
  readonly capabilities: RuntimeCapabilities = {
    snapshots: true,
    streaming: true,
    interactive: true,
    fileOperations: true,
    networkConfiguration: false, // E2B manages network
    resourceLimits: true,
    healthChecks: true,
  };

  constructor(config?: Partial<E2BRuntimeProviderConfig>) {
    super();

    const apiKey = config?.apiKey || process.env.E2B_API_KEY;

    if (!apiKey) {
      throw new Error('E2B API key is required');
    }

    this.config = {
      apiKey,
      defaultTemplate: config?.defaultTemplate || 'base',
      defaultTimeout: config?.defaultTimeout || 600000, // 10 minutes
      maxSandboxes: config?.maxConcurrentSandboxes || config?.maxSandboxes || 50,
      maxConcurrentSandboxes: config?.maxConcurrentSandboxes,
      baseUrl: config?.baseUrl,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Lifecycle Management
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a new agent runtime using E2B sandbox
   */
  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    // Check resource limits
    if (this.config.maxSandboxes && this.runtimes.size >= this.config.maxSandboxes) {
      throw new ResourceExhaustedError(
        `Maximum number of sandboxes (${this.config.maxSandboxes}) reached`,
        'agents'
      );
    }

    const runtimeId = `e2b-${Date.now()}-${++this.runtimeCounter}`;
    const agentId = config.labels?.['agentId'] || runtimeId;

    logger.info('[E2BRuntimeProvider] Spawning E2B runtime', {
      runtimeId,
      agentId,
      template: config.image || this.config.defaultTemplate,
    });

    try {
      // Emit pre-spawn event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'pending',
        currentState: 'creating',
      });

      // Create E2B sandbox
      const sandbox = await MockSandbox.create({
        template: config.image || this.config.defaultTemplate,
        timeout: (config.timeout || 600) * 1000,
        envs: config.env,
        apiKey: this.config.apiKey,
      });

      // Track runtime state
      const runtimeState: E2BRuntimeState = {
        sandbox,
        agentId,
        state: 'running',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        metadata: {
          type: 'e2b',
          agentId,
          teamId: config.labels?.['teamId'] as string,
          createdAt: new Date(),
          labels: config.labels,
        },
        resourceUsage: this.getDefaultResourceUsage(),
      };

      this.runtimes.set(runtimeId, runtimeState);

      // Create AgentRuntime object
      const agentRuntime: AgentRuntime = {
        id: runtimeId,
        runtime: 'e2b' as RuntimeType,
        state: 'running',
        resources: runtimeState.resourceUsage,
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'running',
      });

      logger.info('[E2BRuntimeProvider] E2B runtime spawned successfully', {
        runtimeId,
        sandboxId: sandbox.id,
      });

      return agentRuntime;
    } catch (error) {
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'error',
      });

      logger.error('[E2BRuntimeProvider] Failed to spawn E2B runtime', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ResourceExhaustedError) {
        throw error;
      }

      throw new SpawnError(
        `Failed to spawn E2B runtime: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Terminate a running runtime
   */
  async terminate(runtimeId: string, _force?: boolean): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    logger.info('[E2BRuntimeProvider] Terminating E2B runtime', {
      runtimeId,
      sandboxId: runtimeState.sandbox.id,
    });

    // Update state
    const previousState = runtimeState.state;
    runtimeState.state = 'terminating';

    try {
      // Kill the E2B sandbox
      await runtimeState.sandbox.kill();

      // Update state to terminated
      runtimeState.state = 'terminated';
      this.runtimes.delete(runtimeId);

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState,
        currentState: 'terminated',
      });

      logger.info('[E2BRuntimeProvider] E2B runtime terminated successfully', {
        runtimeId,
      });
    } catch (error) {
      runtimeState.state = 'error';
      logger.error('[E2BRuntimeProvider] Failed to terminate E2B runtime', {
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

    const uptime = Date.now() - runtimeState.createdAt.getTime();

    return {
      id: runtimeId,
      state: runtimeState.state,
      resources: runtimeState.resourceUsage,
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
      if (filters?.runtime) {
        const runtimeFilter = Array.isArray(filters.runtime) ? filters.runtime : [filters.runtime];
        if (!runtimeFilter.includes('e2b')) {
          continue;
        }
      }

      if (filters?.state) {
        const stateFilter = Array.isArray(filters.state) ? filters.state : [filters.state];
        if (!stateFilter.includes(runtimeState.state)) {
          continue;
        }
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
        runtime: 'e2b' as RuntimeType,
        state: runtimeState.state,
        resources: runtimeState.resourceUsage,
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      });
    }

    return runtimes;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Execution
  // ═════════════════════════════════════════════════════════════════════════════

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

    logger.debug('[E2BRuntimeProvider] Executing command in E2B sandbox', {
      runtimeId,
      command,
      sandboxId: runtimeState.sandbox.id,
    });

    const startTime = Date.now();
    const timeoutMs = (options?.timeout || 300) * 1000;

    try {
      // Start the process
      const process = await runtimeState.sandbox.process.start({
        cmd: command,
        cwd: options?.cwd,
        env: options?.env,
      });

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(
            `Command timed out after ${timeoutMs}ms`,
            timeoutMs,
            command,
            runtimeId
          ));
        }, timeoutMs);
      });

      // Wait for process completion with timeout
      const result = await Promise.race([
        process.wait(),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      // Update activity
      runtimeState.lastActiveAt = new Date();

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: result.exitCode,
        stdout: 'Mock stdout output', // In real implementation, capture from process
        stderr: '',
        duration,
        metadata,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof TimeoutError) {
        throw error;
      }

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

    let sequence = 0;
    const outputs: ExecutionOutput[] = [];
    let exitCode = 0;
    let exitResolved = false;

    // Start the process with streaming callbacks
    const process = await runtimeState.sandbox.process.start({
      cmd: command,
      onStdout: (data: string) => {
        outputs.push({
          type: 'stdout',
          data,
          timestamp: new Date(),
          sequence: sequence++,
        });
      },
      onStderr: (data: string) => {
        outputs.push({
          type: 'stderr',
          data,
          timestamp: new Date(),
          sequence: sequence++,
        });
      },
      onExit: (code: number) => {
        exitCode = code;
        exitResolved = true;
      },
    });

    // Wait for process to complete while yielding outputs
    const completionPromise = process.wait().then(result => {
      exitCode = result.exitCode;
      exitResolved = true;
    });

    // Yield outputs as they arrive
    let yieldedCount = 0;
    while (!exitResolved || yieldedCount < outputs.length) {
      if (yieldedCount < outputs.length) {
        yield outputs[yieldedCount];
        yieldedCount++;
      } else {
        // Small delay to allow more output
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Yield exit code
    yield {
      type: 'exit',
      data: String(exitCode),
      timestamp: new Date(),
      sequence: sequence++,
    };

    // Update activity
    runtimeState.lastActiveAt = new Date();
  }

  /**
   * Execute a command with interactive input
   */
  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${runtimeState.state}`, runtimeId);
    }

    const startTime = Date.now();

    try {
      // Start the process
      const process = await runtimeState.sandbox.process.start({
        cmd: command,
      });

      // Pipe stdin to the process
      const reader = stdin.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
            await process.sendStdin(text);
          }
        } catch (error) {
          logger.error('[E2BRuntimeProvider] Error pumping stdin', { error });
        }
      };

      // Start pumping stdin
      pump();

      // Wait for process completion
      const result = await process.wait();
      const duration = Date.now() - startTime;

      // Update activity
      runtimeState.lastActiveAt = new Date();

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: result.exitCode,
        stdout: 'Mock stdout output', // In real implementation, capture from process
        stderr: '',
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

  // ═════════════════════════════════════════════════════════════════════════════
  // File Operations
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Read a file from the runtime
   */
  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    try {
      const content = await runtimeState.sandbox.files.read(filePath);
      
      // Update activity
      runtimeState.lastActiveAt = new Date();

      return Buffer.from(content);
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

    await runtimeState.sandbox.files.write(filePath, data);

    // Update activity
    runtimeState.lastActiveAt = new Date();
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

    // Check if local path exists
    if (!fs.existsSync(localPath)) {
      throw new NotFoundError(`Local path not found: ${localPath}`, 'directory', localPath);
    }

    // Recursively upload files
    await this.uploadDirectoryRecursive(runtimeState.sandbox, localPath, remotePath);

    // Update activity
    runtimeState.lastActiveAt = new Date();

    logger.info('[E2BRuntimeProvider] Directory uploaded', {
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

    // Create local directory
    await fs.promises.mkdir(localPath, { recursive: true });

    // Recursively download files
    await this.downloadDirectoryRecursive(runtimeState.sandbox, remotePath, localPath);

    // Update activity
    runtimeState.lastActiveAt = new Date();

    logger.info('[E2BRuntimeProvider] Directory downloaded', {
      runtimeId,
      remotePath,
      localPath,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // State Management (E2B Snapshots)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Create a snapshot of runtime state
   */
  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      // Create E2B snapshot
      const e2bSnapshot = await runtimeState.sandbox.snapshot();

      // Calculate approximate size (mock implementation)
      const size = 1024 * 1024; // 1MB placeholder

      // Store snapshot info
      const snapshotInfo: SnapshotInfo = {
        id: snapshotId,
        runtimeId,
        e2bSnapshotId: e2bSnapshot.snapshotId,
        createdAt: new Date(),
        metadata: metadata || {},
        size,
      };

      this.snapshots.set(snapshotId, snapshotInfo);

      logger.info('[E2BRuntimeProvider] Snapshot created', {
        snapshotId,
        runtimeId,
        e2bSnapshotId: e2bSnapshot.snapshotId,
      });

      return {
        id: snapshotId,
        runtimeId,
        createdAt: snapshotInfo.createdAt,
        size,
        metadata: metadata || {},
      };
    } catch (error) {
      logger.error('[E2BRuntimeProvider] Failed to create snapshot', {
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

    try {
      // Restore the sandbox from snapshot
      await runtimeState.sandbox.restore(snapshotInfo.e2bSnapshotId);

      logger.info('[E2BRuntimeProvider] Runtime restored from snapshot', {
        snapshotId,
        runtimeId: snapshotInfo.runtimeId,
        e2bSnapshotId: snapshotInfo.e2bSnapshotId,
      });

      // Update activity
      runtimeState.lastActiveAt = new Date();

      return {
        id: snapshotInfo.runtimeId,
        runtime: 'e2b',
        state: runtimeState.state,
        resources: runtimeState.resourceUsage,
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };
    } catch (error) {
      logger.error('[E2BRuntimeProvider] Failed to restore snapshot', {
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

    // Remove from memory
    this.snapshots.delete(snapshotId);

    logger.info('[E2BRuntimeProvider] Snapshot deleted', { snapshotId });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Events
  // ═════════════════════════════════════════════════════════════════════════════

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

  // ═════════════════════════════════════════════════════════════════════════════
  // Health Check
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Check if the E2B provider is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can list sandboxes (lightweight operation)
      // In a real implementation, this would verify E2B API connectivity
      return this.config.apiKey !== undefined && this.config.apiKey.length > 0;
    } catch {
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private Methods
  // ═════════════════════════════════════════════════════════════════════════════

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
          logger.error('[E2BRuntimeProvider] Error in event handler', { error });
        }
      });
    }
  }

  private async uploadDirectoryRecursive(
    sandbox: E2BSandbox,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    const entries = await fs.promises.readdir(localPath, { withFileTypes: true });

    for (const entry of entries) {
      const localEntryPath = path.join(localPath, entry.name);
      const remoteEntryPath = path.join(remotePath, entry.name);

      if (entry.isDirectory()) {
        await this.uploadDirectoryRecursive(sandbox, localEntryPath, remoteEntryPath);
      } else {
        const content = await fs.promises.readFile(localEntryPath);
        await sandbox.files.write(remoteEntryPath, content);
      }
    }
  }

  private async downloadDirectoryRecursive(
    sandbox: E2BSandbox,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    // Create local directory
    await fs.promises.mkdir(localPath, { recursive: true });

    // List files in remote directory
    const files = await sandbox.files.list(remotePath);

    for (const file of files) {
      const remoteFilePath = path.join(remotePath, file.name);
      const localFilePath = path.join(localPath, file.name);

      if (file.isDir) {
        await this.downloadDirectoryRecursive(sandbox, remoteFilePath, localFilePath);
      } else {
        const content = await sandbox.files.read(remoteFilePath);
        await fs.promises.writeFile(localFilePath, Buffer.from(content));
      }
    }
  }

  /**
   * Dispose of the provider and cleanup resources
   */
  dispose(): void {
    // Remove all listeners
    this.removeAllListeners();

    // Clear runtime mappings
    this.runtimes.clear();
    this.snapshots.clear();
    this.eventHandlers.clear();

    logger.info('[E2BRuntimeProvider] Disposed');
  }

  /**
   * Get the runtime cost for a sandbox
   * @param runtimeId - Runtime ID
   * @returns Cost in cents or null if not available
   */
  getRuntimeCost(runtimeId: string): number | null {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      return null;
    }

    // Calculate approximate cost based on uptime
    // This is a mock implementation - real implementation would use E2B billing API
    const uptimeMs = Date.now() - runtime.createdAt.getTime();
    const uptimeHours = uptimeMs / (1000 * 60 * 60);

    // Mock rate: $0.10 per hour
    return Math.round(uptimeHours * 10);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let globalE2BRuntimeProvider: E2BRuntimeProvider | null = null;

/**
 * Get or create the global E2BRuntimeProvider instance
 * 
 * @param config - Provider configuration (only used on first call)
 * @returns E2BRuntimeProvider instance
 */
export function getGlobalE2BRuntimeProvider(
  config?: E2BRuntimeProviderConfig
): E2BRuntimeProvider {
  if (!globalE2BRuntimeProvider && config) {
    globalE2BRuntimeProvider = new E2BRuntimeProvider(config);
  }

  if (!globalE2BRuntimeProvider) {
    throw new Error(
      'Global E2BRuntimeProvider not initialized. Call with config first.'
    );
  }

  return globalE2BRuntimeProvider;
}

/**
 * Initialize the global E2BRuntimeProvider
 * 
 * @param config - Provider configuration
 * @returns Initialized E2BRuntimeProvider
 */
export function initializeGlobalE2BRuntimeProvider(
  config: E2BRuntimeProviderConfig
): E2BRuntimeProvider {
  if (globalE2BRuntimeProvider) {
    globalE2BRuntimeProvider.removeAllListeners();
  }

  globalE2BRuntimeProvider = new E2BRuntimeProvider(config);
  return globalE2BRuntimeProvider;
}

/**
 * Reset the global E2BRuntimeProvider (primarily for testing)
 */
export function resetGlobalE2BRuntimeProvider(): void {
  if (globalE2BRuntimeProvider) {
    globalE2BRuntimeProvider.removeAllListeners();
    globalE2BRuntimeProvider = null;
  }
}

/**
 * Check if global E2BRuntimeProvider is initialized
 * @returns True if initialized
 */
export function hasGlobalE2BRuntimeProvider(): boolean {
  return globalE2BRuntimeProvider !== null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Export
// ═══════════════════════════════════════════════════════════════════════════════

export default E2BRuntimeProvider;

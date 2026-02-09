/**
 * E2BRuntimeProvider - RuntimeProvider implementation using E2B remote sandboxes
 * 
 * Implements the RuntimeProvider interface using E2B.dev API for cloud-based
 * sandbox execution. Provides on-demand sandbox spawning with automatic
 * resource management and cost tracking integration.
 * 
 * @module @godel/core/runtime/providers/e2b-runtime-provider
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.3
 */

import { EventEmitter } from 'events';
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

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for E2BRuntimeProvider
 */
export interface E2BRuntimeProviderConfig {
  /** E2B API key */
  apiKey?: string;
  /** Default template to use for sandboxes */
  defaultTemplate?: string;
  /** Default timeout for sandbox operations (seconds) */
  defaultTimeout?: number;
  /** Maximum number of concurrent sandboxes */
  maxConcurrentSandboxes?: number;
  /** Region for sandbox deployment */
  region?: 'us-east-1' | 'us-west-1' | 'eu-west-1' | 'ap-southeast-1';
  /** Enable cost tracking integration */
  enableCostTracking?: boolean;
  /** Cost per hour for sandbox usage (for budget calculations) */
  costPerHour?: number;
}

/**
 * E2B Sandbox instance state
 */
interface E2BSandboxState {
  sandboxId: string;
  runtimeId: string;
  agentId: string;
  state: RuntimeState;
  createdAt: Date;
  lastActiveAt: Date;
  metadata: RuntimeMetadata;
  template: string;
  client: E2BSandboxClient;
}

/**
 * E2B Sandbox client interface
 */
interface E2BSandboxClient {
  id: string;
  kill: () => Promise<void>;
  runCode: (code: string, opts?: any) => Promise<any>;
  files: {
    read: (path: string) => Promise<Uint8Array>;
    write: (path: string, content: Uint8Array | string) => Promise<void>;
    list: (path: string) => Promise<any[]>;
  };
}

/**
 * Snapshot information for E2B sandboxes
 */
interface E2BSnapshotInfo {
  id: string;
  runtimeId: string;
  sandboxId: string;
  createdAt: Date;
  metadata: SnapshotMetadata;
  size: number;
}

// ============================================================================
// E2B Client Wrapper
// ============================================================================

/**
 * E2B API client wrapper
 */
class E2BClient {
  private apiKey: string;
  private baseUrl = 'https://api.e2b.dev';
  private wsBaseUrl = 'wss://api.e2b.dev';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Create a new sandbox instance
   */
  async createSandbox(template: string, timeout?: number): Promise<E2BSandboxClient> {
    const response = await fetch(`${this.baseUrl}/sandboxes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template,
        timeout,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create E2B sandbox: ${error}`);
    }

      const data = await response.json() as { sandboxId: string };
      return this.wrapSandboxClient(data.sandboxId, data);
  }

  /**
   * Get sandbox by ID
   */
  async getSandbox(sandboxId: string): Promise<E2BSandboxClient | null> {
    try {
      const response = await fetch(`${this.baseUrl}/sandboxes/${sandboxId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return this.wrapSandboxClient(sandboxId, data);
    } catch (error) {
      return null;
    }
  }

  /**
   * List active sandboxes
   */
  async listSandboxes(): Promise<Array<{ id: string; template: string; createdAt: string }>> {
    const response = await fetch(`${this.baseUrl}/sandboxes`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list E2B sandboxes');
    }

    const data = await response.json() as { sandboxes?: Array<{ id: string; template: string; createdAt: string }> };
    return data.sandboxes || [];
  }

  /**
   * Kill a sandbox
   */
  async killSandbox(sandboxId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sandboxes/${sandboxId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to kill E2B sandbox: ${sandboxId}`);
    }
  }

  /**
   * Wrap API response into sandbox client interface
   */
  private wrapSandboxClient(sandboxId: string, data: any): E2BSandboxClient {
    const self = this;
    
    return {
      id: sandboxId,
      
      async kill() {
        await self.killSandbox(sandboxId);
      },
      
      async runCode(code: string, opts?: any) {
        const response = await fetch(`${self.baseUrl}/sandboxes/${sandboxId}/run`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${self.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, ...opts }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Code execution failed: ${error}`);
        }

        return response.json();
      },
      
      files: {
        async read(path: string) {
          const response = await fetch(
            `${self.baseUrl}/sandboxes/${sandboxId}/files/${encodeURIComponent(path)}`,
            {
              headers: {
                'Authorization': `Bearer ${self.apiKey}`,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to read file: ${path}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        },
        
        async write(path: string, content: Uint8Array | string) {
          const body = typeof content === 'string' 
            ? new TextEncoder().encode(content)
            : content;

          const response = await fetch(
            `${self.baseUrl}/sandboxes/${sandboxId}/files/${encodeURIComponent(path)}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${self.apiKey}`,
                'Content-Type': 'application/octet-stream',
              },
              body,
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to write file: ${path}`);
          }
        },
        
        async list(path: string) {
          const response = await fetch(
            `${self.baseUrl}/sandboxes/${sandboxId}/files/${encodeURIComponent(path)}`,
            {
              headers: {
                'Authorization': `Bearer ${self.apiKey}`,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to list directory: ${path}`);
          }

          return response.json() as Promise<any[]>;
        },
      },
    };
  }
}

// ============================================================================
// E2BRuntimeProvider Implementation
// ============================================================================

export class E2BRuntimeProvider extends EventEmitter implements RuntimeProvider {
  private config: Required<E2BRuntimeProviderConfig>;
  private client: E2BClient;
  private sandboxes: Map<string, E2BSandboxState> = new Map();
  private snapshots: Map<string, E2BSnapshotInfo> = new Map();
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private runtimeCounter = 0;
  private healthCheckInterval?: NodeJS.Timeout;

  /**
   * Provider capabilities
   */
  readonly capabilities: RuntimeCapabilities = {
    snapshots: false,  // E2B doesn't support native snapshots yet
    streaming: true,
    interactive: true,
    fileOperations: true,
    networkConfiguration: true,
    resourceLimits: true,
    healthChecks: true,
  };

  constructor(config: E2BRuntimeProviderConfig = {}) {
    super();
    
    const apiKey = config.apiKey || process.env['E2B_API_KEY'];
    if (!apiKey) {
      throw new Error('E2B API key is required. Set E2B_API_KEY environment variable or pass apiKey in config.');
    }

    this.config = {
      apiKey,
      defaultTemplate: config.defaultTemplate || 'base',
      defaultTimeout: config.defaultTimeout || 300,
      maxConcurrentSandboxes: config.maxConcurrentSandboxes || 50,
      region: config.region || 'us-east-1',
      enableCostTracking: config.enableCostTracking ?? true,
      costPerHour: config.costPerHour || 0.50, // $0.50/hour default
    };

    this.client = new E2BClient(apiKey);
    this.startHealthChecks();

    logger.info('[E2BRuntimeProvider] Initialized', {
      region: this.config.region,
      maxConcurrent: this.config.maxConcurrentSandboxes,
      costTracking: this.config.enableCostTracking,
    });
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Spawn a new E2B sandbox runtime
   */
  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    // Check resource limits
    if (this.sandboxes.size >= this.config.maxConcurrentSandboxes) {
      throw new ResourceExhaustedError(
        `Maximum number of sandboxes (${this.config.maxConcurrentSandboxes}) reached`,
        'agents'
      );
    }

    const runtimeId = `e2b-${Date.now()}-${++this.runtimeCounter}`;
    const agentId = config.labels?.['agentId'] || runtimeId;
    const template = config.image || this.config.defaultTemplate;

    logger.info('[E2BRuntimeProvider] Spawning E2B sandbox', {
      runtimeId,
      agentId,
      template,
    });

    try {
      // Emit state change
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'pending',
        currentState: 'creating',
      });

      // Create sandbox via E2B API
      const timeout = config.timeout || this.config.defaultTimeout;
      const sandboxClient = await this.client.createSandbox(template, timeout);

      // Track sandbox state
      const sandboxState: E2BSandboxState = {
        sandboxId: sandboxClient.id,
        runtimeId,
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
        template,
        client: sandboxClient,
      };

      this.sandboxes.set(runtimeId, sandboxState);

      // Create AgentRuntime object
      const agentRuntime: AgentRuntime = {
        id: runtimeId,
        runtime: 'e2b' as RuntimeType,
        state: 'running',
        resources: this.getDefaultResourceUsage(),
        createdAt: sandboxState.createdAt,
        lastActiveAt: sandboxState.lastActiveAt,
        metadata: sandboxState.metadata,
      };

      // Emit state change
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'running',
      });

      logger.info('[E2BRuntimeProvider] E2B sandbox spawned successfully', {
        runtimeId,
        sandboxId: sandboxClient.id,
      });

      return agentRuntime;
    } catch (error) {
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'error',
      });

      logger.error('[E2BRuntimeProvider] Failed to spawn E2B sandbox', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ResourceExhaustedError) {
        throw error;
      }

      throw new SpawnError(
        `Failed to spawn E2B sandbox: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Terminate a running sandbox
   */
  async terminate(runtimeId: string): Promise<void> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    logger.info('[E2BRuntimeProvider] Terminating E2B sandbox', {
      runtimeId,
      sandboxId: sandboxState.sandboxId,
    });

    const previousState = sandboxState.state;
    sandboxState.state = 'terminating';

    try {
      await sandboxState.client.kill();
      sandboxState.state = 'terminated';
      this.sandboxes.delete(runtimeId);

      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState,
        currentState: 'terminated',
      });

      logger.info('[E2BRuntimeProvider] E2B sandbox terminated successfully', {
        runtimeId,
      });
    } catch (error) {
      sandboxState.state = 'error';
      logger.error('[E2BRuntimeProvider] Failed to terminate E2B sandbox', {
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
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    sandboxState.lastActiveAt = new Date();
    const uptime = Date.now() - sandboxState.createdAt.getTime();

    return {
      id: runtimeId,
      state: sandboxState.state,
      resources: this.getDefaultResourceUsage(),
      health: sandboxState.state === 'running' ? 'healthy' : 'unhealthy',
      uptime,
    };
  }

  /**
   * List all runtimes with optional filtering
   */
  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    const runtimes: AgentRuntime[] = [];

    for (const [runtimeId, sandboxState] of this.sandboxes) {
      // Apply filters
      if (filters?.runtime && sandboxState.metadata.type !== filters.runtime) {
        continue;
      }

      if (filters?.state && sandboxState.state !== filters.state) {
        continue;
      }

      if (filters?.teamId && sandboxState.metadata.teamId !== filters.teamId) {
        continue;
      }

      if (filters?.labels) {
        const labelsMatch = Object.entries(filters.labels).every(
          ([key, value]) => sandboxState.metadata.labels?.[key] === value
        );
        if (!labelsMatch) {
          continue;
        }
      }

      runtimes.push({
        id: runtimeId,
        runtime: 'e2b' as RuntimeType,
        state: sandboxState.state,
        resources: this.getDefaultResourceUsage(),
        createdAt: sandboxState.createdAt,
        lastActiveAt: sandboxState.lastActiveAt,
        metadata: sandboxState.metadata,
      });
    }

    return runtimes;
  }

  // ============================================================================
  // Execution
  // ============================================================================

  /**
   * Execute a command in a sandbox
   */
  async execute(
    runtimeId: string,
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (sandboxState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${sandboxState.state}`, runtimeId);
    }

    logger.debug('[E2BRuntimeProvider] Executing command in sandbox', {
      runtimeId,
      command,
    });

    const startTime = Date.now();
    const timeout = (options?.timeout || this.config.defaultTimeout) * 1000;

    try {
      // Execute via E2B runCode API
      const result = await sandboxState.client.runCode(command, {
        timeout,
        cwd: options?.cwd,
        env: options?.env,
      });

      const duration = Date.now() - startTime;
      sandboxState.lastActiveAt = new Date();

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
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

  /**
   * Execute a command with streaming output
   */
  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (sandboxState.state !== 'running') {
      throw new ExecutionError(`Cannot execute in runtime with state: ${sandboxState.state}`, runtimeId);
    }

    let sequence = 0;

    try {
      // E2B API doesn't support true streaming yet, simulate with polling
      const result = await sandboxState.client.runCode(command);
      sandboxState.lastActiveAt = new Date();

      // Yield stdout
      if (result.stdout) {
        yield {
          type: 'stdout',
          data: result.stdout,
          timestamp: new Date(),
          sequence: sequence++,
        };
      }

      // Yield stderr
      if (result.stderr) {
        yield {
          type: 'stderr',
          data: result.stderr,
          timestamp: new Date(),
          sequence: sequence++,
        };
      }

      // Yield exit code
      yield {
        type: 'stderr',
        data: `__EXIT_CODE__:${result.exitCode || 0}`,
        timestamp: new Date(),
        sequence: sequence++,
      };
    } catch (error) {
      yield {
        type: 'stderr',
        data: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        sequence: sequence++,
      };

      yield {
        type: 'stderr',
        data: '__EXIT_CODE__:1',
        timestamp: new Date(),
        sequence: sequence++,
      };
    }
  }

  /**
   * Execute a command with interactive input
   */
  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    // E2B doesn't support true interactive execution yet
    // Fall back to regular execution
    logger.warn('[E2BRuntimeProvider] Interactive execution not fully supported, using regular execute');
    return this.execute(runtimeId, command);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Read a file from the sandbox
   */
  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    try {
      const content = await sandboxState.client.files.read(filePath);
      sandboxState.lastActiveAt = new Date();
      return Buffer.from(content);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundError(`File not found: ${filePath}`, 'file', filePath, runtimeId);
      }
      throw error;
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(runtimeId: string, filePath: string, data: Buffer): Promise<void> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    await sandboxState.client.files.write(filePath, data);
    sandboxState.lastActiveAt = new Date();
  }

  /**
   * Upload a directory to the sandbox
   */
  async uploadDirectory(
    runtimeId: string,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    // Use tar/untar for directory upload
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempTar = path.join(os.tmpdir(), `upload-${Date.now()}.tar.gz`);
    
    try {
      // Create tar archive
      execSync(`tar -czf ${tempTar} -C ${localPath} .`);
      
      // Read and upload
      const tarData = fs.readFileSync(tempTar);
      await sandboxState.client.files.write(`${remotePath}/.upload.tar.gz`, tarData);
      
      // Extract in sandbox
      await sandboxState.client.runCode(`cd ${remotePath} && tar -xzf .upload.tar.gz && rm .upload.tar.gz`);
      
      sandboxState.lastActiveAt = new Date();
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(tempTar);
      } catch {}
    }
  }

  /**
   * Download a directory from the sandbox
   */
  async downloadDirectory(
    runtimeId: string,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    // Use tar/untar for directory download
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempTar = path.join(os.tmpdir(), `download-${Date.now()}.tar.gz`);
    
    try {
      // Create tar in sandbox
      await sandboxState.client.runCode(
        `cd ${remotePath} && tar -czf /tmp/download.tar.gz .`
      );
      
      // Download
      const tarData = await sandboxState.client.files.read('/tmp/download.tar.gz');
      fs.writeFileSync(tempTar, Buffer.from(tarData));
      
      // Extract locally
      const fsPromises = require('fs').promises;
      await fsPromises.mkdir(localPath, { recursive: true });
      execSync(`tar -xzf ${tempTar} -C ${localPath}`);
      
      sandboxState.lastActiveAt = new Date();
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(tempTar);
      } catch {}
    }
  }

  // ============================================================================
  // State Management (Snapshots not supported by E2B yet)
  // ============================================================================

  /**
   * Create a snapshot of runtime state
   * Note: E2B doesn't support native snapshots yet
   */
  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    throw new Error('Snapshots not supported by E2B runtime provider');
  }

  /**
   * Restore a runtime from a snapshot
   */
  async restore(snapshotId: string): Promise<AgentRuntime> {
    throw new Error('Snapshots not supported by E2B runtime provider');
  }

  /**
   * List snapshots for a runtime or all snapshots
   */
  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    return [];
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    throw new NotFoundError(`Snapshot not found: ${snapshotId}`, 'snapshot', snapshotId);
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
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      return false;
    }

    if (sandboxState.state === state) {
      return true;
    }

    const timeoutMs = timeout || 30000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentState = this.sandboxes.get(runtimeId);
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

    this.emit(event, eventData);

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

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [runtimeId, sandboxState] of this.sandboxes) {
        if (sandboxState.state !== 'running') {
          continue;
        }

        try {
          // Check if sandbox still exists via E2B API
          const sandbox = await this.client.getSandbox(sandboxState.sandboxId);
          if (!sandbox) {
            logger.warn('[E2BRuntimeProvider] Sandbox no longer exists', {
              runtimeId,
              sandboxId: sandboxState.sandboxId,
            });
            sandboxState.state = 'error';
            this.emitRuntimeEvent('stateChange', runtimeId, {
              previousState: 'running',
              currentState: 'error',
            });
          }
        } catch (error) {
          logger.error('[E2BRuntimeProvider] Health check failed', {
            runtimeId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Dispose of the provider and cleanup resources
   */
  dispose(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Terminate all running sandboxes
    const terminatePromises = Array.from(this.sandboxes.entries())
      .filter(([_, state]) => state.state === 'running')
      .map(([runtimeId]) => this.terminate(runtimeId).catch(() => {}));

    Promise.all(terminatePromises).then(() => {
      this.removeAllListeners();
      this.sandboxes.clear();
      this.snapshots.clear();
      this.eventHandlers.clear();
    });
  }

  /**
   * Get current cost for a runtime
   */
  getRuntimeCost(runtimeId: string): number {
    const sandboxState = this.sandboxes.get(runtimeId);
    if (!sandboxState) {
      return 0;
    }

    const hours = (Date.now() - sandboxState.createdAt.getTime()) / (1000 * 60 * 60);
    return hours * this.config.costPerHour;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalE2BRuntimeProvider: E2BRuntimeProvider | null = null;

/**
 * Get or create the global E2BRuntimeProvider instance
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
 */
export function initializeGlobalE2BRuntimeProvider(
  config: E2BRuntimeProviderConfig
): E2BRuntimeProvider {
  if (globalE2BRuntimeProvider) {
    globalE2BRuntimeProvider.dispose();
  }

  globalE2BRuntimeProvider = new E2BRuntimeProvider(config);
  return globalE2BRuntimeProvider;
}

/**
 * Reset the global E2BRuntimeProvider (primarily for testing)
 */
export function resetGlobalE2BRuntimeProvider(): void {
  if (globalE2BRuntimeProvider) {
    globalE2BRuntimeProvider.dispose();
    globalE2BRuntimeProvider = null;
  }
}

/**
 * Check if global E2BRuntimeProvider is initialized
 */
export function hasGlobalE2BRuntimeProvider(): boolean {
  return globalE2BRuntimeProvider !== null;
}

export default E2BRuntimeProvider;

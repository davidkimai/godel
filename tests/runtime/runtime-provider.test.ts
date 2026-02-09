/**
 * RuntimeProvider Abstraction Layer Tests
 * 
 * Comprehensive test suite for RuntimeProvider interface compliance,
 * mock implementation, and error handling per SPEC-002 Section 7.
 * 
 * @module tests/runtime/runtime-provider
 * @version 1.0.0
 * @since 2026-02-08
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type {
  RuntimeProvider,
  SpawnConfig,
  AgentRuntime,
  RuntimeStatus,
  RuntimeFilters,
  ExecutionOptions,
  ExecutionResult,
  ExecutionOutput,
  Snapshot,
  SnapshotMetadata,
  RuntimeEvent,
  EventHandler,
  EventData,
  RuntimeState,
  RuntimeType,
  ResourceUsage,
  NetworkStats,
  ExecutionMetadata,
  RuntimeMetadata,
} from '../../src/core/runtime/runtime-provider';
import {
  RuntimeError,
  SpawnError,
  ExecutionError,
  ResourceExhaustedError,
  TimeoutError,
  NotFoundError,
  ConfigurationError,
} from '../../src/core/runtime/runtime-provider';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK RUNTIME PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock implementation of RuntimeProvider for testing
 * Simulates all runtime operations with configurable success/failure scenarios
 */
class MockRuntimeProvider implements RuntimeProvider {
  private runtimes: Map<string, AgentRuntime> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private shouldFailSpawn = false;
  private shouldFailExecute = false;
  private shouldTimeout = false;
  private shouldExhaustResources = false;
  private shouldNotFind = false;
  private spawnDelay = 0;
  private resourceIdCounter = 0;

  configure(options: {
    failSpawn?: boolean;
    failExecute?: boolean;
    timeout?: boolean;
    exhaustResources?: boolean;
    notFound?: boolean;
    spawnDelay?: number;
  }): void {
    this.shouldFailSpawn = options.failSpawn ?? false;
    this.shouldFailExecute = options.failExecute ?? false;
    this.shouldTimeout = options.timeout ?? false;
    this.shouldExhaustResources = options.exhaustResources ?? false;
    this.shouldNotFind = options.notFound ?? false;
    this.spawnDelay = options.spawnDelay ?? 0;
  }

  reset(): void {
    this.runtimes.clear();
    this.snapshots.clear();
    this.eventHandlers.clear();
    this.shouldFailSpawn = false;
    this.shouldFailExecute = false;
    this.shouldTimeout = false;
    this.shouldExhaustResources = false;
    this.shouldNotFind = false;
    this.spawnDelay = 0;
    this.resourceIdCounter = 0;
  }

  private generateId(): string {
    return `runtime-${++this.resourceIdCounter}-${Date.now()}`;
  }

  private generateSnapshotId(): string {
    return `snapshot-${++this.resourceIdCounter}-${Date.now()}`;
  }

  private createDefaultResourceUsage(): ResourceUsage {
    return {
      cpu: 0.1,
      memory: 104857600, // 100MB
      disk: 1073741824,  // 1GB
      network: {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0,
      },
    };
  }

  private createDefaultMetadata(runtime: RuntimeType): RuntimeMetadata {
    return {
      type: runtime,
      createdAt: new Date(),
    };
  }

  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    if (this.shouldFailSpawn) {
      throw new SpawnError('Failed to spawn runtime: simulated error', undefined, { config });
    }

    if (this.shouldExhaustResources) {
      throw new ResourceExhaustedError(
        'Resources exhausted: cannot spawn new runtime',
        'memory',
        undefined,
        { requested: config.resources }
      );
    }

    if (this.shouldTimeout) {
      throw new TimeoutError(
        'Spawn operation timed out',
        config.timeout ? config.timeout * 1000 : 30000,
        'spawn',
        undefined,
        { config }
      );
    }

    if (this.spawnDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.spawnDelay));
    }

    const id = this.generateId();
    const now = new Date();
    const runtime: AgentRuntime = {
      id,
      runtime: config.runtime,
      state: 'running',
      resources: this.createDefaultResourceUsage(),
      createdAt: now,
      lastActiveAt: now,
      metadata: this.createDefaultMetadata(config.runtime),
    };

    this.runtimes.set(id, runtime);
    this.emitEvent('stateChange', {
      runtimeId: id,
      timestamp: new Date(),
      previousState: 'pending',
      currentState: 'running',
    });

    return runtime;
  }

  async terminate(runtimeId: string): Promise<void> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (runtime.state === 'terminated') {
      return; // Already terminated, idempotent
    }

    const previousState = runtime.state;
    runtime.state = 'terminated';
    this.emitEvent('stateChange', {
      runtimeId,
      timestamp: new Date(),
      previousState,
      currentState: 'terminated',
    });
  }

  async getStatus(runtimeId: string): Promise<RuntimeStatus> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    return {
      id: runtimeId,
      state: runtime.state,
      resources: runtime.resources,
      health: runtime.state === 'running' ? 'healthy' : runtime.state === 'error' ? 'unhealthy' : 'unknown',
      uptime: Date.now() - runtime.createdAt.getTime(),
    };
  }

  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    let results = Array.from(this.runtimes.values());

    if (filters) {
      if (filters.runtime) {
        results = results.filter(r => r.runtime === filters.runtime);
      }
      if (filters.state) {
        results = results.filter(r => r.state === filters.state);
      }
    }

    return results;
  }

  async execute(runtimeId: string, command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (this.shouldFailExecute) {
      throw new ExecutionError(
        `Command execution failed: ${command}`,
        runtimeId,
        1,
        { command, options }
      );
    }

    if (this.shouldTimeout) {
      throw new TimeoutError(
        'Execution timed out',
        options?.timeout ? options.timeout * 1000 : 30000,
        'execute',
        runtimeId,
        { command }
      );
    }

    runtime.lastActiveAt = new Date();

    const startedAt = new Date();
    const metadata: ExecutionMetadata = {
      command,
      startedAt,
      endedAt: new Date(),
    };

    return {
      exitCode: 0,
      stdout: `Executed: ${command}`,
      stderr: '',
      duration: 100,
      metadata,
    };
  }

  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const chunks: ExecutionOutput[] = [
      { type: 'stdout', data: `Starting: ${command}\n`, timestamp: new Date() },
      { type: 'stdout', data: 'Processing...\n', timestamp: new Date() },
      { type: 'stdout', data: 'Complete\n', timestamp: new Date() },
    ];

    for (const chunk of chunks) {
      yield chunk;
    }

    runtime.lastActiveAt = new Date();
  }

  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const startedAt = new Date();
    const metadata: ExecutionMetadata = {
      command,
      startedAt,
      endedAt: new Date(),
    };

    runtime.lastActiveAt = new Date();

    return {
      exitCode: 0,
      stdout: `Interactive: ${command}`,
      stderr: '',
      duration: 150,
      metadata,
    };
  }

  async readFile(runtimeId: string, path: string): Promise<Buffer> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (this.shouldFailExecute) {
      throw new NotFoundError(
        `File '${path}' not found`,
        'file',
        path,
        runtimeId
      );
    }

    return Buffer.from(`Contents of ${path}`);
  }

  async writeFile(runtimeId: string, path: string, data: Buffer): Promise<void> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (this.shouldExhaustResources) {
      throw new ResourceExhaustedError(
        'Disk space exhausted',
        'disk',
        runtimeId,
        { path, size: data.length }
      );
    }

    runtime.lastActiveAt = new Date();
  }

  async uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    runtime.lastActiveAt = new Date();
  }

  async downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    runtime.lastActiveAt = new Date();
  }

  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (this.shouldExhaustResources) {
      throw new ResourceExhaustedError(
        'Storage exhausted: cannot create snapshot',
        'disk',
        runtimeId
      );
    }

    const snapshotId = this.generateSnapshotId();
    const snapshot: Snapshot = {
      id: snapshotId,
      runtimeId,
      createdAt: new Date(),
      size: 1073741824, // 1GB
      metadata: metadata ?? {},
    };

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  async restore(snapshotId: string): Promise<AgentRuntime> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }

    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }

    if (this.shouldFailSpawn) {
      throw new SpawnError(`Failed to restore from snapshot '${snapshotId}'`);
    }

    const id = this.generateId();
    const now = new Date();
    const runtime: AgentRuntime = {
      id,
      runtime: 'kata',
      state: 'running',
      resources: this.createDefaultResourceUsage(),
      createdAt: now,
      lastActiveAt: now,
      metadata: {
        type: 'kata',
        restoredFrom: snapshotId,
      },
    };

    this.runtimes.set(id, runtime);
    return runtime;
  }

  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    const snapshots = Array.from(this.snapshots.values());
    if (runtimeId) {
      return snapshots.filter(s => s.runtimeId === runtimeId);
    }
    return snapshots;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }

    if (!this.snapshots.has(snapshotId)) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }

    this.snapshots.delete(snapshotId);
  }

  on(event: RuntimeEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: RuntimeEvent, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emitEvent(event: RuntimeEvent, data: EventData): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event, data);
        } catch (error) {
          // Ignore handler errors in mock
        }
      });
    }
  }

  async waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean> {
    if (this.shouldNotFind) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (this.shouldTimeout) {
      return false;
    }

    // In mock, immediately return true if state matches
    return runtime.state === state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('RuntimeProvider Interface', () => {
  let provider: MockRuntimeProvider;

  beforeEach(() => {
    provider = new MockRuntimeProvider();
  });

  afterEach(() => {
    provider.reset();
  });

  // ============================================================================
  // INTERFACE COMPLIANCE TESTS
  // ============================================================================

  describe('Interface Compliance', () => {
    it('should have all required methods', () => {
      expect(typeof provider.spawn).toBe('function');
      expect(typeof provider.terminate).toBe('function');
      expect(typeof provider.getStatus).toBe('function');
      expect(typeof provider.listRuntimes).toBe('function');
      expect(typeof provider.execute).toBe('function');
      expect(typeof provider.executeStream).toBe('function');
      expect(typeof provider.executeInteractive).toBe('function');
      expect(typeof provider.readFile).toBe('function');
      expect(typeof provider.writeFile).toBe('function');
      expect(typeof provider.uploadDirectory).toBe('function');
      expect(typeof provider.downloadDirectory).toBe('function');
      expect(typeof provider.snapshot).toBe('function');
      expect(typeof provider.restore).toBe('function');
      expect(typeof provider.listSnapshots).toBe('function');
      expect(typeof provider.deleteSnapshot).toBe('function');
      expect(typeof provider.on).toBe('function');
      expect(typeof provider.waitForState).toBe('function');
    });

    it('should return Promise from async methods', async () => {
      const config: SpawnConfig = {
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const spawnResult = provider.spawn(config);
      expect(spawnResult).toBeInstanceOf(Promise);

      const runtime = await spawnResult;
      
      const statusResult = provider.getStatus(runtime.id);
      expect(statusResult).toBeInstanceOf(Promise);

      const listResult = provider.listRuntimes();
      expect(listResult).toBeInstanceOf(Promise);
    });

    it('should return AsyncIterable from executeStream', async () => {
      const config: SpawnConfig = {
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const stream = provider.executeStream(runtime.id, 'echo test');
      
      expect(stream).toBeDefined();
      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });
  });

  // ============================================================================
  // SPAWN TESTS
  // ============================================================================

  describe('spawn()', () => {
    const baseConfig: SpawnConfig = {
      runtime: 'worktree',
      resources: { cpu: 1, memory: '512Mi' },
    };

    it('should successfully spawn a runtime', async () => {
      const runtime = await provider.spawn(baseConfig);

      expect(runtime).toBeDefined();
      expect(runtime.id).toBeDefined();
      expect(runtime.runtime).toBe('worktree');
      expect(runtime.state).toBe('running');
      expect(runtime.createdAt).toBeInstanceOf(Date);
      expect(runtime.lastActiveAt).toBeInstanceOf(Date);
      expect(runtime.resources).toBeDefined();
      expect(runtime.metadata).toBeDefined();
    });

    it('should spawn with different runtime types', async () => {
      const types: RuntimeType[] = ['worktree', 'kata', 'e2b'];

      for (const type of types) {
        const runtime = await provider.spawn({
          ...baseConfig,
          runtime: type,
        });

        expect(runtime.runtime).toBe(type);
      }
    });

    it('should spawn with resource limits', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: {
          cpu: 2,
          memory: '2Gi',
          disk: '10Gi',
          agents: 5,
        },
      };

      const runtime = await provider.spawn(config);
      expect(runtime.resources.cpu).toBeGreaterThanOrEqual(0);
      expect(runtime.resources.memory).toBeGreaterThanOrEqual(0);
    });

    it('should spawn with network configuration', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        network: {
          mode: 'bridge',
          dns: ['8.8.8.8'],
        },
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
    });

    it('should spawn with volume mounts', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        volumes: [
          {
            name: 'context',
            source: '/host/path',
            destination: '/container/path',
            readOnly: false,
          },
        ],
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
    });

    it('should spawn with environment variables', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        env: {
          NODE_ENV: 'test',
          API_KEY: 'secret',
        },
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
    });

    it('should spawn with labels', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        labels: {
          team: 'engineering',
          project: 'godel',
        },
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
    });

    it('should throw SpawnError when spawn fails', async () => {
      provider.configure({ failSpawn: true });

      await expect(provider.spawn(baseConfig)).rejects.toThrow(SpawnError);
      await expect(provider.spawn(baseConfig)).rejects.toThrow('Failed to spawn runtime');
    });

    it('should throw ResourceExhaustedError when resources unavailable', async () => {
      provider.configure({ exhaustResources: true });

      await expect(provider.spawn(baseConfig)).rejects.toThrow(ResourceExhaustedError);
      await expect(provider.spawn(baseConfig)).rejects.toThrow('Resources exhausted');
    });

    it('should throw TimeoutError when spawn times out', async () => {
      provider.configure({ timeout: true });

      await expect(provider.spawn({ ...baseConfig, timeout: 5 })).rejects.toThrow(TimeoutError);
      await expect(provider.spawn({ ...baseConfig, timeout: 5 })).rejects.toThrow('timed out');
    });

    it('should handle spawn delay correctly', async () => {
      provider.configure({ spawnDelay: 50 });

      const startTime = Date.now();
      const runtime = await provider.spawn(baseConfig);
      const endTime = Date.now();

      expect(runtime).toBeDefined();
      expect(endTime - startTime).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });

  // ============================================================================
  // TERMINATE TESTS
  // ============================================================================

  describe('terminate()', () => {
    it('should successfully terminate a running runtime', async () => {
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      await provider.terminate(runtime.id);

      const status = await provider.getStatus(runtime.id);
      expect(status.state).toBe('terminated');
    });

    it('should be idempotent for already terminated runtimes', async () => {
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      await provider.terminate(runtime.id);
      await expect(provider.terminate(runtime.id)).resolves.not.toThrow();
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.terminate('non-existent')).rejects.toThrow(NotFoundError);
      await expect(provider.terminate('non-existent')).rejects.toThrow('not found');
    });
  });

  // ============================================================================
  // GET STATUS TESTS
  // ============================================================================

  describe('getStatus()', () => {
    it('should return status for running runtime', async () => {
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      const status = await provider.getStatus(runtime.id);

      expect(status).toBeDefined();
      expect(status.id).toBe(runtime.id);
      expect(status.state).toBe('running');
      expect(status.health).toBe('healthy');
      expect(status.resources).toBeDefined();
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return status for terminated runtime', async () => {
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      await provider.terminate(runtime.id);
      const status = await provider.getStatus(runtime.id);

      expect(status.state).toBe('terminated');
      expect(status.health).toBe('unknown');
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.getStatus('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // LIST RUNTIMES TESTS
  // ============================================================================

  describe('listRuntimes()', () => {
    it('should return empty array when no runtimes', async () => {
      const runtimes = await provider.listRuntimes();
      expect(runtimes).toEqual([]);
    });

    it('should return all runtimes', async () => {
      await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });
      await provider.spawn({ runtime: 'e2b', resources: { cpu: 1, memory: '512Mi' } });

      const runtimes = await provider.listRuntimes();
      expect(runtimes).toHaveLength(3);
    });

    it('should filter by runtime type', async () => {
      await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });
      await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });

      const kataRuntimes = await provider.listRuntimes({ runtime: 'kata' });
      expect(kataRuntimes).toHaveLength(2);
      expect(kataRuntimes.every(r => r.runtime === 'kata')).toBe(true);
    });

    it('should filter by state', async () => {
      const runtime1 = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      await provider.terminate(runtime1.id);

      const terminatedRuntimes = await provider.listRuntimes({ state: 'terminated' });
      expect(terminatedRuntimes).toHaveLength(1);
      expect(terminatedRuntimes[0].state).toBe('terminated');
    });
  });

  // ============================================================================
  // EXECUTE TESTS
  // ============================================================================

  describe('execute()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should successfully execute a command', async () => {
      const result = await provider.execute(runtime.id, 'echo hello');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Executed: echo hello');
      expect(result.stderr).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
    });

    it('should execute with options', async () => {
      const options: ExecutionOptions = {
        timeout: 30,
        env: { KEY: 'value' },
        cwd: '/tmp',
        user: 'testuser',
      };

      const result = await provider.execute(runtime.id, 'echo test', options);

      expect(result.exitCode).toBe(0);
      expect(result.metadata.command).toBe('echo test');
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.execute('non-existent', 'echo test')).rejects.toThrow(NotFoundError);
    });

    it('should throw ExecutionError when execution fails', async () => {
      provider.configure({ failExecute: true });

      await expect(provider.execute(runtime.id, 'failing-command')).rejects.toThrow(ExecutionError);
      await expect(provider.execute(runtime.id, 'failing-command')).rejects.toThrow('execution failed');
    });

    it('should throw TimeoutError when execution times out', async () => {
      provider.configure({ timeout: true });

      await expect(provider.execute(runtime.id, 'slow-command', { timeout: 1 })).rejects.toThrow(TimeoutError);
    });

    it('should update lastActiveAt on execution', async () => {
      const beforeExecute = runtime.lastActiveAt;
      await provider.execute(runtime.id, 'echo test');
      const afterExecute = runtime.lastActiveAt;

      expect(afterExecute.getTime()).toBeGreaterThanOrEqual(beforeExecute.getTime());
    });
  });

  // ============================================================================
  // EXECUTE STREAM TESTS
  // ============================================================================

  describe('executeStream()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should stream execution output', async () => {
      const outputs: ExecutionOutput[] = [];

      for await (const output of provider.executeStream(runtime.id, 'echo test')) {
        outputs.push(output);
      }

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs[0].type).toBe('stdout');
      expect(outputs[0].data).toContain('Starting: echo test');
      expect(outputs[0].timestamp).toBeInstanceOf(Date);
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      const stream = provider.executeStream('non-existent', 'echo test');
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // Consume stream
        }
      }).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // EXECUTE INTERACTIVE TESTS
  // ============================================================================

  describe('executeInteractive()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should execute interactive command', async () => {
      const stdin = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('input data'));
          controller.close();
        },
      });

      const result = await provider.executeInteractive(runtime.id, 'cat', stdin);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Interactive: cat');
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      const stdin = new ReadableStream();
      await expect(provider.executeInteractive('non-existent', 'cat', stdin)).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // FILE OPERATIONS TESTS
  // ============================================================================

  describe('readFile()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should read a file', async () => {
      const content = await provider.readFile(runtime.id, '/path/to/file.txt');

      expect(content).toBeInstanceOf(Buffer);
      expect(content.toString()).toContain('Contents of /path/to/file.txt');
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.readFile('non-existent', '/path/to/file.txt')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when file not found', async () => {
      provider.configure({ failExecute: true });

      await expect(provider.readFile(runtime.id, '/non-existent/file.txt')).rejects.toThrow(NotFoundError);
      await expect(provider.readFile(runtime.id, '/non-existent/file.txt')).rejects.toThrow('File');
    });
  });

  describe('writeFile()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should write a file', async () => {
      const data = Buffer.from('Hello, World!');
      await expect(provider.writeFile(runtime.id, '/path/to/file.txt', data)).resolves.not.toThrow();
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.writeFile('non-existent', '/path.txt', Buffer.from('data'))).rejects.toThrow(NotFoundError);
    });

    it('should throw ResourceExhaustedError when disk exhausted', async () => {
      provider.configure({ exhaustResources: true });

      await expect(provider.writeFile(runtime.id, '/path.txt', Buffer.from('data'))).rejects.toThrow(ResourceExhaustedError);
      await expect(provider.writeFile(runtime.id, '/path.txt', Buffer.from('data'))).rejects.toThrow('Disk space');
    });
  });

  describe('uploadDirectory()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should upload a directory', async () => {
      await expect(provider.uploadDirectory(runtime.id, '/local/path', '/remote/path')).resolves.not.toThrow();
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.uploadDirectory('non-existent', '/local', '/remote')).rejects.toThrow(NotFoundError);
    });
  });

  describe('downloadDirectory()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should download a directory', async () => {
      await expect(provider.downloadDirectory(runtime.id, '/remote/path', '/local/path')).resolves.not.toThrow();
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.downloadDirectory('non-existent', '/remote', '/local')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // SNAPSHOT TESTS
  // ============================================================================

  describe('snapshot()', () => {
    let runtime: AgentRuntime;

    beforeEach(async () => {
      runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
    });

    it('should create a snapshot', async () => {
      const snapshot = await provider.snapshot(runtime.id);

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.runtimeId).toBe(runtime.id);
      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.size).toBeGreaterThan(0);
    });

    it('should create snapshot with metadata', async () => {
      const metadata: SnapshotMetadata = {
        name: 'test-snapshot',
        description: 'Test snapshot description',
        labels: { env: 'test' },
      };

      const snapshot = await provider.snapshot(runtime.id, metadata);

      expect(snapshot.metadata.name).toBe('test-snapshot');
      expect(snapshot.metadata.description).toBe('Test snapshot description');
      expect(snapshot.metadata.labels).toEqual({ env: 'test' });
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.snapshot('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ResourceExhaustedError when storage exhausted', async () => {
      provider.configure({ exhaustResources: true });

      await expect(provider.snapshot(runtime.id)).rejects.toThrow(ResourceExhaustedError);
    });
  });

  describe('restore()', () => {
    it('should restore from snapshot', async () => {
      const runtime = await provider.spawn({
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      });

      const snapshot = await provider.snapshot(runtime.id, { name: 'test' });
      const restoredRuntime = await provider.restore(snapshot.id);

      expect(restoredRuntime).toBeDefined();
      expect(restoredRuntime.id).not.toBe(runtime.id);
      expect(restoredRuntime.state).toBe('running');
      expect(restoredRuntime.metadata.restoredFrom).toBe(snapshot.id);
    });

    it('should throw NotFoundError when snapshot not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.restore('non-existent')).rejects.toThrow(NotFoundError);
      await expect(provider.restore('non-existent')).rejects.toThrow('Snapshot');
    });

    it('should throw SpawnError when restore fails', async () => {
      const runtime = await provider.spawn({
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      });

      const snapshot = await provider.snapshot(runtime.id);
      provider.configure({ failSpawn: true });

      await expect(provider.restore(snapshot.id)).rejects.toThrow(SpawnError);
    });
  });

  describe('listSnapshots()', () => {
    it('should return empty array when no snapshots', async () => {
      const snapshots = await provider.listSnapshots();
      expect(snapshots).toEqual([]);
    });

    it('should return all snapshots', async () => {
      const runtime1 = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      const runtime2 = await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });

      await provider.snapshot(runtime1.id);
      await provider.snapshot(runtime1.id);
      await provider.snapshot(runtime2.id);

      const snapshots = await provider.listSnapshots();
      expect(snapshots).toHaveLength(3);
    });

    it('should filter by runtimeId', async () => {
      const runtime1 = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      const runtime2 = await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });

      await provider.snapshot(runtime1.id);
      await provider.snapshot(runtime2.id);

      const snapshots = await provider.listSnapshots(runtime1.id);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].runtimeId).toBe(runtime1.id);
    });
  });

  describe('deleteSnapshot()', () => {
    it('should delete a snapshot', async () => {
      const runtime = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      const snapshot = await provider.snapshot(runtime.id);

      await provider.deleteSnapshot(snapshot.id);

      const snapshots = await provider.listSnapshots();
      expect(snapshots).toHaveLength(0);
    });

    it('should throw NotFoundError when snapshot not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.deleteSnapshot('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // EVENT TESTS
  // ============================================================================

  describe('on()', () => {
    it('should subscribe to events', () => {
      const handler: EventHandler = jest.fn();
      
      provider.on('stateChange', handler);
      // Should not throw
    });

    it('should allow multiple handlers for same event', () => {
      const handler1: EventHandler = jest.fn();
      const handler2: EventHandler = jest.fn();

      provider.on('stateChange', handler1);
      provider.on('stateChange', handler2);
      // Should not throw
    });

    it('should allow handlers for different events', () => {
      const stateHandler: EventHandler = jest.fn();
      const errorHandler: EventHandler = jest.fn();

      provider.on('stateChange', stateHandler);
      provider.on('error', errorHandler);
      // Should not throw
    });
  });

  describe('event emission', () => {
    it('should emit stateChange event on spawn', async () => {
      const handler = jest.fn();
      provider.on('stateChange', handler);

      await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });

      expect(handler).toHaveBeenCalled();
      const [, data] = handler.mock.calls[0];
      expect(data.previousState).toBe('pending');
      expect(data.currentState).toBe('running');
    });

    it('should emit stateChange event on terminate', async () => {
      const handler = jest.fn();
      provider.on('stateChange', handler);

      const runtime = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      handler.mockClear();

      await provider.terminate(runtime.id);

      expect(handler).toHaveBeenCalled();
      const [, data] = handler.mock.calls[0];
      expect(data.previousState).toBe('running');
      expect(data.currentState).toBe('terminated');
    });
  });

  describe('waitForState()', () => {
    it('should return true when runtime is in expected state', async () => {
      const runtime = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });

      const result = await provider.waitForState(runtime.id, 'running');

      expect(result).toBe(true);
    });

    it('should return false when runtime is not in expected state', async () => {
      const runtime = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });

      const result = await provider.waitForState(runtime.id, 'terminated');

      expect(result).toBe(false);
    });

    it('should throw NotFoundError when runtime not found', async () => {
      provider.configure({ notFound: true });

      await expect(provider.waitForState('non-existent', 'running')).rejects.toThrow(NotFoundError);
    });

    it('should return false when timeout is reached', async () => {
      const runtime = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
      // Simulate timeout by requesting a state the runtime will never reach without transition
      provider.configure({ timeout: true });
      
      // Request a different state to trigger the timeout path
      const result = await provider.waitForState(runtime.id, 'paused', 1000);

      expect(result).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime Error Classes', () => {
  describe('RuntimeError (base)', () => {
    it('should have correct structure', () => {
      // RuntimeError is abstract, test through concrete implementations
      const error = new SpawnError('test message', 'runtime-123', { key: 'value' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RuntimeError);
      expect(error.message).toBe('test message');
      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ key: 'value' });
      expect(error.name).toBe('SpawnError');
    });
  });

  describe('SpawnError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new SpawnError('spawn failed');

      expect(error.code).toBe('SPAWN_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('should accept runtimeId and context', () => {
      const error = new SpawnError('spawn failed', 'runtime-123', { image: 'test' });

      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ image: 'test' });
    });
  });

  describe('ExecutionError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new ExecutionError('execution failed');

      expect(error.code).toBe('EXECUTION_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('should accept exitCode', () => {
      const error = new ExecutionError('execution failed', 'runtime-123', 1);

      expect(error.exitCode).toBe(1);
      expect(error.runtimeId).toBe('runtime-123');
    });
  });

  describe('ResourceExhaustedError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new ResourceExhaustedError('out of memory', 'memory');

      expect(error.code).toBe('RESOURCE_EXHAUSTED');
      expect(error.retryable).toBe(true);
      expect(error.resourceType).toBe('memory');
    });

    it('should accept all resource types', () => {
      const types: Array<'cpu' | 'memory' | 'disk' | 'agents' | 'network'> = [
        'cpu', 'memory', 'disk', 'agents', 'network'
      ];

      for (const type of types) {
        const error = new ResourceExhaustedError(`out of ${type}`, type);
        expect(error.resourceType).toBe(type);
      }
    });

    it('should accept runtimeId and context', () => {
      const error = new ResourceExhaustedError('out of disk', 'disk', 'runtime-123', { size: 1000 });

      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ size: 1000 });
    });
  });

  describe('TimeoutError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new TimeoutError('operation timed out', 30000, 'spawn');

      expect(error.code).toBe('TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.timeout).toBe(30000);
      expect(error.operation).toBe('spawn');
    });

    it('should accept runtimeId and context', () => {
      const error = new TimeoutError('timeout', 5000, 'execute', 'runtime-123', { command: 'test' });

      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ command: 'test' });
    });
  });

  describe('NotFoundError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new NotFoundError('runtime not found', 'runtime', 'runtime-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.retryable).toBe(false);
      expect(error.resourceType).toBe('runtime');
      expect(error.resourceId).toBe('runtime-123');
    });

    it('should accept all resource types', () => {
      const types: Array<'runtime' | 'snapshot' | 'file' | 'directory'> = [
        'runtime', 'snapshot', 'file', 'directory'
      ];

      for (const type of types) {
        const error = new NotFoundError('not found', type, 'id-123');
        expect(error.resourceType).toBe(type);
        expect(error.resourceId).toBe('id-123');
      }
    });

    it('should accept runtimeId and context', () => {
      const error = new NotFoundError('file not found', 'file', '/path/file', 'runtime-123', { path: '/path' });

      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ path: '/path' });
    });
  });

  describe('ConfigurationError', () => {
    it('should have correct code and retryable flag', () => {
      const error = new ConfigurationError('invalid config');

      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('should accept configKey, runtimeId and context', () => {
      const error = new ConfigurationError(
        'Missing required field',
        'resources.cpu',
        'runtime-123',
        { field: 'cpu' }
      );

      expect(error.configKey).toBe('resources.cpu');
      expect(error.runtimeId).toBe('runtime-123');
      expect(error.context).toEqual({ field: 'cpu' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Type Definitions', () => {
  it('should have correct RuntimeType values', () => {
    const validTypes: RuntimeType[] = ['worktree', 'kata', 'e2b'];
    expect(validTypes).toContain('worktree');
    expect(validTypes).toContain('kata');
    expect(validTypes).toContain('e2b');
  });

  it('should have correct RuntimeState values', () => {
    const validStates: RuntimeState[] = [
      'pending', 'creating', 'running', 'paused', 'terminating', 'terminated', 'error'
    ];
    expect(validStates).toHaveLength(7);
    expect(validStates).toContain('running');
    expect(validStates).toContain('terminated');
  });

  it('should have correct RuntimeEvent values', () => {
    const validEvents: RuntimeEvent[] = [
      'stateChange', 'error', 'resourceWarning', 'healthCheck'
    ];
    expect(validEvents).toHaveLength(4);
    expect(validEvents).toContain('stateChange');
    expect(validEvents).toContain('error');
  });

  it('should create valid SpawnConfig', () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: {
        cpu: 2,
        memory: '2Gi',
        disk: '10Gi',
      },
      network: {
        mode: 'bridge',
        dns: ['8.8.8.8'],
      },
      volumes: [
        {
          name: 'data',
          source: '/host/data',
          destination: '/data',
          readOnly: false,
        },
      ],
      env: {
        KEY: 'value',
      },
      labels: {
        team: 'eng',
      },
      timeout: 300,
    };

    expect(config.runtime).toBe('kata');
    expect(config.resources.cpu).toBe(2);
    expect(config.resources.memory).toBe('2Gi');
  });

  it('should create valid AgentRuntime', () => {
    const runtime: AgentRuntime = {
      id: 'runtime-123',
      runtime: 'kata',
      state: 'running',
      resources: {
        cpu: 1,
        memory: 536870912,
        disk: 1073741824,
        network: {
          rxBytes: 1024,
          txBytes: 2048,
          rxPackets: 10,
          txPackets: 20,
        },
      },
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: {
        type: 'kata',
        createdAt: new Date(),
      },
    };

    expect(runtime.id).toBe('runtime-123');
    expect(runtime.state).toBe('running');
  });

  it('should create valid ExecutionResult', () => {
    const result: ExecutionResult = {
      exitCode: 0,
      stdout: 'output',
      stderr: '',
      duration: 100,
      metadata: {
        command: 'echo test',
        startedAt: new Date(),
        endedAt: new Date(),
      },
    };

    expect(result.exitCode).toBe(0);
    expect(result.duration).toBe(100);
  });

  it('should create valid Snapshot', () => {
    const snapshot: Snapshot = {
      id: 'snapshot-123',
      runtimeId: 'runtime-123',
      createdAt: new Date(),
      size: 1073741824,
      metadata: {
        name: 'test-snapshot',
        description: 'Test',
      },
    };

    expect(snapshot.size).toBe(1073741824);
    expect(snapshot.metadata.name).toBe('test-snapshot');
  });

  it('should verify all re-exports are defined', () => {
    // This test ensures the re-exports are covered
    expect(SpawnError).toBeDefined();
    expect(ExecutionError).toBeDefined();
    expect(ResourceExhaustedError).toBeDefined();
    expect(TimeoutError).toBeDefined();
    expect(NotFoundError).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('RuntimeProvider Integration', () => {
  let provider: MockRuntimeProvider;

  beforeEach(() => {
    provider = new MockRuntimeProvider();
  });

  afterEach(() => {
    provider.reset();
  });

  it('should complete full lifecycle: spawn → execute → snapshot → terminate', async () => {
    // Spawn
    const runtime = await provider.spawn({
      runtime: 'kata',
      resources: { cpu: 1, memory: '1Gi' },
    });
    expect(runtime.state).toBe('running');

    // Execute
    const result = await provider.execute(runtime.id, 'echo hello');
    expect(result.exitCode).toBe(0);

    // Snapshot
    const snapshot = await provider.snapshot(runtime.id, { name: 'pre-terminate' });
    expect(snapshot.runtimeId).toBe(runtime.id);

    // Terminate
    await provider.terminate(runtime.id);
    const status = await provider.getStatus(runtime.id);
    expect(status.state).toBe('terminated');
  });

  it('should restore from snapshot and continue execution', async () => {
    // Create and snapshot
    const original = await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '1Gi' } });
    const snapshot = await provider.snapshot(original.id);

    // Restore
    const restored = await provider.restore(snapshot.id);
    expect(restored.state).toBe('running');

    // Execute on restored
    const result = await provider.execute(restored.id, 'echo restored');
    expect(result.exitCode).toBe(0);
  });

  it('should handle multiple concurrent runtimes', async () => {
    const runtimes = await Promise.all([
      provider.spawn({ runtime: 'worktree', resources: { cpu: 0.5, memory: '256Mi' } }),
      provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } }),
      provider.spawn({ runtime: 'e2b', resources: { cpu: 2, memory: '1Gi' } }),
    ]);

    expect(runtimes).toHaveLength(3);
    expect(runtimes.map(r => r.runtime)).toEqual(['worktree', 'kata', 'e2b']);

    // Execute on all concurrently
    const results = await Promise.all(
      runtimes.map(r => provider.execute(r.id, 'echo test'))
    );

    expect(results.every(r => r.exitCode === 0)).toBe(true);
  });

  it('should filter runtimes correctly', async () => {
    await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });
    await provider.spawn({ runtime: 'kata', resources: { cpu: 1, memory: '512Mi' } });
    const toTerminate = await provider.spawn({ runtime: 'worktree', resources: { cpu: 1, memory: '512Mi' } });
    await provider.terminate(toTerminate.id);

    const kataRuntimes = await provider.listRuntimes({ runtime: 'kata' });
    const terminatedRuntimes = await provider.listRuntimes({ state: 'terminated' });

    expect(kataRuntimes).toHaveLength(2);
    expect(terminatedRuntimes).toHaveLength(1);
  });
});

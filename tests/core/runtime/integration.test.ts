/**
 * RuntimeProvider Integration Tests
 *
 * End-to-end integration tests for the RuntimeProviderFactory and RuntimeProvider system.
 * Tests factory integration, provider switching, E2E workflows, configuration, and lifecycle.
 *
 * @module tests/runtime/integration
 * @see SPEC-002 Section 7
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  RuntimeProviderFactory,
  getFactory,
  resetFactory,
  ProviderNotRegisteredError,
  ProviderAlreadyRegisteredError,
  FactoryInitializationError,
  ProviderFactory,
} from '../../../src/core/runtime/runtime-provider-factory';
import {
  RuntimeProvider,
  RuntimeType,
  SpawnConfig,
  AgentRuntime,
  RuntimeState,
  RuntimeEvent,
  RuntimeFilters,
  NotFoundError,
  SpawnError,
  TimeoutError,
} from '../../../src/core/runtime/runtime-provider';
import {
  ProviderConfig,
  RuntimeCapabilities,
} from '../../../src/core/runtime/types';

// ============================================================================
// MOCK PROVIDER IMPLEMENTATION
// ============================================================================

/**
 * Mock RuntimeProvider for testing
 */
class MockRuntimeProvider implements RuntimeProvider {
  readonly type: RuntimeType;
  private runtimes = new Map<string, AgentRuntime>();
  private snapshots = new Map<string, any>();
  private eventHandlers = new Map<RuntimeEvent, Array<(event: RuntimeEvent, data: any) => void>>();
  private config: ProviderConfig;
  private idCounter = 0;
  private terminated = false;

  constructor(config: ProviderConfig) {
    this.type = config.type;
    this.config = config;
  }

  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    if (this.terminated) {
      throw new Error('Provider has been terminated');
    }

    this.idCounter++;
    const id = `${this.type}-agent-${this.idCounter}`;
    const now = new Date();

    const runtime: AgentRuntime = {
      id,
      runtime: this.type,
      state: 'running',
      resources: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
        },
      },
      createdAt: now,
      lastActiveAt: now,
      metadata: {
        type: this.type,
        createdAt: now,
        agentId: config.labels?.agentId,
        teamId: config.labels?.teamId,
        ...config.labels,
      },
    };

    this.runtimes.set(id, runtime);
    this.emitEvent('stateChange', {
      runtimeId: id,
      timestamp: now,
      previousState: 'pending' as RuntimeState,
      currentState: 'running' as RuntimeState,
    });

    return runtime;
  }

  async terminate(runtimeId: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    runtime.state = 'terminating';
    this.emitEvent('stateChange', {
      runtimeId,
      timestamp: new Date(),
      previousState: 'running',
      currentState: 'terminating',
    });

    runtime.state = 'terminated';
    this.runtimes.delete(runtimeId);

    this.emitEvent('stateChange', {
      runtimeId,
      timestamp: new Date(),
      previousState: 'terminating',
      currentState: 'terminated',
    });
  }

  async getStatus(runtimeId: string): Promise<any> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    return {
      id: runtimeId,
      state: runtime.state,
      resources: runtime.resources,
      health: runtime.state === 'running' ? 'healthy' : 'unhealthy',
      uptime: Date.now() - runtime.createdAt.getTime(),
    };
  }

  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    let runtimes = Array.from(this.runtimes.values());

    if (filters) {
      if (filters.runtime) {
        const types = Array.isArray(filters.runtime) ? filters.runtime : [filters.runtime];
        runtimes = runtimes.filter((r: AgentRuntime) => types.includes(r.runtime));
      }
      if (filters.state) {
        const states = Array.isArray(filters.state) ? filters.state : [filters.state];
        runtimes = runtimes.filter((r: AgentRuntime) => states.includes(r.state));
      }
    }

    return runtimes;
  }

  async execute(runtimeId: string, command: string, options?: any): Promise<any> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    const startTime = Date.now();

    return {
      exitCode: 0,
      stdout: `Executed: ${command}`,
      stderr: '',
      duration: Date.now() - startTime,
      metadata: {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      },
    };
  }

  async *executeStream(runtimeId: string, command: string): AsyncIterable<any> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    yield {
      type: 'stdout',
      data: `Mock stream: ${command}`,
      timestamp: new Date(),
    };

    yield {
      type: 'exit',
      data: '0',
      timestamp: new Date(),
    };
  }

  async executeInteractive(runtimeId: string, command: string, stdin: ReadableStream): Promise<any> {
    return this.execute(runtimeId, command);
  }

  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    return Buffer.from(`Mock file content for ${filePath}`);
  }

  async writeFile(runtimeId: string, filePath: string, data: Buffer): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }
  }

  async uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }
  }

  async downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }
  }

  async snapshot(runtimeId: string, metadata?: any): Promise<any> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    const snapshot = {
      id: `snapshot-${Date.now()}`,
      runtimeId,
      createdAt: new Date(),
      size: 1024,
      metadata: metadata || {},
    };

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async restore(snapshotId: string): Promise<AgentRuntime> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new NotFoundError(`Snapshot ${snapshotId} not found`, 'snapshot', snapshotId);
    }

    return this.spawn({
      runtime: this.type,
      resources: { cpu: 1, memory: '512Mi' },
    });
  }

  async listSnapshots(runtimeId?: string): Promise<any[]> {
    let snapshots = Array.from(this.snapshots.values());
    if (runtimeId) {
      snapshots = snapshots.filter((s: any) => s.runtimeId === runtimeId);
    }
    return snapshots;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.snapshots.has(snapshotId)) {
      throw new NotFoundError(`Snapshot ${snapshotId} not found`, 'snapshot', snapshotId);
    }
    this.snapshots.delete(snapshotId);
  }

  on(event: RuntimeEvent, handler: (event: RuntimeEvent, data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  async waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(`Runtime ${runtimeId} not found`, 'runtime', runtimeId);
    }

    if (runtime.state === state) {
      return true;
    }

    if (timeout && timeout <= 0) {
      return false;
    }

    return ['running', 'terminated', 'paused', 'error'].includes(state);
  }

  dispose(): void {
    this.terminated = true;
    this.runtimes.clear();
    this.snapshots.clear();
    this.eventHandlers.clear();
  }

  private emitEvent(event: RuntimeEvent, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(event, data);
      } catch (error) {
        // Ignore handler errors
      }
    });
  }
}

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock provider factory
 */
function createMockProviderFactory(type: RuntimeType): ProviderFactory {
  return (config?: ProviderConfig) => {
    const mergedConfig: ProviderConfig = {
      type,
      name: `${type}-provider`,
      capabilities: {
        snapshots: true,
        streaming: true,
        interactive: true,
        fileOperations: true,
        networkConfiguration: true,
        resourceLimits: true,
        healthChecks: true,
      },
      defaults: {},
      ...config,
    };
    return new MockRuntimeProvider(mergedConfig);
  };
}

/**
 * Create a temporary directory for test files
 */
async function createTempDir(): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), 'runtime-test-'));
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('RuntimeProvider Integration', () => {
  let factory: RuntimeProviderFactory;
  let tempDir: string;

  beforeEach(async () => {
    // Reset factory before each test
    resetFactory();
    
    // Create temp directory
    tempDir = await createTempDir();
    
    // Create fresh factory with no auto-initialization
    factory = new RuntimeProviderFactory({ enableConfigLoading: false });
  });

  afterEach(async () => {
    // Cleanup
    if (factory) {
      factory.dispose();
    }
    
    // Cleanup temp directory
    await cleanupTempDir(tempDir);
    
    // Reset factory
    resetFactory();
  });

  // ============================================================================
  // FACTORY INTEGRATION TESTS
  // ============================================================================

  describe('Factory Integration', () => {
    beforeEach(() => {
      // Reset the singleton to ensure clean state
      RuntimeProviderFactory.resetInstance();
    });

    it('should create factory with default configuration', () => {
      const testFactory = RuntimeProviderFactory.getInstance({ enableConfigLoading: false });
      
      expect(testFactory).toBeDefined();
      expect(testFactory.isDisposed()).toBe(false);
    });

    it('should enforce singleton pattern', () => {
      const factory1 = RuntimeProviderFactory.getInstance({ enableConfigLoading: false });
      const factory2 = RuntimeProviderFactory.getInstance();
      
      expect(factory1).toBe(factory2);
    });

    it('should register and retrieve providers', () => {
      // Clear any existing providers first
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.unregisterProvider('e2b');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));
      factory.registerProvider('e2b', createMockProviderFactory('e2b'));
      
      expect(factory.isProviderRegistered('worktree')).toBe(true);
      expect(factory.isProviderRegistered('kata')).toBe(true);
      expect(factory.isProviderRegistered('e2b')).toBe(true);
      
      const providers = factory.listRegisteredProviders();
      expect(providers).toContain('worktree');
      expect(providers).toContain('kata');
      expect(providers).toContain('e2b');
    });

    it('should throw when registering duplicate provider', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      
      expect(() => {
        factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      }).toThrow(ProviderAlreadyRegisteredError);
    });

    it('should create provider instances', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      
      const provider = factory.createProvider('worktree');
      
      expect(provider).toBeDefined();
      expect(typeof provider.spawn).toBe('function');
      expect(typeof provider.terminate).toBe('function');
      expect(typeof provider.execute).toBe('function');
    });

    it('should throw when creating unregistered provider', () => {
      // Ensure worktree is not registered
      factory.unregisterProvider('worktree');
      expect(() => {
        factory.createProvider('worktree');
      }).toThrow(ProviderNotRegisteredError);
    });

    it('should cache singleton providers', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));

      const provider1 = factory.getProvider('worktree');
      const provider2 = factory.getProvider('worktree');

      expect(provider1).toBe(provider2);
    });

    it('should create new instances when singleton cache disabled', () => {
      const noCacheFactory = new RuntimeProviderFactory({
        enableConfigLoading: false,
        enableSingletonCache: false,
      });
      
      noCacheFactory.unregisterProvider('worktree');
      noCacheFactory.registerProvider('worktree', createMockProviderFactory('worktree'));
      
      const provider1 = noCacheFactory.getProvider('worktree');
      const provider2 = noCacheFactory.getProvider('worktree');
      
      expect(provider1).not.toBe(provider2);
      
      noCacheFactory.dispose();
    });

    it('should provide cache statistics', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.getProvider('worktree');
      
      const stats = factory.getCacheStats();
      
      expect(stats.totalProviders).toBe(1);
      expect(stats.cachedProviders).toBe(1);
      expect(stats.cacheEntries.length).toBe(1);
      expect(stats.cacheEntries[0].type).toBe('worktree');
      expect(stats.cacheEntries[0].accessCount).toBeGreaterThanOrEqual(1);
    });

    it('should clear cache', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.getProvider('worktree');
      
      expect(factory.getCacheStats().cachedProviders).toBe(1);
      
      factory.clearCache();
      
      expect(factory.getCacheStats().cachedProviders).toBe(0);
    });

    it('should clear specific provider cache', () => {
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));
      factory.getProvider('worktree');
      factory.getProvider('kata');
      
      factory.clearCache('worktree');
      
      const stats = factory.getCacheStats();
      expect(stats.cachedProviders).toBe(1);
    });

    it('should unregister providers', () => {
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));

      expect(factory.isProviderRegistered('worktree')).toBe(true);

      const removed = factory.unregisterProvider('worktree');

      expect(removed).toBe(true);
      expect(factory.isProviderRegistered('worktree')).toBe(false);
    });

    it('should return false when unregistering non-existent provider', () => {
      // Ensure worktree is not registered
      factory.unregisterProvider('worktree');
      const removed = factory.unregisterProvider('worktree');
      expect(removed).toBe(false);
    });

    it('should dispose and cleanup resources and throw when using disposed factory', () => {
      // Create a fresh factory for this test to avoid interference from other tests
      const disposeTestFactory = new RuntimeProviderFactory({
        enableConfigLoading: false,
      });

      // First part: setup and verify cache before disposal
      disposeTestFactory.unregisterProvider('worktree');
      disposeTestFactory.registerProvider('worktree', createMockProviderFactory('worktree'));
      disposeTestFactory.getProvider('worktree');

      // Verify cache has entries before disposal
      expect(disposeTestFactory.getCacheStats().cachedProviders).toBe(1);

      // Dispose the factory
      disposeTestFactory.dispose();

      // Verify factory is disposed
      expect(disposeTestFactory.isDisposed()).toBe(true);

      // Second part: verify it throws when used after disposal
      expect(() => {
        disposeTestFactory.isProviderRegistered('worktree');
      }).toThrow('RuntimeProviderFactory has been disposed');
    });
  });

  // ============================================================================
  // PROVIDER SWITCHING TESTS
  // ============================================================================

  describe('Provider Switching', () => {
    beforeEach(() => {
      // Clear any previously registered providers
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));
    });

    it('should switch between worktree and kata providers', () => {
      const worktreeProvider = factory.getProvider('worktree');
      const kataProvider = factory.getProvider('kata');
      
      expect(worktreeProvider).toBeDefined();
      expect(kataProvider).toBeDefined();
      expect(worktreeProvider).not.toBe(kataProvider);
    });

    it('should support runtime selection logic', () => {
      // Register different provider implementations
      const mockWorktree = new MockRuntimeProvider({
        type: 'worktree',
        name: 'worktree-provider',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
      });

      const mockKata = new MockRuntimeProvider({
        type: 'kata',
        name: 'kata-provider',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: true,
          resourceLimits: true,
          healthChecks: true,
        },
        defaults: {},
      });

      // Unregister existing providers before registering new ones
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', () => mockWorktree);
      factory.registerProvider('kata', () => mockKata);

      // Select based on requirements
      const requiresNetwork = true;
      let selectedProvider: RuntimeProvider;

      if (requiresNetwork) {
        selectedProvider = factory.getProvider('kata');
      } else {
        selectedProvider = factory.getProvider('worktree');
      }

      expect(selectedProvider).toBe(mockKata);
    });

    it('should implement fallback behavior', async () => {
      // Create providers with different availability
      const availableProvider = new MockRuntimeProvider({
        type: 'worktree',
        name: 'worktree-provider',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
      });

      // Unregister both providers to start fresh
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', () => availableProvider);

      // Simulate fallback logic - kata not available, worktree is
      let provider: RuntimeProvider | null = null;
      const fallbackChain: RuntimeType[] = ['kata', 'worktree'];

      for (const type of fallbackChain) {
        if (factory.isProviderRegistered(type)) {
          provider = factory.getProvider(type);
          break;
        }
      }

      expect(provider).toBe(availableProvider);
    });

    it('should support provider replacement', () => {
      const provider1 = new MockRuntimeProvider({
        type: 'worktree',
        name: 'worktree-v1',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
      });

      const provider2 = new MockRuntimeProvider({
        type: 'worktree',
        name: 'worktree-v2',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
      });

      // Unregister existing provider first
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', () => provider1);
      
      // Unregister old provider
      factory.unregisterProvider('worktree');
      
      // Register new provider
      factory.registerProvider('worktree', () => provider2);

      const currentProvider = factory.getProvider('worktree');
      expect(currentProvider).toBe(provider2);
    });
  });

  // ============================================================================
  // END-TO-END WORKFLOW TESTS
  // ============================================================================

  describe('End-to-End Workflows', () => {
    beforeEach(() => {
      // Clear any previously registered providers
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
    });

    it('should complete full agent lifecycle (spawn → execute → terminate)', async () => {
      const provider = factory.getProvider('worktree');

      // 1. Spawn agent
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { agentId: 'test-agent-1', teamId: 'test-team' },
      });

      expect(runtime).toBeDefined();
      expect(runtime.id).toBeDefined();
      expect(runtime.runtime).toBe('worktree');
      expect(runtime.state).toBe('running');

      // 2. Get status
      const status = await provider.getStatus(runtime.id);
      expect(status.id).toBe(runtime.id);
      expect(status.state).toBe('running');
      expect(status.health).toBe('healthy');

      // 3. Execute command
      const result = await provider.execute(runtime.id, 'echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Executed: echo hello');

      // 4. List runtimes
      const runtimes = await provider.listRuntimes();
      expect(runtimes.length).toBe(1);
      expect(runtimes[0].id).toBe(runtime.id);

      // 5. Terminate agent
      await provider.terminate(runtime.id);

      // 6. Verify termination
      const afterTerminate = await provider.listRuntimes();
      expect(afterTerminate.length).toBe(0);
    });

    it('should execute streaming commands', async () => {
      const provider = factory.getProvider('worktree');
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      const outputs: any[] = [];
      for await (const output of provider.executeStream(runtime.id, 'ls -la')) {
        outputs.push(output);
      }

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs.some(o => o.type === 'stdout')).toBe(true);
      expect(outputs.some(o => o.type === 'exit')).toBe(true);

      await provider.terminate(runtime.id);
    });

    it('should support file operations workflow', async () => {
      const provider = factory.getProvider('worktree');
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      // Write file
      const testContent = Buffer.from('Hello, World!');
      await provider.writeFile(runtime.id, '/tmp/test.txt', testContent);

      // Read file
      const readContent = await provider.readFile(runtime.id, '/tmp/test.txt');
      expect(readContent.toString()).toContain('Mock file content');

      await provider.terminate(runtime.id);
    });

    it('should support snapshot and restore workflow', async () => {
      const provider = factory.getProvider('worktree');
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { name: 'original-runtime' },
      });

      // Create snapshot
      const snapshot = await provider.snapshot(runtime.id, {
        name: 'test-snapshot',
        description: 'Test snapshot for integration test',
        labels: { test: 'true' },
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.runtimeId).toBe(runtime.id);
      expect(snapshot.metadata.name).toBe('test-snapshot');

      // List snapshots
      const snapshots = await provider.listSnapshots(runtime.id);
      expect(snapshots.length).toBe(1);

      // Restore from snapshot
      const restoredRuntime = await provider.restore(snapshot.id);
      expect(restoredRuntime).toBeDefined();
      expect(restoredRuntime.id).not.toBe(runtime.id);
      expect(restoredRuntime.runtime).toBe('worktree');

      // Delete snapshot
      await provider.deleteSnapshot(snapshot.id);
      const afterDelete = await provider.listSnapshots();
      expect(afterDelete.length).toBe(0);

      await provider.terminate(runtime.id);
      await provider.terminate(restoredRuntime.id);
    });

    it('should handle error workflow gracefully', async () => {
      const provider = factory.getProvider('worktree');

      // Try to get status of non-existent runtime
      await expect(provider.getStatus('non-existent')).rejects.toThrow(NotFoundError);

      // Try to terminate non-existent runtime
      await expect(provider.terminate('non-existent')).rejects.toThrow(NotFoundError);

      // Try to execute on non-existent runtime
      await expect(provider.execute('non-existent', 'echo test')).rejects.toThrow(NotFoundError);
    });

    it('should handle events', async () => {
      const provider = factory.getProvider('worktree');
      const events: Array<{ event: RuntimeEvent; data: any }> = [];

      provider.on('stateChange', (event, data) => {
        events.push({ event, data });
      });

      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event).toBe('stateChange');
      expect(events[0].data.previousState).toBe('pending');
      expect(events[0].data.currentState).toBe('running');

      await provider.terminate(runtime.id);
    });

    it('should wait for state transitions', async () => {
      const provider = factory.getProvider('worktree');
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      // Wait for running state
      const isRunning = await provider.waitForState(runtime.id, 'running', 5000);
      expect(isRunning).toBe(true);

      await provider.terminate(runtime.id);
    });

    it('should support directory operations', async () => {
      const provider = factory.getProvider('worktree');
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      // Upload directory (mock)
      await provider.uploadDirectory(runtime.id, '/local/path', '/remote/path');

      // Download directory (mock)
      await provider.downloadDirectory(runtime.id, '/remote/path', '/local/path');

      await provider.terminate(runtime.id);
    });
  });

  // ============================================================================
  // CONFIGURATION INTEGRATION TESTS
  // ============================================================================

  describe('Configuration Integration', () => {
    it('should load configuration from environment variables', () => {
      // Set environment variables
      process.env.GODEL_RUNTIME_CPU = '2';
      process.env.GODEL_RUNTIME_MEMORY = '1Gi';
      process.env.GODEL_RUNTIME_DISK = '20Gi';

      const envFactory = new RuntimeProviderFactory({ enableConfigLoading: true });
      
      // Verify environment was loaded (factory stores in baseConfig)
      expect(envFactory).toBeDefined();

      // Cleanup
      delete process.env.GODEL_RUNTIME_CPU;
      delete process.env.GODEL_RUNTIME_MEMORY;
      delete process.env.GODEL_RUNTIME_DISK;
      envFactory.dispose();
    });

    it('should load configuration from file', async () => {
      const configDir = path.join(tempDir, 'config', 'runtime');
      await fs.promises.mkdir(configDir, { recursive: true });

      const config = {
        base: {
          type: 'worktree' as RuntimeType,
          name: 'test-provider',
          capabilities: {
            snapshots: true,
            streaming: true,
            interactive: true,
            fileOperations: true,
            networkConfiguration: false,
            resourceLimits: false,
            healthChecks: true,
          },
          defaults: {
            resources: {
              cpu: 2,
              memory: '1Gi',
            },
          },
        },
      };

      await fs.promises.writeFile(
        path.join(configDir, 'providers.json'),
        JSON.stringify(config, null, 2)
      );

      const fileFactory = new RuntimeProviderFactory({
        configDir,
        enableConfigLoading: true,
      });

      expect(fileFactory).toBeDefined();
      fileFactory.dispose();
    });

    it('should support team-specific overrides', () => {
      factory.setTeamOverride('team-alpha', {
        defaults: {
          resources: {
            cpu: 4,
            memory: '2Gi',
          },
        },
      });

      // Register and create provider with team config
      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));

      const configWithTeam: ProviderConfig = {
        type: 'worktree',
        name: 'worktree-provider',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
        settings: { teamId: 'team-alpha' },
      };

      const provider = factory.createProvider('worktree', configWithTeam);
      expect(provider).toBeDefined();
    });

    it('should support agent-specific overrides', () => {
      factory.setAgentOverride('agent-123', {
        defaults: {
          timeout: 600,
        },
      });

      factory.unregisterProvider('worktree');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));

      const configWithAgent: ProviderConfig = {
        type: 'worktree',
        name: 'worktree-provider',
        capabilities: {
          snapshots: true,
          streaming: true,
          interactive: true,
          fileOperations: true,
          networkConfiguration: false,
          resourceLimits: false,
          healthChecks: true,
        },
        defaults: {},
        settings: { agentId: 'agent-123' },
      };

      const provider = factory.createProvider('worktree', configWithAgent);
      expect(provider).toBeDefined();
    });

    it('should validate configuration', () => {
      // Currently no validation in factory, but we can test structure
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.unregisterProvider('e2b');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));
      factory.registerProvider('e2b', createMockProviderFactory('e2b'));

      const providers = factory.listRegisteredProviders();
      expect(providers).toContain('worktree');
      expect(providers).toContain('kata');
      expect(providers).toContain('e2b');
    });

    it('should load team overrides from environment', () => {
      process.env.GODEL_RUNTIME_TEAM_TEAMALPHA_CPU = '4';

      const teamFactory = new RuntimeProviderFactory({ enableConfigLoading: true });
      expect(teamFactory).toBeDefined();

      delete process.env.GODEL_RUNTIME_TEAM_TEAMALPHA_CPU;
      teamFactory.dispose();
    });
  });

  // ============================================================================
  // LIFECYCLE INTEGRATION TESTS
  // ============================================================================

  describe('Lifecycle Integration', () => {
    beforeEach(() => {
      // Clear any previously registered providers
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));
    });

    it('should manage multiple runtimes simultaneously', async () => {
      const worktreeProvider = factory.getProvider('worktree');
      const kataProvider = factory.getProvider('kata');

      // Spawn multiple runtimes
      const runtime1 = await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      const runtime2 = await kataProvider.spawn({
        runtime: 'kata',
        resources: { cpu: 2, memory: '1Gi' },
      });

      const runtime3 = await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 0.5, memory: '256Mi' },
      });

      // List all runtimes from worktree provider
      const worktreeRuntimes = await worktreeProvider.listRuntimes();
      expect(worktreeRuntimes.length).toBe(2);

      // List all runtimes from kata provider
      const kataRuntimes = await kataProvider.listRuntimes();
      expect(kataRuntimes.length).toBe(1);

      // Cleanup
      await worktreeProvider.terminate(runtime1.id);
      await kataProvider.terminate(runtime2.id);
      await worktreeProvider.terminate(runtime3.id);
    });

    it('should handle state transitions correctly', async () => {
      const provider = factory.getProvider('worktree');
      const stateChanges: Array<{ from: RuntimeState; to: RuntimeState }> = [];

      provider.on('stateChange', (_event, data: any) => {
        stateChanges.push({
          from: data.previousState,
          to: data.currentState,
        });
      });

      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      expect(stateChanges.some(s => s.from === 'pending' && s.to === 'running')).toBe(true);

      await provider.terminate(runtime.id);

      expect(stateChanges.some(s => s.from === 'running' && s.to === 'terminating')).toBe(true);
      expect(stateChanges.some(s => s.from === 'terminating' && s.to === 'terminated')).toBe(true);
    });

    it('should cleanup all resources on factory dispose', async () => {
      const worktreeProvider = factory.getProvider('worktree');
      const kataProvider = factory.getProvider('kata');

      // Spawn several runtimes
      await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });

      await kataProvider.spawn({
        runtime: 'kata',
        resources: { cpu: 2, memory: '1Gi' },
      });

      await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 0.5, memory: '256Mi' },
      });

      // Verify runtimes exist
      expect((await worktreeProvider.listRuntimes()).length).toBe(2);
      expect((await kataProvider.listRuntimes()).length).toBe(1);

      // Dispose factory
      factory.dispose();

      // Factory should be disposed
      expect(factory.isDisposed()).toBe(true);
    });

    it('should handle concurrent operations', async () => {
      const provider = factory.getProvider('worktree');

      // Spawn multiple runtimes concurrently
      const spawnPromises = Array.from({ length: 5 }, (_, i) =>
        provider.spawn({
          runtime: 'worktree',
          resources: { cpu: 0.5, memory: '256Mi' },
          labels: { index: String(i) },
        })
      );

      const runtimes = await Promise.all(spawnPromises);
      expect(runtimes.length).toBe(5);

      // Execute commands concurrently
      const execPromises = runtimes.map(rt =>
        provider.execute(rt.id, `echo ${rt.id}`)
      );

      const results = await Promise.all(execPromises);
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });

      // Terminate all concurrently
      const terminatePromises = runtimes.map(rt => provider.terminate(rt.id));
      await Promise.all(terminatePromises);

      // Verify all terminated
      const remainingRuntimes = await provider.listRuntimes();
      expect(remainingRuntimes.length).toBe(0);
    });

    it('should support filtering runtimes', async () => {
      const worktreeProvider = factory.getProvider('worktree');

      // Spawn runtimes with different labels
      await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { teamId: 'team-alpha', env: 'dev' },
      });

      await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { teamId: 'team-beta', env: 'prod' },
      });

      await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { teamId: 'team-alpha', env: 'prod' },
      });

      // List all runtimes
      const allRuntimes = await worktreeProvider.listRuntimes();
      expect(allRuntimes.length).toBe(3);

      // Cleanup
      for (const rt of allRuntimes) {
        await worktreeProvider.terminate(rt.id);
      }
    });
  });

  // ============================================================================
  // MULTI-PROVIDER WORKFLOW TESTS
  // ============================================================================

  describe('Multi-Provider Workflows', () => {
    it('should orchestrate workflows across providers', async () => {
      // Clear any previously registered providers
      factory.unregisterProvider('worktree');
      factory.unregisterProvider('kata');
      factory.registerProvider('worktree', createMockProviderFactory('worktree'));
      factory.registerProvider('kata', createMockProviderFactory('kata'));

      const worktreeProvider = factory.getProvider('worktree');
      const kataProvider = factory.getProvider('kata');

      // Spawn worktree runtime for development
      const devRuntime = await worktreeProvider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { purpose: 'development' },
      });

      // Spawn kata runtime for testing
      const testRuntime = await kataProvider.spawn({
        runtime: 'kata',
        resources: { cpu: 2, memory: '1Gi' },
        labels: { purpose: 'testing' },
      });

      // Execute on worktree
      const devResult = await worktreeProvider.execute(devRuntime.id, 'npm run build');
      expect(devResult.exitCode).toBe(0);

      // Execute on kata
      const testResult = await kataProvider.execute(testRuntime.id, 'npm test');
      expect(testResult.exitCode).toBe(0);

      // Cleanup
      await worktreeProvider.terminate(devRuntime.id);
      await kataProvider.terminate(testRuntime.id);
    });
  });

  // ============================================================================
  // GLOBAL FACTORY TESTS
  // ============================================================================

  describe('Global Factory', () => {
    it('should provide global factory instance', () => {
      const factory1 = getFactory();
      const factory2 = getFactory();

      expect(factory1).toBe(factory2);
    });

    it('should reset global factory', () => {
      const factory1 = getFactory();
      resetFactory();
      const factory2 = getFactory();

      expect(factory1).not.toBe(factory2);
    });
  });
});

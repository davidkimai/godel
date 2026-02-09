/**
 * RuntimeProviderFactory Unit Tests
 * 
 * Comprehensive test suite for the RuntimeProviderFactory implementation.
 * 
 * @module tests/core/runtime/runtime-provider-factory.test
 * @version 1.0.0
 */

import {
  RuntimeProviderFactory,
  ProviderFactory,
  ProviderNotRegisteredError,
  ProviderAlreadyRegisteredError,
  FactoryInitializationError,
  getFactory,
  resetFactory,
} from '../../../src/core/runtime/runtime-provider-factory';

import {
  RuntimeType,
  RuntimeProvider,
  ProviderConfig,
  AgentRuntime,
  SpawnConfig,
  RuntimeStatus,
  ExecutionResult,
  ExecutionOptions,
  Snapshot,
  SnapshotMetadata,
  ExecutionOutput,
  RuntimeFilters,
  RuntimeState,
  RuntimeEvent,
  EventHandler,
  EventData,
} from '../../../src/core/runtime/runtime-provider';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock implementation of RuntimeProvider for testing
 */
class MockRuntimeProvider implements RuntimeProvider {
  public spawnedRuntimes: Map<string, AgentRuntime> = new Map();
  public snapshots: Map<string, Snapshot> = new Map();
  public eventHandlers: Map<RuntimeEvent, EventHandler[]> = new Map();
  public config: ProviderConfig;
  public disposed = false;

  constructor(config?: ProviderConfig) {
    this.config = config || {
      type: 'worktree' as RuntimeType,
      name: 'mock-provider',
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
    };
  }

  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    const runtime: AgentRuntime = {
      id: `runtime-${Date.now()}`,
      runtime: config.runtime,
      state: 'running' as RuntimeState,
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
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: {
        type: config.runtime,
        labels: config.labels,
        createdAt: new Date(),
      },
    };
    this.spawnedRuntimes.set(runtime.id, runtime);
    return runtime;
  }

  async terminate(runtimeId: string): Promise<void> {
    this.spawnedRuntimes.delete(runtimeId);
  }

  async getStatus(runtimeId: string): Promise<RuntimeStatus> {
    const runtime = this.spawnedRuntimes.get(runtimeId);
    if (!runtime) {
      throw new Error('Runtime not found');
    }
    return {
      id: runtime.id,
      state: runtime.state,
      resources: runtime.resources,
      health: 'healthy',
      uptime: Date.now() - runtime.createdAt.getTime(),
    };
  }

  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    let runtimes = Array.from(this.spawnedRuntimes.values());
    
    if (filters?.runtime) {
      runtimes = runtimes.filter(r => r.runtime === filters.runtime);
    }
    
    if (filters?.state) {
      runtimes = runtimes.filter(r => r.state === filters.state);
    }
    
    return runtimes;
  }

  async execute(runtimeId: string, command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    return {
      exitCode: 0,
      stdout: 'mock output',
      stderr: '',
      duration: 100,
      metadata: {
        command,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    };
  }

  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    yield {
      type: 'stdout',
      data: 'mock stream output',
      timestamp: new Date(),
    };
  }

  async executeInteractive(runtimeId: string, command: string, stdin: ReadableStream): Promise<ExecutionResult> {
    return {
      exitCode: 0,
      stdout: 'mock interactive output',
      stderr: '',
      duration: 100,
      metadata: {
        command,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    };
  }

  async readFile(runtimeId: string, path: string): Promise<Buffer> {
    return Buffer.from('mock file content');
  }

  async writeFile(runtimeId: string, path: string, data: Buffer): Promise<void> {
    // Mock implementation
  }

  async uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void> {
    // Mock implementation
  }

  async downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void> {
    // Mock implementation
  }

  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    const snapshot: Snapshot = {
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
      throw new Error('Snapshot not found');
    }
    return this.spawn({
      runtime: 'worktree',
      resources: { cpu: 1, memory: '512Mi' },
    });
  }

  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    let snapshots = Array.from(this.snapshots.values());
    if (runtimeId) {
      snapshots = snapshots.filter(s => s.runtimeId === runtimeId);
    }
    return snapshots;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    this.snapshots.delete(snapshotId);
  }

  on(event: RuntimeEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean> {
    return Promise.resolve(true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('RuntimeProviderFactory', () => {
  let factory: RuntimeProviderFactory;

  beforeEach(() => {
    // Reset factory before each test
    RuntimeProviderFactory.resetInstance();
    factory = RuntimeProviderFactory.getInstance({
      enableSingletonCache: true,
      enableConfigLoading: false,
      debug: false,
    });
  });

  afterEach(() => {
    // Cleanup after each test
    if (factory && !factory.isDisposed()) {
      factory.dispose();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLETON PATTERN TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Singleton Pattern', () => {
    it('should return the same instance for multiple getInstance() calls', () => {
      const instance1 = RuntimeProviderFactory.getInstance();
      const instance2 = RuntimeProviderFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance after resetInstance()', () => {
      const instance1 = RuntimeProviderFactory.getInstance();
      RuntimeProviderFactory.resetInstance();
      const instance2 = RuntimeProviderFactory.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it('should throw error when accessing disposed factory', () => {
      factory.dispose();
      expect(() => factory.listRegisteredProviders()).toThrow('RuntimeProviderFactory has been disposed');
    });

    it('should track disposed state correctly', () => {
      expect(factory.isDisposed()).toBe(false);
      factory.dispose();
      expect(factory.isDisposed()).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER REGISTRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Provider Registration', () => {
    it('should register a provider factory', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      
      factory.registerProvider('worktree', mockFactory);
      
      expect(factory.isProviderRegistered('worktree')).toBe(true);
      expect(factory.listRegisteredProviders()).toContain('worktree');
    });

    it('should throw ProviderAlreadyRegisteredError when registering duplicate', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      
      factory.registerProvider('worktree', mockFactory);
      
      expect(() => {
        factory.registerProvider('worktree', mockFactory);
      }).toThrow(ProviderAlreadyRegisteredError);
    });

    it('should unregister a provider', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      
      factory.registerProvider('worktree', mockFactory);
      const result = factory.unregisterProvider('worktree');
      
      expect(result).toBe(true);
      expect(factory.isProviderRegistered('worktree')).toBe(false);
    });

    it('should return false when unregistering non-existent provider', () => {
      const result = factory.unregisterProvider('nonexistent' as RuntimeType);
      expect(result).toBe(false);
    });

    it('should list all registered providers', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      
      factory.registerProvider('worktree', mockFactory);
      factory.registerProvider('kata', mockFactory);
      factory.registerProvider('e2b', mockFactory);
      
      const providers = factory.listRegisteredProviders();
      expect(providers).toHaveLength(3);
      expect(providers).toContain('worktree');
      expect(providers).toContain('kata');
      expect(providers).toContain('e2b');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE PROVIDER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createProvider()', () => {
    it('should create a new provider instance', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      const provider = factory.createProvider('worktree');
      
      expect(provider).toBeInstanceOf(MockRuntimeProvider);
    });

    it('should pass configuration to provider factory', () => {
      const mockFactory = jest.fn((config) => new MockRuntimeProvider(config));
      factory.registerProvider('worktree', mockFactory);
      
      const config: ProviderConfig = {
        type: 'worktree',
        name: 'test-provider',
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
      };
      
      factory.createProvider('worktree', config);
      
      expect(mockFactory).toHaveBeenCalledWith(expect.objectContaining({
        name: 'test-provider',
      }));
    });

    it('should throw ProviderNotRegisteredError for unregistered provider', () => {
      expect(() => {
        factory.createProvider('kata');
      }).toThrow(ProviderNotRegisteredError);
    });

    it('should create different instances on multiple calls', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      const provider1 = factory.createProvider('worktree');
      const provider2 = factory.createProvider('worktree');
      
      expect(provider1).not.toBe(provider2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET PROVIDER (SINGLETON) TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProvider() - Singleton', () => {
    it('should return cached instance for same type', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      const provider1 = factory.getProvider('worktree');
      const provider2 = factory.getProvider('worktree');
      
      expect(provider1).toBe(provider2);
    });

    it('should create new instance when cache disabled', () => {
      // Reset and create new factory with cache disabled
      RuntimeProviderFactory.resetInstance();
      const noCacheFactory = RuntimeProviderFactory.getInstance({
        enableSingletonCache: false,
        enableConfigLoading: false,
      });
      
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      noCacheFactory.registerProvider('worktree', mockFactory);
      
      const provider1 = noCacheFactory.getProvider('worktree');
      const provider2 = noCacheFactory.getProvider('worktree');
      
      expect(provider1).not.toBe(provider2);
      
      // Cleanup
      noCacheFactory.dispose();
    });

    it('should track cache statistics', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      // Access provider multiple times
      factory.getProvider('worktree');
      factory.getProvider('worktree');
      factory.getProvider('worktree');
      
      const stats = factory.getCacheStats();
      
      expect(stats.totalProviders).toBe(1);
      expect(stats.cachedProviders).toBe(1);
      expect(stats.cacheEntries[0].accessCount).toBe(3);
    });

    it('should update last accessed time', async () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      factory.getProvider('worktree');
      const stats1 = factory.getCacheStats();
      const firstAccess = stats1.cacheEntries[0].lastAccessedAt;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      factory.getProvider('worktree');
      const stats2 = factory.getCacheStats();
      const secondAccess = stats2.cacheEntries[0].lastAccessedAt;
      
      expect(secondAccess.getTime()).toBeGreaterThan(firstAccess.getTime());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cache Management', () => {
    it('should clear cache for specific provider', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      factory.registerProvider('kata', mockFactory);
      
      factory.getProvider('worktree');
      factory.getProvider('kata');
      
      factory.clearCache('worktree');
      
      const stats = factory.getCacheStats();
      expect(stats.cachedProviders).toBe(1);
    });

    it('should clear all caches', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      factory.registerProvider('kata', mockFactory);
      
      factory.getProvider('worktree');
      factory.getProvider('kata');
      
      factory.clearCache();
      
      const stats = factory.getCacheStats();
      expect(stats.cachedProviders).toBe(0);
    });

    it('should clear cache when unregistering provider', () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      factory.getProvider('worktree');
      expect(factory.getCacheStats().cachedProviders).toBe(1);
      
      factory.unregisterProvider('worktree');
      expect(factory.getCacheStats().cachedProviders).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Configuration Management', () => {
    it('should set base configuration', () => {
      const baseConfig: Partial<ProviderConfig> = {
        defaults: {
          resources: {
            cpu: 2,
            memory: '1Gi',
          },
        },
      };
      
      factory.setBaseConfig(baseConfig);
      
      // Verify by creating a provider and checking config
      const mockFactory = jest.fn((config) => new MockRuntimeProvider(config));
      factory.registerProvider('worktree', mockFactory);
      factory.createProvider('worktree');
      
      expect(mockFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: expect.objectContaining({
            resources: expect.objectContaining({
              cpu: 2,
              memory: '1Gi',
            }),
          }),
        })
      );
    });

    it('should set team overrides', () => {
      const teamConfig: Partial<ProviderConfig> = {
        defaults: {
          resources: {
            cpu: 4,
            memory: '2Gi',
          },
        },
      };
      
      factory.setTeamOverride('team-1', teamConfig);
      
      // The override should be stored
      expect(() => factory.setTeamOverride('team-1', teamConfig)).not.toThrow();
    });

    it('should set agent overrides', () => {
      const agentConfig: Partial<ProviderConfig> = {
        defaults: {
          resources: {
            cpu: 1,
            memory: '256Mi',
          },
        },
      };
      
      factory.setAgentOverride('agent-1', agentConfig);
      
      // The override should be stored
      expect(() => factory.setAgentOverride('agent-1', agentConfig)).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL FACTORY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Global Factory Functions', () => {
    it('getFactory() should return a factory instance', () => {
      resetFactory();
      const globalFactory = getFactory();
      expect(globalFactory).toBeInstanceOf(RuntimeProviderFactory);
    });

    it('getFactory() should return same instance on multiple calls', () => {
      resetFactory();
      const factory1 = getFactory();
      const factory2 = getFactory();
      expect(factory1).toBe(factory2);
    });

    it('resetFactory() should reset the global factory', () => {
      resetFactory();
      const factory1 = getFactory();
      resetFactory();
      const factory2 = getFactory();
      expect(factory1).not.toBe(factory2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER FUNCTIONALITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Provider Functionality', () => {
    it('should create working provider that can spawn runtimes', async () => {
      const mockFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      factory.registerProvider('worktree', mockFactory);
      
      const provider = factory.createProvider('worktree') as MockRuntimeProvider;
      
      const runtime = await provider.spawn({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      });
      
      expect(runtime).toBeDefined();
      expect(runtime.id).toBeDefined();
      expect(runtime.runtime).toBe('worktree');
    });

    it('should support multiple provider types simultaneously', () => {
      const worktreeFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      const kataFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      const e2bFactory: ProviderFactory = (config) => new MockRuntimeProvider(config);
      
      factory.registerProvider('worktree', worktreeFactory);
      factory.registerProvider('kata', kataFactory);
      factory.registerProvider('e2b', e2bFactory);
      
      const worktreeProvider = factory.getProvider('worktree');
      const kataProvider = factory.getProvider('kata');
      const e2bProvider = factory.getProvider('e2b');
      
      expect(worktreeProvider).toBeInstanceOf(MockRuntimeProvider);
      expect(kataProvider).toBeInstanceOf(MockRuntimeProvider);
      expect(e2bProvider).toBeInstanceOf(MockRuntimeProvider);
    });
  });
});

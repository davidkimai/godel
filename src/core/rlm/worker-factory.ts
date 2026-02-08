/**
 * @fileoverview RLMWorker Factory & Registry - Worker Management Infrastructure
 *
 * Provides factory pattern for RLMWorker instantiation and a registry for
 * tracking active workers. Includes singleton management for application-wide
 * worker lifecycle management.
 *
 * Based on SPEC-003: RLM Integration Specification - Section 4.1
 * @module @godel/core/rlm/worker-factory
 * @version 1.0.0
 */

import {
  RLMWorker,
  RLMWorkerConfig,
  WorkerStatus,
  ExecutionResult,
  ContextReference,
  RLMResult,
  ContextChunk,
  ByteRange,
  DEFAULT_WORKER_CONFIG,
  validateWorkerConfig,
} from './worker-profile';
import { REPLEnvironment, createREPLEnvironment } from './repl-environment';

// =============================================================================
// Worker Registry
// =============================================================================

/**
 * Worker registry entry with metadata
 */
interface WorkerEntry {
  /** Worker instance */
  worker: RLMWorker;
  /** Registration timestamp */
  registeredAt: Date;
  /** Last access timestamp */
  lastAccessed: Date;
  /** Access count */
  accessCount: number;
}

/**
 * Worker registry for tracking active RLMWorkers
 *
 * Provides centralized worker lifecycle tracking and querying capabilities.
 * Supports filtering by status, efficient lookups, and usage analytics.
 *
 * @example
 * ```typescript
 * const registry = getWorkerRegistry();
 *
 * // Register a worker
 * registry.register(worker);
 *
 * // Query workers
 * const activeWorkers = registry.getWorkersByStatus(WorkerStatus.BUSY);
 * console.log(`Active workers: ${activeWorkers.length}`);
 *
 * // Get specific worker
 * const worker = registry.getWorker('worker-001');
 * ```
 */
export class WorkerRegistry {
  /** Map of worker ID to worker entry */
  private workers: Map<string, WorkerEntry> = new Map();
  /** Event listeners for registry changes */
  private listeners: Array<(event: RegistryEvent) => void> = [];

  /**
   * Register a new worker
   *
   * @param worker - RLMWorker instance to register
   * @throws Error if worker with same ID already exists
   */
  register(worker: RLMWorker): void {
    if (this.workers.has(worker.id)) {
      throw new Error(`Worker with ID '${worker.id}' is already registered`);
    }

    this.workers.set(worker.id, {
      worker,
      registeredAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
    });

    this.emit({
      type: 'register',
      workerId: worker.id,
      timestamp: new Date(),
    });

    console.log(`[WorkerRegistry] Registered worker: ${worker.id}`);
  }

  /**
   * Unregister a worker
   *
   * @param workerId - ID of worker to unregister
   * @returns True if worker was unregistered, false if not found
   */
  unregister(workerId: string): boolean {
    const entry = this.workers.get(workerId);
    if (!entry) {
      return false;
    }

    this.workers.delete(workerId);

    this.emit({
      type: 'unregister',
      workerId,
      timestamp: new Date(),
    });

    console.log(`[WorkerRegistry] Unregistered worker: ${workerId}`);
    return true;
  }

  /**
   * Get a worker by ID
   *
   * @param workerId - Worker identifier
   * @returns RLMWorker instance or undefined if not found
   */
  getWorker(workerId: string): RLMWorker | undefined {
    const entry = this.workers.get(workerId);
    if (entry) {
      entry.lastAccessed = new Date();
      entry.accessCount++;
      return entry.worker;
    }
    return undefined;
  }

  /**
   * Get all registered workers
   *
   * @returns Array of all workers
   */
  getAllWorkers(): RLMWorker[] {
    return Array.from(this.workers.values()).map((entry) => entry.worker);
  }

  /**
   * Get count of active (registered) workers
   *
   * @returns Number of registered workers
   */
  getActiveCount(): number {
    return this.workers.size;
  }

  /**
   * Get workers filtered by status
   *
   * @param status - Worker status to filter by
   * @returns Array of workers with matching status
   */
  getWorkersByStatus(status: WorkerStatus): RLMWorker[] {
    return this.getAllWorkers().filter((worker) => worker.status === status);
  }

  /**
   * Check if a worker is registered
   *
   * @param workerId - Worker identifier
   * @returns True if worker exists in registry
   */
  hasWorker(workerId: string): boolean {
    return this.workers.has(workerId);
  }

  /**
   * Get registry statistics
   *
   * @returns Statistics object
   */
  getStats(): RegistryStats {
    const workers = this.getAllWorkers();
    const statusCounts = {
      [WorkerStatus.IDLE]: 0,
      [WorkerStatus.BUSY]: 0,
      [WorkerStatus.ERROR]: 0,
      [WorkerStatus.TERMINATED]: 0,
    };

    for (const worker of workers) {
      statusCounts[worker.status]++;
    }

    return {
      totalWorkers: workers.length,
      statusCounts,
      averageAge: this.calculateAverageAge(),
    };
  }

  /**
   * Clear all workers from registry
   *
   * @param terminate - Whether to terminate workers before removing
   */
  async clear(terminate: boolean = false): Promise<void> {
    if (terminate) {
      for (const entry of this.workers.values()) {
        await entry.worker.terminate();
      }
    }

    this.workers.clear();

    this.emit({
      type: 'clear',
      timestamp: new Date(),
    });
  }

  /**
   * Subscribe to registry events
   *
   * @param listener - Event listener function
   * @returns Unsubscribe function
   */
  subscribe(listener: (event: RegistryEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[WorkerRegistry] Event listener error:', error);
      }
    }
  }

  /**
   * Calculate average worker age in milliseconds
   */
  private calculateAverageAge(): number {
    const now = Date.now();
    const ages = Array.from(this.workers.values()).map(
      (entry) => now - entry.registeredAt.getTime()
    );

    if (ages.length === 0) return 0;
    return ages.reduce((a, b) => a + b, 0) / ages.length;
  }
}

/**
 * Registry event types
 */
export type RegistryEvent =
  | { type: 'register'; workerId: string; timestamp: Date }
  | { type: 'unregister'; workerId: string; timestamp: Date }
  | { type: 'clear'; timestamp: Date };

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of registered workers */
  totalWorkers: number;
  /** Count per status */
  statusCounts: Record<WorkerStatus, number>;
  /** Average worker age in milliseconds */
  averageAge: number;
}

// =============================================================================
// RLMWorker Implementation
// =============================================================================

/**
 * Internal RLMWorker implementation
 */
class RLMWorkerImpl implements RLMWorker {
  readonly id: string;
  status: WorkerStatus = WorkerStatus.IDLE;
  readonly createdAt: Date = new Date();
  lastActivity: Date = new Date();
  readonly config: RLMWorkerConfig;

  private repl: REPLEnvironment | null = null;
  private currentContext: ContextReference | null = null;
  private childCallCount: number = 0;
  private totalCost: number = 0;
  private totalTokens: number = 0;

  constructor(config: RLMWorkerConfig) {
    this.id = config.id;
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.repl = await createREPLEnvironment({
      id: this.id,
      libraries: this.config.libraries,
      workingDir: `/tmp/worker-${this.id}`,
      timeout: this.config.executionTimeout,
      allowFileSystem: true,
    });

    this.status = WorkerStatus.IDLE;
  }

  async executeCode(code: string): Promise<ExecutionResult> {
    this.updateActivity();
    this.status = WorkerStatus.BUSY;

    try {
      if (!this.repl) {
        throw new Error('Worker not initialized');
      }

      const startTime = Date.now();
      const replOutput = await this.repl.execute(code);

      // Update metrics (simulated)
      const estimatedTokens = Math.ceil(code.length / 4);
      this.totalTokens += estimatedTokens;
      this.totalCost += estimatedTokens * 0.00001; // $0.01 per 1K tokens

      this.status = WorkerStatus.IDLE;

      return {
        code: replOutput.success ? 0 : 1,
        output: String(replOutput.output ?? ''),
        error: replOutput.errors.join('\n') || undefined,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      this.status = WorkerStatus.ERROR;
      return {
        code: 1,
        output: '',
        error: String(error),
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  async getContext(): Promise<ContextReference> {
    this.updateActivity();

    if (!this.currentContext) {
      throw new Error('No context set for this worker');
    }

    return this.currentContext;
  }

  async setContext(context: ContextReference): Promise<void> {
    this.updateActivity();
    this.currentContext = context;

    if (this.repl) {
      this.repl.setContextVariable(context);
    }
  }

  async invokeChild(
    query: string,
    context: ContextReference,
    options?: {
      maxTokens?: number;
      temperature?: number;
      timeout?: number;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      metadata?: Record<string, unknown>;
    }
  ): Promise<RLMResult> {
    this.updateActivity();
    this.childCallCount++;

    // This would delegate to the federation engine in production
    // For now, return a simulated result
    const startTime = Date.now();
    const estimatedTokens = options?.maxTokens ?? 1000;
    const cost = estimatedTokens * 0.00001;

    this.totalTokens += estimatedTokens;
    this.totalCost += cost;

    return {
      result: `Simulated child response for: ${query.slice(0, 50)}...`,
      metadata: {
        tokensUsed: estimatedTokens,
        cost,
        duration: Date.now() - startTime,
        childCalls: 0,
        recursionDepth: 1,
        workerId: this.id,
      },
    };
  }

  async readContextRange(range: ByteRange): Promise<Buffer> {
    this.updateActivity();

    if (!this.currentContext) {
      throw new Error('No context available');
    }

    const fileOps = this.repl?.getFileOperations();
    if (!fileOps) {
      throw new Error('File operations not available');
    }

    // Convert URI to local path (simplified)
    const localPath = this.currentContext.uri.replace('file://', '');
    const result = await fileOps.seek(localPath, range.start, range.end - range.start);

    if (!result.success || !result.data) {
      throw new Error(`Failed to read context range: ${result.error}`);
    }

    return Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
  }

  async *iterateContext(chunkSize: number): AsyncIterable<ContextChunk> {
    this.updateActivity();

    if (!this.currentContext) {
      throw new Error('No context available');
    }

    // Simplified implementation - would use actual file streaming
    const totalSize = this.currentContext.metadata.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);

      yield {
        index: i,
        range: { start, end },
        data: Buffer.alloc(end - start), // Placeholder
        totalChunks,
      };
    }
  }

  async health(): Promise<boolean> {
    return this.status !== WorkerStatus.ERROR && this.status !== WorkerStatus.TERMINATED;
  }

  async terminate(): Promise<void> {
    if (this.repl) {
      await this.repl.cleanup();
      this.repl = null;
    }

    this.status = WorkerStatus.TERMINATED;
    this.currentContext = null;

    console.log(`[RLMWorker] Terminated worker: ${this.id}`);
  }

  private updateActivity(): void {
    this.lastActivity = new Date();
  }
}

// =============================================================================
// RLMWorker Factory
// =============================================================================

/**
 * Factory for creating and managing RLMWorker instances
 *
 * Implements the factory pattern for worker instantiation with support
 * for worker pooling, configuration validation, and lifecycle management.
 *
 * @example
 * ```typescript
 * const factory = getRLMWorkerFactory();
 *
 * // Create a single worker
 * const worker = await factory.createWorker({
 *   id: 'worker-001',
 *   runtime: 'kata',
 *   maxRecursionDepth: 10
 * });
 *
 * // Create a pool of workers
 * const pool = await factory.createPool(5, { runtime: 'kata' });
 * ```
 */
export class RLMWorkerFactory {
  /** Worker registry for tracking created workers */
  private registry: WorkerRegistry;
  /** Worker counter for auto-generating IDs */
  private workerCounter: number = 0;
  /** Factory configuration */
  private config: FactoryConfig;

  constructor(registry: WorkerRegistry, config: Partial<FactoryConfig> = {}) {
    this.registry = registry;
    this.config = {
      autoRegister: true,
      validateConfig: true,
      defaultRuntime: 'kata',
      ...config,
    };
  }

  /**
   * Create a new RLMWorker instance
   *
   * @param config - Worker configuration (partial, merged with defaults)
   * @returns Initialized RLMWorker
   *
   * @example
   * ```typescript
   * const worker = await factory.createWorker({
   *   id: 'my-worker',
   *   runtime: 'kata',
   *   maxRecursionDepth: 10,
   *   budgetLimit: 50.0
   * });
   * ```
   */
  async createWorker(config: Partial<RLMWorkerConfig>): Promise<RLMWorker> {
    // Merge with defaults
    const fullConfig: RLMWorkerConfig = {
      ...DEFAULT_WORKER_CONFIG,
      ...config,
      id: config.id ?? this.generateWorkerId(),
      runtime: config.runtime ?? this.config.defaultRuntime,
    };

    // Validate configuration
    if (this.config.validateConfig) {
      const validation = validateWorkerConfig(fullConfig);
      if (!validation.valid) {
        throw new Error(`Invalid worker configuration: ${validation.errors.join(', ')}`);
      }
    }

    // Create and initialize worker
    const worker = new RLMWorkerImpl(fullConfig);
    await worker.initialize();

    // Register if auto-register is enabled
    if (this.config.autoRegister) {
      this.registry.register(worker);
    }

    console.log(`[RLMWorkerFactory] Created worker: ${worker.id}`);
    return worker;
  }

  /**
   * Create a pool of workers with shared configuration
   *
   * @param size - Number of workers to create
   * @param config - Configuration for all workers in pool
   * @returns Array of initialized workers
   *
   * @example
   * ```typescript
   * const pool = await factory.createPool(5, {
   *   runtime: 'kata',
   *   maxRecursionDepth: 10
   * });
   *
   * console.log(`Created pool with ${pool.length} workers`);
   * ```
   */
  async createPool(size: number, config: Partial<RLMWorkerConfig>): Promise<RLMWorker[]> {
    if (size < 1) {
      throw new Error('Pool size must be at least 1');
    }

    if (size > 100) {
      throw new Error('Pool size cannot exceed 100 workers');
    }

    const workers: RLMWorker[] = [];

    for (let i = 0; i < size; i++) {
      const workerConfig = {
        ...config,
        id: `${config.id ?? 'pool-worker'}-${i}`,
      };
      const worker = await this.createWorker(workerConfig);
      workers.push(worker);
    }

    console.log(`[RLMWorkerFactory] Created worker pool with ${size} workers`);
    return workers;
  }

  /**
   * Destroy a worker and remove it from registry
   *
   * @param workerId - ID of worker to destroy
   * @returns True if worker was destroyed, false if not found
   */
  async destroyWorker(workerId: string): Promise<boolean> {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      return false;
    }

    await worker.terminate();
    this.registry.unregister(workerId);

    console.log(`[RLMWorkerFactory] Destroyed worker: ${workerId}`);
    return true;
  }

  /**
   * Get factory statistics
   *
   * @returns Factory statistics
   */
  getStats(): FactoryStats {
    const registryStats = this.registry.getStats();

    return {
      totalCreated: this.workerCounter,
      activeWorkers: registryStats.totalWorkers,
      statusDistribution: registryStats.statusCounts,
    };
  }

  /**
   * Generate a unique worker ID
   */
  private generateWorkerId(): string {
    this.workerCounter++;
    return `worker-${Date.now()}-${this.workerCounter}`;
  }
}

/**
 * Factory configuration
 */
export interface FactoryConfig {
  /** Automatically register workers with registry */
  autoRegister: boolean;
  /** Validate worker configurations on creation */
  validateConfig: boolean;
  /** Default runtime environment */
  defaultRuntime: 'kata' | 'e2b' | 'local';
}

/**
 * Factory statistics
 */
export interface FactoryStats {
  /** Total number of workers created */
  totalCreated: number;
  /** Number of currently active workers */
  activeWorkers: number;
  /** Distribution of workers by status */
  statusDistribution: Record<WorkerStatus, number>;
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton registry instance */
let globalRegistry: WorkerRegistry | null = null;

/** Singleton factory instance */
let globalFactory: RLMWorkerFactory | null = null;

/**
 * Get the global WorkerRegistry singleton
 *
 * @returns WorkerRegistry instance
 */
export function getWorkerRegistry(): WorkerRegistry {
  if (!globalRegistry) {
    globalRegistry = new WorkerRegistry();
  }
  return globalRegistry;
}

/**
 * Get the global RLMWorkerFactory singleton
 *
 * @returns RLMWorkerFactory instance
 */
export function getRLMWorkerFactory(): RLMWorkerFactory {
  if (!globalFactory) {
    const registry = getWorkerRegistry();
    globalFactory = new RLMWorkerFactory(registry);
  }
  return globalFactory;
}

/**
 * Reset factory and registry (useful for testing)
 */
export function resetFactory(): void {
  globalFactory = null;
  globalRegistry = null;
  console.log('[RLMWorkerFactory] Factory and registry reset');
}

/**
 * Configure factory singleton with custom settings
 *
 * @param config - Factory configuration
 */
export function configureFactory(config: Partial<FactoryConfig>): void {
  const registry = getWorkerRegistry();
  globalFactory = new RLMWorkerFactory(registry, config);
  console.log('[RLMWorkerFactory] Factory configured');
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  WorkerRegistry,
  RLMWorkerFactory,
  getWorkerRegistry,
  getRLMWorkerFactory,
  resetFactory,
  configureFactory,
};

import { EventEmitter } from 'events';
import { promisify } from 'util';
import type { HealthStatus } from './health-monitor';

/**
 * VM configuration for warm pool
 */
interface VMConfig {
  image: string;
  cpu: number;
  memory: string;
  runtimeClass: string;
  labels?: Record<string, string>;
}

/**
 * Warm pool configuration
 */
interface WarmPoolConfig {
  minSize: number;
  maxSize: number;
  targetSize: number;
  refillThreshold: number;
  imagePreloadCount: number;
}

/**
 * Pool statistics
 */
interface PoolStats {
  totalVMs: number;
  readyVMs: number;
  allocatedVMs: number;
  creatingVMs: number;
  warmPoolHitRate: number;
  averageAllocationTimeMs: number;
  averageCreationTimeMs: number;
}

/**
 * Performance metrics
 */
interface PerformanceMetrics {
  bootTimeP95: number;
  bootTimeP99: number;
  vmCreationTimeAvg: number;
  warmPoolHits: number;
  warmPoolMisses: number;
  totalRequests: number;
}

/**
 * SpawnOptimizer - Performance optimization for VM spawning
 * 
 * Features:
 * - Warm pool of pre-created VMs for <100ms boot time
 * - VM creation path optimization (reduce 38-49ms to <30ms)
 * - Async pre-warming during idle time
 * - Connection pooling for K8s API
 * - Docker image pre-pulling
 * 
 * Targets:
 * - Boot time P95: <100ms (currently 100.61ms)
 * - VM creation: <30ms (currently 38-49ms)
 * - Warm pool hit rate: >80%
 */
export class SpawnOptimizer extends EventEmitter {
  private warmPool: Map<string, WarmVM> = new Map();
  private allocatedVMs: Map<string, AllocatedVM> = new Map();
  private config: WarmPoolConfig;
  private k8sConnectionPool: K8sConnectionPool;
  private imageCache: ImageCache;
  private metrics: PerformanceMetrics;
  private isWarming = false;
  private refillTimeout?: NodeJS.Timeout;
  private readonly creationTimes: number[] = [];
  private readonly allocationTimes: number[] = [];

  constructor(
    k8sClient: any, // Kubernetes client
    config: Partial<WarmPoolConfig> = {}
  ) {
    super();
    
    this.config = {
      minSize: config.minSize ?? 10,
      maxSize: config.maxSize ?? 50,
      targetSize: config.targetSize ?? 20,
      refillThreshold: config.refillThreshold ?? 5,
      imagePreloadCount: config.imagePreloadCount ?? 5,
    };

    this.k8sConnectionPool = new K8sConnectionPool(k8sClient);
    this.imageCache = new ImageCache(k8sClient);
    
    this.metrics = {
      bootTimeP95: 0,
      bootTimeP99: 0,
      vmCreationTimeAvg: 0,
      warmPoolHits: 0,
      warmPoolMisses: 0,
      totalRequests: 0,
    };

    this.startWarmPoolMaintenance();
    this.preloadCommonImages();
  }

  /**
   * Get or create a VM with optimized path
   * Target: <100ms P95 boot time
   */
  public async getOrCreateVM(
    requestedConfig: Partial<VMConfig>,
    timeoutMs = 30000
  ): Promise<VMInstance> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Try to get from warm pool first (fast path: <10ms)
    const warmVM = this.findMatchingVM(requestedConfig);
    
    if (warmVM) {
      // Warm pool hit!
      this.metrics.warmPoolHits++;
      const allocationTime = Date.now() - startTime;
      this.allocationTimes.push(allocationTime);
      
      const vm = this.allocateVM(warmVM, requestedConfig);
      this.emit('vm:allocated-from-pool', {
        vmId: vm.id,
        allocationTimeMs: allocationTime,
      });

      // Trigger async refill if needed
      this.checkAndRefill();

      return vm;
    }

    // Warm pool miss - need to create new VM
    this.metrics.warmPoolMisses++;
    
    const vm = await this.createVMOptimized(requestedConfig, timeoutMs);
    const creationTime = Date.now() - startTime;
    this.creationTimes.push(creationTime);
    
    this.updateMetrics();
    
    this.emit('vm:created', {
      vmId: vm.id,
      creationTimeMs: creationTime,
    });

    return vm;
  }

  /**
   * Optimized VM creation path
   * Target: <30ms (currently 38-49ms)
   */
  private async createVMOptimized(
    config: Partial<VMConfig>,
    timeoutMs: number
  ): Promise<VMInstance> {
    const startTime = Date.now();
    const vmId = `vm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Use connection from pool (avoids connection setup time)
      const connection = await this.k8sConnectionPool.acquire();

      // Parallel initialization
      const [imageReady, networkReady, volumeReady] = await Promise.all([
        // Pre-pull or verify image is available
        this.imageCache.ensureImage(config.image || 'godel-agent-base'),
        
        // Pre-allocate network resources
        this.preAllocateNetwork(vmId),
        
        // Pre-allocate storage
        this.preAllocateStorage(vmId),
      ]);

      // Create VM with optimized settings
      const vmConfig = this.buildOptimizedConfig(vmId, config);
      
      // Use pooled connection for API call
      const vm = await connection.createPod(vmConfig);
      
      this.k8sConnectionPool.release(connection);

      const creationTime = Date.now() - startTime;
      
      // Track creation time for metrics
      this.creationTimes.push(creationTime);
      
      if (creationTime > 30) {
        console.warn(`[SpawnOptimizer] VM creation took ${creationTime}ms (target: <30ms)`);
      }

      return {
        id: vmId,
        config: vmConfig,
        state: 'running',
        createdAt: new Date(),
        bootTimeMs: creationTime,
      };
    } catch (error) {
      this.emit('vm:creation-failed', { vmId, error, duration: Date.now() - startTime });
      throw error;
    }
  }

  /**
   * Find matching VM in warm pool
   */
  private findMatchingVM(requestedConfig: Partial<VMConfig>): WarmVM | undefined {
    for (const [id, vm] of this.warmPool) {
      if (this.configMatches(vm.config, requestedConfig)) {
        this.warmPool.delete(id);
        return vm;
      }
    }
    return undefined;
  }

  /**
   * Check if warm pool VM matches requested config
   */
  private configMatches(poolConfig: VMConfig, requested: Partial<VMConfig>): boolean {
    if (requested.image && poolConfig.image !== requested.image) return false;
    if (requested.cpu && poolConfig.cpu !== requested.cpu) return false;
    if (requested.memory && poolConfig.memory !== requested.memory) return false;
    if (requested.runtimeClass && poolConfig.runtimeClass !== requested.runtimeClass) return false;
    return true;
  }

  /**
   * Allocate VM from warm pool
   */
  private allocateVM(warmVM: WarmVM, config: Partial<VMConfig>): VMInstance {
    const vm: VMInstance = {
      id: warmVM.id,
      config: { ...warmVM.config, ...config },
      state: 'running',
      createdAt: warmVM.createdAt,
      bootTimeMs: Date.now() - warmVM.readyAt.getTime(),
      fromPool: true,
    };

    this.allocatedVMs.set(vm.id, {
      ...vm,
      allocatedAt: new Date(),
    });

    return vm;
  }

  /**
   * Build optimized VM configuration
   */
  private buildOptimizedConfig(vmId: string, config: Partial<VMConfig>): VMConfig {
    return {
      image: config.image || 'godel-agent-base:latest',
      cpu: config.cpu || 1,
      memory: config.memory || '512Mi',
      runtimeClass: config.runtimeClass || 'kata',
      labels: {
        ...config.labels,
        'godel.io/vm-id': vmId,
        'godel.io/optimized': 'true',
      },
    };
  }

  /**
   * Pre-allocate network resources
   */
  private async preAllocateNetwork(vmId: string): Promise<void> {
    // Reserve IP, setup network policies
    // This runs in parallel with other initialization
    await Promise.resolve(); // Placeholder
  }

  /**
   * Pre-allocate storage
   */
  private async preAllocateStorage(vmId: string): Promise<void> {
    // Pre-create volume, setup storage
    // This runs in parallel with other initialization
    await Promise.resolve(); // Placeholder
  }

  /**
   * Start warm pool maintenance
   */
  private startWarmPoolMaintenance(): void {
    // Check pool health every 5 seconds
    setInterval(() => {
      this.maintainWarmPool();
    }, 5000);

    // Pre-warm during idle time
    this.scheduleIdleWarming();
  }

  /**
   * Maintain warm pool size
   */
  private maintainWarmPool(): void {
    const currentSize = this.warmPool.size;

    if (currentSize < this.config.minSize) {
      // Need to add more VMs
      this.refillPool(this.config.targetSize - currentSize);
    } else if (currentSize > this.config.maxSize) {
      // Too many VMs, remove excess
      this.removeExcessVMs(currentSize - this.config.maxSize);
    }
  }

  /**
   * Check if pool needs refill and schedule if needed
   */
  private checkAndRefill(): void {
    if (this.warmPool.size <= this.config.refillThreshold && !this.isWarming) {
      this.scheduleRefill();
    }
  }

  /**
   * Schedule pool refill
   */
  private scheduleRefill(): void {
    if (this.refillTimeout) {
      clearTimeout(this.refillTimeout);
    }

    this.refillTimeout = setTimeout(() => {
      const needed = this.config.targetSize - this.warmPool.size;
      if (needed > 0) {
        this.refillPool(needed);
      }
    }, 100);
  }

  /**
   * Refill warm pool with new VMs
   */
  private async refillPool(count: number): Promise<void> {
    if (this.isWarming) return;
    
    this.isWarming = true;
    this.emit('pool:refill-start', { count });

    try {
      const refillStart = Date.now();
      
      // Create VMs in parallel (up to 5 at a time)
      const batchSize = 5;
      for (let i = 0; i < count; i += batchSize) {
        const batch = Math.min(batchSize, count - i);
        await Promise.all(
          Array.from({ length: batch }, () => this.createWarmVM())
        );
      }

      const refillTime = Date.now() - refillStart;
      this.emit('pool:refill-complete', { count, durationMs: refillTime });
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Create a single warm pool VM
   */
  private async createWarmVM(): Promise<void> {
    try {
      const vmId = `warm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const config = this.buildOptimizedConfig(vmId, {});

      // Use optimized creation path
      const connection = await this.k8sConnectionPool.acquire();
      await connection.createPod(config);
      this.k8sConnectionPool.release(connection);

      const warmVM: WarmVM = {
        id: vmId,
        config,
        createdAt: new Date(),
        readyAt: new Date(),
        lastHealthCheck: new Date(),
      };

      this.warmPool.set(vmId, warmVM);
    } catch (error) {
      console.error('[SpawnOptimizer] Failed to create warm VM:', error);
    }
  }

  /**
   * Remove excess VMs from pool
   */
  private removeExcessVMs(count: number): void {
    const vmsToRemove = Array.from(this.warmPool.values())
      .sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime())
      .slice(0, count);

    for (const vm of vmsToRemove) {
      this.terminateWarmVM(vm.id);
    }
  }

  /**
   * Terminate a warm pool VM
   */
  private async terminateWarmVM(vmId: string): Promise<void> {
    this.warmPool.delete(vmId);
    
    try {
      const connection = await this.k8sConnectionPool.acquire();
      await connection.deletePod(vmId);
      this.k8sConnectionPool.release(connection);
    } catch (error) {
      console.error(`[SpawnOptimizer] Failed to terminate warm VM ${vmId}:`, error);
    }
  }

  /**
   * Schedule warming during idle time
   */
  private scheduleIdleWarming(): void {
    // Detect idle time and pre-warm
    let idleTimeout: NodeJS.Timeout;
    
    const resetIdle = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        // System is idle, do pre-warming
        this.preWarmAdditionalVMs();
      }, 60000); // 1 minute of idle time
    };

    // Call resetIdle on every VM request
    this.on('vm:allocated-from-pool', resetIdle);
    this.on('vm:created', resetIdle);
  }

  /**
   * Pre-warm additional VMs during idle time
   */
  private preWarmAdditionalVMs(): void {
    if (this.warmPool.size < this.config.targetSize) {
      const additional = Math.min(5, this.config.targetSize - this.warmPool.size);
      this.refillPool(additional);
    }
  }

  /**
   * Preload common Docker images
   */
  private async preloadCommonImages(): Promise<void> {
    const commonImages = [
      'godel-agent-base:latest',
      'godel-agent-python:latest',
      'godel-agent-node:latest',
      'godel-agent-golang:latest',
      'godel-agent-rust:latest',
    ];

    for (const image of commonImages.slice(0, this.config.imagePreloadCount)) {
      await this.imageCache.preloadImage(image);
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(): void {
    // Calculate P95/P99 boot times
    const sortedBootTimes = [...this.allocationTimes, ...this.creationTimes].sort((a, b) => a - b);
    
    if (sortedBootTimes.length > 0) {
      this.metrics.bootTimeP95 = this.calculatePercentile(sortedBootTimes, 0.95);
      this.metrics.bootTimeP99 = this.calculatePercentile(sortedBootTimes, 0.99);
    }

    // Calculate average creation time
    if (this.creationTimes.length > 0) {
      this.metrics.vmCreationTimeAvg = 
        this.creationTimes.reduce((a, b) => a + b, 0) / this.creationTimes.length;
    }

    // Keep only last 1000 measurements
    if (this.creationTimes.length > 1000) {
      this.creationTimes.splice(0, this.creationTimes.length - 1000);
    }
    if (this.allocationTimes.length > 1000) {
      this.allocationTimes.splice(0, this.allocationTimes.length - 1000);
    }
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Get current pool statistics
   */
  public getPoolStats(): PoolStats {
    const total = this.metrics.warmPoolHits + this.metrics.warmPoolMisses;
    
    return {
      totalVMs: this.warmPool.size + this.allocatedVMs.size,
      readyVMs: this.warmPool.size,
      allocatedVMs: this.allocatedVMs.size,
      creatingVMs: this.isWarming ? this.config.targetSize - this.warmPool.size : 0,
      warmPoolHitRate: total > 0 ? (this.metrics.warmPoolHits / total) * 100 : 0,
      averageAllocationTimeMs: this.allocationTimes.length > 0
        ? this.allocationTimes.reduce((a, b) => a + b, 0) / this.allocationTimes.length
        : 0,
      averageCreationTimeMs: this.creationTimes.length > 0
        ? this.creationTimes.reduce((a, b) => a + b, 0) / this.creationTimes.length
        : 0,
    };
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if boot time target is met
   */
  public isBootTimeTargetMet(): boolean {
    return this.metrics.bootTimeP95 < 100; // <100ms P95
  }

  /**
   * Shutdown and cleanup
   */
  public async shutdown(): Promise<void> {
    // Stop all timers
    if (this.refillTimeout) {
      clearTimeout(this.refillTimeout);
    }

    // Terminate all warm pool VMs
    const terminationPromises = Array.from(this.warmPool.keys()).map((id) =>
      this.terminateWarmVM(id)
    );

    await Promise.all(terminationPromises);
    
    this.emit('optimizer:shutdown');
  }
}

/**
 * Warm VM in pool
 */
interface WarmVM {
  id: string;
  config: VMConfig;
  createdAt: Date;
  readyAt: Date;
  lastHealthCheck: Date;
}

/**
 * Allocated VM
 */
interface AllocatedVM extends VMInstance {
  allocatedAt: Date;
}

/**
 * VM Instance
 */
interface VMInstance {
  id: string;
  config: VMConfig;
  state: 'creating' | 'running' | 'terminated' | 'error';
  createdAt: Date;
  bootTimeMs: number;
  fromPool?: boolean;
}

/**
 * K8s Connection Pool
 */
class K8sConnectionPool {
  private connections: any[] = [];
  private available: any[] = [];
  private maxSize = 10;

  constructor(private k8sClient: any) {}

  async acquire(): Promise<any> {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    
    if (this.connections.length < this.maxSize) {
      const conn = this.k8sClient; // In production, create actual connection
      this.connections.push(conn);
      return conn;
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      const check = () => {
        if (this.available.length > 0) {
          resolve(this.available.pop());
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  release(connection: any): void {
    this.available.push(connection);
  }
}

/**
 * Image Cache Manager
 */
class ImageCache {
  private cachedImages: Set<string> = new Set();

  constructor(private k8sClient: any) {}

  async ensureImage(image: string): Promise<void> {
    if (this.cachedImages.has(image)) {
      return;
    }
    
    await this.preloadImage(image);
  }

  async preloadImage(image: string): Promise<void> {
    // In production, this would pre-pull the image
    console.log(`[ImageCache] Preloading image: ${image}`);
    this.cachedImages.add(image);
  }

  isImageCached(image: string): boolean {
    return this.cachedImages.has(image);
  }
}

// Export types
export type {
  VMConfig,
  WarmPoolConfig,
  PoolStats,
  PerformanceMetrics,
  VMInstance,
};

export default SpawnOptimizer;

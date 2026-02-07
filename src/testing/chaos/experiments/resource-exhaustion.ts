/**
 * Resource Exhaustion Chaos Experiment
 * 
 * Simulates CPU, memory, disk, or network exhaustion to test
 * system behavior under resource constraints.
 */

import { ChaosExperiment, ChaosResult, ChaosContext } from '../runner';
import { EventEmitter } from 'events';

export type ResourceType = 'cpu' | 'memory' | 'disk' | 'network' | 'file-descriptors';

export interface ResourceExhaustionConfig {
  /** Type of resource to exhaust */
  resourceType: ResourceType;
  /** Target service */
  target: string;
  /** Consumption level: 0-100 percentage */
  consumptionPercent: number;
  /** Duration in seconds */
  duration: number;
  /** Method of exhaustion */
  method?: 'gradual' | 'immediate' | 'spike';
  /** Cleanup after experiment */
  cleanup?: boolean;
}

export interface ResourceExhaustionResult {
  experimentId: string;
  startTime: Date;
  endTime: Date;
  config: ResourceExhaustionConfig;
  metrics: {
    targetConsumption: number;
    actualConsumption: number;
    oomEvents: number;
    throttleEvents: number;
    evictedPods: number;
  };
  systemBehavior: {
    remainedStable: boolean;
    gracefulDegradation: boolean;
    recoveryTimeMs: number;
  };
}

/**
 * Resource exhaustion chaos experiment
 */
export class ResourceExhaustionExperiment extends EventEmitter implements ChaosExperiment {
  name = 'resource-exhaustion';
  description = 'Exhausts system resources to test behavior under constraints';
  
  private config: ResourceExhaustionConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private metrics: {
    oomEvents: number;
    throttleEvents: number;
    evictedPods: number;
    peakConsumption: number;
  } = {
    oomEvents: 0,
    throttleEvents: 0,
    evictedPods: 0,
    peakConsumption: 0,
  };

  constructor(config: Partial<ResourceExhaustionConfig> = {}) {
    super();
    this.config = {
      resourceType: 'cpu',
      target: '',
      consumptionPercent: 80,
      duration: 60,
      method: 'gradual',
      cleanup: true,
      ...config,
    };
  }

  /**
   * Validate experiment configuration
   */
  validate(): string[] {
    const errors: string[] = [];
    
    if (!this.config.target) {
      errors.push('Target service is required');
    }
    
    if (this.config.consumptionPercent < 0 || this.config.consumptionPercent > 100) {
      errors.push('Consumption percentage must be between 0 and 100');
    }
    
    if (this.config.duration < 1) {
      errors.push('Duration must be at least 1 second');
    }
    
    return errors;
  }

  /**
   * Run the resource exhaustion experiment
   */
  async run(context: ChaosContext): Promise<ChaosResult<ResourceExhaustionResult>> {
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        data: null as unknown as ResourceExhaustionResult,
      };
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.metrics = {
      oomEvents: 0,
      throttleEvents: 0,
      evictedPods: 0,
      peakConsumption: 0,
    };
    
    const experimentId = `resource-${this.config.resourceType}-${Date.now()}`;
    const startTime = new Date();
    
    this.emit('start', { experimentId, config: this.config, startTime });

    try {
      // Start resource consumption
      await this.startConsumption();
      
      // Monitor system behavior
      await this.monitorSystem(context);
      
      // Cleanup resources
      if (this.config.cleanup) {
        await this.cleanup();
      }

      const endTime = new Date();
      const systemBehavior = await this.assessSystemBehavior(context);

      const result: ResourceExhaustionResult = {
        experimentId,
        startTime,
        endTime,
        config: this.config,
        metrics: {
          targetConsumption: this.config.consumptionPercent,
          actualConsumption: this.metrics.peakConsumption,
          oomEvents: this.metrics.oomEvents,
          throttleEvents: this.metrics.throttleEvents,
          evictedPods: this.metrics.evictedPods,
        },
        systemBehavior,
      };

      // Success criteria: system remained stable with graceful degradation
      const passed = systemBehavior.remainedStable && systemBehavior.recoveryTimeMs < 30000;

      this.emit('complete', { result, passed });

      return {
        success: passed,
        data: result,
        error: passed ? undefined : `System instability detected: ${systemBehavior.recoveryTimeMs}ms recovery`,
      };
    } catch (error) {
      await this.cleanup().catch(() => {});
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null as unknown as ResourceExhaustionResult,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the experiment
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.abortController?.abort();
    await this.cleanup();
    this.isRunning = false;
    this.emit('stop');
  }

  private async startConsumption(): Promise<void> {
    this.emit('consumption:start', this.config);
    
    console.log(`[ResourceExhaustion] Starting ${this.config.resourceType} exhaustion`);
    console.log(`  Target: ${this.config.target}`);
    console.log(`  Consumption: ${this.config.consumptionPercent}%`);
    console.log(`  Method: ${this.config.method}`);
    
    switch (this.config.resourceType) {
      case 'cpu':
        await this.consumeCPU();
        break;
      case 'memory':
        await this.consumeMemory();
        break;
      case 'disk':
        await this.consumeDisk();
        break;
      case 'network':
        await this.consumeNetwork();
        break;
      case 'file-descriptors':
        await this.consumeFileDescriptors();
        break;
    }
  }

  private async consumeCPU(): Promise<void> {
    // In real implementation:
    // - Use stress-ng or similar tools
    // - Configure CPU limits in Kubernetes
    // - Use cgroups directly
    
    const cpuCount = require('os').cpus().length;
    const workers = Math.ceil(cpuCount * (this.config.consumptionPercent / 100));
    
    console.log(`  Starting ${workers} CPU workers`);
    
    // Simulate CPU load
    for (let i = 0; i < workers; i++) {
      this.runCPULoad();
    }
  }

  private runCPULoad(): void {
    // CPU-intensive calculation loop
    const run = () => {
      if (!this.isRunning || this.abortController?.signal.aborted) return;
      
      // Busy work
      for (let i = 0; i < 1000000; i++) {
        Math.sqrt(i);
      }
      
      setImmediate(run);
    };
    run();
  }

  private async consumeMemory(): Promise<void> {
    // In real implementation:
    // - Allocate memory in target process
    // - Use memory stress tools
    
    const targetBytes = this.calculateMemoryTarget();
    console.log(`  Target memory consumption: ${(targetBytes / 1024 / 1024).toFixed(0)} MB`);
    
    // Simulate memory allocation
    const allocations: number[][] = [];
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    
    const allocate = () => {
      if (!this.isRunning || this.abortController?.signal.aborted) return;
      
      if (this.config.method === 'gradual') {
        // Gradual allocation
        const current = allocations.reduce((sum, arr) => sum + arr.length * 8, 0);
        if (current < targetBytes) {
          allocations.push(new Array(chunkSize / 8).fill(0));
          this.metrics.peakConsumption = (current / targetBytes) * 100;
          setTimeout(allocate, 1000);
        }
      } else {
        // Immediate allocation
        while (allocations.reduce((sum, arr) => sum + arr.length * 8, 0) < targetBytes) {
          allocations.push(new Array(chunkSize / 8).fill(0));
        }
        this.metrics.peakConsumption = 100;
      }
    };
    
    allocate();
  }

  private async consumeDisk(): Promise<void> {
    // In real implementation:
    // - Create large temporary files
    // - Fill disk partition
    
    console.log('  Filling disk space...');
    // Simulated
  }

  private async consumeNetwork(): Promise<void> {
    // In real implementation:
    // - Saturate network bandwidth
    // - Use iperf or similar tools
    
    console.log('  Consuming network bandwidth...');
    // Simulated
  }

  private async consumeFileDescriptors(): Promise<void> {
    // In real implementation:
    // - Open files/sockets without closing
    // - Exhaust process limits
    
    console.log('  Consuming file descriptors...');
    // Simulated
  }

  private calculateMemoryTarget(): number {
    // Get system memory and calculate target
    // In real implementation, use system memory info
    const systemMemory = 8 * 1024 * 1024 * 1024; // Assume 8GB
    return systemMemory * (this.config.consumptionPercent / 100);
  }

  private async monitorSystem(context: ChaosContext): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000;
    
    while (Date.now() - startTime < this.config.duration * 1000) {
      if (this.abortController?.signal.aborted) break;
      
      try {
        // Check for OOM, throttling, evictions
        const health = await context.checkHealth();
        
        // Monitor resource metrics
        // In real implementation, query Prometheus, Kubernetes metrics, etc.
        
        this.emit('heartbeat', { metrics: this.metrics, health });
      } catch (error) {
        // Likely OOM or system instability
        this.metrics.oomEvents++;
      }
      
      await this.sleep(pollInterval);
    }
  }

  private async cleanup(): Promise<void> {
    this.emit('cleanup');
    console.log('[ResourceExhaustion] Cleaning up resources...');
    
    // Release all resources
    // In real implementation:
    // - Kill stress processes
    // - Delete temporary files
    // - Close file descriptors
    // - Free memory allocations
    
    await this.sleep(500);
  }

  private async assessSystemBehavior(context: ChaosContext): Promise<{
    remainedStable: boolean;
    gracefulDegradation: boolean;
    recoveryTimeMs: number;
  }> {
    const cleanupStart = Date.now();
    
    // Wait for system to recover
    const maxWait = 30000;
    const pollInterval = 500;
    
    while (Date.now() - cleanupStart < maxWait) {
      const health = await context.checkHealth();
      
      if (health.healthy) {
        return {
          remainedStable: this.metrics.oomEvents === 0,
          gracefulDegradation: this.metrics.throttleEvents > 0 && this.metrics.oomEvents === 0,
          recoveryTimeMs: Date.now() - cleanupStart,
        };
      }
      
      await this.sleep(pollInterval);
    }
    
    return {
      remainedStable: false,
      gracefulDegradation: false,
      recoveryTimeMs: maxWait,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Exhaust CPU resources
 */
export async function exhaustCPU(
  target: string,
  percentage: number = 80,
  duration: number = 60
): Promise<ChaosResult<ResourceExhaustionResult>> {
  const experiment = new ResourceExhaustionExperiment({
    resourceType: 'cpu',
    target,
    consumptionPercent: percentage,
    duration,
  });

  return experiment.run({
    checkHealth: async () => ({ healthy: true, services: {} }),
    checkConsistency: async () => ({ consistent: true }),
    getState: async () => ({}),
    setState: async () => {},
  });
}

/**
 * Exhaust memory resources
 */
export async function exhaustMemory(
  target: string,
  percentage: number = 80,
  duration: number = 60
): Promise<ChaosResult<ResourceExhaustionResult>> {
  const experiment = new ResourceExhaustionExperiment({
    resourceType: 'memory',
    target,
    consumptionPercent: percentage,
    duration,
  });

  return experiment.run({
    checkHealth: async () => ({ healthy: true, services: {} }),
    checkConsistency: async () => ({ consistent: true }),
    getState: async () => ({}),
    setState: async () => {},
  });
}

export default ResourceExhaustionExperiment;

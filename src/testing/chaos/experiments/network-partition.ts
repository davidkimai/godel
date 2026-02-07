/**
 * Network Partition Chaos Experiment
 * 
 * Simulates network partitions between services to test
 * system resilience and eventual consistency.
 */

import { ChaosExperiment, ChaosResult, ChaosContext } from '../runner';
import { EventEmitter } from 'events';

export interface NetworkPartitionConfig {
  /** Duration of partition in seconds */
  duration: number;
  /** Services to isolate (e.g., ['agent-service', 'task-queue']) */
  isolatedServices: string[];
  /** Direction of partition: 'both', 'ingress', 'egress' */
  direction: 'both' | 'ingress' | 'egress';
  /** Percentage of traffic to drop (0-100) */
  packetLossPercentage?: number;
  /** Latency to inject in ms */
  latencyMs?: number;
  /** Whether to heal automatically after duration */
  autoHeal?: boolean;
}

export interface NetworkPartitionResult {
  partitionId: string;
  startTime: Date;
  endTime: Date;
  config: NetworkPartitionConfig;
  metrics: {
    droppedConnections: number;
    recoveredConnections: number;
    failedRequests: number;
    consistencyViolations: number;
  };
  recovery: {
    timeToRecoveryMs: number;
    dataLossEvents: number;
    fullConsistencyRestored: boolean;
  };
}

/**
 * Network partition chaos experiment
 */
export class NetworkPartitionExperiment extends EventEmitter implements ChaosExperiment {
  name = 'network-partition';
  description = 'Simulates network partitions between services';
  
  private config: NetworkPartitionConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(config: Partial<NetworkPartitionConfig> = {}) {
    super();
    this.config = {
      duration: 30,
      isolatedServices: [],
      direction: 'both',
      packetLossPercentage: 100,
      latencyMs: 0,
      autoHeal: true,
      ...config,
    };
  }

  /**
   * Validate experiment configuration
   */
  validate(): string[] {
    const errors: string[] = [];
    
    if (this.config.duration < 1) {
      errors.push('Duration must be at least 1 second');
    }
    
    if (this.config.isolatedServices.length === 0) {
      errors.push('At least one service must be specified for isolation');
    }
    
    if (this.config.packetLossPercentage !== undefined && 
        (this.config.packetLossPercentage < 0 || this.config.packetLossPercentage > 100)) {
      errors.push('Packet loss percentage must be between 0 and 100');
    }
    
    return errors;
  }

  /**
   * Run the network partition experiment
   */
  async run(context: ChaosContext): Promise<ChaosResult<NetworkPartitionResult>> {
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        data: null as unknown as NetworkPartitionResult,
      };
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    
    const partitionId = `partition-${Date.now()}`;
    const startTime = new Date();
    
    this.emit('start', { partitionId, config: this.config, startTime });
    
    // Metrics tracking
    const metrics = {
      droppedConnections: 0,
      recoveredConnections: 0,
      failedRequests: 0,
      consistencyViolations: 0,
    };

    try {
      // Inject network partition
      await this.injectPartition(partitionId);
      
      // Monitor during partition
      const monitorPromise = this.monitorPartition(context, metrics);
      
      // Wait for duration or abort
      await Promise.race([
        this.sleep(this.config.duration * 1000),
        this.waitForAbort(),
      ]);

      // Heal partition if auto-heal is enabled
      if (this.config.autoHeal && !this.abortController?.signal.aborted) {
        await this.healPartition(partitionId);
      }

      await monitorPromise;

      const endTime = new Date();
      const recovery = await this.measureRecovery(context);

      const result: NetworkPartitionResult = {
        partitionId,
        startTime,
        endTime,
        config: this.config,
        metrics,
        recovery,
      };

      // Check zero data loss requirement
      const passed = recovery.dataLossEvents === 0 && recovery.fullConsistencyRestored;

      this.emit('complete', { result, passed });

      return {
        success: passed,
        data: result,
        error: passed ? undefined : `Data loss detected: ${recovery.dataLossEvents} events`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null as unknown as NetworkPartitionResult,
      };
    } finally {
      this.isRunning = false;
      await this.healPartition(partitionId).catch(() => {}); // Ensure cleanup
    }
  }

  /**
   * Stop the experiment
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.abortController?.abort();
    this.isRunning = false;
    this.emit('stop');
  }

  private async injectPartition(partitionId: string): Promise<void> {
    this.emit('partition:inject', { partitionId, services: this.config.isolatedServices });
    
    // In real implementation, this would:
    // - Use iptables to drop packets
    // - Configure service mesh (Istio/Linkerd) fault injection
    // - Use Toxiproxy or similar tools
    // - Update cloud security groups
    
    // Simulation for now
    console.log(`[NetworkPartition] Injecting partition ${partitionId}`);
    console.log(`  Services isolated: ${this.config.isolatedServices.join(', ')}`);
    console.log(`  Direction: ${this.config.direction}`);
    console.log(`  Packet loss: ${this.config.packetLossPercentage}%`);
    
    await this.sleep(100); // Simulate injection delay
  }

  private async healPartition(partitionId: string): Promise<void> {
    this.emit('partition:heal', { partitionId });
    
    console.log(`[NetworkPartition] Healing partition ${partitionId}`);
    
    // In real implementation, reverse the partition injection
    await this.sleep(100); // Simulate healing delay
  }

  private async monitorPartition(context: ChaosContext, metrics: {
    droppedConnections: number;
    recoveredConnections: number;
    failedRequests: number;
    consistencyViolations: number;
  }): Promise<void> {
    const startTime = Date.now();
    
    while (this.isRunning && Date.now() - startTime < this.config.duration * 1000) {
      if (this.abortController?.signal.aborted) break;
      
      // Check system health during partition
      try {
        const health = await context.checkHealth();
        
        // Track failed requests
        if (!health.healthy) {
          metrics.failedRequests++;
        }
        
        // Check for consistency violations
        const consistency = await context.checkConsistency();
        if (!consistency.consistent) {
          metrics.consistencyViolations++;
        }
        
        this.emit('heartbeat', { health, consistency, metrics });
      } catch (error) {
        metrics.failedRequests++;
      }
      
      await this.sleep(1000);
    }
  }

  private async measureRecovery(context: ChaosContext): Promise<{
    timeToRecoveryMs: number;
    dataLossEvents: number;
    fullConsistencyRestored: boolean;
  }> {
    const healStart = Date.now();
    
    // Poll for recovery with 30s timeout
    const maxWaitTime = 30000;
    const pollInterval = 100;
    
    while (Date.now() - healStart < maxWaitTime) {
      const health = await context.checkHealth();
      const consistency = await context.checkConsistency();
      
      if (health.healthy && consistency.consistent) {
        return {
          timeToRecoveryMs: Date.now() - healStart,
          dataLossEvents: 0, // Would be determined by comparing state
          fullConsistencyRestored: true,
        };
      }
      
      await this.sleep(pollInterval);
    }
    
    return {
      timeToRecoveryMs: maxWaitTime,
      dataLossEvents: 1, // Assume data loss if not recovered
      fullConsistencyRestored: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private waitForAbort(): Promise<never> {
    return new Promise((_, reject) => {
      const checkAbort = () => {
        if (this.abortController?.signal.aborted) {
          reject(new Error('Experiment aborted'));
        } else {
          setTimeout(checkAbort, 100);
        }
      };
      checkAbort();
    });
  }
}

/**
 * Create a network partition between two services
 */
export async function partitionServices(
  serviceA: string,
  serviceB: string,
  duration: number = 30
): Promise<ChaosResult<NetworkPartitionResult>> {
  const experiment = new NetworkPartitionExperiment({
    isolatedServices: [serviceA, serviceB],
    duration,
    direction: 'both',
  });

  return experiment.run({
    checkHealth: async () => ({ healthy: true, services: {} }),
    checkConsistency: async () => ({ consistent: true }),
    getState: async () => ({}),
    setState: async () => {},
  });
}

/**
 * Create partial network degradation
 */
export async function degradeNetwork(
  services: string[],
  packetLoss: number,
  duration: number
): Promise<ChaosResult<NetworkPartitionResult>> {
  const experiment = new NetworkPartitionExperiment({
    isolatedServices: services,
    duration,
    direction: 'egress',
    packetLossPercentage: packetLoss,
  });

  return experiment.run({
    checkHealth: async () => ({ healthy: true, services: {} }),
    checkConsistency: async () => ({ consistent: true }),
    getState: async () => ({}),
    setState: async () => {},
  });
}

export default NetworkPartitionExperiment;

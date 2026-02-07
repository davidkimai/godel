/**
 * Pod Failure Chaos Experiment
 * 
 * Simulates pod/container failures to test system recovery
 * and high availability.
 */

import { ChaosExperiment, ChaosResult, ChaosContext } from '../runner';
import { EventEmitter } from 'events';

export interface PodFailureConfig {
  /** Number of pods to terminate */
  podCount: number;
  /** Service selector for target pods */
  serviceSelector: string;
  /** Namespace to target */
  namespace?: string;
  /** Termination grace period in seconds */
  gracePeriodSeconds?: number;
  /** Whether to restart pods after failure */
  autoRestart?: boolean;
  /** Delay before restart in seconds */
  restartDelay?: number;
  /** Pattern: 'random', 'oldest', 'newest' */
  selectionPattern: 'random' | 'oldest' | 'newest';
}

export interface PodFailureResult {
  experimentId: string;
  startTime: Date;
  endTime: Date;
  config: PodFailureConfig;
  terminatedPods: TerminatedPod[];
  metrics: {
    totalPods: number;
    terminatedCount: number;
    recoveryTimeAvgMs: number;
    recoveryTimeMaxMs: number;
    failedRecoveries: number;
  };
  recovery: {
    allPodsRecovered: boolean;
    recoveryTimeMs: number;
    serviceDegradation: boolean;
  };
}

interface TerminatedPod {
  name: string;
  namespace: string;
  terminatedAt: Date;
  recoveredAt?: Date;
  recoveryTimeMs?: number;
  status: 'terminated' | 'recovering' | 'recovered' | 'failed';
}

/**
 * Pod failure chaos experiment
 */
export class PodFailureExperiment extends EventEmitter implements ChaosExperiment {
  name = 'pod-failure';
  description = 'Terminates pods to test recovery mechanisms';
  
  private config: PodFailureConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private terminatedPods: TerminatedPod[] = [];

  constructor(config: Partial<PodFailureConfig> = {}) {
    super();
    this.config = {
      podCount: 1,
      serviceSelector: '',
      namespace: 'default',
      gracePeriodSeconds: 30,
      autoRestart: true,
      restartDelay: 10,
      selectionPattern: 'random',
      ...config,
    };
  }

  /**
   * Validate experiment configuration
   */
  validate(): string[] {
    const errors: string[] = [];
    
    if (this.config.podCount < 1) {
      errors.push('Pod count must be at least 1');
    }
    
    if (!this.config.serviceSelector) {
      errors.push('Service selector is required');
    }
    
    if (this.config.gracePeriodSeconds !== undefined && this.config.gracePeriodSeconds < 0) {
      errors.push('Grace period must be non-negative');
    }
    
    return errors;
  }

  /**
   * Run the pod failure experiment
   */
  async run(context: ChaosContext): Promise<ChaosResult<PodFailureResult>> {
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        data: null as unknown as PodFailureResult,
      };
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.terminatedPods = [];
    
    const experimentId = `pod-failure-${Date.now()}`;
    const startTime = new Date();
    
    this.emit('start', { experimentId, config: this.config, startTime });

    try {
      // Get list of target pods
      const targetPods = await this.getTargetPods();
      
      if (targetPods.length === 0) {
        throw new Error(`No pods found for selector: ${this.config.serviceSelector}`);
      }

      if (targetPods.length < this.config.podCount) {
        console.warn(`Requested ${this.config.podCount} pods but only ${targetPods.length} available`);
      }

      // Select pods to terminate
      const selectedPods = this.selectPods(targetPods, this.config.podCount);
      
      // Terminate pods
      await this.terminatePods(selectedPods);
      
      // Monitor recovery
      if (this.config.autoRestart) {
        await this.sleep(this.config.restartDelay! * 1000);
        await this.monitorRecovery();
      }

      const endTime = new Date();
      const metrics = this.calculateMetrics();
      const recovery = await this.assessRecovery(context);

      const result: PodFailureResult = {
        experimentId,
        startTime,
        endTime,
        config: this.config,
        terminatedPods: this.terminatedPods,
        metrics,
        recovery,
      };

      // Success criteria: recovery < 30s and all pods recovered
      const passed = recovery.recoveryTimeMs < 30000 && recovery.allPodsRecovered;

      this.emit('complete', { result, passed });

      return {
        success: passed,
        data: result,
        error: passed ? undefined : `Recovery failed or exceeded 30s threshold`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null as unknown as PodFailureResult,
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
    this.isRunning = false;
    this.emit('stop');
  }

  private async getTargetPods(): Promise<Array<{ name: string; namespace: string; age: number }>> {
    // In real implementation, use Kubernetes API
    // kubectl get pods -l <selector> -n <namespace>
    
    // Simulation
    return [
      { name: 'agent-service-1', namespace: this.config.namespace!, age: 3600 },
      { name: 'agent-service-2', namespace: this.config.namespace!, age: 7200 },
      { name: 'agent-service-3', namespace: this.config.namespace!, age: 1800 },
    ];
  }

  private selectPods(
    pods: Array<{ name: string; namespace: string; age: number }>,
    count: number
  ): Array<{ name: string; namespace: string }> {
    let sorted = [...pods];
    
    switch (this.config.selectionPattern) {
      case 'oldest':
        sorted.sort((a, b) => b.age - a.age);
        break;
      case 'newest':
        sorted.sort((a, b) => a.age - b.age);
        break;
      case 'random':
      default:
        sorted.sort(() => Math.random() - 0.5);
        break;
    }
    
    return sorted.slice(0, count).map(p => ({
      name: p.name,
      namespace: p.namespace,
    }));
  }

  private async terminatePods(pods: Array<{ name: string; namespace: string }>): Promise<void> {
    for (const pod of pods) {
      if (this.abortController?.signal.aborted) break;
      
      this.emit('pod:terminate', pod);
      
      const terminatedPod: TerminatedPod = {
        name: pod.name,
        namespace: pod.namespace,
        terminatedAt: new Date(),
        status: 'terminated',
      };
      
      this.terminatedPods.push(terminatedPod);
      
      // In real implementation:
      // kubectl delete pod <name> -n <namespace> --grace-period=<gracePeriodSeconds>
      console.log(`[PodFailure] Terminating pod: ${pod.namespace}/${pod.name}`);
      
      await this.sleep(100);
    }
  }

  private async monitorRecovery(): Promise<void> {
    const maxWaitTime = 60000; // 60 second max wait
    const pollInterval = 500;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      if (this.abortController?.signal.aborted) break;
      
      // Check pod status
      for (const pod of this.terminatedPods) {
        if (pod.status === 'recovered' || pod.status === 'failed') continue;
        
        // In real implementation, check actual pod status via K8s API
        // kubectl get pod <name> -n <namespace> -o jsonpath='{.status.phase}'
        
        // Simulate recovery after some time
        const elapsed = Date.now() - pod.terminatedAt.getTime();
        if (elapsed > 5000) { // Assume 5s recovery
          pod.recoveredAt = new Date();
          pod.recoveryTimeMs = elapsed;
          pod.status = 'recovered';
          this.emit('pod:recovered', pod);
        }
      }
      
      // Check if all pods recovered
      const allRecovered = this.terminatedPods.every(
        p => p.status === 'recovered' || p.status === 'failed'
      );
      
      if (allRecovered) break;
      
      await this.sleep(pollInterval);
    }
    
    // Mark any still-terminating pods as failed
    for (const pod of this.terminatedPods) {
      if (pod.status === 'terminated' || pod.status === 'recovering') {
        pod.status = 'failed';
      }
    }
  }

  private calculateMetrics() {
    const recovered = this.terminatedPods.filter(p => p.status === 'recovered');
    const recoveryTimes = recovered
      .map(p => p.recoveryTimeMs!)
      .filter(t => t !== undefined);
    
    return {
      totalPods: this.terminatedPods.length,
      terminatedCount: this.terminatedPods.length,
      recoveryTimeAvgMs: recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : 0,
      recoveryTimeMaxMs: recoveryTimes.length > 0
        ? Math.max(...recoveryTimes)
        : 0,
      failedRecoveries: this.terminatedPods.filter(p => p.status === 'failed').length,
    };
  }

  private async assessRecovery(context: ChaosContext): Promise<{
    allPodsRecovered: boolean;
    recoveryTimeMs: number;
    serviceDegradation: boolean;
  }> {
    const allRecovered = this.terminatedPods.every(p => p.status === 'recovered');
    const recoveryTimes = this.terminatedPods
      .filter(p => p.recoveryTimeMs !== undefined)
      .map(p => p.recoveryTimeMs!);
    
    const maxRecoveryTime = recoveryTimes.length > 0
      ? Math.max(...recoveryTimes)
      : 0;

    // Check service health
    const health = await context.checkHealth();
    
    return {
      allPodsRecovered: allRecovered,
      recoveryTimeMs: maxRecoveryTime,
      serviceDegradation: !health.healthy,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Terminate a specific number of pods for a service
 */
export async function terminatePods(
  serviceSelector: string,
  count: number,
  namespace: string = 'default'
): Promise<ChaosResult<PodFailureResult>> {
  const experiment = new PodFailureExperiment({
    serviceSelector,
    podCount: count,
    namespace,
    selectionPattern: 'random',
  });

  return experiment.run({
    checkHealth: async () => ({ healthy: true, services: {} }),
    checkConsistency: async () => ({ consistent: true }),
    getState: async () => ({}),
    setState: async () => {},
  });
}

/**
 * Simulate cascading pod failures
 */
export async function cascadingFailure(
  services: string[],
  delayBetween: number = 5000
): Promise<ChaosResult<PodFailureResult>[]> {
  const results: ChaosResult<PodFailureResult>[] = [];
  
  for (const service of services) {
    const result = await terminatePods(service, 1);
    results.push(result);
    
    if (delayBetween > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }
  }
  
  return results;
}

export default PodFailureExperiment;

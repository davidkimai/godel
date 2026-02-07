/**
 * Chaos Engineering Experiment Runner
 * 
 * Orchestrates chaos experiments with safety controls,
 * monitoring, and automatic rollback capabilities.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Context passed to experiments for system interaction
 */
export interface ChaosContext {
  /** Check overall system health */
  checkHealth(): Promise<HealthStatus>;
  /** Check data consistency across services */
  checkConsistency(): Promise<ConsistencyStatus>;
  /** Get current system state for verification */
  getState(): Promise<Record<string, unknown>>;
  /** Set system state (for test setup/teardown) */
  setState(state: Record<string, unknown>): Promise<void>;
}

export interface HealthStatus {
  healthy: boolean;
  services: Record<string, {
    healthy: boolean;
    latency?: number;
    errorRate?: number;
  }>;
}

export interface ConsistencyStatus {
  consistent: boolean;
  violations?: Array<{
    service: string;
    expected: unknown;
    actual: unknown;
  }>;
}

/**
 * Base interface for all chaos experiments
 */
export interface ChaosExperiment {
  name: string;
  description: string;
  validate(): string[];
  run(context: ChaosContext): Promise<ChaosResult<unknown>>;
  stop(): Promise<void>;
}

/**
 * Result of a chaos experiment
 */
export interface ChaosResult<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Safety configuration for chaos experiments
 */
export interface SafetyConfig {
  /** Abort if error rate exceeds threshold */
  maxErrorRate: number;
  /** Abort if latency exceeds threshold */
  maxLatencyMs: number;
  /** Abort if unhealthy services exceed threshold */
  maxUnhealthyServices: number;
  /** Auto-rollback on failure */
  autoRollback: boolean;
  /** Maximum experiment duration */
  maxDurationSeconds: number;
}

/**
 * Experiment schedule configuration
 */
export interface ExperimentSchedule {
  id: string;
  name: string;
  experiments: ScheduledExperiment[];
  safety: SafetyConfig;
  parallel: boolean;
}

export interface ScheduledExperiment {
  experiment: ChaosExperiment;
  delayMs?: number;
  dependencies?: string[];
}

/**
 * Chaos experiment runner
 */
export class ChaosRunner extends EventEmitter {
  private context: ChaosContext;
  private safety: SafetyConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private experiments: Map<string, ChaosExperiment> = new Map();
  private results: Map<string, ChaosResult<unknown>> = new Map();

  constructor(context: ChaosContext, safety?: Partial<SafetyConfig>) {
    super();
    this.context = context;
    this.safety = {
      maxErrorRate: 50,
      maxLatencyMs: 10000,
      maxUnhealthyServices: 3,
      autoRollback: true,
      maxDurationSeconds: 300,
      ...safety,
    };
  }

  /**
   * Register an experiment for execution
   */
  registerExperiment(id: string, experiment: ChaosExperiment): void {
    this.experiments.set(id, experiment);
  }

  /**
   * Run a single experiment with safety monitoring
   */
  async runExperiment(
    experiment: ChaosExperiment,
    experimentId?: string
  ): Promise<ChaosResult<unknown>> {
    const id = experimentId || `${experiment.name}-${Date.now()}`;
    
    // Validate experiment
    const validationErrors = experiment.validate();
    if (validationErrors.length > 0) {
      const result: ChaosResult<unknown> = {
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        data: null,
      };
      this.results.set(id, result);
      return result;
    }

    // Pre-experiment safety check
    const preHealth = await this.context.checkHealth();
    if (!preHealth.healthy) {
      const result: ChaosResult<unknown> = {
        success: false,
        error: 'System not healthy before experiment start',
        data: null,
      };
      this.results.set(id, result);
      return result;
    }

    this.emit('experiment:start', { id, experiment, preHealth });
    
    this.isRunning = true;
    this.abortController = new AbortController();

    // Start safety monitor
    const safetyMonitor = this.startSafetyMonitor();

    try {
      // Run experiment with timeout
      const result = await Promise.race([
        experiment.run(this.context),
        this.createTimeoutPromise(this.safety.maxDurationSeconds * 1000),
        this.createAbortPromise(),
      ]);

      // Stop safety monitor
      safetyMonitor.stop();

      // Post-experiment checks
      const postHealth = await this.context.checkHealth();
      const consistency = await this.context.checkConsistency();

      this.emit('experiment:complete', { 
        id, 
        result, 
        postHealth, 
        consistency,
        duration: Date.now() - parseInt(id.split('-').pop() || '0'),
      });

      this.results.set(id, result);
      this.isRunning = false;

      return result;
    } catch (error) {
      safetyMonitor.stop();
      
      // Attempt rollback if enabled
      if (this.safety.autoRollback) {
        await this.rollback(experiment);
      }

      const result: ChaosResult<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null,
      };

      this.emit('experiment:error', { id, error, result });
      this.results.set(id, result);
      this.isRunning = false;

      return result;
    }
  }

  /**
   * Run a scheduled sequence of experiments
   */
  async runSchedule(schedule: ExperimentSchedule): Promise<Map<string, ChaosResult<unknown>>> {
    const results = new Map<string, ChaosResult<unknown>>();
    
    this.emit('schedule:start', { schedule });

    if (schedule.parallel) {
      // Run independent experiments in parallel
      const completed = new Set<string>();
      const running = new Map<string, Promise<void>>();

      for (const item of schedule.experiments) {
        // Wait for dependencies
        if (item.dependencies) {
          await Promise.all(
            item.dependencies.map(dep => running.get(dep))
          );
        }

        // Start experiment
        const runPromise = this.runWithDelay(item)
          .then(result => {
            results.set(item.experiment.name, result);
            completed.add(item.experiment.name);
          });

        running.set(item.experiment.name, runPromise);

        // If not parallel, wait for completion
        if (!schedule.parallel) {
          await runPromise;
        }
      }

      // Wait for all to complete
      await Promise.all(running.values());
    } else {
      // Run sequentially
      for (const item of schedule.experiments) {
        await this.sleep(item.delayMs || 0);
        const result = await this.runExperiment(item.experiment);
        results.set(item.experiment.name, result);

        // Stop if experiment failed and auto-rollback is enabled
        if (!result.success && schedule.safety.autoRollback) {
          break;
        }
      }
    }

    this.emit('schedule:complete', { schedule, results });
    return results;
  }

  /**
   * Stop all running experiments
   */
  async stop(): Promise<void> {
    this.abortController?.abort();
    
    for (const [id, experiment] of this.experiments) {
      if (this.isRunning) {
        await experiment.stop();
      }
    }
    
    this.isRunning = false;
    this.emit('runner:stop');
  }

  /**
   * Get experiment results
   */
  getResults(): Map<string, ChaosResult<unknown>> {
    return new Map(this.results);
  }

  /**
   * Generate chaos engineering report
   */
  generateReport(): ChaosEngineeringReport {
    const results = Array.from(this.results.entries());
    const successful = results.filter(([, r]) => r.success);
    const failed = results.filter(([, r]) => !r.success);

    return {
      totalExperiments: results.length,
      successfulExperiments: successful.length,
      failedExperiments: failed.length,
      successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
      results: this.results,
      timestamp: new Date(),
      recommendations: this.generateRecommendations(failed),
    };
  }

  private startSafetyMonitor(): { stop: () => void } {
    const interval = setInterval(async () => {
      try {
        const health = await this.context.checkHealth();
        
        // Check error rate
        const unhealthyCount = Object.values(health.services).filter(s => !s.healthy).length;
        
        if (unhealthyCount > this.safety.maxUnhealthyServices) {
          this.emit('safety:triggered', { 
            reason: 'Too many unhealthy services', 
            count: unhealthyCount,
          });
          this.abortController?.abort();
        }

        // Check latency
        for (const [service, status] of Object.entries(health.services)) {
          if (status.latency && status.latency > this.safety.maxLatencyMs) {
            this.emit('safety:triggered', { 
              reason: 'Latency exceeded threshold', 
              service,
              latency: status.latency,
            });
            this.abortController?.abort();
            break;
          }
        }
      } catch (error) {
        this.emit('safety:error', error);
      }
    }, 1000);

    return {
      stop: () => clearInterval(interval),
    };
  }

  private async runWithDelay(item: ScheduledExperiment): Promise<ChaosResult<unknown>> {
    await this.sleep(item.delayMs || 0);
    return this.runExperiment(item.experiment);
  }

  private async rollback(experiment: ChaosExperiment): Promise<void> {
    this.emit('rollback:start', { experiment });
    
    try {
      await experiment.stop();
      this.emit('rollback:complete', { experiment });
    } catch (error) {
      this.emit('rollback:error', { experiment, error });
    }
  }

  private createTimeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Experiment timeout after ${ms}ms`)), ms);
    });
  }

  private createAbortPromise(): Promise<never> {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRecommendations(
    failed: Array<[string, ChaosResult<unknown>]>
  ): string[] {
    const recommendations: string[] = [];

    for (const [name, result] of failed) {
      if (result.error?.includes('timeout')) {
        recommendations.push(`Consider increasing timeouts for ${name}`);
      }
      if (result.error?.includes('partition')) {
        recommendations.push(`Improve partition tolerance for ${name}`);
      }
      if (result.error?.includes('memory') || result.error?.includes('OOM')) {
        recommendations.push(`Review memory limits and resource allocation for ${name}`);
      }
    }

    return recommendations;
  }
}

export interface ChaosEngineeringReport {
  totalExperiments: number;
  successfulExperiments: number;
  failedExperiments: number;
  successRate: number;
  results: Map<string, ChaosResult<unknown>>;
  timestamp: Date;
  recommendations: string[];
}

/**
 * Create a default chaos context
 */
export function createDefaultContext(
  healthCheck: () => Promise<HealthStatus>,
  consistencyCheck: () => Promise<ConsistencyStatus>
): ChaosContext {
  return {
    checkHealth: healthCheck,
    checkConsistency: consistencyCheck,
    getState: async () => ({}),
    setState: async () => {},
  };
}

/**
 * Run a game day scenario
 */
export async function runGameDay(
  experiments: ChaosExperiment[],
  context: ChaosContext
): Promise<ChaosEngineeringReport> {
  const runner = new ChaosRunner(context, {
    maxErrorRate: 30,
    maxLatencyMs: 5000,
    maxUnhealthyServices: 2,
    autoRollback: true,
    maxDurationSeconds: 600,
  });

  console.log('🎮 Starting Game Day Chaos Engineering Session');
  console.log(`   ${experiments.length} experiments scheduled`);

  for (let i = 0; i < experiments.length; i++) {
    const exp = experiments[i];
    console.log(`\n[${i + 1}/${experiments.length}] Running: ${exp.name}`);
    console.log(`   ${exp.description}`);

    const result = await runner.runExperiment(exp);
    
    if (result.success) {
      console.log(`   ✅ PASSED`);
    } else {
      console.log(`   ❌ FAILED: ${result.error}`);
    }
  }

  const report = runner.generateReport();
  
  console.log('\n📊 Game Day Results');
  console.log(`   Total: ${report.totalExperiments}`);
  console.log(`   Passed: ${report.successfulExperiments}`);
  console.log(`   Failed: ${report.failedExperiments}`);
  console.log(`   Success Rate: ${report.successRate.toFixed(1)}%`);

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach(r => console.log(`   - ${r}`));
  }

  return report;
}

export default ChaosRunner;

/**
 * Latency Injection Chaos Experiment
 * 
 * Injects artificial latency into service calls to test
 * timeout handling and circuit breaker behavior.
 */

import { ChaosExperiment, ChaosResult, ChaosContext } from '../runner';
import { EventEmitter } from 'events';

export interface LatencyInjectionConfig {
  /** Target service or endpoint */
  target: string;
  /** Latency to inject in milliseconds */
  latencyMs: number;
  /** Duration of injection in seconds */
  duration: number;
  /** Jitter percentage (0-100) */
  jitterPercent?: number;
  /** Percentage of requests to affect (0-100) */
  coveragePercent?: number;
  /** Specific endpoints to target */
  endpoints?: string[];
  /** HTTP methods to target */
  methods?: string[];
}

export interface LatencyInjectionResult {
  experimentId: string;
  startTime: Date;
  endTime: Date;
  config: LatencyInjectionConfig;
  metrics: {
    requestsAffected: number;
    avgInjectedLatency: number;
    timeoutErrors: number;
    circuitBreakerOpens: number;
  };
  impact: {
    userVisibleLatency: number;
    degradedExperiences: number;
    errorRateIncrease: number;
  };
}

/**
 * Latency injection chaos experiment
 */
export class LatencyInjectionExperiment extends EventEmitter implements ChaosExperiment {
  name = 'latency-injection';
  description = 'Injects artificial latency to test timeout handling';
  
  private config: LatencyInjectionConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private metrics: {
    requestsAffected: number;
    totalInjectedLatency: number;
    timeoutErrors: number;
    circuitBreakerOpens: number;
  } = {
    requestsAffected: 0,
    totalInjectedLatency: 0,
    timeoutErrors: 0,
    circuitBreakerOpens: 0,
  };

  constructor(config: Partial<LatencyInjectionConfig> = {}) {
    super();
    this.config = {
      target: '',
      latencyMs: 1000,
      duration: 60,
      jitterPercent: 10,
      coveragePercent: 100,
      endpoints: [],
      methods: ['GET', 'POST'],
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
    
    if (this.config.latencyMs < 0) {
      errors.push('Latency must be non-negative');
    }
    
    if (this.config.duration < 1) {
      errors.push('Duration must be at least 1 second');
    }
    
    if (this.config.jitterPercent !== undefined && 
        (this.config.jitterPercent < 0 || this.config.jitterPercent > 100)) {
      errors.push('Jitter percentage must be between 0 and 100');
    }
    
    if (this.config.coveragePercent !== undefined && 
        (this.config.coveragePercent < 0 || this.config.coveragePercent > 100)) {
      errors.push('Coverage percentage must be between 0 and 100');
    }
    
    return errors;
  }

  /**
   * Run the latency injection experiment
   */
  async run(context: ChaosContext): Promise<ChaosResult<LatencyInjectionResult>> {
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        data: null as unknown as LatencyInjectionResult,
      };
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.metrics = {
      requestsAffected: 0,
      totalInjectedLatency: 0,
      timeoutErrors: 0,
      circuitBreakerOpens: 0,
    };
    
    const experimentId = `latency-${Date.now()}`;
    const startTime = new Date();
    
    this.emit('start', { experimentId, config: this.config, startTime });

    try {
      // Inject latency
      await this.injectLatency();
      
      // Monitor during injection
      await this.monitorImpact(context);
      
      // Remove latency injection
      await this.removeLatency();

      const endTime = new Date();
      const impact = await this.measureImpact(context);

      const result: LatencyInjectionResult = {
        experimentId,
        startTime,
        endTime,
        config: this.config,
        metrics: {
          ...this.metrics,
          avgInjectedLatency: this.metrics.requestsAffected > 0
            ? this.metrics.totalInjectedLatency / this.metrics.requestsAffected
            : 0,
        },
        impact,
      };

      // Success criteria: system remains functional despite latency
      const passed = impact.errorRateIncrease < 5 && impact.degradedExperiences < 10;

      this.emit('complete', { result, passed });

      return {
        success: passed,
        data: result,
        error: passed ? undefined : `System impact too high: ${impact.errorRateIncrease}% error rate increase`,
      };
    } catch (error) {
      await this.removeLatency().catch(() => {});
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null as unknown as LatencyInjectionResult,
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
    await this.removeLatency();
    this.isRunning = false;
    this.emit('stop');
  }

  private async injectLatency(): Promise<void> {
    this.emit('latency:inject', this.config);
    
    console.log(`[LatencyInjection] Injecting ${this.config.latencyMs}ms latency to ${this.config.target}`);
    console.log(`  Jitter: ${this.config.jitterPercent}%, Coverage: ${this.config.coveragePercent}%`);
    
    // In real implementation, use:
    // - Istio fault injection
    // - Toxiproxy
    // - Service mesh configuration
    // - Application-level interceptors
    
    await this.sleep(100);
  }

  private async removeLatency(): Promise<void> {
    this.emit('latency:remove');
    
    console.log('[LatencyInjection] Removing latency injection');
    
    await this.sleep(100);
  }

  private async monitorImpact(context: ChaosContext): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000;
    
    while (Date.now() - startTime < this.config.duration * 1000) {
      if (this.abortController?.signal.aborted) break;
      
      // Check system metrics during latency injection
      try {
        const health = await context.checkHealth();
        
        // Track timeout errors and circuit breaker state
        if (!health.healthy) {
          this.metrics.timeoutErrors++;
        }
        
        // In real implementation, monitor actual metrics:
        // - Request latency distribution
        // - Timeout counts
        // - Circuit breaker state
        // - Error rates
        
        this.emit('heartbeat', { metrics: this.metrics, health });
      } catch (error) {
        this.metrics.timeoutErrors++;
      }
      
      await this.sleep(pollInterval);
    }
  }

  private async measureImpact(context: ChaosContext): Promise<{
    userVisibleLatency: number;
    degradedExperiences: number;
    errorRateIncrease: number;
  }> {
    // Measure impact on user experience
    // In real implementation, query metrics from monitoring system
    
    return {
      userVisibleLatency: this.config.latencyMs * (1 + (this.config.jitterPercent || 0) / 100),
      degradedExperiences: Math.floor(this.metrics.timeoutErrors / 10), // Estimate
      errorRateIncrease: this.metrics.timeoutErrors > 0 
        ? (this.metrics.timeoutErrors / Math.max(this.metrics.requestsAffected, 1)) * 100
        : 0,
    };
  }

  /**
   * Calculate jittered latency value
   */
  private getJitteredLatency(): number {
    const jitter = (this.config.latencyMs * (this.config.jitterPercent || 0)) / 100;
    const jitterAmount = (Math.random() * 2 - 1) * jitter; // +/- jitter
    return Math.max(0, this.config.latencyMs + jitterAmount);
  }

  /**
   * Check if current request should be affected
   */
  private shouldAffectRequest(): boolean {
    return Math.random() * 100 < (this.config.coveragePercent || 100);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Inject latency to a specific service
 */
export async function injectLatency(
  target: string,
  latencyMs: number,
  duration: number = 60
): Promise<ChaosResult<LatencyInjectionResult>> {
  const experiment = new LatencyInjectionExperiment({
    target,
    latencyMs,
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
 * Gradually increase latency to find breaking point
 */
export async function latencyRampUp(
  target: string,
  startLatency: number = 100,
  maxLatency: number = 10000,
  step: number = 100,
  stepDuration: number = 30
): Promise<ChaosResult<LatencyInjectionResult>[]> {
  const results: ChaosResult<LatencyInjectionResult>[] = [];
  
  for (let latency = startLatency; latency <= maxLatency; latency += step) {
    console.log(`Testing with ${latency}ms latency...`);
    
    const result = await injectLatency(target, latency, stepDuration);
    results.push(result);
    
    if (!result.success) {
      console.log(`Breaking point found at ${latency}ms`);
      break;
    }
  }
  
  return results;
}

export default LatencyInjectionExperiment;

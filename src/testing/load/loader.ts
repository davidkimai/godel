/**
 * Load Testing Framework - Godel Phase 7
 * 
 * Generates configurable load for testing system behavior under stress.
 * Supports 100+ concurrent agents with detailed metrics collection.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface LoadTestConfig {
  /** Number of concurrent agents (default: 100) */
  agentCount: number;
  /** Test duration in seconds (default: 60) */
  duration: number;
  /** Ramp-up time in seconds (default: 10) */
  rampUpTime: number;
  /** Request rate per agent per second (default: 1) */
  requestRate: number;
  /** Target endpoint or service */
  target: string;
  /** Scenario to execute */
  scenario: string;
  /** Payload configuration */
  payload?: Record<string, unknown>;
  /** Headers to include */
  headers?: Record<string, string>;
  /** Timeout per request in ms (default: 5000) */
  timeout: number;
  /** Success criteria */
  successCriteria: {
    /** Minimum success rate percentage (default: 99.9) */
    minSuccessRate: number;
    /** Maximum p95 latency in ms (default: 1000) */
    maxP95Latency: number;
    /** Maximum p99 latency in ms (default: 2000) */
    maxP99Latency: number;
    /** Maximum error rate percentage (default: 0.1) */
    maxErrorRate: number;
  };
}

export interface LoadTestResult {
  id: string;
  config: LoadTestConfig;
  startTime: Date;
  endTime: Date;
  metrics: LoadMetrics;
  passed: boolean;
  violations: string[];
}

export interface LoadMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  successRate: number;
  latencies: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
    p99_9: number;
  };
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  agentStats: AgentStats[];
  errors: ErrorBreakdown[];
  timeline: TimelinePoint[];
}

interface AgentStats {
  agentId: string;
  requests: number;
  success: number;
  failures: number;
  avgLatency: number;
}

interface ErrorBreakdown {
  type: string;
  count: number;
  percentage: number;
  sample: string;
}

interface TimelinePoint {
  timestamp: number;
  requests: number;
  errors: number;
  avgLatency: number;
  activeAgents: number;
}

interface RequestResult {
  success: boolean;
  latency: number;
  error?: string;
  statusCode?: number;
  bytesSent: number;
  bytesReceived: number;
}

export type LoadScenario = (agentId: string, iteration: number) => Promise<RequestResult>;

export class LoadGenerator extends EventEmitter {
  private config: LoadTestConfig;
  private scenarios: Map<string, LoadScenario> = new Map();
  private isRunning = false;
  private abortController: AbortController | null = null;
  private results: RequestResult[] = [];
  private timeline: TimelinePoint[] = [];
  private agentResults: Map<string, AgentStats> = new Map();
  private errorCounts: Map<string, number> = new Map();

  constructor(config: Partial<LoadTestConfig> = {}) {
    super();
    this.config = {
      agentCount: 100,
      duration: 60,
      rampUpTime: 10,
      requestRate: 1,
      target: 'http://localhost:3000',
      scenario: 'basic',
      timeout: 5000,
      successCriteria: {
        minSuccessRate: 99.9,
        maxP95Latency: 1000,
        maxP99Latency: 2000,
        maxErrorRate: 0.1,
      },
      ...config,
    };
  }

  /**
   * Register a load test scenario
   */
  registerScenario(name: string, scenario: LoadScenario): void {
    this.scenarios.set(name, scenario);
  }

  /**
   * Start the load test
   */
  async run(): Promise<LoadTestResult> {
    if (this.isRunning) {
      throw new Error('Load test already running');
    }

    const scenario = this.scenarios.get(this.config.scenario);
    if (!scenario) {
      throw new Error(`Scenario '${this.config.scenario}' not found`);
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.results = [];
    this.timeline = [];
    this.agentResults.clear();
    this.errorCounts.clear();

    const startTime = new Date();
    const testId = uuidv4();

    this.emit('start', { testId, config: this.config, startTime });

    try {
      // Start metrics collection interval
      const metricsInterval = setInterval(() => this.collectTimelinePoint(), 1000);

      // Run agents with ramp-up
      const agentPromises: Promise<void>[] = [];
      const rampUpDelay = (this.config.rampUpTime * 1000) / this.config.agentCount;

      for (let i = 0; i < this.config.agentCount; i++) {
        agentPromises.push(this.runAgent(i, scenario, rampUpDelay * i));
      }

      // Wait for all agents to complete or timeout
      await Promise.race([
        Promise.all(agentPromises),
        this.waitForDuration(this.config.duration * 1000),
      ]);

      // Stop metrics collection
      clearInterval(metricsInterval);

      // Final timeline point
      this.collectTimelinePoint();

      this.abortController?.abort();
    } finally {
      this.isRunning = false;
    }

    const endTime = new Date();
    const metrics = this.calculateMetrics();
    const violations = this.checkSuccessCriteria(metrics);

    const result: LoadTestResult = {
      id: testId,
      config: this.config,
      startTime,
      endTime,
      metrics,
      passed: violations.length === 0,
      violations,
    };

    this.emit('complete', result);
    return result;
  }

  /**
   * Stop the running load test
   */
  stop(): void {
    if (!this.isRunning) return;
    this.abortController?.abort();
    this.isRunning = false;
    this.emit('stop');
  }

  private async runAgent(agentIndex: number, scenario: LoadScenario, delayMs: number): Promise<void> {
    const agentId = `agent-${agentIndex}`;
    
    // Ramp-up delay
    await this.sleep(delayMs);
    
    if (this.abortController?.signal.aborted) return;

    const agentStats: AgentStats = {
      agentId,
      requests: 0,
      success: 0,
      failures: 0,
      avgLatency: 0,
    };
    this.agentResults.set(agentId, agentStats);

    const startTime = Date.now();
    const durationMs = this.config.duration * 1000;
    const requestInterval = 1000 / this.config.requestRate;
    let iteration = 0;
    let totalLatency = 0;

    while (Date.now() - startTime < durationMs && !this.abortController?.signal.aborted) {
      const requestStart = Date.now();
      
      try {
        const result = await this.runWithTimeout(
          scenario(agentId, iteration),
          this.config.timeout
        );

        result.latency = Date.now() - requestStart;
        this.results.push(result);

        // Update agent stats
        agentStats.requests++;
        if (result.success) {
          agentStats.success++;
        } else {
          agentStats.failures++;
          this.recordError(result.error || 'Unknown error');
        }
        totalLatency += result.latency;
        agentStats.avgLatency = totalLatency / agentStats.requests;

        this.emit('request', { agentId, iteration, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failedResult: RequestResult = {
          success: false,
          latency: Date.now() - requestStart,
          error: errorMessage,
          bytesSent: 0,
          bytesReceived: 0,
        };
        this.results.push(failedResult);
        agentStats.requests++;
        agentStats.failures++;
        this.recordError(errorMessage);
        
        this.emit('request', { agentId, iteration, result: failedResult });
      }

      iteration++;

      // Wait for next request interval
      const elapsed = Date.now() - requestStart;
      if (elapsed < requestInterval) {
        await this.sleep(requestInterval - elapsed);
      }
    }
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private waitForDuration(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordError(error: string): void {
    const errorType = this.classifyError(error);
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
  }

  private classifyError(error: string): string {
    if (error.includes('timeout')) return 'TIMEOUT';
    if (error.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (error.includes('ENOTFOUND')) return 'DNS_ERROR';
    if (error.includes('500')) return 'SERVER_ERROR_500';
    if (error.includes('502')) return 'BAD_GATEWAY';
    if (error.includes('503')) return 'SERVICE_UNAVAILABLE';
    if (error.includes('429')) return 'RATE_LIMITED';
    return 'UNKNOWN';
  }

  private collectTimelinePoint(): void {
    const recentResults = this.results.slice(-100);
    const activeAgents = Array.from(this.agentResults.values()).filter(
      a => a.requests > 0
    ).length;

    this.timeline.push({
      timestamp: Date.now(),
      requests: recentResults.length,
      errors: recentResults.filter(r => !r.success).length,
      avgLatency: recentResults.length > 0 
        ? recentResults.reduce((sum, r) => sum + r.latency, 0) / recentResults.length 
        : 0,
      activeAgents,
    });
  }

  private calculateMetrics(): LoadMetrics {
    const latencies = this.results.map(r => r.latency).sort((a, b) => a - b);
    const totalRequests = this.results.length;
    const successfulRequests = this.results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;

    const sum = latencies.reduce((a, b) => a + b, 0);
    const mean = totalRequests > 0 ? sum / totalRequests : 0;
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      latencies: {
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0,
        mean,
        median: this.percentile(latencies, 50),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        p99_9: this.percentile(latencies, 99.9),
      },
      throughput: {
        requestsPerSecond: totalRequests / this.config.duration,
        bytesPerSecond: 0, // Would calculate from actual bytes
      },
      agentStats: Array.from(this.agentResults.values()),
      errors: this.calculateErrorBreakdown(totalRequests),
      timeline: this.timeline,
    };
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private calculateErrorBreakdown(totalRequests: number): ErrorBreakdown[] {
    return Array.from(this.errorCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalRequests > 0 ? (count / totalRequests) * 100 : 0,
        sample: '', // Could capture actual error samples
      }))
      .sort((a, b) => b.count - a.count);
  }

  private checkSuccessCriteria(metrics: LoadMetrics): string[] {
    const violations: string[] = [];
    const { successCriteria } = this.config;

    if (metrics.successRate < successCriteria.minSuccessRate) {
      violations.push(
        `Success rate ${metrics.successRate.toFixed(2)}% below threshold ${successCriteria.minSuccessRate}%`
      );
    }

    if (metrics.latencies.p95 > successCriteria.maxP95Latency) {
      violations.push(
        `P95 latency ${metrics.latencies.p95}ms exceeds threshold ${successCriteria.maxP95Latency}ms`
      );
    }

    if (metrics.latencies.p99 > successCriteria.maxP99Latency) {
      violations.push(
        `P99 latency ${metrics.latencies.p99}ms exceeds threshold ${successCriteria.maxP99Latency}ms`
      );
    }

    if (metrics.errorRate > successCriteria.maxErrorRate) {
      violations.push(
        `Error rate ${metrics.errorRate.toFixed(2)}% exceeds threshold ${successCriteria.maxErrorRate}%`
      );
    }

    return violations;
  }
}

/**
 * Pre-built load test scenarios
 */
export const BuiltInScenarios = {
  /**
   * Basic health check scenario
   */
  healthCheck: (target: string): LoadScenario => {
    return async (_agentId: string, _iteration: number): Promise<RequestResult> => {
      const start = Date.now();
      try {
        // In real implementation, use actual HTTP client
        const response = await fetch(`${target}/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        
        const latency = Date.now() - start;
        const success = response.ok;
        
        return {
          success,
          latency,
          statusCode: response.status,
          bytesSent: 0,
          bytesReceived: Number(response.headers.get('content-length')) || 0,
          error: success ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          success: false,
          latency: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
          bytesSent: 0,
          bytesReceived: 0,
        };
      }
    };
  },

  /**
   * Agent creation scenario
   */
  createAgent: (target: string, payload?: Record<string, unknown>): LoadScenario => {
    return async (agentId: string, iteration: number): Promise<RequestResult> => {
      const start = Date.now();
      try {
        const body = JSON.stringify({
          name: `load-test-${agentId}-${iteration}`,
          type: 'worker',
          ...payload,
        });

        const response = await fetch(`${target}/api/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body,
        });

        const latency = Date.now() - start;
        const success = response.ok;

        return {
          success,
          latency,
          statusCode: response.status,
          bytesSent: body.length,
          bytesReceived: Number(response.headers.get('content-length')) || 0,
          error: success ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          success: false,
          latency: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
          bytesSent: 0,
          bytesReceived: 0,
        };
      }
    };
  },

  /**
   * Task execution scenario
   */
  executeTask: (target: string, taskType: string = 'compute'): LoadScenario => {
    return async (agentId: string, iteration: number): Promise<RequestResult> => {
      const start = Date.now();
      try {
        const body = JSON.stringify({
          type: taskType,
          agentId,
          payload: { iteration, timestamp: Date.now() },
        });

        const response = await fetch(`${target}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body,
        });

        const latency = Date.now() - start;
        const success = response.ok;

        return {
          success,
          latency,
          statusCode: response.status,
          bytesSent: body.length,
          bytesReceived: Number(response.headers.get('content-length')) || 0,
          error: success ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          success: false,
          latency: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
          bytesSent: 0,
          bytesReceived: 0,
        };
      }
    };
  },
};

export default LoadGenerator;

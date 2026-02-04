/**
 * Queue Metrics Collector
 * 
 * Collects and exposes metrics for the task queue system:
 * - Queue depth (pending, processing, scheduled, dead letter counts)
 * - Processing time tracking (avg, min, max, p95)
 * - Throughput counters (enqueued, completed, failed, retried)
 * - Agent utilization stats
 * 
 * Integrates with Prometheus for metrics export.
 */

import Redis from 'ioredis';
import { Counter, Gauge, Histogram, register } from 'prom-client';
import type { QueueMetrics } from './types';

export class QueueMetricsCollector {
  private redis: Redis;
  private keyPrefix: string;
  
  // Prometheus metrics
  private readonly queueDepthGauge: Gauge<string>;
  private readonly tasksCounter: Counter<string>;
  private readonly processingTimeHistogram: Histogram<string>;
  private readonly agentLoadGauge: Gauge<string>;
  private readonly retryCounter: Counter<string>;
  private readonly deadLetterCounter: Counter<string>;

  constructor(redis: Redis, keyPrefix: string) {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
    
    // Initialize Prometheus metrics
    this.queueDepthGauge = new Gauge({
      name: 'dash_queue_depth',
      help: 'Current number of tasks in each queue state',
      labelNames: ['state'],
    });
    
    this.tasksCounter = new Counter({
      name: 'dash_queue_tasks_total',
      help: 'Total number of tasks processed',
      labelNames: ['status'],
    });
    
    this.processingTimeHistogram = new Histogram({
      name: 'dash_queue_processing_duration_seconds',
      help: 'Task processing duration in seconds',
      labelNames: ['task_type'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 600],
    });
    
    this.agentLoadGauge = new Gauge({
      name: 'dash_queue_agent_load',
      help: 'Current load on each agent',
      labelNames: ['agent_id', 'status'],
    });
    
    this.retryCounter = new Counter({
      name: 'dash_queue_retries_total',
      help: 'Total number of task retries',
      labelNames: ['task_type'],
    });
    
    this.deadLetterCounter = new Counter({
      name: 'dash_queue_dead_letter_total',
      help: 'Total number of tasks moved to dead letter queue',
      labelNames: ['reason'],
    });
    
    // Register metrics
    register.registerMetric(this.queueDepthGauge);
    register.registerMetric(this.tasksCounter);
    register.registerMetric(this.processingTimeHistogram);
    register.registerMetric(this.agentLoadGauge);
    register.registerMetric(this.retryCounter);
    register.registerMetric(this.deadLetterCounter);
  }

  // ========================================================================
  // METRIC UPDATES
  // ========================================================================

  /**
   * Increment enqueued tasks counter
   */
  async incrementTasksEnqueued(): Promise<void> {
    this.tasksCounter.inc({ status: 'enqueued' });
    await this.redis.hincrby(`${this.keyPrefix}:metrics:counters`, 'enqueued', 1);
  }

  /**
   * Increment completed tasks counter
   */
  async incrementTasksCompleted(processingTimeMs: number): Promise<void> {
    this.tasksCounter.inc({ status: 'completed' });
    this.processingTimeHistogram.observe(processingTimeMs / 1000);
    
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(`${this.keyPrefix}:metrics:counters`, 'completed', 1);
    pipeline.lpush(`${this.keyPrefix}:metrics:processing_times`, String(processingTimeMs));
    pipeline.ltrim(`${this.keyPrefix}:metrics:processing_times`, 0, 9999); // Keep last 10k
    await pipeline.exec();
  }

  /**
   * Increment failed tasks counter
   */
  async incrementTasksFailed(): Promise<void> {
    this.tasksCounter.inc({ status: 'failed' });
    await this.redis.hincrby(`${this.keyPrefix}:metrics:counters`, 'failed', 1);
  }

  /**
   * Increment retried tasks counter
   */
  async incrementTasksRetried(): Promise<void> {
    this.retryCounter.inc({ task_type: 'all' });
    await this.redis.hincrby(`${this.keyPrefix}:metrics:counters`, 'retried', 1);
  }

  /**
   * Increment dead letter counter
   */
  async incrementTasksDeadLettered(): Promise<void> {
    this.deadLetterCounter.inc({ reason: 'max_retries_exceeded' });
    await this.redis.hincrby(`${this.keyPrefix}:metrics:counters`, 'dead_lettered', 1);
  }

  /**
   * Update queue depth gauge
   */
  async updateQueueDepth(state: string, count: number): Promise<void> {
    this.queueDepthGauge.set({ state }, count);
  }

  /**
   * Update agent load gauge
   */
  updateAgentLoad(agentId: string, currentLoad: number, capacity: number, status: string): void {
    this.agentLoadGauge.set(
      { agent_id: agentId, status },
      currentLoad
    );
  }

  // ========================================================================
  // METRICS QUERY
  // ========================================================================

  /**
   * Get all queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const [
      pendingCount,
      processingCount,
      scheduledCount,
      deadLetterCount,
      counters,
      processingTimes,
      agents,
    ] = await Promise.all([
      this.redis.llen(`${this.keyPrefix}:queue:pending`),
      this.redis.zcard(`${this.keyPrefix}:tasks:processing`),
      this.redis.zcard(`${this.keyPrefix}:queue:scheduled`),
      this.redis.zcard(`${this.keyPrefix}:queue:dead`),
      this.redis.hgetall(`${this.keyPrefix}:metrics:counters`),
      this.redis.lrange(`${this.keyPrefix}:metrics:processing_times`, 0, 9999),
      this.getAgentMetrics(),
    ]);

    // Calculate processing time stats
    const times = processingTimes.map(t => parseInt(t, 10)).filter(t => !isNaN(t));
    const stats = this.calculateStats(times);

    return {
      // Queue depth
      pendingCount,
      processingCount,
      scheduledCount,
      deadLetterCount,
      
      // Throughput
      tasksEnqueued: parseInt(counters['enqueued'] || '0', 10),
      tasksCompleted: parseInt(counters['completed'] || '0', 10),
      tasksFailed: parseInt(counters['failed'] || '0', 10),
      tasksRetried: parseInt(counters['retried'] || '0', 10),
      tasksDeadLettered: parseInt(counters['dead_lettered'] || '0', 10),
      
      // Processing times
      avgProcessingTimeMs: stats.avg,
      minProcessingTimeMs: stats.min,
      maxProcessingTimeMs: stats.max,
      p95ProcessingTimeMs: stats.p95,
      
      // Agent stats
      activeAgents: agents.active,
      totalCapacity: agents.capacity,
      currentLoad: agents.load,
    };
  }

  /**
   * Get Prometheus-formatted metrics
   */
  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.getMetrics();
    
    // Update gauges with current values
    this.queueDepthGauge.set({ state: 'pending' }, metrics.pendingCount);
    this.queueDepthGauge.set({ state: 'processing' }, metrics.processingCount);
    this.queueDepthGauge.set({ state: 'scheduled' }, metrics.scheduledCount);
    this.queueDepthGauge.set({ state: 'dead_letter' }, metrics.deadLetterCount);
    
    return register.metrics();
  }

  /**
   * Reset all counters (useful for testing)
   */
  async reset(): Promise<void> {
    await this.redis.del(`${this.keyPrefix}:metrics:counters`);
    await this.redis.del(`${this.keyPrefix}:metrics:processing_times`);
    
    this.tasksCounter.reset();
    this.retryCounter.reset();
    this.deadLetterCounter.reset();
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private async getAgentMetrics(): Promise<{
    active: number;
    capacity: number;
    load: number;
  }> {
    const agentIds = await this.redis.smembers(`${this.keyPrefix}:agents`);
    let active = 0;
    let capacity = 0;
    let load = 0;
    
    for (const id of agentIds) {
      const data = await this.redis.get(`${this.keyPrefix}:agent:${id}`);
      if (data) {
        try {
          const agent = JSON.parse(data);
          if (agent.status !== 'offline') {
            active++;
            capacity += agent.capacity || 1;
            load += agent.currentLoad || 0;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
    
    return { active, capacity, load };
  }

  private calculateStats(values: number[]): {
    avg: number;
    min: number;
    max: number;
    p95: number;
  } {
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    const avg = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    // Calculate p95
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[Math.max(0, p95Index)];
    
    return { avg, min, max, p95 };
  }
}

export default QueueMetricsCollector;

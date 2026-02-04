/**
 * Scheduling Metrics
 * 
 * Prometheus metrics export for the scheduling system.
 * Includes scheduling latency, resource utilization, preemption count, etc.
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { Scheduler } from './scheduler';
import { logger } from '../utils/logger';

// ============================================================================
// SCHEDULING METRICS CLASS
// ============================================================================

export interface SchedulingMetricsConfig {
  /** Prometheus registry */
  registry?: Registry;
  /** Metric prefix */
  prefix?: string;
  /** Enable collection interval */
  enableCollection?: boolean;
  /** Collection interval (ms) */
  collectionIntervalMs?: number;
}

export class SchedulingMetrics {
  private registry: Registry;
  private prefix: string;
  private scheduler?: Scheduler;
  private collectionInterval?: NodeJS.Timeout;
  private config: Required<Omit<SchedulingMetricsConfig, 'registry'>> &
    Pick<SchedulingMetricsConfig, 'registry'>;

  // Scheduling counters
  public readonly schedulingAttemptsTotal: Counter<string>;
  public readonly schedulingSuccessesTotal: Counter<string>;
  public readonly schedulingFailuresTotal: Counter<string>;
  public readonly preemptionTotal: Counter<string>;
  public readonly affinityViolationsTotal: Counter<string>;

  // Scheduling latency
  public readonly schedulingLatencyHistogram: Histogram<string>;

  // Resource gauges
  public readonly nodeCpuUtilization: Gauge<string>;
  public readonly nodeMemoryUtilization: Gauge<string>;
  public readonly nodeOverallUtilization: Gauge<string>;
  public readonly nodeAgentCount: Gauge<string>;

  // Cluster-wide gauges
  public readonly clusterCpuUtilization: Gauge;
  public readonly clusterMemoryUtilization: Gauge;
  public readonly clusterOverallUtilization: Gauge;
  public readonly healthyNodeCount: Gauge;
  public readonly totalNodeCount: Gauge;

  // Preemption gauges
  public readonly preemptedAgentsGauge: Gauge;
  public readonly checkpointCountGauge: Gauge;

  constructor(config: SchedulingMetricsConfig = {}) {
    this.config = {
      prefix: 'dash_scheduler',
      enableCollection: true,
      collectionIntervalMs: 15000,
      ...config,
    };

    this.prefix = this.config.prefix;
    this.registry = config.registry || new Registry();

    // Initialize counters
    this.schedulingAttemptsTotal = new Counter({
      name: `${this.prefix}_scheduling_attempts_total`,
      help: 'Total number of scheduling attempts',
      labelNames: ['priority_class'],
      registers: [this.registry],
    });

    this.schedulingSuccessesTotal = new Counter({
      name: `${this.prefix}_scheduling_successes_total`,
      help: 'Total number of successful scheduling operations',
      labelNames: ['priority_class'],
      registers: [this.registry],
    });

    this.schedulingFailuresTotal = new Counter({
      name: `${this.prefix}_scheduling_failures_total`,
      help: 'Total number of failed scheduling operations',
      labelNames: ['priority_class', 'reason'],
      registers: [this.registry],
    });

    this.preemptionTotal = new Counter({
      name: `${this.prefix}_preemption_total`,
      help: 'Total number of preemptions performed',
      labelNames: ['node_id'],
      registers: [this.registry],
    });

    this.affinityViolationsTotal = new Counter({
      name: `${this.prefix}_affinity_violations_total`,
      help: 'Total number of affinity rule violations',
      registers: [this.registry],
    });

    // Initialize histograms
    this.schedulingLatencyHistogram = new Histogram({
      name: `${this.prefix}_scheduling_latency_seconds`,
      help: 'Scheduling latency in seconds',
      labelNames: ['result'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // Initialize node gauges
    this.nodeCpuUtilization = new Gauge({
      name: `${this.prefix}_node_cpu_utilization`,
      help: 'CPU utilization ratio per node (0-1)',
      labelNames: ['node_id'],
      registers: [this.registry],
    });

    this.nodeMemoryUtilization = new Gauge({
      name: `${this.prefix}_node_memory_utilization`,
      help: 'Memory utilization ratio per node (0-1)',
      labelNames: ['node_id'],
      registers: [this.registry],
    });

    this.nodeOverallUtilization = new Gauge({
      name: `${this.prefix}_node_overall_utilization`,
      help: 'Overall resource utilization per node (0-1)',
      labelNames: ['node_id'],
      registers: [this.registry],
    });

    this.nodeAgentCount = new Gauge({
      name: `${this.prefix}_node_agent_count`,
      help: 'Number of agents scheduled per node',
      labelNames: ['node_id'],
      registers: [this.registry],
    });

    // Initialize cluster gauges
    this.clusterCpuUtilization = new Gauge({
      name: `${this.prefix}_cluster_cpu_utilization`,
      help: 'Average CPU utilization across all nodes (0-1)',
      registers: [this.registry],
    });

    this.clusterMemoryUtilization = new Gauge({
      name: `${this.prefix}_cluster_memory_utilization`,
      help: 'Average memory utilization across all nodes (0-1)',
      registers: [this.registry],
    });

    this.clusterOverallUtilization = new Gauge({
      name: `${this.prefix}_cluster_overall_utilization`,
      help: 'Average overall utilization across all nodes (0-1)',
      registers: [this.registry],
    });

    this.healthyNodeCount = new Gauge({
      name: `${this.prefix}_healthy_nodes`,
      help: 'Number of healthy nodes',
      registers: [this.registry],
    });

    this.totalNodeCount = new Gauge({
      name: `${this.prefix}_total_nodes`,
      help: 'Total number of registered nodes',
      registers: [this.registry],
    });

    // Initialize preemption gauges
    this.preemptedAgentsGauge = new Gauge({
      name: `${this.prefix}_preempted_agents`,
      help: 'Number of currently preempted agents',
      registers: [this.registry],
    });

    this.checkpointCountGauge = new Gauge({
      name: `${this.prefix}_checkpoint_count`,
      help: 'Number of stored checkpoints',
      registers: [this.registry],
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Attach to a scheduler for automatic metric collection
   */
  attach(scheduler: Scheduler): void {
    this.scheduler = scheduler;

    // Listen to scheduling events
    scheduler.on('scheduling.event', (event) => {
      this.recordSchedulingEvent(event);
    });

    scheduler.on('scheduling.succeeded', (event) => {
      this._recordSchedulingSuccess(event);
    });

    scheduler.on('scheduling.failed', (event) => {
      this._recordSchedulingFailure(event);
    });

    scheduler.on('scheduling.preempted', (event) => {
      this._recordPreemption(event);
    });

    // Start periodic collection
    if (this.config.enableCollection) {
      this.startCollection();
    }

    logger.info('[SchedulingMetrics] Attached to scheduler');
  }

  /**
   * Detach from scheduler
   */
  detach(): void {
    this.stopCollection();
    this.scheduler = undefined;
    logger.info('[SchedulingMetrics] Detached from scheduler');
  }

  /**
   * Start periodic metric collection
   */
  startCollection(): void {
    if (this.collectionInterval) return;

    this.collectionInterval = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.collectionIntervalMs);

    logger.info('[SchedulingMetrics] Started metric collection');
  }

  /**
   * Stop periodic collection
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  // ============================================================================
  // METRIC RECORDING
  // ============================================================================

  private recordSchedulingEvent(event: {
    type: string;
    agentId?: string;
    payload: Record<string, unknown>;
  }): void {
    const priorityClass = (event.payload["priority"] as { priorityClass: string })?.priorityClass || 'normal';

    switch (event.type) {
      case 'scheduling.requested':
        this.schedulingAttemptsTotal.inc({ priority_class: priorityClass });
        break;
    }
  }

  private _recordSchedulingSuccess(event: {
    agentId?: string;
    payload: Record<string, unknown>;
  }): void {
    const latency = (event.payload['latency'] as number) || 0;
    this.schedulingSuccessesTotal.inc({});
    this.schedulingLatencyHistogram.observe({ result: 'success' }, latency / 1000);
  }

  private _recordSchedulingFailure(event: {
    agentId?: string;
    payload: Record<string, unknown>;
  }): void {
    const latency = (event.payload['latency'] as number) || 0;
    const error = (event.payload['error'] as string) || 'unknown';

    this.schedulingFailuresTotal.inc({ priority_class: 'unknown', reason: error });
    this.schedulingLatencyHistogram.observe({ result: 'failure' }, latency / 1000);
  }

  private _recordPreemption(event: {
    agentId: string;
    preemptedBy: string;
    nodeId: string;
  }): void {
    this.preemptionTotal.inc({ node_id: event['nodeId'] });
  }

  // ============================================================================
  // PERIODIC COLLECTION
  // ============================================================================

  private async collectMetrics(): Promise<void> {
    if (!this.scheduler) return;

    try {
      // Get scheduler metrics
      const metrics = this.scheduler.getMetrics();
      const clusterUtil = await metrics.clusterUtilization;

      // Update cluster gauges
      this.clusterCpuUtilization.set(clusterUtil.average.cpu);
      this.clusterMemoryUtilization.set(clusterUtil.average.memory);
      this.clusterOverallUtilization.set(clusterUtil.average.overall);

      // Update node gauges
      for (const [nodeId, util] of Object.entries(clusterUtil.nodes)) {
        this.nodeCpuUtilization.set({ node_id: nodeId }, util.cpu);
        this.nodeMemoryUtilization.set({ node_id: nodeId }, util.memory);
        this.nodeOverallUtilization.set({ node_id: nodeId }, util.overall);
      }

      // Get node allocations
      const nodes = await this.scheduler.getNodes();
      this.totalNodeCount.set(nodes.length);
      this.healthyNodeCount.set(nodes.filter((n) => n.healthy).length);

      // Update agent counts per node
      for (const node of nodes) {
        this.nodeAgentCount.set(
          { node_id: node.capacity['nodeId'] },
          node["agents"].length
        );
      }

      // Update preemption metrics
      const preemptionSystem = this.scheduler.getPreemptionSystem();
      const preemptedAgents = preemptionSystem.getAllPreemptedAgents();
      this.preemptedAgentsGauge.set(preemptedAgents.length);

      // Count checkpoints
      let checkpointCount = 0;
      for (const agent of preemptedAgents) {
        if (agent.checkpointCreated) checkpointCount++;
      }
      this.checkpointCountGauge.set(checkpointCount);

    } catch (error) {
      logger['error']('[SchedulingMetrics] Error collecting metrics:', error);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Record a scheduling attempt
   */
  recordSchedulingAttempt(priorityClass: string = 'normal'): void {
    this.schedulingAttemptsTotal.inc({ priority_class: priorityClass });
  }

  /**
   * Record a successful scheduling
   */
  recordSchedulingSuccess(priorityClass: string = 'normal', latencyMs: number = 0): void {
    this.schedulingSuccessesTotal.inc({ priority_class: priorityClass });
    this.schedulingLatencyHistogram.observe({ result: 'success' }, latencyMs / 1000);
  }

  /**
   * Record a failed scheduling
   */
  recordSchedulingFailure(
    priorityClass: string = 'normal',
    reason: string = 'unknown',
    latencyMs: number = 0
  ): void {
    this.schedulingFailuresTotal.inc({ priority_class: priorityClass, reason });
    this.schedulingLatencyHistogram.observe({ result: 'failure' }, latencyMs / 1000);
  }

  /**
   * Record an affinity violation
   */
  recordAffinityViolation(): void {
    this.affinityViolationsTotal.inc();
  }

  /**
   * Record a preemption
   */
  recordPreemption(nodeId: string): void {
    this.preemptionTotal.inc({ node_id: nodeId });
  }

  /**
   * Update node utilization metrics
   */
  updateNodeUtilization(
    nodeId: string,
    cpuUtil: number,
    memoryUtil: number,
    overallUtil: number
  ): void {
    this.nodeCpuUtilization.set({ node_id: nodeId }, cpuUtil);
    this.nodeMemoryUtilization.set({ node_id: nodeId }, memoryUtil);
    this.nodeOverallUtilization.set({ node_id: nodeId }, overallUtil);
  }

  /**
   * Update cluster utilization
   */
  updateClusterUtilization(
    cpuUtil: number,
    memoryUtil: number,
    overallUtil: number
  ): void {
    this.clusterCpuUtilization.set(cpuUtil);
    this.clusterMemoryUtilization.set(memoryUtil);
    this.clusterOverallUtilization.set(overallUtil);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get the registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.registry.resetMetrics();
  }
}

export default SchedulingMetrics;

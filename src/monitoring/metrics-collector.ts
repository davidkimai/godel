import { createServer, IncomingMessage, ServerResponse } from 'http';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * Metric types supported by the collector
 */
type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * VM resource metrics interface
 */
interface VMMetrics {
  runtimeId: string;
  cpu: number;
  memory: number;
  disk: number;
  networkRx: number;
  networkTx: number;
  timestamp: Date;
}

/**
 * Cost attribution data interface
 */
interface CostAttribution {
  runtimeId: string;
  teamId: string;
  agentId: string;
  costPerHour: number;
  accumulatedCost: number;
  lastUpdated: Date;
}

/**
 * Historical data point for time-series storage
 */
interface HistoricalDataPoint {
  timestamp: number;
  value: number;
  labels: Record<string, string>;
}

/**
 * Configuration for the metrics collector
 */
interface MetricsCollectorConfig {
  collectionIntervalMs?: number;
  maxHistoricalDataPoints?: number;
  enableDefaultMetrics?: boolean;
  httpPort?: number;
  httpPath?: string;
}

/**
 * MetricsCollector - Prometheus-compatible metrics collection for Godel VMs
 * 
 * Collects VM metrics (CPU, memory, I/O, network), cost attribution per team/agent,
 * and provides real-time and historical data collection with Grafana export support.
 */
export class MetricsCollector {
  private config: Required<MetricsCollectorConfig>;
  private server?: ReturnType<typeof createServer>;
  private collectionTimer?: ReturnType<typeof setInterval>;
  
  // Prometheus metrics
  private bootDurationHistogram: Histogram<string>;
  private executionDurationHistogram: Histogram<string>;
  private memoryUsageGauge: Gauge<string>;
  private cpuUsageGauge: Gauge<string>;
  private diskUsageGauge: Gauge<string>;
  private networkRxGauge: Gauge<string>;
  private networkTxGauge: Gauge<string>;
  private costPerAgentGauge: Gauge<string>;
  private costPerTeamGauge: Gauge<string>;
  private budgetRemainingGauge: Gauge<string>;
  
  // In-memory storage for historical data (circular buffers)
  private historicalData: Map<string, HistoricalDataPoint[]> = new Map();
  private costAttribution: Map<string, CostAttribution> = new Map();
  private vmMetrics: Map<string, VMMetrics> = new Map();
  
  // Thread-safe update queue
  private updateQueue: Array<() => void> = [];
  private isProcessingQueue = false;

  constructor(config: MetricsCollectorConfig = {}) {
    this.config = {
      collectionIntervalMs: config.collectionIntervalMs ?? 15000,
      maxHistoricalDataPoints: config.maxHistoricalDataPoints ?? 10000,
      enableDefaultMetrics: config.enableDefaultMetrics ?? true,
      httpPort: config.httpPort ?? 9090,
      httpPath: config.httpPath ?? '/metrics',
    };

    this.initializeMetrics();
    
    if (this.config.enableDefaultMetrics) {
      collectDefaultMetrics({ register });
    }
  }

  /**
   * Initialize all Prometheus metrics
   */
  private initializeMetrics(): void {
    // VM boot duration histogram
    this.bootDurationHistogram = new Histogram({
      name: 'godel_runtime_boot_duration_seconds',
      help: 'Time taken to boot a VM in seconds',
      labelNames: ['runtime_type', 'team_id'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    // VM execution duration histogram
    this.executionDurationHistogram = new Histogram({
      name: 'godel_runtime_execution_duration_seconds',
      help: 'Time taken to execute commands in a VM',
      labelNames: ['runtime_id', 'team_id'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
    });

    // Memory usage gauge
    this.memoryUsageGauge = new Gauge({
      name: 'godel_runtime_memory_usage_bytes',
      help: 'Current memory usage of VMs in bytes',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // CPU usage gauge
    this.cpuUsageGauge = new Gauge({
      name: 'godel_runtime_cpu_usage_cores',
      help: 'Current CPU usage of VMs in cores',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // Disk usage gauge
    this.diskUsageGauge = new Gauge({
      name: 'godel_runtime_disk_usage_bytes',
      help: 'Current disk usage of VMs in bytes',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // Network RX gauge
    this.networkRxGauge = new Gauge({
      name: 'godel_runtime_network_rx_bytes',
      help: 'Total network bytes received by VMs',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // Network TX gauge
    this.networkTxGauge = new Gauge({
      name: 'godel_runtime_network_tx_bytes',
      help: 'Total network bytes transmitted by VMs',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // Cost per agent gauge
    this.costPerAgentGauge = new Gauge({
      name: 'godel_cost_per_agent_dollars',
      help: 'Accumulated cost per agent in dollars',
      labelNames: ['runtime_id', 'team_id', 'agent_id'],
    });

    // Cost per team gauge
    this.costPerTeamGauge = new Gauge({
      name: 'godel_cost_per_team_dollars',
      help: 'Accumulated cost per team in dollars',
      labelNames: ['team_id'],
    });

    // Budget remaining gauge
    this.budgetRemainingGauge = new Gauge({
      name: 'godel_budget_remaining_percent',
      help: 'Remaining budget percentage per team',
      labelNames: ['team_id'],
    });

    // Register all metrics
    register.registerMetric(this.bootDurationHistogram);
    register.registerMetric(this.executionDurationHistogram);
    register.registerMetric(this.memoryUsageGauge);
    register.registerMetric(this.cpuUsageGauge);
    register.registerMetric(this.diskUsageGauge);
    register.registerMetric(this.networkRxGauge);
    register.registerMetric(this.networkTxGauge);
    register.registerMetric(this.costPerAgentGauge);
    register.registerMetric(this.costPerTeamGauge);
    register.registerMetric(this.budgetRemainingGauge);
  }

  /**
   * Start the metrics collection and HTTP server
   */
  public async start(): Promise<void> {
    await this.startHTTPServer();
    this.startCollection();
    console.log(`[MetricsCollector] Started on port ${this.config.httpPort}`);
  }

  /**
   * Stop the metrics collection and HTTP server
   */
  public async stop(): Promise<void> {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = undefined;
    }
    
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
    }
    
    console.log('[MetricsCollector] Stopped');
  }

  /**
   * Start the HTTP server for Prometheus scraping
   */
  private async startHTTPServer(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === this.config.httpPath) {
        this.handleMetricsRequest(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    return new Promise((resolve, reject) => {
      this.server?.listen(this.config.httpPort, () => {
        resolve();
      });
      
      this.server?.on('error', reject);
    });
  }

  /**
   * Handle Prometheus metrics scrape requests
   */
  private async handleMetricsRequest(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const metrics = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(metrics);
    } catch (error) {
      res.writeHead(500);
      res.end(`Error collecting metrics: ${error}`);
    }
  }

  /**
   * Start periodic metrics collection
   */
  private startCollection(): void {
    this.collectionTimer = setInterval(() => {
      this.collectAllMetrics();
    }, this.config.collectionIntervalMs);
  }

  /**
   * Collect metrics from all active VMs
   */
  private collectAllMetrics(): void {
    // Process any pending updates in a thread-safe manner
    this.processUpdateQueue();
    
    // Update Prometheus gauges with current values
    this.vmMetrics.forEach((metrics) => {
      const labels = {
        runtime_id: metrics.runtimeId,
        team_id: this.getTeamId(metrics.runtimeId),
        agent_id: this.getAgentId(metrics.runtimeId),
      };

      this.cpuUsageGauge.set(labels, metrics.cpu);
      this.memoryUsageGauge.set(labels, metrics.memory);
      this.diskUsageGauge.set(labels, metrics.disk);
      this.networkRxGauge.set(labels, metrics.networkRx);
      this.networkTxGauge.set(labels, metrics.networkTx);

      // Store historical data
      this.storeHistoricalData('cpu', metrics.cpu, labels);
      this.storeHistoricalData('memory', metrics.memory, labels);
      this.storeHistoricalData('disk', metrics.disk, labels);
      this.storeHistoricalData('network_rx', metrics.networkRx, labels);
      this.storeHistoricalData('network_tx', metrics.networkTx, labels);
    });

    // Update cost metrics
    this.updateCostMetrics();
  }

  /**
   * Process the update queue in a thread-safe manner
   */
  private processUpdateQueue(): void {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    
    while (this.updateQueue.length > 0) {
      const update = this.updateQueue.shift();
      update?.();
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Store historical data point with circular buffer
   */
  private storeHistoricalData(metricName: string, value: number, labels: Record<string, string>): void {
    const key = `${metricName}:${JSON.stringify(labels)}`;
    const dataPoint: HistoricalDataPoint = {
      timestamp: Date.now(),
      value,
      labels,
    };

    if (!this.historicalData.has(key)) {
      this.historicalData.set(key, []);
    }

    const buffer = this.historicalData.get(key)!;
    buffer.push(dataPoint);

    // Maintain circular buffer size
    if (buffer.length > this.config.maxHistoricalDataPoints) {
      buffer.shift();
    }
  }

  /**
   * Update cost-related metrics
   */
  private updateCostMetrics(): void {
    const teamCosts = new Map<string, number>();

    this.costAttribution.forEach((cost) => {
      const labels = {
        runtime_id: cost.runtimeId,
        team_id: cost.teamId,
        agent_id: cost.agentId,
      };

      this.costPerAgentGauge.set(labels, cost.accumulatedCost);

      // Accumulate team costs
      const currentTeamCost = teamCosts.get(cost.teamId) ?? 0;
      teamCosts.set(cost.teamId, currentTeamCost + cost.accumulatedCost);
    });

    teamCosts.forEach((cost, teamId) => {
      this.costPerTeamGauge.set({ team_id: teamId }, cost);
    });
  }

  /**
   * Record VM boot duration
   */
  public recordBootDuration(runtimeType: string, teamId: string, durationSeconds: number): void {
    this.queueUpdate(() => {
      this.bootDurationHistogram.observe({ runtime_type: runtimeType, team_id: teamId }, durationSeconds);
    });
  }

  /**
   * Record command execution duration
   */
  public recordExecutionDuration(runtimeId: string, teamId: string, durationSeconds: number): void {
    this.queueUpdate(() => {
      this.executionDurationHistogram.observe({ runtime_id: runtimeId, team_id: teamId }, durationSeconds);
    });
  }

  /**
   * Update VM resource metrics
   */
  public updateVMMetrics(metrics: VMMetrics): void {
    this.queueUpdate(() => {
      this.vmMetrics.set(metrics.runtimeId, metrics);
    });
  }

  /**
   * Update cost attribution for an agent
   */
  public updateCostAttribution(cost: CostAttribution): void {
    this.queueUpdate(() => {
      this.costAttribution.set(cost.runtimeId, cost);
    });
  }

  /**
   * Update budget remaining percentage for a team
   */
  public updateBudgetRemaining(teamId: string, remainingPercent: number): void {
    this.queueUpdate(() => {
      this.budgetRemainingGauge.set({ team_id: teamId }, remainingPercent);
    });
  }

  /**
   * Queue an update for thread-safe processing
   */
  private queueUpdate(update: () => void): void {
    this.updateQueue.push(update);
  }

  /**
   * Get historical data for a specific metric and time range
   */
  public getHistoricalData(
    metricName: string,
    labels: Record<string, string>,
    startTime?: Date,
    endTime?: Date
  ): HistoricalDataPoint[] {
    const key = `${metricName}:${JSON.stringify(labels)}`;
    const data = this.historicalData.get(key) ?? [];

    return data.filter((point) => {
      const timestamp = new Date(point.timestamp);
      if (startTime && timestamp < startTime) return false;
      if (endTime && timestamp > endTime) return false;
      return true;
    });
  }

  /**
   * Get cost attribution for a specific runtime
   */
  public getCostAttribution(runtimeId: string): CostAttribution | undefined {
    return this.costAttribution.get(runtimeId);
  }

  /**
   * Get all cost attributions for a team
   */
  public getTeamCostAttributions(teamId: string): CostAttribution[] {
    return Array.from(this.costAttribution.values()).filter(
      (cost) => cost.teamId === teamId
    );
  }

  /**
   * Generate Grafana dashboard JSON configuration
   */
  public generateGrafanaDashboard(): Record<string, unknown> {
    return {
      dashboard: {
        id: null,
        title: 'Godel VM Metrics',
        tags: ['godel', 'vm', 'metrics'],
        timezone: 'browser',
        schemaVersion: 36,
        refresh: '15s',
        panels: [
          {
            id: 1,
            title: 'VM Boot Duration',
            type: 'graph',
            targets: [
              {
                expr: 'godel_runtime_boot_duration_seconds',
                legendFormat: '{{runtime_type}} - {{team_id}}',
              },
            ],
          },
          {
            id: 2,
            title: 'CPU Usage',
            type: 'graph',
            targets: [
              {
                expr: 'godel_runtime_cpu_usage_cores',
                legendFormat: '{{runtime_id}}',
              },
            ],
          },
          {
            id: 3,
            title: 'Memory Usage',
            type: 'graph',
            targets: [
              {
                expr: 'godel_runtime_memory_usage_bytes',
                legendFormat: '{{runtime_id}}',
              },
            ],
          },
          {
            id: 4,
            title: 'Cost Per Team',
            type: 'graph',
            targets: [
              {
                expr: 'godel_cost_per_team_dollars',
                legendFormat: '{{team_id}}',
              },
            ],
          },
          {
            id: 5,
            title: 'Budget Remaining',
            type: 'graph',
            targets: [
              {
                expr: 'godel_budget_remaining_percent',
                legendFormat: '{{team_id}}',
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Export metrics to a file (for debugging or backup)
   */
  public async exportMetricsToFile(filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const metrics = await register.metrics();
    await fs.writeFile(filePath, metrics);
  }

  /**
   * Get current metrics as a formatted string
   */
  public async getMetricsString(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics and historical data
   */
  public clear(): void {
    this.vmMetrics.clear();
    this.costAttribution.clear();
    this.historicalData.clear();
    register.resetMetrics();
  }

  // Helper methods (would be replaced with actual lookup logic)
  private getTeamId(runtimeId: string): string {
    // In production, this would look up the team from a database
    return runtimeId.split('-')[0] ?? 'unknown';
  }

  private getAgentId(runtimeId: string): string {
    // In production, this would look up the agent from a database
    return runtimeId.split('-')[1] ?? 'unknown';
  }
}

// Export types
export type { VMMetrics, CostAttribution, HistoricalDataPoint, MetricsCollectorConfig };

// Default export
export default MetricsCollector;

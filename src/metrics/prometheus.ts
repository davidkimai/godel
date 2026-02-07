/**
 * Prometheus Metrics Export for Godel
 * 
 * Provides Prometheus-compatible metrics for monitoring the Godel orchestration platform.
 * Includes gauges, counters, and histograms for all key system metrics.
 */

import { logger } from '../utils/logger';
import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { AgentEventBus, AgentEvent, AgentEventType } from '../core/event-bus';
import { TeamOrchestrator } from '../core/team-orchestrator';

// ============================================================================
// METRIC LABELS
// ============================================================================

export interface AgentMetricLabels {
  agentId: string;
  teamId: string;
  status: string;
}

export interface TeamMetricLabels {
  teamId: string;
  strategy: string;
  status: string;
}

export interface EventMetricLabels {
  eventType: string;
  teamId?: string;
  agentId?: string;
}

export interface ApiMetricLabels {
  method: string;
  route: string;
  statusCode: string;
}

export interface ErrorMetricLabels {
  errorType: string;
  component: string;
  severity: string;
}

// ============================================================================
// PROMETHEUS METRICS REGISTRY
// ============================================================================

export class PrometheusMetrics {
  // Agent count gauges
  public readonly agentActiveGauge: Gauge<string>;
  public readonly agentPendingGauge: Gauge<string>;
  public readonly agentFailedGauge: Gauge<string>;
  public readonly agentCompletedGauge: Gauge<string>;
  public readonly agentTotalGauge: Gauge<string>;

  // Team gauges
  public readonly swarmActiveGauge: Gauge<string>;
  public readonly swarmTotalGauge: Gauge<string>;
  public readonly swarmAgentsGauge: Gauge<string>;
  
  // Event counters
  public readonly eventsTotalCounter: Counter<string>;
  public readonly eventsDroppedCounter: Counter<string>;
  
  // Latency histograms
  public readonly eventProcessingHistogram: Histogram<string>;
  public readonly apiLatencyHistogram: Histogram<string>;
  public readonly agentExecutionHistogram: Histogram<string>;
  public readonly toolCallHistogram: Histogram<string>;
  
  // Error counters
  public readonly errorsTotalCounter: Counter<string>;
  public readonly agentFailuresCounter: Counter<string>;
  
  // Business metrics
  public readonly swarmSuccessCounter: Counter<string>;
  public readonly swarmFailureCounter: Counter<string>;
  public readonly swarmCostGauge: Gauge<string>;
  public readonly swarmDurationHistogram: Histogram<string>;
  public readonly budgetUtilizationGauge: Gauge<string>;
  
  // System metrics
  public readonly memoryUsageGauge: Gauge<string>;
  public readonly cpuUsageGauge: Gauge<string>;
  public readonly websocketConnectionsGauge: Gauge<string>;
  
  // Event bus metrics
  public readonly eventBusSubscriptionsGauge: Gauge<string>;
  public readonly eventBusQueuedGauge: Gauge<string>;
  
  private eventBus?: AgentEventBus;
  private orchestrator?: TeamOrchestrator;
  private collectInterval?: NodeJS.Timeout;

  constructor() {
    // Agent count gauges
    this.agentActiveGauge = new Gauge({
      name: 'dash_agents_active',
      help: 'Number of currently active agents',
      labelNames: ['team_id'],
    });
    
    this.agentPendingGauge = new Gauge({
      name: 'dash_agents_pending',
      help: 'Number of pending agents waiting to start',
      labelNames: ['team_id'],
    });
    
    this.agentFailedGauge = new Gauge({
      name: 'dash_agents_failed',
      help: 'Number of failed agents',
      labelNames: ['team_id'],
    });
    
    this.agentCompletedGauge = new Gauge({
      name: 'dash_agents_completed',
      help: 'Number of completed agents',
      labelNames: ['team_id'],
    });
    
    this.agentTotalGauge = new Gauge({
      name: 'dash_agents_total',
      help: 'Total number of agents across all teams',
      labelNames: ['status'],
    });

    // Team gauges
    this.swarmActiveGauge = new Gauge({
      name: 'dash_teams_active',
      help: 'Number of currently active teams',
    });
    
    this.swarmTotalGauge = new Gauge({
      name: 'dash_teams_total',
      help: 'Total number of teams created',
    });
    
    this.swarmAgentsGauge = new Gauge({
      name: 'dash_swarm_agents',
      help: 'Number of agents in a team',
      labelNames: ['team_id', 'strategy'],
    });

    // Event counters
    this.eventsTotalCounter = new Counter({
      name: 'dash_events_total',
      help: 'Total number of events processed',
      labelNames: ['event_type', 'team_id'],
    });
    
    this.eventsDroppedCounter = new Counter({
      name: 'dash_events_dropped_total',
      help: 'Total number of events dropped',
      labelNames: ['reason'],
    });

    // Latency histograms
    this.eventProcessingHistogram = new Histogram({
      name: 'dash_event_processing_duration_seconds',
      help: 'Event processing latency in seconds',
      labelNames: ['event_type'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
    
    this.apiLatencyHistogram = new Histogram({
      name: 'dash_api_request_duration_seconds',
      help: 'API request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
    
    this.agentExecutionHistogram = new Histogram({
      name: 'dash_agent_execution_duration_seconds',
      help: 'Agent task execution duration in seconds',
      labelNames: ['team_id', 'model'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
    });
    
    this.toolCallHistogram = new Histogram({
      name: 'dash_tool_call_duration_seconds',
      help: 'Tool call execution duration in seconds',
      labelNames: ['tool_name', 'success'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    // Error counters
    this.errorsTotalCounter = new Counter({
      name: 'dash_errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'component', 'severity'],
    });
    
    this.agentFailuresCounter = new Counter({
      name: 'dash_agent_failures_total',
      help: 'Total number of agent failures',
      labelNames: ['team_id', 'failure_reason'],
    });

    // Business metrics
    this.swarmSuccessCounter = new Counter({
      name: 'dash_swarm_success_total',
      help: 'Total number of successful team completions',
      labelNames: ['strategy'],
    });
    
    this.swarmFailureCounter = new Counter({
      name: 'dash_swarm_failure_total',
      help: 'Total number of failed teams',
      labelNames: ['strategy', 'failure_reason'],
    });
    
    this.swarmCostGauge = new Gauge({
      name: 'dash_swarm_cost_usd',
      help: 'Cost of team execution in USD',
      labelNames: ['team_id', 'currency'],
    });
    
    this.swarmDurationHistogram = new Histogram({
      name: 'dash_swarm_duration_seconds',
      help: 'Team execution duration in seconds',
      labelNames: ['strategy', 'status'],
      buckets: [10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400],
    });
    
    this.budgetUtilizationGauge = new Gauge({
      name: 'dash_budget_utilization_ratio',
      help: 'Budget utilization ratio (0-1)',
      labelNames: ['team_id'],
    });

    // System metrics
    this.memoryUsageGauge = new Gauge({
      name: 'dash_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
    });
    
    this.cpuUsageGauge = new Gauge({
      name: 'dash_cpu_usage_percent',
      help: 'CPU usage percentage',
    });
    
    this.websocketConnectionsGauge = new Gauge({
      name: 'dash_websocket_connections',
      help: 'Number of active WebSocket connections',
    });

    // Event bus metrics
    this.eventBusSubscriptionsGauge = new Gauge({
      name: 'dash_eventbus_subscriptions',
      help: 'Number of event bus subscriptions',
    });
    
    this.eventBusQueuedGauge = new Gauge({
      name: 'dash_eventbus_queued_events',
      help: 'Number of queued events in event bus',
    });

    // Register all metrics
    register.registerMetric(this.agentActiveGauge);
    register.registerMetric(this.agentPendingGauge);
    register.registerMetric(this.agentFailedGauge);
    register.registerMetric(this.agentCompletedGauge);
    register.registerMetric(this.agentTotalGauge);
    register.registerMetric(this.swarmActiveGauge);
    register.registerMetric(this.swarmTotalGauge);
    register.registerMetric(this.swarmAgentsGauge);
    register.registerMetric(this.eventsTotalCounter);
    register.registerMetric(this.eventsDroppedCounter);
    register.registerMetric(this.eventProcessingHistogram);
    register.registerMetric(this.apiLatencyHistogram);
    register.registerMetric(this.agentExecutionHistogram);
    register.registerMetric(this.toolCallHistogram);
    register.registerMetric(this.errorsTotalCounter);
    register.registerMetric(this.agentFailuresCounter);
    register.registerMetric(this.swarmSuccessCounter);
    register.registerMetric(this.swarmFailureCounter);
    register.registerMetric(this.swarmCostGauge);
    register.registerMetric(this.swarmDurationHistogram);
    register.registerMetric(this.budgetUtilizationGauge);
    register.registerMetric(this.memoryUsageGauge);
    register.registerMetric(this.cpuUsageGauge);
    register.registerMetric(this.websocketConnectionsGauge);
    register.registerMetric(this.eventBusSubscriptionsGauge);
    register.registerMetric(this.eventBusQueuedGauge);

    // Collect default Node.js metrics
    collectDefaultMetrics({ register });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize metrics with event bus and orchestrator
   */
  initialize(eventBus: AgentEventBus, orchestrator: TeamOrchestrator): void {
    this.eventBus = eventBus;
    this.orchestrator = orchestrator;

    // Subscribe to all events for metrics collection
    this.eventBus.subscribeAll((event) => {
      this.recordEvent(event);
    });

    // Start periodic collection
    this.startPeriodicCollection();

    logger.info('[PrometheusMetrics] Initialized with event bus and orchestrator');
  }

  /**
   * Start periodic metrics collection
   */
  private startPeriodicCollection(): void {
    this.collectInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.collectTeamMetrics();
    }, 15000); // Collect every 15 seconds

    // Initial collection
    this.collectSystemMetrics();
    this.collectTeamMetrics();
  }

  /**
   * Stop periodic collection
   */
  stop(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = undefined;
    }
  }

  // =========================================================================
  // EVENT RECORDING
  // =========================================================================

  /**
   * Record an event from the event bus
   */
  private recordEvent(event: AgentEvent): void {
    const startTime = Date.now();

    // Increment event counter
    this.eventsTotalCounter.inc({
      event_type: event.type,
      team_id: event.teamId || 'unknown',
    });

    // Record specific event types
    switch (event.type) {
      case 'agent_start':
        this.agentTotalGauge.inc({ status: 'active' });
        break;
      case 'agent_complete':
        this.agentTotalGauge.dec({ status: 'active' });
        this.agentTotalGauge.inc({ status: 'completed' });
        if ('totalCost' in event) {
          this.swarmCostGauge.set(
            { team_id: event.teamId || 'unknown', currency: 'usd' },
            (event as any).totalCost
          );
        }
        if ('duration' in event) {
          this.agentExecutionHistogram.observe(
            { team_id: event.teamId || 'unknown', model: 'default' },
            (event as any).duration / 1000
          );
        }
        break;
      case 'error':
        this.errorsTotalCounter.inc({
          error_type: (event as any).error?.code || 'unknown',
          component: 'agent',
          severity: 'error',
        });
        break;
      case 'tool_call_end':
        const toolEvent = event as any;
        this.toolCallHistogram.observe(
          { tool_name: toolEvent.tool, success: String(toolEvent.success) },
          toolEvent.duration / 1000
        );
        break;
    }

    // Record processing latency
    const duration = (Date.now() - startTime) / 1000;
    this.eventProcessingHistogram.observe({ event_type: event.type }, duration);
  }

  // =========================================================================
  // METRIC COLLECTION
  // =========================================================================

  /**
   * Collect system-level metrics
   */
  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.memoryUsageGauge.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.memoryUsageGauge.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsageGauge.set({ type: 'external' }, memUsage.external);

    // CPU usage (simplified - would need more sophisticated tracking for real CPU %)
    const cpuUsage = process.cpuUsage();
    this.cpuUsageGauge.set((cpuUsage.user + cpuUsage.system) / 1000000);
  }

  /**
   * Collect team-level metrics
   */
  private collectTeamMetrics(): void {
    if (!this.orchestrator) return;

    const teams = (this.orchestrator as any).listActiveTeams();
    this.swarmActiveGauge.set(teams.length);

    // Reset gauges that need fresh values
    this.agentActiveGauge.reset();
    this.agentPendingGauge.reset();
    this.agentFailedGauge.reset();
    this.agentCompletedGauge.reset();

    for (const team of teams) {
      const agents = (this.orchestrator as any).getTeamAgents(team.id);
      const status = (this.orchestrator as any).getStatus(team.id);

      // Count agents by state
      const activeCount = agents.filter(a => a.status === 'running').length;
      const pendingCount = agents.filter(a => a.status === 'pending').length;
      const failedCount = team.metrics.failedAgents;
      const completedCount = team.metrics.completedAgents;

      this.agentActiveGauge.set({ team_id: team.id }, activeCount);
      this.agentPendingGauge.set({ team_id: team.id }, pendingCount);
      this.agentFailedGauge.set({ team_id: team.id }, failedCount);
      this.agentCompletedGauge.set({ team_id: team.id }, completedCount);

      this.swarmAgentsGauge.set(
        { team_id: team.id, strategy: team.config.strategy },
        agents.length
      );

      // Budget utilization
      if (team.budget.allocated > 0) {
        const utilization = team.budget.consumed / team.budget.allocated;
        this.budgetUtilizationGauge.set({ team_id: team.id }, utilization);
      }

      // Record team duration if completed
      if (team.status === 'completed' && team.completedAt) {
        const duration = (team.completedAt.getTime() - team.createdAt.getTime()) / 1000;
        this.swarmDurationHistogram.observe(
          { strategy: team.config.strategy, status: 'completed' },
          duration
        );
        this.swarmSuccessCounter.inc({ strategy: team.config.strategy });
      }

      // Record cost
      if (team.budget.consumed > 0) {
        this.swarmCostGauge.set(
          { team_id: team.id, currency: 'usd' },
          team.budget.consumed
        );
      }
    }
  }

  // =========================================================================
  // PUBLIC API METHODS
  // =========================================================================

  /**
   * Record an API request
   */
  recordApiRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    this.apiLatencyHistogram.observe(
      { method, route, status_code: String(statusCode) },
      durationMs / 1000
    );
  }

  /**
   * Record an agent failure
   */
  recordAgentFailure(teamId: string, reason: string): void {
    this.agentFailuresCounter.inc({ team_id: teamId, failure_reason: reason });
    this.agentFailedGauge.inc({ team_id: teamId });
  }

  /**
   * Record a team failure
   */
  recordTeamFailure(teamId: string, strategy: string, reason: string): void {
    this.swarmFailureCounter.inc({ strategy, failure_reason: reason });
  }

  /**
   * Record a dropped event
   */
  recordDroppedEvent(reason: string): void {
    this.eventsDroppedCounter.inc({ reason });
  }

  /**
   * Update WebSocket connection count
   */
  setWebSocketConnections(count: number): void {
    this.websocketConnectionsGauge.set(count);
  }

  /**
   * Update event bus subscription count
   */
  setEventBusSubscriptions(count: number): void {
    this.eventBusSubscriptionsGauge.set(count);
  }

  /**
   * Update event bus queued events count
   */
  setEventBusQueued(count: number): void {
    this.eventBusQueuedGauge.set(count);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Get metrics content type
   */
  getContentType(): string {
    return register.contentType;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    register.resetMetrics();
  }

  /**
   * Static method to get global instance
   */
  static getGlobalPrometheusMetrics(): PrometheusMetrics {
    return getGlobalPrometheusMetrics();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalPrometheusMetrics: PrometheusMetrics | null = null;

export function getGlobalPrometheusMetrics(): PrometheusMetrics {
  if (!globalPrometheusMetrics) {
    globalPrometheusMetrics = new PrometheusMetrics();
  }
  return globalPrometheusMetrics;
}

export function resetGlobalPrometheusMetrics(): void {
  if (globalPrometheusMetrics) {
    globalPrometheusMetrics.stop();
    globalPrometheusMetrics = null;
  }
}

export { register };
export default PrometheusMetrics;

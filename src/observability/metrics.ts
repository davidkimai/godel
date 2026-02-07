/**
 * Prometheus Metrics Collection for Godel
 * 
 * Provides Prometheus-compatible metrics for monitoring the Godel orchestration platform.
 * Includes counters, gauges, and histograms for all key system metrics.
 * 
 * Metrics exposed:
 * - Request counts and latency
 * - Active agents/teams
 * - Task completion rates
 * - Error rates
 * - System resource usage
 */

import { logger } from '../integrations/utils/logger';
import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

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

export interface TaskMetricLabels {
  taskType: string;
  teamId: string;
  status: string;
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

export class MetricsCollector {
  // Request metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  
  // Agent metrics
  public readonly agentsActive: Gauge<string>;
  public readonly agentsPending: Gauge<string>;
  public readonly agentsFailed: Gauge<string>;
  public readonly agentsCompleted: Gauge<string>;
  public readonly agentExecutionsTotal: Counter<string>;
  public readonly agentExecutionDuration: Histogram<string>;
  
  // Team metrics
  public readonly teamsActive: Gauge<string>;
  public readonly teamsTotal: Gauge<string>;
  public readonly teamAgents: Gauge<string>;
  public readonly teamExecutionsTotal: Counter<string>;
  public readonly teamExecutionDuration: Histogram<string>;
  
  // Task metrics
  public readonly tasksCreatedTotal: Counter<string>;
  public readonly tasksCompletedTotal: Counter<string>;
  public readonly tasksFailedTotal: Counter<string>;
  public readonly taskCompletionRate: Gauge<string>;
  public readonly taskQueueDepth: Gauge<string>;
  public readonly taskProcessingDuration: Histogram<string>;
  
  // Error metrics
  public readonly errorsTotal: Counter<string>;
  public readonly errorRate: Gauge<string>;
  
  // System metrics
  public readonly memoryUsageBytes: Gauge<string>;
  public readonly cpuUsagePercent: Gauge<string>;
  public readonly websocketConnections: Gauge<string>;
  public readonly eventBusSubscriptions: Gauge<string>;
  public readonly eventBusQueued: Gauge<string>;

  // Internal state for rate calculations
  private errorWindow: number[] = [];
  private readonly errorWindowSize = 100;
  private taskStats: Map<string, { completed: number; failed: number }> = new Map();

  constructor() {
    // HTTP Request metrics
    this.httpRequestsTotal = new Counter({
      name: 'godel_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpRequestDuration = new Histogram({
      name: 'godel_http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    // Agent metrics
    this.agentsActive = new Gauge({
      name: 'godel_agents_active',
      help: 'Number of currently active agents',
      labelNames: ['team_id'],
    });

    this.agentsPending = new Gauge({
      name: 'godel_agents_pending',
      help: 'Number of pending agents waiting to start',
      labelNames: ['team_id'],
    });

    this.agentsFailed = new Gauge({
      name: 'godel_agents_failed',
      help: 'Number of failed agents',
      labelNames: ['team_id'],
    });

    this.agentsCompleted = new Gauge({
      name: 'godel_agents_completed',
      help: 'Number of completed agents',
      labelNames: ['team_id'],
    });

    this.agentExecutionsTotal = new Counter({
      name: 'godel_agent_executions_total',
      help: 'Total number of agent executions',
      labelNames: ['team_id', 'status'],
    });

    this.agentExecutionDuration = new Histogram({
      name: 'godel_agent_execution_duration_seconds',
      help: 'Agent task execution duration in seconds',
      labelNames: ['team_id', 'model'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
    });

    // Team metrics
    this.teamsActive = new Gauge({
      name: 'godel_teams_active',
      help: 'Number of currently active teams',
    });

    this.teamsTotal = new Gauge({
      name: 'godel_teams_total',
      help: 'Total number of teams created',
    });

    this.teamAgents = new Gauge({
      name: 'godel_team_agents',
      help: 'Number of agents in a team',
      labelNames: ['team_id', 'strategy'],
    });

    this.teamExecutionsTotal = new Counter({
      name: 'godel_team_executions_total',
      help: 'Total number of team executions',
      labelNames: ['strategy', 'status'],
    });

    this.teamExecutionDuration = new Histogram({
      name: 'godel_team_execution_duration_seconds',
      help: 'Team execution duration in seconds',
      labelNames: ['strategy', 'status'],
      buckets: [10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400],
    });

    // Task metrics
    this.tasksCreatedTotal = new Counter({
      name: 'godel_tasks_created_total',
      help: 'Total number of tasks created',
      labelNames: ['task_type', 'team_id'],
    });

    this.tasksCompletedTotal = new Counter({
      name: 'godel_tasks_completed_total',
      help: 'Total number of tasks completed',
      labelNames: ['task_type', 'team_id'],
    });

    this.tasksFailedTotal = new Counter({
      name: 'godel_tasks_failed_total',
      help: 'Total number of tasks failed',
      labelNames: ['task_type', 'team_id', 'error_type'],
    });

    this.taskCompletionRate = new Gauge({
      name: 'godel_task_completion_rate',
      help: 'Task completion rate (0-1)',
      labelNames: ['team_id'],
    });

    this.taskQueueDepth = new Gauge({
      name: 'godel_task_queue_depth',
      help: 'Number of tasks in queue',
      labelNames: ['queue_name'],
    });

    this.taskProcessingDuration = new Histogram({
      name: 'godel_task_processing_duration_seconds',
      help: 'Task processing duration in seconds',
      labelNames: ['task_type'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
    });

    // Error metrics
    this.errorsTotal = new Counter({
      name: 'godel_errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'component', 'severity'],
    });

    this.errorRate = new Gauge({
      name: 'godel_error_rate',
      help: 'Error rate over the last 100 operations',
    });

    // System metrics
    this.memoryUsageBytes = new Gauge({
      name: 'godel_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
    });

    this.cpuUsagePercent = new Gauge({
      name: 'godel_cpu_usage_percent',
      help: 'CPU usage percentage',
    });

    this.websocketConnections = new Gauge({
      name: 'godel_websocket_connections',
      help: 'Number of active WebSocket connections',
    });

    this.eventBusSubscriptions = new Gauge({
      name: 'godel_eventbus_subscriptions',
      help: 'Number of event bus subscriptions',
    });

    this.eventBusQueued = new Gauge({
      name: 'godel_eventbus_queued_events',
      help: 'Number of queued events in event bus',
    });

    // Register all metrics
    this.registerMetrics();

    // Collect default Node.js metrics
    collectDefaultMetrics({ register });

    logger.info('[Metrics] Metrics collector initialized');
  }

  /**
   * Register all metrics with the Prometheus registry
   */
  private registerMetrics(): void {
    register.registerMetric(this.httpRequestsTotal);
    register.registerMetric(this.httpRequestDuration);
    register.registerMetric(this.agentsActive);
    register.registerMetric(this.agentsPending);
    register.registerMetric(this.agentsFailed);
    register.registerMetric(this.agentsCompleted);
    register.registerMetric(this.agentExecutionsTotal);
    register.registerMetric(this.agentExecutionDuration);
    register.registerMetric(this.teamsActive);
    register.registerMetric(this.teamsTotal);
    register.registerMetric(this.teamAgents);
    register.registerMetric(this.teamExecutionsTotal);
    register.registerMetric(this.teamExecutionDuration);
    register.registerMetric(this.tasksCreatedTotal);
    register.registerMetric(this.tasksCompletedTotal);
    register.registerMetric(this.tasksFailedTotal);
    register.registerMetric(this.taskCompletionRate);
    register.registerMetric(this.taskQueueDepth);
    register.registerMetric(this.taskProcessingDuration);
    register.registerMetric(this.errorsTotal);
    register.registerMetric(this.errorRate);
    register.registerMetric(this.memoryUsageBytes);
    register.registerMetric(this.cpuUsagePercent);
    register.registerMetric(this.websocketConnections);
    register.registerMetric(this.eventBusSubscriptions);
    register.registerMetric(this.eventBusQueued);
  }

  // =========================================================================
  // HTTP REQUEST METRICS
  // =========================================================================

  /**
   * Record an HTTP request
   */
  recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const statusCodeStr = String(statusCode);
    this.httpRequestsTotal.inc({ method, route, status_code: statusCodeStr });
    this.httpRequestDuration.observe({ method, route, status_code: statusCodeStr }, durationMs / 1000);
  }

  // =========================================================================
  // AGENT METRICS
  // =========================================================================

  /**
   * Update agent counts for a team
   */
  setAgentCounts(teamId: string, counts: { active: number; pending: number; failed: number; completed: number }): void {
    this.agentsActive.set({ team_id: teamId }, counts.active);
    this.agentsPending.set({ team_id: teamId }, counts.pending);
    this.agentsFailed.set({ team_id: teamId }, counts.failed);
    this.agentsCompleted.set({ team_id: teamId }, counts.completed);
  }

  /**
   * Record an agent execution
   */
  recordAgentExecution(teamId: string, status: 'success' | 'failure', durationMs: number, model?: string): void {
    this.agentExecutionsTotal.inc({ team_id: teamId, status });
    this.agentExecutionDuration.observe({ team_id: teamId, model: model || 'default' }, durationMs / 1000);
    
    if (status === 'failure') {
      this.recordError('agent_execution', 'agent', 'error');
    }
  }

  /**
   * Reset agent gauges for a team
   */
  resetAgentGauges(teamId: string): void {
    this.agentsActive.remove({ team_id: teamId });
    this.agentsPending.remove({ team_id: teamId });
    this.agentsFailed.remove({ team_id: teamId });
    this.agentsCompleted.remove({ team_id: teamId });
  }

  // =========================================================================
  // TEAM METRICS
  // =========================================================================

  /**
   * Update team counts
   */
  setTeamCounts(active: number, total: number): void {
    this.teamsActive.set(active);
    this.teamsTotal.set(total);
  }

  /**
   * Set agent count for a specific team
   */
  setTeamAgentCount(teamId: string, strategy: string, count: number): void {
    this.teamAgents.set({ team_id: teamId, strategy }, count);
  }

  /**
   * Record a team execution
   */
  recordTeamExecution(strategy: string, status: 'success' | 'failure', durationMs: number): void {
    this.teamExecutionsTotal.inc({ strategy, status });
    this.teamExecutionDuration.observe({ strategy, status }, durationMs / 1000);
    
    if (status === 'failure') {
      this.recordError('team_execution', 'team', 'error');
    }
  }

  // =========================================================================
  // TASK METRICS
  // =========================================================================

  /**
   * Record task creation
   */
  recordTaskCreated(taskType: string, teamId: string): void {
    this.tasksCreatedTotal.inc({ task_type: taskType, team_id: teamId });
  }

  /**
   * Record task completion
   */
  recordTaskCompleted(taskType: string, teamId: string, durationMs: number): void {
    this.tasksCompletedTotal.inc({ task_type: taskType, team_id: teamId });
    this.taskProcessingDuration.observe({ task_type: taskType }, durationMs / 1000);
    this.updateTaskCompletionRate(teamId);
  }

  /**
   * Record task failure
   */
  recordTaskFailed(taskType: string, teamId: string, errorType: string): void {
    this.tasksFailedTotal.inc({ task_type: taskType, team_id: teamId, error_type: errorType });
    this.updateTaskCompletionRate(teamId);
    this.recordError('task_execution', 'task', 'error');
  }

  /**
   * Update task queue depth
   */
  setTaskQueueDepth(queueName: string, depth: number): void {
    this.taskQueueDepth.set({ queue_name: queueName }, depth);
  }

  /**
   * Calculate and update task completion rate for a team
   */
  private updateTaskCompletionRate(teamId: string): void {
    const stats = this.taskStats.get(teamId) || { completed: 0, failed: 0 };
    const total = stats.completed + stats.failed;
    const rate = total > 0 ? stats.completed / total : 1;
    this.taskCompletionRate.set({ team_id: teamId }, rate);
  }

  // =========================================================================
  // ERROR METRICS
  // =========================================================================

  /**
   * Record an error
   */
  recordError(errorType: string, component: string, severity: 'warning' | 'error' | 'critical'): void {
    this.errorsTotal.inc({ error_type: errorType, component, severity });
    
    // Update error rate window
    this.errorWindow.push(Date.now());
    if (this.errorWindow.length > this.errorWindowSize) {
      this.errorWindow.shift();
    }
    
    // Calculate error rate
    const errorRate = this.errorWindow.length / this.errorWindowSize;
    this.errorRate.set(errorRate);
  }

  // =========================================================================
  // SYSTEM METRICS
  // =========================================================================

  /**
   * Collect system metrics
   */
  collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.memoryUsageBytes.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.memoryUsageBytes.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.memoryUsageBytes.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsageBytes.set({ type: 'external' }, memUsage.external);

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.cpuUsagePercent.set((cpuUsage.user + cpuUsage.system) / 1000000);
  }

  /**
   * Update WebSocket connection count
   */
  setWebSocketConnections(count: number): void {
    this.websocketConnections.set(count);
  }

  /**
   * Update event bus subscription count
   */
  setEventBusSubscriptions(count: number): void {
    this.eventBusSubscriptions.set(count);
  }

  /**
   * Update event bus queued events count
   */
  setEventBusQueued(count: number): void {
    this.eventBusQueued.set(count);
  }

  // =========================================================================
  // EXPORT METRICS
  // =========================================================================

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    this.collectSystemMetrics();
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
    this.errorWindow = [];
    this.taskStats.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalMetricsCollector: MetricsCollector | null = null;

export function getGlobalMetricsCollector(): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector();
  }
  return globalMetricsCollector;
}

export function resetGlobalMetricsCollector(): void {
  if (globalMetricsCollector) {
    globalMetricsCollector.reset();
    globalMetricsCollector = null;
  }
}

export { register };
export default MetricsCollector;

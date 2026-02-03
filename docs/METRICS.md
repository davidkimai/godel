# Dash Metrics Infrastructure

This document describes the Prometheus metrics export and health check infrastructure for Dash.

## Overview

The metrics infrastructure provides comprehensive observability for the Dash orchestration platform, including:

- **Prometheus metrics export** for all system and business metrics
- **Health check endpoints** for monitoring system health
- **Grafana dashboards** for visualization
- **Alert rules** for proactive notifications

## Quick Start

### 1. Start Prometheus Stack

```bash
cd monitoring
docker-compose up -d
```

Access the services:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)
- Alertmanager: http://localhost:9093

### 2. Verify Metrics

```bash
# Check metrics endpoint
curl http://localhost:7373/metrics

# Check health endpoint
curl http://localhost:7373/health

# Check readiness probe
curl http://localhost:7373/health/ready

# Check liveness probe
curl http://localhost:7373/health/live
```

## Exported Metrics

### Agent Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_agents_active` | Gauge | `swarm_id` | Currently running agents |
| `dash_agents_pending` | Gauge | `swarm_id` | Agents waiting to start |
| `dash_agents_failed` | Gauge | `swarm_id` | Failed agents |
| `dash_agents_completed` | Gauge | `swarm_id` | Completed agents |
| `dash_agents_total` | Gauge | `status` | Total agents by status |
| `dash_agent_failures_total` | Counter | `swarm_id`, `failure_reason` | Total agent failures |
| `dash_agent_execution_duration_seconds` | Histogram | `swarm_id`, `model` | Agent execution time |

### Swarm Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_swarms_active` | Gauge | - | Active swarm count |
| `dash_swarms_total` | Gauge | - | Total swarm count |
| `dash_swarm_agents` | Gauge | `swarm_id`, `strategy` | Agents per swarm |
| `dash_swarm_success_total` | Counter | `strategy` | Successful swarm completions |
| `dash_swarm_failure_total` | Counter | `strategy`, `failure_reason` | Failed swarms |
| `dash_swarm_cost_usd` | Gauge | `swarm_id`, `currency` | Swarm cost |
| `dash_swarm_duration_seconds` | Histogram | `strategy`, `status` | Swarm execution time |
| `dash_budget_utilization_ratio` | Gauge | `swarm_id` | Budget used (0-1) |

### Event Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_events_total` | Counter | `event_type`, `swarm_id` | Events processed |
| `dash_events_dropped_total` | Counter | `reason` | Events dropped |
| `dash_event_processing_duration_seconds` | Histogram | `event_type` | Event processing latency |
| `dash_eventbus_subscriptions` | Gauge | - | Active subscriptions |
| `dash_eventbus_queued_events` | Gauge | - | Queued events |

### API Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_api_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | API latency |

### Error Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_errors_total` | Counter | `error_type`, `component`, `severity` | Total errors |

### System Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `dash_memory_usage_bytes` | Gauge | `type` | Memory usage (heap, rss, etc.) |
| `dash_cpu_usage_percent` | Gauge | - | CPU usage percentage |
| `dash_websocket_connections` | Gauge | - | Active WebSocket connections |

## Prometheus Query Examples

### Agent Status

```promql
# Active agents by swarm
sum by (swarm_id) (dash_agents_active)

# Agent failure rate
rate(dash_agent_failures_total[5m])

# Average agent execution time
histogram_quantile(0.95, 
  sum(rate(dash_agent_execution_duration_seconds_bucket[5m])) by (le)
)
```

### Swarm Performance

```promql
# Swarm success rate
rate(dash_swarm_success_total[10m]) / 
  (rate(dash_swarm_success_total[10m]) + rate(dash_swarm_failure_total[10m]))

# Average swarm cost by strategy
avg by (strategy) (dash_swarm_cost_usd)

# Swarms running over 1 hour
dash_swarm_duration_seconds_bucket{le="3600"}
```

### Budget Monitoring

```promql
# Budget utilization by swarm
dash_budget_utilization_ratio

# Total spend across all swarms
sum(dash_swarm_cost_usd)

# Swarms approaching budget limit
dash_budget_utilization_ratio > 0.8
```

### System Health

```promql
# Memory usage trend
rate(dash_memory_usage_bytes{type="rss"}[5m])

# Event processing backlog
dash_events_total - dash_events_dropped_total

# API error rate
rate(dash_api_request_duration_seconds_count{status_code=~"5.."}[5m])
```

## Alert Thresholds

### Critical Alerts (Immediate Action Required)

| Alert | Condition | Threshold | Action |
|-------|-----------|-----------|--------|
| DashNoMetrics | `up{job="dash"} == 0` | 2m | Check if Dash is running |
| DashBudgetCritical | `dash_budget_utilization_ratio > 0.95` | 1m | Scale down or increase budget |
| DashHighAgentFailureRate | `rate(dash_agent_failures_total[10m]) > 0.5` | 5m | Investigate agent failures |
| DashSwarmFailureRate | `rate(dash_swarm_failure_total[10m]) > 0.1` | 5m | Review swarm strategy |

### Warning Alerts (Monitor Closely)

| Alert | Condition | Threshold | Action |
|-------|-----------|-----------|--------|
| DashBudgetWarning | `dash_budget_utilization_ratio > 0.80` | 5m | Monitor spending |
| DashHighErrorRate | `rate(dash_errors_total[5m]) > 0.1` | 5m | Check error logs |
| DashHighApiLatency | `histogram_quantile(0.95, ...) > 5` | 5m | Optimize API performance |
| DashDiskSpaceLow | `disk_used_percent > 85%` | 5m | Clean up disk space |
| DashMemoryHigh | `memory_usage > 4GB` | 5m | Monitor memory usage |
| DashEventProcessingSlow | `avg_event_processing > 1s` | 5m | Check event handlers |

## Health Check Endpoints

### GET /health

Returns comprehensive health report:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "2.0.0",
  "uptime": 3600,
  "hostname": "dash-server",
  "checks": [
    {
      "name": "memory",
      "status": "healthy",
      "message": "System memory healthy: 45.2% used",
      "responseTime": 5,
      "details": {
        "systemUsedPercent": "45.20",
        "heapUsedBytes": 104857600
      }
    },
    {
      "name": "disk",
      "status": "healthy",
      "message": "Disk space healthy: 32.1% used",
      "responseTime": 12,
      "details": {
        "freeBytes": 50000000000,
        "usedPercent": "32.10"
      }
    },
    {
      "name": "database",
      "status": "healthy",
      "message": "Database connection successful",
      "responseTime": 25
    },
    {
      "name": "redis",
      "status": "healthy",
      "message": "Redis connection successful",
      "responseTime": 8
    }
  ],
  "summary": {
    "healthy": 6,
    "degraded": 0,
    "unhealthy": 0,
    "unknown": 0,
    "total": 6
  }
}
```

### GET /health/ready

Readiness probe for Kubernetes:

```json
{
  "ready": true,
  "status": "healthy"
}
```

Returns 503 if service is not ready to receive traffic.

### GET /health/live

Liveness probe for Kubernetes:

```json
{
  "alive": true,
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Integration with Dashboard Server

To enable metrics in the dashboard server:

```typescript
import { DashboardServer } from './dashboard/server';
import { getGlobalPrometheusMetrics } from './metrics';
import { getGlobalEventBus } from './core/event-bus';
import { getGlobalSwarmOrchestrator } from './core/swarm-orchestrator';

// Initialize metrics
const metrics = getGlobalPrometheusMetrics();
const eventBus = getGlobalEventBus();
const orchestrator = getGlobalSwarmOrchestrator();

metrics.initialize(eventBus, orchestrator);

// Create server with metrics enabled
const server = new DashboardServer(eventBus, orchestrator, sessionTree, {
  enableMetrics: true,
  metricsPath: '/metrics',
});
```

## Custom Metrics

To add custom business metrics:

```typescript
import { getGlobalPrometheusMetrics } from './metrics';

const metrics = getGlobalPrometheusMetrics();

// Record custom metric
metrics.swarmSuccessCounter.inc({ strategy: 'pipeline' });

// Record with value
metrics.swarmCostGauge.set({ swarm_id: 'swarm-123', currency: 'usd' }, 25.50);

// Observe histogram
metrics.agentExecutionHistogram.observe(
  { swarm_id: 'swarm-123', model: 'gpt-4' },
  45.5 // seconds
);
```

## Grafana Dashboards

### Pre-built Dashboards

1. **Dash Overview** - High-level system health and key metrics
2. **Swarm Performance** - Detailed swarm execution metrics
3. **Agent Metrics** - Per-agent performance and health
4. **Cost Analysis** - Budget tracking and cost breakdowns

### Custom Dashboards

To create custom dashboards:

1. Open Grafana at http://localhost:3000
2. Click "+" → "Dashboard"
3. Add panels with Prometheus queries
4. Save dashboard to monitoring/grafana/dashboards/
5. Restart Grafana to load the new dashboard

## Troubleshooting

### Metrics Not Appearing

1. Check if metrics endpoint is accessible:
   ```bash
   curl http://localhost:7373/metrics
   ```

2. Verify Prometheus is scraping:
   - Open http://localhost:9090/targets
   - Check if `dash` target is up

3. Check Prometheus logs:
   ```bash
   docker logs dash-prometheus
   ```

### High Memory Usage

If metrics collection uses too much memory:

1. Reduce retention: Edit `prometheus.yml` and lower `retention.time`
2. Adjust scrape interval: Increase `scrape_interval` in config
3. Limit label cardinality: Avoid high-cardinality labels

### Missing Dashboard Data

1. Verify datasource is configured:
   - Grafana → Configuration → Data Sources
   - Check Prometheus URL

2. Check query in Prometheus:
   - Open http://localhost:9090
   - Enter query manually
   - Verify data exists

## Performance Considerations

- **Scrape Interval**: Default is 15s. Increase for lower overhead.
- **Label Cardinality**: Avoid unbounded labels (user IDs, timestamps).
- **Histogram Buckets**: Default buckets suit most cases. Customize if needed.
- **Metric Retention**: Prometheus stores 15 days by default.

## Security

- Metrics endpoint is unauthenticated by default
- In production, add authentication or restrict access
- Do not expose sensitive data in metric labels
- Use network policies to restrict metric access

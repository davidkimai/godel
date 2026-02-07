# Monitoring Example

This example demonstrates Godel's monitoring and observability capabilities.

## Overview

Godel provides comprehensive monitoring through:
- Metrics collection (Prometheus-compatible)
- Distributed tracing (OpenTelemetry)
- Event streaming
- Health checks
- Custom dashboards

## Quick Start

### 1. Start Monitoring Stack

```bash
# Start Prometheus, Grafana, and Loki
docker-compose -f monitoring/docker-compose.yml up -d

# Verify
curl http://localhost:9090/api/v1/status/targets
curl http://localhost:3100/ready
```

### 2. View Dashboard

```bash
# Open Grafana
godel dashboard open

# Or manually
open http://localhost:3000
```

## Examples

### 3. Query Metrics

```bash
# Get all metrics
godel metrics show

# Get agent metrics
godel metrics agents

# Get team metrics
godel metrics teams

# Raw Prometheus query
godel metrics query 'godel_agents_connected'
```

### 4. Using the SDK

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({ baseUrl: 'http://localhost:7373' });

// Get system metrics
const metrics = await client.metrics.getSystem();
console.log(`Agents: ${metrics.agents.connected}`);
console.log(`Queue Depth: ${metrics.queue.depth}`);

// Get agent-specific metrics
const agentMetrics = await client.metrics.getAgent('agent-001');
console.log(`Tasks Completed: ${agentMetrics.tasks.completed}`);
console.log(`Avg Latency: ${agentMetrics.performance.avgLatency}ms`);
```

### 5. Event Streaming

```typescript
// Stream all events
const stream = client.events.stream();

stream.on('event', (event) => {
  console.log(`[${event.type}] ${event.message}`);
});

// Filtered stream
const taskStream = client.events.stream({
  types: ['task_started', 'task_completed', 'task_failed'],
  severity: 'info'
});

// Stream for specific agent
const agentStream = client.events.stream({
  agentId: 'agent-001'
});
```

### 6. Health Checks

```bash
# Check overall health
godel health

# Check specific components
godel health --component api
godel health --component database
godel health --component redis
```

```typescript
// Health check via SDK
const health = await client.health.check();

if (health.status === 'healthy') {
  console.log('✓ All systems operational');
} else {
  for (const issue of health.issues) {
    console.log(`✗ ${issue.component}: ${issue.message}`);
  }
}
```

### 7. Distributed Tracing

```typescript
// Traces are automatically collected
const result = await client.intent.execute({
  description: 'Implement feature X'
});

// View trace in Jaeger
console.log(`Trace ID: ${result.traceId}`);
// Open: http://localhost:16686/trace/{traceId}
```

### 8. Custom Metrics

```typescript
import { metrics } from '@jtan15010/godel';

// Create custom counter
const requestCounter = metrics.createCounter('my_app_requests_total', {
  description: 'Total requests',
  labels: ['method', 'endpoint']
});

requestCounter.inc({ method: 'GET', endpoint: '/api/users' });

// Create histogram
const latencyHistogram = metrics.createHistogram('my_app_latency_seconds', {
  description: 'Request latency',
  buckets: [0.1, 0.5, 1, 2, 5]
});

latencyHistogram.observe(0.3);
```

### 9. Alerting

```typescript
// Configure alerts
await client.alerts.configure({
  rules: [
    {
      name: 'high-error-rate',
      condition: 'rate(godel_errors_total[5m]) > 0.1',
      severity: 'warning',
      channels: ['slack', 'email']
    },
    {
      name: 'queue-backup',
      condition: 'godel_queue_depth > 100',
      severity: 'critical',
      channels: ['pagerduty', 'slack']
    }
  ]
});
```

### 10. Log Aggregation

```bash
# Query logs
godel logs query --agent agent-001 --since 1h

# Tail logs
godel logs tail --follow

# Search logs
godel logs search "error" --severity error
```

```typescript
// Log query via SDK
const logs = await client.logs.query({
  agentId: 'agent-001',
  since: '1h',
  severity: 'error'
});

for (const log of logs) {
  console.log(`[${log.timestamp}] ${log.message}`);
}
```

## Available Metrics

### System Metrics

| Metric | Description |
|--------|-------------|
| `godel_agents_connected` | Number of connected agents |
| `godel_agents_active` | Number of active agents |
| `godel_queue_depth` | Current queue depth |
| `godel_tasks_total` | Total tasks processed |
| `godel_tasks_duration_seconds` | Task execution duration |

### Proxy Metrics

| Metric | Description |
|--------|-------------|
| `godel_proxy_requests_total` | Total proxy requests |
| `godel_proxy_cost_total` | Total API cost |
| `godel_proxy_tokens_total` | Total tokens used |
| `godel_proxy_latency_seconds` | Proxy latency |

### Federation Metrics

| Metric | Description |
|--------|-------------|
| `godel_federation_instances` | Number of federation instances |
| `godel_federation_routes_total` | Total routing decisions |

## Dashboards

Pre-configured Grafana dashboards:
- **Overview**: System health and key metrics
- **Agents**: Agent performance and status
- **Teams**: Team metrics and throughput
- **Proxy**: LLM proxy usage and costs
- **Federation**: Multi-instance metrics

Access at: http://localhost:3000

## Best Practices

1. **Set up alerts** for critical metrics
2. **Monitor queue depth** to detect backlogs
3. **Track costs** per team/project
4. **Use tracing** for debugging complex flows
5. **Rotate logs** to manage storage

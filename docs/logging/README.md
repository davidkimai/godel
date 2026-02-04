# Dash Logging System

Centralized log aggregation and analysis for the Dash orchestration platform using Loki, Promtail, and Grafana.

## Overview

The Dash logging system provides:

- **Structured JSON logging** with correlation IDs for request tracing
- **Centralized log aggregation** using Grafana Loki
- **Log shipping** with Promtail
- **Real-time log analysis** and dashboards
- **Error pattern detection** and alerting
- **Multi-line log support** for stack traces

## Architecture

```
┌─────────────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐
│  Dash Services  │───▶│ Promtail │───▶│    Loki     │───▶│  Grafana │
│  (JSON Logs)    │    │(Shipping)│    │ (Storage)   │    │ (UI/API) │
└─────────────────┘    └──────────┘    └─────────────┘    └──────────┘
        │                                                        │
        │              ┌─────────────────┐                       │
        └─────────────▶│   Alertmanager  │◀──────────────────────┘
                       │  (Notifications)│
                       └─────────────────┘
```

## Quick Start

### 1. Start the Logging Stack

```bash
cd monitoring
docker-compose up -d loki promtail grafana
```

### 2. Access Grafana

- URL: http://localhost:3000
- Default credentials: admin/admin
- Navigate to **Dashboards > Dash Logs**

### 3. View Logs

```bash
# Search logs by agent
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="dash",agent_id="agent-123"}'

# Search logs by trace ID
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="dash"} |= "trace-abc-123"'
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum log level (debug, info, warn, error, fatal) |
| `DASH_LOG_LEVEL` | `info` | Alternative log level variable |
| `DASH_SERVICE_NAME` | `dash` | Service name for log entries |

### Log Levels

- `DEBUG` (0): Detailed debugging information
- `INFO` (1): General operational information
- `WARN` (2): Warning conditions
- `ERROR` (3): Error conditions
- `FATAL` (4): Critical errors requiring immediate attention

## Usage

### Basic Logging

```typescript
import { getLogger } from './logging';

const logger = getLogger({ level: LogLevel.INFO });

logger.debug('Debug message', { detail: 'value' });
logger.info('User action', { userId: '123', action: 'login' });
logger.warn('Unexpected state', { state: 'pending' });
logger.error('Operation failed', error, { operation: 'save' });
logger.fatal('System error', error);
```

### Agent-Specific Logging

```typescript
import { createAgentLogger } from './logging';

const agentLogger = createAgentLogger('agent-123', 'swarm-456');

agentLogger.info('Agent started', { task: 'data-processing' });
agentLogger.error('Task failed', error, { taskId: 'task-789' });
```

### Request Context Logging

```typescript
import { createRequestLogger, withContext } from './logging';

// Create request-scoped logger
const requestLogger = createRequestLogger('req-abc', 'user-xyz');

// Or use withContext helper
await withContext({ traceId: 'trace-123', agentId: 'agent-1' }, async (logger) => {
  logger.info('Processing request');
  // ... do work
  logger.info('Request completed', { duration: 100 });
});
```

### Timing Operations

```typescript
// Log function execution time
const result = await logger.time(
  LogLevel.INFO,
  'Database query',
  async () => {
    return await db.query('SELECT * FROM users');
  },
  { table: 'users' }
);
```

### Express Middleware

```typescript
import { requestLoggerMiddleware } from './logging';

app.use(requestLoggerMiddleware());

// Access logger in route handlers
app.get('/api/users', (req, res) => {
  req.logger.info('Fetching users');
  // ...
});
```

## Log Format

All logs are output as JSON with the following structure:

```json
{
  "timestamp": "2026-02-03T19:18:33.123Z",
  "level": "ERROR",
  "levelCode": 3,
  "service": "dash",
  "message": "Agent execution failed",
  "trace_id": "abc123",
  "span_id": "def456",
  "agent_id": "agent-789",
  "swarm_id": "swarm-abc",
  "workflow_id": "wf-123",
  "error": {
    "name": "AgentError",
    "message": "Connection refused",
    "stack": "...",
    "code": "ECONNREFUSED"
  },
  "duration_ms": 150,
  "metadata": {
    "task": "data-processing",
    "attempt": 3
  },
  "source": {
    "file": "agent.ts",
    "line": 42,
    "function": "executeTask"
  }
}
```

## Loki Queries

### Common Queries

```logql
# All logs from Dash
{job="dash"}

# Logs from specific agent
{job="dash", agent_id="agent-123"}

# Error logs only
{job="dash"} |= "ERROR"

# Logs with trace ID
{job="dash"} |= "trace-abc-123"

# Logs from specific swarm
{job="dash"} | json | swarm_id="swarm-456"

# Count errors by agent
sum by (agent_id) (rate({job="dash"} |= "ERROR" [5m]))

# Log volume over time
sum(rate({job="dash"} [1m]))
```

## Alerting

### Pre-configured Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | > 0.1 errors/sec for 2m | Critical |
| Agent Crash | Any crash in last minute | Critical |
| Workflow Failure | Any failure detected | Warning |
| Database Error | Any DB error in 5m | Critical |
| Log Volume Spike | > 1000 logs/sec | Info |
| Out of Memory | Any OOM error | Critical |
| Connection Timeout | > 0.5 timeouts/sec | Warning |

### Custom Alerts

Add custom alerts in `monitoring/grafana/provisioning/alerting/`:

```yaml
- uid: custom-alert
  title: Custom Error Pattern
  condition: C
  data:
    - refId: A
      datasourceUid: Loki
      model:
        expr: 'sum(count_over_time({job="dash"} |= "custom-pattern" [5m]))'
  for: 2m
  annotations:
    summary: "Custom error detected"
  labels:
    severity: warning
```

## Error Pattern Detection

The system automatically detects common error patterns:

```typescript
import { ErrorPatternDetector, DEFAULT_ERROR_PATTERNS } from './logging';

const detector = new ErrorPatternDetector(DEFAULT_ERROR_PATTERNS);

const pattern = detector.detect(errorMessage);
if (pattern) {
  console.log(`Detected: ${pattern.name} (${pattern.severity})`);
}
```

### Built-in Patterns

- `ConnectionRefused` - Service connection failures
- `Timeout` - Operation timeouts
- `OutOfMemory` - Memory exhaustion
- `DatabaseError` - Database failures
- `AuthError` - Authentication failures
- `RateLimit` - Rate limiting
- `AgentError` - Agent crashes
- `WorkflowError` - Workflow failures

## Log Retention

Logs are retained for **7 days** by default. Configure in `monitoring/loki/loki-config.yml`:

```yaml
table_manager:
  retention_deletes_enabled: true
  retention_period: 168h  # 7 days
```

## Troubleshooting

### Logs Not Appearing in Grafana

1. Check Promtail is running: `docker-compose ps promtail`
2. Verify log file paths in `promtail-config.yml`
3. Check Promtail logs: `docker-compose logs promtail`

### High Log Volume

Enable sampling for high-volume services:

```typescript
const logger = getLogger({
  enableSampling: true,
  sampleRate: 0.1  // Log 10% of messages
});
```

### Sensitive Data

Configure redaction patterns:

```typescript
const logger = getLogger({
  redactFields: ['password', 'token', 'secret', 'api_key']
});
```

## API Reference

See [Logging API](./LOGGING_API.md) for complete API documentation.

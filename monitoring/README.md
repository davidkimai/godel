# Godel Observability Stack

This directory contains the complete Prometheus + Grafana monitoring stack for the Godel orchestration platform.

## Quick Start

```bash
# Start the monitoring stack
cd monitoring
docker-compose up -d

# With all optional services (node-exporter, blackbox)
docker-compose --profile full up -d
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Prometheus | 9090 | Metrics collection and alerting |
| Grafana | 3000 | Visualization dashboards |
| Alertmanager | 9093 | Alert routing and notifications |
| Redis Exporter | 9121 | Redis metrics export |
| PostgreSQL Exporter | 9187 | PostgreSQL metrics export |
| Node Exporter | 9100 | Host system metrics (optional) |
| Blackbox Exporter | 9115 | Endpoint probing (optional) |

## Access

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

## Dashboards

The following dashboards are pre-configured and available in Grafana:

### 1. Team Overview (`godel-team-overview`)
High-level view of all teams, agents, and events.
- Active teams and agent counts
- Success/failure rates
- Budget utilization
- Event processing rates

### 2. Agent Performance (`godel-agent-performance`)
Detailed agent execution metrics.
- Execution latency (p50, p95, p99)
- Throughput by team and model
- Failure rates and error patterns
- Tool call performance
- SLO tracking

### 3. Cost Analysis (`godel-cost-analysis`)
Budget and cost tracking.
- Total spend and burn rate
- Cost by team and strategy
- Budget utilization with thresholds
- Cost efficiency metrics
- 30-day projections

### 4. Error Tracking (`godel-error-tracking`)
Error analysis and debugging.
- Error rates by component and type
- Agent failure tracking
- Error budget consumption
- Top error sources
- SLO violations

### 5. Infrastructure (`godel-infrastructure`)
System and infrastructure health.
- CPU, memory, disk usage
- Redis metrics (connections, memory, ops)
- PostgreSQL metrics (connections, transactions, cache)
- WebSocket connections
- Event bus health

## Alerting

### Alert Rules

Alerts are configured in `prometheus/alerts.yml`:

#### Critical Alerts (Immediate Action)
- **DashDown**: Service unreachable
- **DashHighErrorRate**: >5% error rate for 5 minutes
- **DashHighAgentFailureRate**: >10% agent failures
- **DashBudgetCritical**: >95% budget consumed
- **DashPostgreSQLDown**: Database unreachable
- **DashRedisDown**: Redis unreachable
- **DashDiskFull**: >95% disk usage

#### Warning Alerts (Attention Needed)
- **DashBudgetWarning**: >80% budget consumed
- **DashMemoryHigh**: >4GB memory usage
- **DashDiskSpaceLow**: >85% disk usage
- **DashEventProcessingSlow**: >1s avg processing time
- **DashHighApiLatency**: p95 latency >5s
- **DashQueueDepthHigh**: >100 pending tasks
- **DashEventBusBacklog**: >1000 queued events

### Alertmanager Configuration

Edit `alertmanager/alertmanager.yml` to configure notifications:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts'
        title: 'Godel Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

## Recording Rules

Pre-computed aggregations in `prometheus/recording_rules.yml`:

### SLO Tracking
- `slo:dash_api_latency_p99:ratio_rate5m` - 99th percentile API latency
- `slo:dash_api_latency_p95:ratio_rate5m` - 95th percentile API latency
- `slo:dash_agent_execution_p99:ratio_rate5m` - 99th percentile agent execution
- `slo:dash_error_rate:ratio_rate5m` - Error rate for SLO calculation
- `slo:dash_swarm_success_rate:ratio_rate5m` - Team success rate

### Error Budget
- `error_budget:dash_monthly:allowed` - Monthly error budget
- `error_budget:dash_monthly:consumed` - Errors consumed this month
- `error_budget:dash_monthly:remaining_ratio` - Budget remaining (0-1)
- `error_budget:dash_daily:burn_rate` - Daily burn rate

### Dashboard Aggregations
- `agg:dash_agents_active_total` - Total active agents
- `agg:dash_event_rate_by_type:rate5m` - Event rate by type
- `agg:dash_error_rate_by_component:rate5m` - Error rate by component
- `agg:dash_api_latency_avg:rate5m` - Average API latency
- `agg:dash_agent_execution_avg:rate5m` - Average agent execution time

### Cost Analysis
- `cost:dash_per_agent_execution` - Cost per agent execution
- `cost:dash_per_successful_swarm` - Cost per successful team
- `cost:dash_hourly_projection` - Hourly cost projection
- `cost:dash_daily_projection` - Daily cost projection
- `cost:dash_efficiency_ratio` - Successes per dollar

## Data Retention

- **Prometheus**: 15 days (configurable via `--storage.tsdb.retention.time`)
- **Grafana**: Persistent storage for dashboards and users
- **Alertmanager**: In-memory only (resets on restart)

## Maintenance

### Reload Configuration

```bash
# Reload Prometheus config without restart
curl -X POST http://localhost:9090/-/reload

# Reload Alertmanager config without restart
curl -X POST http://localhost:9093/-/reload
```

### Backup

```bash
# Backup Prometheus data
docker run --rm -v dash_prometheus-data:/data -v $(pwd):/backup alpine tar czf /backup/prometheus-backup.tar.gz -C /data .

# Backup Grafana data
docker run --rm -v dash_grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-backup.tar.gz -C /data .
```

### Troubleshooting

**Prometheus not scraping Godel**
- Verify Godel is running on port 7373
- Check `host.docker.internal` resolves correctly
- Review Prometheus targets at http://localhost:9090/targets

**No data in Grafana**
- Verify Prometheus is a configured data source
- Check dashboard time range matches data retention
- Ensure recording rules are loaded (Status > Rules)

**Alerts not firing**
- Check alert rules at http://localhost:9090/alerts
- Verify Alertmanager is running and configured
- Review Alertmanager status at http://localhost:9093/#/status

## Configuration

### Environment Variables

Create a `.env` file in the monitoring directory:

```bash
# Database credentials for exporters
POSTGRES_USER=godel
POSTGRES_PASSWORD=your_password
POSTGRES_DB=godel
REDIS_PASSWORD=

# Grafana admin password
GF_SECURITY_ADMIN_PASSWORD=secure_password
```

### Customizing Dashboards

1. Edit dashboards in Grafana
2. Export JSON (Share > Export)
3. Save to `grafana/dashboards/`
4. Update provisioning if needed

### Adding New Alerts

1. Edit `prometheus/alerts.yml`
2. Add alert rule following Prometheus format
3. Reload Prometheus or restart stack

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Godel     │────▶│  Prometheus │────▶│   Grafana   │
│   :7373     │     │   :9090     │     │   :3000     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Alertmanager│
                    │   :9093     │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Slack/     │
                    │  PagerDuty  │
                    └─────────────┘
```

## Further Reading

- [Dashboard Usage Guide](./docs/DASHBOARD_USAGE.md)
- [Alert Runbook](./docs/ALERT_RUNBOOK.md)
- [Query Examples](./docs/QUERY_EXAMPLES.md)

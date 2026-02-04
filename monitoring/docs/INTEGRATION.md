# Dash Monitoring Integration Guide

This guide explains how to integrate the monitoring stack with your Dash deployment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Dash Stack                           │
├─────────────────────────────────────────────────────────────┤
│  Dash Orchestrator (port 7373)                              │
│  ├── /metrics → Prometheus metrics endpoint                 │
│  ├── /health  → Health check endpoint                       │
│  └── Event Bus → Redis                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                         │
├─────────────────────────────────────────────────────────────┤
│  Prometheus (9090)  Grafana (3000)  Alertmanager (9093)    │
│  ├── Scrapes metrics        ├── Visualizes          ├── Routes │
│  ├── Evaluates rules        ├── Dashboards          ├── Notifies │
│  └── Sends alerts           ├── Explores            └── Groups   │
└─────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Start the Main Dash Stack

```bash
cd /Users/jasontang/clawd/projects/dash
docker-compose up -d postgres redis
npm run dev  # or: dash server
```

Verify Dash is exporting metrics:
```bash
curl http://localhost:7373/metrics
curl http://localhost:7373/health
```

### 2. Start the Monitoring Stack

```bash
cd /Users/jasontang/clawd/projects/dash/monitoring
docker-compose up -d
```

### 3. Verify Integration

Check Prometheus targets:
- Open http://localhost:9090/targets
- All targets should show as **UP**

Check Grafana dashboards:
- Open http://localhost:3000
- Login: admin/admin
- Navigate to Dashboards
- All 5 Dash dashboards should be present

## Configuration

### Environment Variables

Create `.env` in the monitoring directory:

```bash
# Database credentials (must match main stack)
POSTGRES_USER=dash
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=dash

# Redis password (if configured)
REDIS_PASSWORD=

# Grafana settings
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=change_me_in_production
```

### Prometheus Scraping

The Prometheus configuration assumes Dash is running on the host machine and accessible via `host.docker.internal:7373`.

For different setups, edit `prometheus/prometheus.yml`:

```yaml
# Local development (default)
static_configs:
  - targets: ['host.docker.internal:7373']

# Docker Compose (if Dash in same network)
static_configs:
  - targets: ['dash:7373']

# Production (explicit IP/hostname)
static_configs:
  - targets: ['dash.prod.internal:7373']
```

### Alert Notifications

Configure alert destinations in `alertmanager/alertmanager.yml`:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#dash-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'your-service-key'
        severity: '{{ .Labels.severity }}'

  - name: 'email'
    email_configs:
      - to: 'oncall@example.com'
        from: 'alerts@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alerts@example.com'
        auth_password: 'password'
```

## Docker Compose Integration

### Option 1: Separate Stacks (Recommended for Development)

Run monitoring stack independently:

```bash
# Terminal 1: Main stack
docker-compose -f docker-compose.yml up -d

# Terminal 2: Monitoring stack
docker-compose -f monitoring/docker-compose.yml up -d
```

### Option 2: Combined Stack (Production)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

include:
  - docker-compose.yml
  - monitoring/docker-compose.yml

services:
  dash:
    networks:
      - dash-network
      - dash-monitoring
    labels:
      - "prometheus.io/scrape=true"
      - "prometheus.io/port=7373"
      - "prometheus.io/path=/metrics"

networks:
  dash-monitoring:
    external: true
```

Run combined:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Kubernetes Integration

### Helm Chart Values

```yaml
# values.yaml
monitoring:
  enabled: true
  
  prometheus:
    serviceMonitor:
      enabled: true
      interval: 15s
      path: /metrics
      
  grafana:
    enabled: true
    dashboards:
      dash-overview:
        url: https://raw.githubusercontent.com/dash/monitoring/main/grafana/dashboards/dash-swarm-overview.json
      dash-agent-performance:
        url: https://raw.githubusercontent.com/dash/monitoring/main/grafana/dashboards/dash-agent-performance.json
      dash-cost-analysis:
        url: https://raw.githubusercontent.com/dash/monitoring/main/grafana/dashboards/dash-cost-analysis.json
      dash-error-tracking:
        url: https://raw.githubusercontent.com/dash/monitoring/main/grafana/dashboards/dash-error-tracking.json
      dash-infrastructure:
        url: https://raw.githubusercontent.com/dash/monitoring/main/grafana/dashboards/dash-infrastructure.json
    
  alertmanager:
    config:
      global:
        slack_api_url: 'YOUR_WEBHOOK_URL'
      route:
        receiver: 'slack'
      receivers:
        - name: 'slack'
          slack_configs:
            - channel: '#alerts'
              send_resolved: true
```

### ServiceMonitor for Prometheus Operator

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: dash-metrics
  labels:
    app: dash
spec:
  selector:
    matchLabels:
      app: dash
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

## Troubleshooting

### Prometheus Can't Scrape Dash

**Symptom**: Target shows as DOWN in Prometheus

**Diagnosis**:
```bash
# Check if Dash is responding
curl http://localhost:7373/metrics

# From inside Prometheus container
docker exec -it dash-prometheus sh
wget -O- http://host.docker.internal:7373/metrics
```

**Solutions**:
1. Verify Dash is running: `curl http://localhost:7373/health`
2. Check firewall rules for port 7373
3. Update Prometheus config with correct target
4. For Linux, ensure Docker supports host.docker.internal

### No Data in Dashboards

**Symptom**: Dashboards show "No data"

**Diagnosis**:
1. Check Prometheus data source in Grafana
2. Verify recording rules are loaded: http://localhost:9090/rules
3. Check time range covers data retention period

**Solutions**:
1. Verify data source URL: http://prometheus:9090
2. Reload Prometheus configuration
3. Reduce dashboard time range

### Alerts Not Firing

**Symptom**: Conditions met but no alerts

**Diagnosis**:
```bash
# Check alert rules
 curl http://localhost:9090/api/v1/rules

# Check alertmanager config
docker logs dash-alertmanager
```

**Solutions**:
1. Verify alert expression in Prometheus
2. Check Alertmanager is receiving alerts
3. Review alert routing configuration
4. Test with amtool: `amtool config routes test --config.file=alertmanager.yml`

### High Memory Usage

**Symptom**: Prometheus or Grafana using excessive memory

**Solutions**:
1. Reduce Prometheus retention: `--storage.tsdb.retention.time=7d`
2. Increase scrape interval: `scrape_interval: 30s`
3. Add recording rules for expensive queries
4. Limit series cardinality with relabel configs

## Performance Tuning

### Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s      # Increase for lower overhead
  evaluation_interval: 15s
  external_labels:
    cluster: 'dash-prod'
    replica: '{{.ExternalURL}}'

# Command flags
--storage.tsdb.retention.time=15d
--storage.tsdb.retention.size=50GB
--query.max-samples=50000000
--query.timeout=2m
```

### Grafana

```yaml
# docker-compose.yml environment
GF_DATABASE_TYPE=postgres
GF_DATABASE_HOST=postgres:5432
GF_DATABASE_NAME=grafana
GF_DATABASE_USER=grafana
GF_DATABASE_PASSWORD=secret

GF_SERVER_ROOT_URL=https://grafana.dash.internal
GF_SECURITY_COOKIE_SECURE=true
GF_SECURITY_COOKIE_SAMESITE=strict
```

## Security Considerations

### Production Checklist

- [ ] Change default Grafana password
- [ ] Enable HTTPS for all endpoints
- [ ] Use authentication for Prometheus
- [ ] Restrict Alertmanager access
- [ ] Encrypt alert notification channels
- [ ] Regular security updates
- [ ] Audit log access

### Network Security

```yaml
# docker-compose.security.yml
services:
  grafana:
    networks:
      - monitoring-internal
    expose:
      - "3000"
    # No public port binding
    
  prometheus:
    networks:
      - monitoring-internal
    # Access via reverse proxy only
    
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    networks:
      - monitoring-internal
      - public
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
```

## Maintenance

### Backup

```bash
#!/bin/bash
# backup-monitoring.sh
DATE=$(date +%Y%m%d)

# Backup Prometheus
docker run --rm -v dash_prometheus-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar czf /backup/prometheus-$DATE.tar.gz -C /data .

# Backup Grafana
docker run --rm -v dash_grafana-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar czf /backup/grafana-$DATE.tar.gz -C /data .

# Backup configuration
tar czf backups/monitoring-config-$DATE.tar.gz \
  prometheus/ grafana/ alertmanager/
```

### Updates

```bash
# Update images
docker-compose pull
docker-compose up -d

# Check for breaking changes
docker logs dash-prometheus
docker logs dash-grafana
```

## Monitoring the Monitors

### Meta-Monitoring

Set up basic health checks:

```bash
# Check Prometheus health
curl -f http://localhost:9090/-/healthy || echo "Prometheus unhealthy"

# Check Grafana health
curl -f http://localhost:3000/api/health || echo "Grafana unhealthy"

# Check Alertmanager health
curl -f http://localhost:9093/-/healthy || echo "Alertmanager unhealthy"
```

### Dead Man's Switch

Configure critical alert for monitoring failure:

```yaml
# alerts.yml
- alert: MonitoringDeadMansSwitch
  expr: vector(1)
  labels:
    severity: critical
  annotations:
    summary: "Monitoring is working"
    description: "This alert should always be firing to prove monitoring is up"
```

## Support

For issues with the monitoring stack:

1. Check [README.md](../README.md) for basic setup
2. Review [Dashboard Usage Guide](./DASHBOARD_USAGE.md)
3. Follow [Alert Runbook](./ALERT_RUNBOOK.md)
4. Use [Query Examples](./QUERY_EXAMPLES.md) for debugging

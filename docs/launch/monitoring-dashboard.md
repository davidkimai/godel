# Godel Production Monitoring Dashboard

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Dashboard URL:** https://grafana.godel.dev/d/godel-production

---

## Overview

This document specifies the production monitoring dashboard for Godel, providing real-time visibility into system health, performance, and business metrics.

---

## Dashboard Architecture

### Primary Dashboard: Godel Production Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  GODEL PRODUCTION STATUS                              [🟢 Healthy]│
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │   Uptime    │ │  Error Rate │ │   Requests  │ │  Latency P99│ │
│  │   99.99%    │ │    0.05%    │ │   45.2k/min │ │    245ms    │ │
│  │   [🟢]      │ │   [🟢]      │ │   [🟢]      │ │   [🟢]      │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  SERVICE HEALTH                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ API Gateway      [🟢]  99.9%   │  Auth Service   [🟢]    │  │
│  │ Task Engine      [🟢]  99.8%   │  Intent Parser  [🟢]    │  │
│  │ Runtime Manager  [🟢]  100%    │  State Store    [🟢]    │  │
│  │ Federation       [🟢]  99.7%   │  Event Bus      [🟢]    │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ERROR BREAKDOWN                               [Last 1 Hour]     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ▓▓▓▓▓▓▓▓░░ 400 Bad Request      45%  (23 incidents)     │  │
│  │ ▓▓▓▓▓░░░░░ 500 Server Error      30%  (15 incidents)     │  │
│  │ ▓▓▓░░░░░░░ 429 Rate Limited      15%  (8 incidents)      │  │
│  │ ▓▓░░░░░░░░ 401 Unauthorized      10%  (5 incidents)      │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  BUSINESS METRICS                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Active Users │ │ Tasks/min    │ │ API Calls/hr │             │
│  │    1,247     │ │     892      │ │   2.7M       │             │
│  │   ↑ 12%      │ │    ↑ 8%      │ │   ↑ 15%      │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Panels

### 1. System Health (Top Row)

#### 1.1 Uptime Gauge
- **Metric:** `up{job=~"godel-.*"}`
- **Visualization:** Stat panel with color thresholds
- **Thresholds:**
  - 🟢 > 99.9%
  - 🟡 99.0% - 99.9%
  - 🔴 < 99.0%
- **Refresh:** 10s

#### 1.2 Error Rate
- **Metric:** `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`
- **Visualization:** Percentage with trend line
- **Thresholds:**
  - 🟢 < 0.1%
  - 🟡 0.1% - 1%
  - 🔴 > 1%
- **Alert:** Page on-call if > 1% for 5m

#### 1.3 Request Rate
- **Metric:** `rate(http_requests_total[1m])`
- **Visualization:** Requests per minute
- **Baseline:** Compare to 7-day average

#### 1.4 Latency Percentiles
- **Metrics:**
  - P50: `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))`
  - P95: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
  - P99: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`
- **Thresholds:**
  - 🟢 P99 < 500ms
  - 🟡 P99 500ms - 1000ms
  - 🔴 P99 > 1000ms

---

### 2. Service Health Grid

| Service | Health Check | Key Metric | Alert Threshold |
|---------|--------------|------------|-----------------|
| API Gateway | `/health` | Response time < 50ms | > 200ms |
| Auth Service | `/auth/health` | Token issuance rate | Error rate > 0.5% |
| Task Engine | `/tasks/health` | Queue depth | > 1000 pending |
| Intent Parser | `/intent/health` | Parse success rate | < 95% |
| Runtime Manager | `/runtime/health` | Active runtimes | Memory > 80% |
| State Store | `/state/health` | Query latency | P99 > 100ms |
| Federation | `/federation/health` | Cross-node latency | > 500ms |
| Event Bus | `/events/health` | Event lag | > 30s |

---

### 3. Error Analysis

#### 3.1 Error Rate by Endpoint
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (handler)
```

#### 3.2 Error Rate by Status Code
```promql
sum(rate(http_requests_total{status=~"[45].."}[5m])) by (status)
```

#### 3.3 Top Erroring Paths
- Table view with:
  - Path
  - Error count (last hour)
  - Error rate %
  - First seen
  - Last seen

---

### 4. Business Metrics

#### 4.1 User Activity
- **Active Users (Real-time):** `godel_users_active_total`
- **New Signups (Daily):** `godel_users_created_total`
- **Session Duration:** Average time per session

#### 4.2 Task Metrics
- **Tasks Created/min:** `rate(godel_tasks_created_total[1m])`
- **Tasks Completed/min:** `rate(godel_tasks_completed_total[1m])`
- **Task Success Rate:** `completed / (completed + failed)`
- **Queue Depth:** `godel_task_queue_depth`

#### 4.3 API Usage
- **Total API Calls:** `rate(godel_api_calls_total[1h])`
- **By Endpoint:** Breakdown of top 10 endpoints
- **By Client:** SDK vs. Direct API usage

---

### 5. Infrastructure Metrics

#### 5.1 Resource Utilization
| Resource | Metric | Warning | Critical |
|----------|--------|---------|----------|
| CPU | `process_cpu_usage` | > 70% | > 90% |
| Memory | `process_resident_memory_bytes` | > 75% | > 90% |
| Disk | `node_filesystem_avail_bytes` | < 20% | < 10% |
| Network | `rate(node_network_receive_bytes_total[1m])` | Baseline + 3σ | Baseline + 5σ |

#### 5.2 Database Metrics
- **Connection Pool:** `godel_db_connections_active / godel_db_connections_max`
- **Query Duration:** P95 and P99 latencies
- **Slow Queries:** > 1s execution time
- **Replication Lag:** For read replicas

#### 5.3 Cache Metrics
- **Hit Rate:** `redis_keyspace_hits / (hits + misses)`
- **Eviction Rate:** `redis_evicted_keys_total`
- **Memory Usage:** `redis_memory_used_bytes / redis_memory_max_bytes`

---

## Alert Configuration

### Critical Alerts (P0)

```yaml
- alert: GodelServiceDown
  expr: up{job=~"godel-.*"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Godel service {{ $labels.job }} is down"
    
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected: {{ $value }}%"
```

### Warning Alerts (P1)

```yaml
- alert: ElevatedLatency
  expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "P99 latency above 1 second"
    
- alert: HighQueueDepth
  expr: godel_task_queue_depth > 1000
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Task queue depth is {{ $value }}"
```

### Info Alerts (P2)

```yaml
- alert: CertificateExpiry
  expr: (ssl_certificate_expiry - time()) / 86400 < 30
  labels:
    severity: info
  annotations:
    summary: "Certificate expires in {{ $value }} days"
```

---

## Dashboard Access

### Viewers
- Engineering team (all members)
- Product team (read-only)
- Leadership (executive summary view)

### Editors
- SRE team
- Platform engineers
- On-call engineers

### Authentication
- SSO via Google Workspace
- Role-based access control
- Audit logging enabled

---

## Mobile Dashboard

### Key Metrics (Mobile-Optimized)
- Overall health indicator
- Current error rate
- P99 latency
- Active incidents

### Mobile Alerts
- Push notifications for P0/P1 alerts
- SMS for critical escalations
- Email digest for daily summary

---

## Runbook Integration

Each alert links to relevant runbooks:

| Alert | Runbook Link |
|-------|--------------|
| ServiceDown | [Service Recovery](../../maintenance/runbooks/service-recovery.md) |
| HighErrorRate | [Error Investigation](../../maintenance/runbooks/error-investigation.md) |
| HighLatency | [Performance Tuning](../../maintenance/runbooks/performance-tuning.md) |
| DBConnectionPool | [Database Scaling](../../maintenance/runbooks/db-scaling.md) |

---

## Dashboard Maintenance

### Regular Reviews
- **Weekly:** SRE team reviews alert accuracy
- **Monthly:** Dashboard UX review with stakeholders
- **Quarterly:** Full metrics audit and cleanup

### Updates
- Version controlled in `monitoring/dashboards/`
- Changes require PR review
- Automated backup before updates

---

## Related Resources

- [On-Call Guide](./on-call.md)
- [Incident Response](../maintenance/incident-response.md)
- [Alert Manager Config](../../monitoring/alertmanager.yml)
- [Prometheus Rules](../../monitoring/prometheus-rules.yml)

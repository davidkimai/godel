# RLM Hypervisor Monitoring Runbook

Operational monitoring and alerting for RLM Hypervisor production systems.

## Table of Contents

1. [Key Metrics](#key-metrics)
2. [Dashboards](#dashboards)
3. [Alerting Rules](#alerting-rules)
4. [Incident Response](#incident-response)
5. [Capacity Planning](#capacity-planning)

---

## Key Metrics

### Service Health Metrics

| Metric | Description | Target | Warning | Critical |
|--------|-------------|--------|---------|----------|
| `rlm_api_availability` | API uptime percentage | 99.99% | < 99.9% | < 99% |
| `rlm_task_success_rate` | Task completion success | > 99.5% | < 99% | < 95% |
| `rlm_api_latency_p99` | P99 response time | < 100ms | > 200ms | > 500ms |
| `rlm_api_latency_p50` | P50 response time | < 20ms | > 50ms | > 100ms |

### Resource Utilization Metrics

| Metric | Description | Target | Warning | Critical |
|--------|-------------|--------|---------|----------|
| `rlm_cpu_utilization` | Average CPU usage | 40-60% | > 80% | > 95% |
| `rlm_memory_utilization` | Average memory usage | 50-70% | > 85% | > 95% |
| `rlm_active_agents` | Concurrent agents | < 80% limit | > 80% | > 95% |
| `rlm_queue_depth` | Pending tasks | < 100 | > 500 | > 1000 |

### Business Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `rlm_quota_usage_daily` | Daily quota consumption | < 80% | > 90% |
| `rlm_cost_per_request` | Cost efficiency | Trending down | > 20% increase |
| `rlm_user_active` | Daily active users | Growth | Sudden drop > 50% |

---

## Dashboards

### 1. Executive Dashboard

Key metrics for leadership visibility:

```yaml
dashboard:
  name: "RLM Executive Summary"
  refresh: 5m
  panels:
    - title: "Service Availability (24h)"
      type: stat
      query: "avg(rlm_api_availability)"
      
    - title: "Daily Active Users"
      type: graph
      query: "count_unique(rlm_user_active)"
      
    - title: "Daily Tasks Executed"
      type: stat
      query: "sum(rlm_tasks_completed)"
      
    - title: "Cost Per Million Requests"
      type: graph
      query: "rlm_cost / (rlm_requests / 1000000)"
```

### 2. Operational Dashboard

Real-time system health:

```yaml
dashboard:
  name: "RLM Operations"
  refresh: 10s
  panels:
    - title: "API Latency Heatmap"
      type: heatmap
      query: "histogram(rlm_api_latency)"
      
    - title: "Error Rate by Endpoint"
      type: graph
      query: "rate(rlm_errors[5m]) by (endpoint)"
      
    - title: "Active Agents by Type"
      type: graph
      query: "sum(rlm_active_agents) by (type)"
      
    - title: "Storage Connector Latency"
      type: graph
      query: "avg(rlm_storage_latency) by (connector)"
```

### 3. Capacity Dashboard

Resource planning metrics:

```yaml
dashboard:
  name: "RLM Capacity Planning"
  refresh: 1m
  panels:
    - title: "Quota Utilization by Org"
      type: bar gauge
      query: "rlm_quota_usage / rlm_quota_limit"
      
    - title: "Agent Pool Utilization"
      type: gauge
      query: "rlm_active_agents / rlm_max_agents"
      
    - title: "Forecast: 30-day Capacity"
      type: graph
      query: "forecast_linear(rlm_active_agents[7d], 30d)"
```

---

## Alerting Rules

### PagerDuty Alerts (Page On-Call)

```yaml
# alerts-critical.yaml
groups:
  - name: critical
    rules:
      - alert: RLMHighErrorRate
        expr: rate(rlm_errors[5m]) / rate(rlm_requests[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
          team: rlm-sre
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"
          
      - alert: RLMHighLatency
        expr: histogram_quantile(0.99, rate(rlm_api_latency_bucket[5m])) > 1
        for: 3m
        labels:
          severity: critical
          team: rlm-sre
        annotations:
          summary: "P99 latency exceeds 1 second"
          
      - alert: RLMDatabaseConnectionFail
        expr: rlm_db_connections_available == 0
        for: 1m
        labels:
          severity: critical
          team: rlm-sre
        annotations:
          summary: "Database connection pool exhausted"
```

### Slack Alerts (Warning Channel)

```yaml
# alerts-warning.yaml
groups:
  - name: warnings
    rules:
      - alert: RLMElevatedErrorRate
        expr: rate(rlm_errors[5m]) / rate(rlm_requests[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Elevated error rate: {{ $value | humanizePercentage }}"
          
      - alert: RLMQuotaNearLimit
        expr: rlm_quota_usage / rlm_quota_limit > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Quota usage above 80% for {{ $labels.user }}"
          
      - alert: RLMSlowTaskExecution
        expr: rlm_task_duration_p99 > 30000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Task execution P99 latency > 30s"
```

### Business Alerts (Email)

```yaml
# alerts-business.yaml
groups:
  - name: business
    rules:
      - alert: RLMSuddenUserDrop
        expr: abs(delta(count(rlm_active_users[1h]))) > 0.5 * count(rlm_active_users)
        for: 15m
        labels:
          severity: info
          channel: email
        annotations:
          summary: "User count dropped by > 50%"
          
      - alert: RLMCostSpike
        expr: rlm_daily_cost > 1.5 * avg_over_time(rlm_daily_cost[7d])
        for: 1h
        labels:
          severity: info
          channel: email
        annotations:
          summary: "Daily cost 50% above 7-day average"
```

---

## Incident Response

### Severity Levels

| Severity | Criteria | Response Time | Escalation |
|----------|----------|---------------|------------|
| SEV-1 | Complete service outage | 5 minutes | Immediate VP notification |
| SEV-2 | Major feature degradation | 15 minutes | Director notification |
| SEV-3 | Minor impact, workarounds exist | 1 hour | Team lead notification |
| SEV-4 | No user impact | 24 hours | Weekly report |

### Incident Response Playbook

#### SEV-1: Complete Outage

```bash
# 1. Acknowledge and create incident
incident create --severity=1 --title="RLM API Outage"

# 2. Check system status
kubectl get pods -n rlm-production
kubectl get events -n rlm-production --sort-by='.lastTimestamp'

# 3. Check recent deployments
kubectl rollout history deployment/rlm-api -n rlm-production

# 4. If deployment-related, immediate rollback
kubectl rollout undo deployment/rlm-api -n rlm-production

# 5. If not deployment, check infrastructure
curl -s https://status.cloudprovider.com/api/v2/status.json | jq

# 6. Communicate status
echo "Investigating complete outage. ETA for resolution: 30 minutes" | \
  slack post #incidents

# 7. Post-incident review within 24 hours
```

#### SEV-2: High Error Rate

```bash
# 1. Identify error patterns
kubectl logs -l app=rlm-api -n rlm-production --tail=1000 | \
  grep ERROR | sort | uniq -c | sort -rn

# 2. Check error breakdown by endpoint
curl -s $API_URL/v1/metrics/errors | jq '.byEndpoint'

# 3. If specific endpoint failing, isolate
curl -X POST $API_URL/v1/admin/circuit-breaker/enable \
  -d '{"endpoint": "/v1/execute", "durationMinutes": 10}'

# 4. If quota-related, emergency quota increase
./scripts/emergency-quota-boost.sh --factor=2

# 5. Monitor recovery
watch -n 10 'curl -s $API_URL/v1/metrics/error-rate'
```

### Runbook Commands

```bash
# Quick health check
./scripts/health-check.sh

# Get current error rate
curl -s $API_URL/v1/metrics/error-rate | jq

# View recent logs
stern rlm --since 15m

# Check quota status
./scripts/quota-status.sh

# Emergency scale up
kubectl scale deployment rlm-api --replicas=10 -n rlm-production

# Enable maintenance mode
kubectl apply -f k8s/emergency/maintenance-mode.yaml

# Disable maintenance mode
kubectl delete -f k8s/emergency/maintenance-mode.yaml
```

---

## Capacity Planning

### Weekly Capacity Review

```bash
#!/bin/bash
# weekly-capacity-review.sh

echo "=== Weekly Capacity Review ==="

# Current utilization
echo "Current Utilization:"
echo "  CPU: $(kubectl top nodes | awk 'NR>1 {sum+=$3} END {print sum/NR}')%"
echo "  Memory: $(kubectl top nodes | awk 'NR>1 {sum+=$5} END {print sum/NR}')%"
echo "  Agents: $(curl -s $API_URL/v1/metrics/active-agents)"

# Trend analysis
echo -e "\n7-day Growth Trends:"
curl -s $API_URL/v1/metrics/growth-rate | jq '.daily_tasks'

# Forecast
echo -e "\n30-day Forecast:"
curl -s $API_URL/v1/metrics/forecast | jq '.required_capacity'

# Recommendations
echo -e "\nRecommendations:"
if (( $(curl -s $API_URL/v1/metrics/quota-forecast) > 80 )); then
    echo "  ⚠️  Plan quota increase within 2 weeks"
fi

if (( $(kubectl top nodes | awk 'NR>1 {sum+=$3} END {print sum/NR}') > 70 )); then
    echo "  ⚠️  Consider cluster scale-out"
fi

echo "=== End Capacity Review ==="
```

### Auto-Scaling Configuration

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rlm-api-hpa
  namespace: rlm-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rlm-api
  minReplicas: 5
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: rlm_active_agents
      target:
        type: AverageValue
        averageValue: "10"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### Capacity Thresholds

| Resource | Scale Up | Scale Down | Max |
|----------|----------|------------|-----|
| API Pods | CPU > 70% | CPU < 30% | 50 |
| OOLONG Pods | Queue > 100 | Queue < 10 | 100 |
| Quota Manager | Latency > 100ms | Latency < 20ms | 10 |

---

## On-Call Responsibilities

### Shift Handoff Checklist

- [ ] Review open incidents
- [ ] Check current alerts
- [ ] Verify on-call rotation
- [ ] Review scheduled deployments
- [ ] Check capacity forecasts
- [ ] Handoff notes documented

### Daily Health Check

Run each morning:

```bash
./scripts/daily-health-check.sh
```

Expected output:
```
✓ All services healthy
✓ Error rate: 0.001%
✓ P99 latency: 45ms
✓ Quota utilization: 45%
✓ No critical alerts
```

---

## Contact Information

- **On-Call Escalation:** pagerduty.com/rlm-oncall
- **Slack:** #rlm-oncall
- **Emergency Hotline:** +1-800-RLM-HELP
- **Documentation:** https://wiki.internal/rlm-runbooks

# Dash Query Examples

This document provides useful PromQL queries for monitoring and debugging the Dash orchestration platform.

## Basic Queries

### System Health

```promql
# Is Dash up?
up{job="dash"}

# Current active swarms
dash_swarms_active

# Total active agents
sum(dash_agents_active)

# Current memory usage (MB)
dash_memory_usage_bytes{type="rss"} / 1024 / 1024
```

### Error Analysis

```promql
# Current error rate per second
sum(rate(dash_errors_total[5m]))

# Error rate by component
sum by (component) (rate(dash_errors_total[5m]))

# Top 5 error types (last hour)
topk(5, sum by (error_type) (increase(dash_errors_total[1h])))

# Error percentage of total events
(
  sum(rate(dash_errors_total[5m])) 
  / 
  sum(rate(dash_events_total[5m]))
) * 100
```

### Agent Performance

```promql
# Average agent execution time (last 5 minutes)
sum(rate(dash_agent_execution_duration_seconds_sum[5m]))
/
sum(rate(dash_agent_execution_duration_seconds_count[5m]))

# 95th percentile execution time
histogram_quantile(0.95, 
  sum(rate(dash_agent_execution_duration_seconds_bucket[5m])) by (le)
)

# Agent throughput by swarm
sum by (swarm_id) (rate(dash_agent_execution_duration_seconds_count[5m]))

# Agent failure rate
sum(rate(dash_agent_failures_total[5m]))
```

## Intermediate Queries

### Cost Analysis

```promql
# Total cost (USD)
sum(dash_swarm_cost_usd)

# Hourly burn rate
sum(rate(dash_swarm_cost_usd[1h])) * 3600

# Cost by swarm (top 10)
topk(10, sum by (swarm_id) (dash_swarm_cost_usd))

# Budget utilization by swarm
dash_budget_utilization_ratio

# Swarms over 80% budget
(dash_budget_utilization_ratio > 0.8) * on(swarm_id) group_left dash_swarm_cost_usd
```

### Event Processing

```promql
# Events per second by type
sum by (event_type) (rate(dash_events_total[5m]))

# Total events per second
sum(rate(dash_events_total[5m]))

# Event processing latency (p95)
histogram_quantile(0.95, 
  sum(rate(dash_event_processing_duration_seconds_bucket[5m])) by (le)
)

# Event bus backlog
dash_eventbus_queued_events

# Dropped events rate
sum(rate(dash_events_dropped_total[5m]))
```

### Swarm Analysis

```promql
# Success rate by strategy
(
  sum by (strategy) (rate(dash_swarm_success_total[5m]))
  /
  (
    sum by (strategy) (rate(dash_swarm_success_total[5m]))
    +
    sum by (strategy) (rate(dash_swarm_failure_total[5m]))
  )
) * 100

# Swarm completion rate
sum(rate(dash_swarm_success_total[5m])) + sum(rate(dash_swarm_failure_total[5m]))

# Average swarm duration
sum(rate(dash_swarm_duration_seconds_sum[5m]))
/
sum(rate(dash_swarm_duration_seconds_count[5m]))
```

## Advanced Queries

### SLO Tracking

```promql
# API latency SLO (99th percentile should be < 2s)
histogram_quantile(0.99, 
  sum(rate(dash_api_request_duration_seconds_bucket[5m])) by (le)
) <= 2

# Success rate SLO (should be > 99%)
(
  sum(rate(dash_swarm_success_total[5m]))
  /
  (sum(rate(dash_swarm_success_total[5m])) + sum(rate(dash_swarm_failure_total[5m])))
) > 0.99

# Error budget remaining (using recording rule)
error_budget:dash_monthly:remaining_ratio

# Error burn rate (should be < 1 for sustainable)
error_budget:dash_daily:burn_rate
```

### Infrastructure Monitoring

```promql
# Redis memory usage
redis_memory_used_bytes / 1024 / 1024

# Redis operations per second
rate(redis_commands_processed_total[5m])

# PostgreSQL connections
pg_stat_activity_count

# PostgreSQL cache hit ratio
(
  sum(pg_stat_database_blks_hit)
  /
  (sum(pg_stat_database_blks_hit) + sum(pg_stat_database_blks_read))
) * 100

# Disk usage percentage
(
  1 - 
  (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})
) * 100
```

### Capacity Planning

```promql
# Agent saturation (active / total)
sum(dash_agents_active) / (sum(dash_agents_active) + sum(dash_agents_pending))

# Queue depth ratio (pending / active)
sum(dash_agents_pending) / sum(dash_agents_active)

# Memory growth rate
rate(dash_memory_usage_bytes{type="rss"}[5m])

# WebSocket connection growth
rate(dash_websocket_connections[5m])
```

## Recording Rules Usage

```promql
# Use pre-computed aggregations for better performance
# These are defined in recording_rules.yml

# Fast latency lookup (no histogram calculation needed)
slo:dash_api_latency_p99:ratio_rate5m

# Pre-computed error rate
slo:dash_error_rate:ratio_rate5m

# Pre-aggregated agent counts
agg:dash_agents_active_total

# Pre-computed event rates
agg:dash_event_rate_by_type:rate5m
```

## Dashboard Queries

### Variables

```promql
# Swarm ID variable options
label_values(dash_swarms_active, swarm_id)

# Model variable options
label_values(dash_agent_execution_duration_seconds, model)

# Component variable options
label_values(dash_errors_total, component)
```

### Table Queries

```promql
# Swarm status table
sort_desc(sum by (swarm_id, strategy) (
  label_replace(
    dash_agents_active or dash_agents_pending or dash_agents_failed,
    "status", "active", "", ""
  )
))

# Error summary table
topk(20, 
  sum by (component, error_type) (increase(dash_errors_total[1h]))
)
```

## Alert Queries

```promql
# High error rate alert condition
(
  sum(rate(dash_errors_total[5m])) 
  / 
  sum(rate(dash_events_total[5m]))
) > 0.05

# Budget critical alert
dash_budget_utilization_ratio > 0.95

# Queue depth alert
sum(dash_agents_pending) > 100

# Memory alert
dash_memory_usage_bytes{type="rss"} / 1024 / 1024 / 1024 > 4
```

## Debugging Queries

```promql
# Find slowest agents (p99 by swarm)
sort_desc(
  histogram_quantile(0.99, 
    sum by (le, swarm_id) (rate(dash_agent_execution_duration_seconds_bucket[5m]))
  )
)

# Find error spikes
(
  sum(rate(dash_errors_total[5m]))
  >
  2 * sum(rate(dash_errors_total[5m] offset 1h))
)

# Find swarms with no progress
(
  dash_agents_active > 0
  and
  rate(dash_agent_execution_duration_seconds_count[5m]) == 0
)

# Cost anomaly detection (swarms spending 10x normal)
(
  sum by (swarm_id) (rate(dash_swarm_cost_usd[5m]))
  >
  10 * avg(sum by (swarm_id) (rate(dash_swarm_cost_usd[1h])))
)
```

## Aggregation Functions

```promql
# Average over time
avg_over_time(dash_agents_active[1h])

# Maximum over time
max_over_time(dash_memory_usage_bytes{type="rss"}[1d])

# Quantile over time
quantile_over_time(0.95, dash_api_request_duration_seconds[1h])

# Increase (counter reset safe)
increase(dash_events_total[1h])

# Rate (per-second average)
rate(dash_errors_total[5m])

# Irate (instant rate)
irate(dash_events_total[5m])
```

## Join Queries

```promql
# Correlate cost with completion rate
(
  sum by (swarm_id) (rate(dash_swarm_cost_usd[5m]))
  /
  sum by (swarm_id) (rate(dash_agent_execution_duration_seconds_count[5m]))
)

# Error rate vs agent count
(
  sum by (swarm_id) (rate(dash_errors_total[5m]))
  /
  sum by (swarm_id) (dash_agents_active)
)
```

## Tips and Tricks

### Range Vectors
- `[5m]` - Last 5 minutes (good for rates)
- `[1h]` - Last hour (good for totals)
- `[1d]` - Last day (good for trends)
- `[7d]` - Last week (good for SLOs)

### Time Offsets
- `offset 1h` - Compare with 1 hour ago
- `offset 1d` - Compare with yesterday
- `offset 1w` - Compare with last week

### Filtering
```promql
# Exact match
{status="running"}

# Regex match
{status=~"running|pending"}

# Negative match
{status!="completed"}

# Regex negative match
{status!~"completed|failed"}
```

### Aggregation Operators
```promql
# Sum
sum(metric)

# Average
avg(metric)

# Count
count(metric)

# Maximum
max(metric)

# Minimum
min(metric)

# Standard deviation
stddev(metric)

# Quantile
quantile(0.95, metric)
```

## Query Optimization

1. **Use recording rules** for complex calculations
2. **Limit time ranges** for faster queries
3. **Filter by labels** early in the query
4. **Avoid high cardinality** in aggregations
5. **Use `topk()`** instead of sorting large datasets

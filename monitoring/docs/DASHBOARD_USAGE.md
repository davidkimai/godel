# Dash Dashboard Usage Guide

This guide explains how to use the pre-built Grafana dashboards for monitoring the Dash orchestration platform.

## Accessing Dashboards

1. Open Grafana at http://localhost:3000
2. Login with default credentials: `admin/admin`
3. Navigate to **Dashboards** in the left sidebar
4. Select a dashboard from the list

## Dashboard Overview

### 1. Swarm Overview
**Purpose**: High-level operational view of all swarms and agents

**Key Metrics**:
- **Active Swarms**: Number of currently running swarms
- **Active Agents**: Total agents currently executing
- **Pending Agents**: Agents waiting in queue
- **Failed Agents**: Agents that encountered errors
- **Success Rate**: Percentage of successful swarm completions
- **Total Cost**: Accumulated cost across all swarms

**When to Use**:
- Daily operations check
- Capacity planning
- Cost monitoring
- Identifying failing swarms

**Interpretation**:
- High pending agents (>50) may indicate need for scaling
- Failed agents >5 may indicate systemic issues
- Success rate <95% requires investigation

### 2. Agent Performance
**Purpose**: Deep dive into agent execution metrics

**Key Metrics**:
- **Execution Time**: p50, p95, p99 latencies
- **Throughput**: Agents completed per second
- **Tool Call Performance**: Individual tool latencies
- **SLO Tracking**: 99th percentile latency trends

**When to Use**:
- Debugging slow agents
- Capacity optimization
- SLO compliance verification
- Tool performance analysis

**Interpretation**:
- p99 latency >5 minutes indicates performance issues
- Throughput drops may indicate resource constraints
- Tool call failures require immediate attention

### 3. Cost Analysis
**Purpose**: Budget tracking and cost optimization

**Key Metrics**:
- **Total Cost**: Current spend (24h)
- **Burn Rate**: Cost per hour
- **Budget Utilization**: Percentage of allocated budget used
- **Cost Efficiency**: Successful completions per dollar
- **Projections**: 30-day spend forecast

**When to Use**:
- Budget reviews
- Cost optimization
- Swarm right-sizing
- Chargeback reporting

**Interpretation**:
- Burn rate >10x hourly average may indicate runaway costs
- Budget utilization >80% triggers warning
- Low efficiency indicates optimization opportunities

### 4. Error Tracking
**Purpose**: Debugging and reliability analysis

**Key Metrics**:
- **Error Rate**: Errors per second
- **Error Budget**: Remaining monthly error budget
- **Error Types**: Distribution by error category
- **Top Error Sources**: Components with most errors

**When to Use**:
- Post-incident analysis
- Reliability improvements
- Error pattern detection
- SLO violation investigation

**Interpretation**:
- Error rate >1% requires immediate attention
- Error budget <50% remaining indicates reliability risk
- Concentrated errors in one component suggests bug

### 5. Infrastructure
**Purpose**: System health and resource monitoring

**Key Metrics**:
- **Resource Usage**: CPU, memory, disk
- **Redis Health**: Connections, memory, operations
- **PostgreSQL Health**: Connections, transactions, cache
- **Service Status**: Up/down indicators

**When to Use**:
- Infrastructure troubleshooting
- Capacity planning
- Database optimization
- Resource leak detection

**Interpretation**:
- Memory >4GB may indicate leak
- Disk >85% requires cleanup
- Redis memory near limit requires tuning
- PostgreSQL cache hit <99% indicates query issues

## Using Variables

Most dashboards support variables for filtering:

1. **Swarm ID**: Filter to specific swarm(s)
2. **Model**: Filter by LLM model used
3. **Component**: Filter by system component
4. **Severity**: Filter errors by severity

To use variables:
1. Select variable from dropdown at top of dashboard
2. Choose values (or "All")
3. Dashboard updates automatically

## Time Ranges

All dashboards default to "Last 1 Hour". Change via time picker:

- **Quick Ranges**: Last 5m, 15m, 1h, 6h, 24h, 7d
- **Custom Range**: Absolute or relative dates
- **Auto-refresh**: 15s, 30s, 1m, 5m, Off

Recommended ranges:
- **Debugging**: Last 15 minutes
- **Operations**: Last 1 hour
- **Reporting**: Last 24 hours
- **Trends**: Last 7 days

## Alert Annotations

Dashboards show alert state changes as vertical lines:

- **Red line**: Alert fired
- **Green line**: Alert resolved

Hover over lines to see alert details.

## Panel Types

### Stat Panels
Single value display with thresholds:
- Green: Healthy
- Yellow: Warning
- Red: Critical

### Graph/Timeseries Panels
Time-series data with multiple series:
- Hover for exact values
- Click legend to hide/show series
- Use zoom for detailed view

### Gauge Panels
Radial display for percentages:
- Shows current value vs max
- Color-coded thresholds

### Table Panels
Detailed lists with sorting:
- Click column headers to sort
- Use search to filter rows
- Export data via panel menu

### Pie/Bar Charts
Distribution visualizations:
- Hover for exact percentages
- Click to drill down (where supported)

### Heatmaps
Latency distributions:
- X-axis: Time
- Y-axis: Latency buckets
- Color intensity: Frequency

## Sharing Dashboards

### Export JSON
1. Click **Share** icon on dashboard
2. Select **Export** tab
3. Click **Save to file**
4. Use JSON for version control

### Create Link
1. Click **Share** icon on dashboard
2. Copy **Link** URL
3. Set time range and variables in URL

### Snapshot
1. Click **Share** icon on dashboard
2. Select **Snapshot** tab
3. Set expiration
4. Share snapshot URL

## Customizing Dashboards

### Save As New
1. Make changes to dashboard
2. Click **Save** icon
3. Enter new name
4. Choose folder

### Add Panel
1. Click **Add** button
2. Select **Visualization**
3. Configure query and display
4. Save dashboard

### Set Home Dashboard
1. Navigate to desired dashboard
2. Click star icon (★) to favorite
3. Go to **Preferences** > **Preferences**
4. Set as home dashboard

## Best Practices

### For Operators
- Check Swarm Overview daily
- Monitor Error Tracking for trends
- Review Cost Analysis weekly
- Set up alert notifications

### For Developers
- Use Agent Performance for debugging
- Check Error Tracking after deployments
- Monitor Infrastructure for resource usage
- Correlate metrics with code changes

### For Managers
- Review Cost Analysis for budgeting
- Monitor Success Rate for reliability
- Track Error Budget for SLOs
- Use overview for status reports

## Troubleshooting

### No Data Showing
1. Verify Prometheus data source
2. Check time range includes data
3. Verify recording rules are loaded
4. Check Dash is exporting metrics

### Slow Loading
1. Reduce time range
2. Simplify queries
3. Increase scrape interval
4. Use recording rules

### Incorrect Values
1. Check unit settings
2. Verify query syntax
3. Compare with Prometheus UI
4. Check for data gaps

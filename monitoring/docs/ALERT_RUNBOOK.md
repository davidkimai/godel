# Godel Alert Runbook

This runbook provides step-by-step instructions for responding to Godel alerts.

## Critical Alerts

### DashDown
**Severity**: CRITICAL  
**Description**: Godel orchestrator is unreachable

**Impact**: Complete service outage

**Diagnosis**:
```bash
# Check if Godel process is running
curl http://localhost:7373/health
curl http://localhost:7373/metrics

# Check logs
tail -f ~/.config/dash/logs/dash.log
docker logs dash-orchestrator  # if using Docker
```

**Resolution**:
1. Check if process crashed - restart if needed
2. Verify port 7373 is not in use by another process
3. Check for OOM kills in system logs
4. Review recent changes that may have caused failure

**Escalation**: Page on-call engineer immediately

---

### DashHighErrorRate
**Severity**: CRITICAL  
**Description**: Error rate exceeds 5% for 5 minutes

**Impact**: Degraded service reliability

**Diagnosis**:
```bash
# Check error details in Prometheus
# Query: rate(dash_errors_total[5m])

# Review recent errors
curl http://localhost:7373/api/swarms | jq '.swarms[] | select(.status == "failed")'
```

**Resolution**:
1. Identify error source from Error Tracking dashboard
2. Check if specific component or swarm is affected
3. Review recent deployments for correlation
4. If isolated to one swarm, consider terminating it
5. Scale down if systemic issue suspected

**Escalation**: Notify team lead if not resolved in 15 minutes

---

### DashHighAgentFailureRate
**Severity**: CRITICAL  
**Description**: >10% of agents failing

**Impact**: Task execution severely impacted

**Diagnosis**:
```bash
# Check failure reasons
# Query: rate(dash_agent_failures_total[10m]) by (failure_reason)

# Review agent logs
dash agents logs --failed
```

**Resolution**:
1. Identify common failure pattern
2. Check external dependencies (APIs, databases)
3. Verify resource availability (memory, disk)
4. Review agent configuration for issues
5. Pause new agent creation until resolved

**Escalation**: Page if failure rate >50%

---

### DashBudgetCritical
**Severity**: CRITICAL  
**Description**: Budget utilization exceeds 95%

**Impact**: Risk of overspending

**Diagnosis**:
```bash
# Check cost breakdown
dash budget status --swarm=$SWARM_ID

# Identify expensive operations
# Check Cost Analysis dashboard
```

**Resolution**:
1. Identify high-cost swarm(s)
2. Evaluate if swarms can be terminated
3. Check for cost anomalies (infinite loops, retries)
4. Increase budget if legitimate growth
5. Implement cost controls

**Escalation**: Notify finance team

---

### DashPostgreSQLDown
**Severity**: CRITICAL  
**Description**: Database connection lost

**Impact**: State persistence unavailable

**Diagnosis**:
```bash
# Check PostgreSQL status
docker ps | grep postgres
pg_isready -h localhost -p 5432

# Check connection logs
docker logs dash-postgres
```

**Resolution**:
1. Verify PostgreSQL container/process is running
2. Check network connectivity
3. Review connection pool settings
4. Restart PostgreSQL if needed
5. Verify data integrity after recovery

**Escalation**: Page DBA if data corruption suspected

---

### DashRedisDown
**Severity**: CRITICAL  
**Description**: Redis connection lost

**Impact**: Event bus and caching unavailable

**Diagnosis**:
```bash
# Check Redis status
redis-cli ping
docker logs dash-redis

# Check memory usage
redis-cli info memory
```

**Resolution**:
1. Verify Redis container/process is running
2. Check memory usage (may be evicting keys)
3. Review persistence settings
4. Restart Redis if needed
5. Check for data loss in event bus

**Escalation**: Page if data loss confirmed

---

### DashDiskFull
**Severity**: CRITICAL  
**Description**: Disk usage exceeds 95%

**Impact**: System instability, potential data loss

**Diagnosis**:
```bash
# Check disk usage
df -h
du -sh /var/lib/postgresql/data
du -sh ~/.config/dash/metrics

# Find large files
find / -type f -size +100M 2>/dev/null
```

**Resolution**:
1. Identify largest disk consumers
2. Clean up old logs and metrics
3. Archive or delete old database backups
4. Expand disk if persistent growth
5. Set up log rotation if not configured

**Escalation**: Page infrastructure team

---

## Warning Alerts

### DashBudgetWarning
**Severity**: WARNING  
**Description**: Budget utilization exceeds 80%

**Diagnosis**:
```bash
# Review Cost Analysis dashboard
# Check budget trends over past week
```

**Resolution**:
1. Review spending patterns
2. Identify cost drivers
3. Plan for budget increase if needed
4. Set up additional monitoring

**Escalation**: Notify project manager

---

### DashMemoryHigh
**Severity**: WARNING  
**Description**: Memory usage exceeds 4GB

**Diagnosis**:
```bash
# Check memory usage
ps aux | grep dash
free -h

# Check for memory leaks
# Compare memory usage over time in Infrastructure dashboard
```

**Resolution**:
1. Identify memory-intensive swarms
2. Restart if memory leak suspected
3. Scale down memory-intensive operations
4. Increase system memory if persistent

**Escalation**: Escalate to critical if >8GB

---

### DashDiskSpaceLow
**Severity**: WARNING  
**Description**: Disk usage exceeds 85%

**Diagnosis**: Same as DashDiskFull

**Resolution**:
1. Clean up temporary files
2. Archive old logs
3. Review growth trends
4. Plan disk expansion

**Escalation**: Escalate to critical if >90%

---

### DashEventProcessingSlow
**Severity**: WARNING  
**Description**: Average event processing >1 second

**Diagnosis**:
```bash
# Check event queue depth
dash events queue-status

# Review slow events in logs
grep "slow" ~/.config/dash/logs/events.log
```

**Resolution**:
1. Check for blocked event handlers
2. Review database query performance
3. Scale event processing workers
4. Check for external API latency

**Escalation**: Escalate if queue backing up

---

### DashHighApiLatency
**Severity**: WARNING  
**Description**: p95 API latency exceeds 5 seconds

**Diagnosis**:
```bash
# Check slow endpoints
# Query in Prometheus: dash_api_request_duration_seconds

# Review API logs
```

**Resolution**:
1. Identify slow endpoints
2. Check database query performance
3. Review concurrent request handling
4. Scale API servers if needed

**Escalation**: Escalate if >10 seconds

---

### DashQueueDepthHigh
**Severity**: WARNING  
**Description**: >100 pending tasks

**Diagnosis**:
```bash
# Check queue status
dash queue status

# Review agent capacity
# Check Agent Performance dashboard
```

**Resolution**:
1. Scale up agent pool
2. Review task distribution
3. Check for blocked agents
4. Consider priority queue adjustments

**Escalation**: Escalate if >500 and growing

---

## Alert Response Procedures

### Immediate Response (0-5 minutes)
1. Acknowledge alert
2. Check alert details in Alertmanager
3. Verify alert is legitimate (not flapping)
4. Assess business impact

### Short-term Response (5-15 minutes)
1. Follow diagnosis steps
2. Attempt immediate resolution
3. Document actions taken
4. Update incident status

### Long-term Response (15+ minutes)
1. Escalate if unresolved
2. Initiate incident response
3. Communicate with stakeholders
4. Plan post-incident review

## Post-Incident Actions

1. **Document**: Write incident report
2. **Review**: Analyze root cause
3. **Improve**: Update runbook if needed
4. **Prevent**: Implement preventive measures
5. **Monitor**: Add additional alerting if gaps found

## Contact Information

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| On-call Engineer | PagerDuty | 0 minutes |
| Team Lead | Slack #alerts | 15 minutes |
| Engineering Manager | Phone | 30 minutes |
| VP Engineering | Phone | 1 hour |

## External Resources

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000
- Alertmanager: http://localhost:9093
- Godel API: http://localhost:7373

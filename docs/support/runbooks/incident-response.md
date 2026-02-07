# Runbook: Incident Response

**Purpose:** Standardized incident response procedures  
**Scope:** All severity levels and incident types  
**Last Updated:** 2026-02-06

---

## Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P1 - Critical | Complete outage | 15 minutes | All agents down, data loss |
| P2 - High | Major degradation | 30 minutes | >50% session failures |
| P3 - Medium | Minor degradation | 2 hours | Performance issues |
| P4 - Low | Cosmetic issues | 24 hours | UI glitches |

---

## 1. P1 - Critical Incident Response

### 1.1 Immediate Actions (0-15 min)

1. **Acknowledge Alert**
   ```bash
   # In PagerDuty/Opsgenie
   # Acknowledge and start incident
   ```

2. **Assess Scope**
   ```bash
   # Check system health
godel status
   
   # Check all components
curl http://localhost:7373/health
   kubectl get pods -n godel
   ```

3. **Establish Communication**
   - Create Slack channel: #incident-YYYY-MM-DD
   - Page on-call engineer if not already
   - Notify stakeholders if customer-impacting

### 1.2 Investigation (15-30 min)

```bash
# 1. Check logs
kubectl logs -f deployment/godel -n godel --tail=1000

# 2. Check metrics
curl http://localhost:7373/metrics | grep error

# 3. Check recent deployments
kubectl rollout history deployment/godel -n godel

# 4. Check resource usage
kubectl top pods -n godel
```

### 1.3 Common P1 Scenarios

#### Scenario A: Complete Outage

```bash
# 1. Check if pods are running
kubectl get pods -n godel

# 2. If pods are down, check events
kubectl get events -n godel --sort-by=.lastTimestamp

# 3. Check resource constraints
kubectl describe node

# 4. Emergency restart
kubectl rollout restart deployment/godel -n godel
```

#### Scenario B: Database Failure

```bash
# 1. Check database connectivity
kubectl exec -it deployment/godel -n godel -- \
  pg_isready -h postgres -p 5432

# 2. Check database logs
kubectl logs -f deployment/postgres -n godel

# 3. If needed, failover to replica
# (Documented in DATABASE_FAILOVER.md)
```

#### Scenario C: Memory Exhaustion

```bash
# 1. Check memory usage
kubectl top pods -n godel

# 2. Identify memory-hungry agents
godel agent list --sort-by=memory

# 3. Kill problematic agents
godel agent terminate <agent-id>

# 4. Scale up if needed
kubectl scale deployment/godel --replicas=5 -n godel
```

### 1.4 Resolution & Recovery

1. **Fix the Issue**
   - Apply fix (rollback, config change, etc.)
   - Verify fix works

2. **Verify Recovery**
   ```bash
   # Full health check
   curl http://localhost:7373/health
   
   # Run smoke tests
   npm run test:smoke
   ```

3. **Close Incident**
   - Update incident ticket
   - Post summary in Slack
   - Schedule post-mortem

---

## 2. P2 - High Severity Response

### 2.1 Response Actions

1. **Acknowledge** (within 30 min)
2. **Assess Impact**
   ```bash
   # Check error rates
godel logs query --level error --since 1h
   
   # Check agent success rate
   curl http://localhost:7373/metrics | grep agent_success
   ```

3. **Mitigation**
   - If partial degradation, redirect traffic
   - If performance issue, scale up
   - If data issue, pause writes

### 2.2 Common P2 Scenarios

#### Scenario A: High Error Rate

```bash
# 1. Identify error pattern
godel logs query --level error --since 30m | grep -E "(ERROR|error)"

# 2. Check recent changes
git log --oneline -10

# 3. Rollback if recent deployment
kubectl rollout undo deployment/godel -n godel

# 4. Monitor recovery
watch 'curl -s http://localhost:7373/health | jq .status'
```

#### Scenario B: Performance Degradation

```bash
# 1. Check latency
curl http://localhost:7373/metrics | grep latency

# 2. Check resource usage
kubectl top pods -n godel

# 3. Scale horizontally
kubectl scale deployment/godel --replicas=5 -n godel

# 4. Enable circuit breaker if needed
# (Update config and restart)
```

---

## 3. Post-Incident Process

### 3.1 Post-Mortem Template

```markdown
# Incident Post-Mortem: [INCIDENT_ID]

## Summary
- **Date:** YYYY-MM-DD
- **Duration:** HH:MM
- **Severity:** P1/P2/P3
- **Impact:** Brief description

## Timeline
- HH:MM - Alert fired
- HH:MM - Engineer acknowledged
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service restored

## Root Cause
[Detailed explanation]

## Impact Assessment
- Users affected: X
- Sessions lost: Y
- Data lost: Yes/No

## Lessons Learned
1. 
2. 

## Action Items
- [ ] Owner - Due Date - Description
```

### 3.2 Required Follow-Up

- [ ] Post-mortem completed within 48 hours
- [ ] Action items assigned and tracked
- [ ] Runbooks updated if needed
- [ ] Monitoring improved if needed
- [ ] Team debrief completed

---

## 4. Escalation Procedures

### 4.1 Escalation Matrix

| Time | Action | Contact |
|------|--------|---------|
| 15 min | Page on-call | PagerDuty |
| 30 min | Escalate to lead | Engineering Lead |
| 1 hour | War room | All engineers |
| 4 hours | Executive notify | CTO |

### 4.2 Communication Channels

| Channel | Use For |
|---------|---------|
| #incidents | Real-time updates |
| #incident-leads | Coordination |
| Status page | Customer updates |
| Email | Stakeholder summary |

---

## 5. Emergency Contacts

| Role | Primary | Secondary |
|------|---------|-----------|
| On-call | oncall@godel.io | +1-555-0100 |
| Engineering Lead | eng-lead@godel.io | +1-555-0101 |
| DevOps Lead | devops@godel.io | +1-555-0102 |
| Product Manager | pm@godel.io | +1-555-0103 |

---

## 6. Quick Reference Commands

```bash
# Health checks
curl http://localhost:7373/health
godel status

# Logs
kubectl logs -f deployment/godel -n godel
godel logs tail --follow

# Metrics
curl http://localhost:7373/metrics
godel metrics

# Restart
kubectl rollout restart deployment/godel -n godel

# Rollback
kubectl rollout undo deployment/godel -n godel

# Scale
kubectl scale deployment/godel --replicas=5 -n godel
```

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-02-06  
**Next Review:** 2026-03-06

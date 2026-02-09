# Operational Runbooks

Collection of operational procedures and incident response guides for Godel v2.0.

## Table of Contents

1. [Incident Response](#incident-response)
2. [Deployment Procedures](#deployment-procedures)
3. [Monitoring & Alerting](#monitoring--alerting)
4. [Backup & Recovery](#backup--recovery)
5. [Performance Tuning](#performance-tuning)
6. [Security Procedures](#security-procedures)

---

## Incident Response

### P0 - Critical Outage

**Impact:** Complete system unavailability

**Response Time:** 5 minutes

**Procedure:**

1. **Immediate Actions (0-5 min):**
```bash
# Assess scope
curl -s http://localhost:3000/health | jq

# Check if rollback needed
npm run status:check

# Notify on-call
npm run alert:oncall --severity=critical
```

2. **If Service Down:**
```bash
# Check process status
pm2 status

# Restart services
npm run restart:emergency

# Verify recovery
curl -s http://localhost:3000/health
```

3. **If Database Issues:**
```bash
# Check DB connectivity
npm run db:status

# Check connection pool
npm run db:pool:status

# If needed, restart connection pool
npm run db:pool:restart
```

4. **If Rollback Required:**
```bash
# Emergency rollback to last known good version
npm run rollback:emergency --version=v2.0.0-stable

# Verify rollback
curl -s http://localhost:3000/health
```

### P1 - High Priority

**Impact:** Major functionality impaired

**Response Time:** 15 minutes

**Common Scenarios:**

#### Agent Spawn Failures

```bash
# Check agent capacity
npm run agents:capacity

# Check resource usage
npm run metrics:resources

# Clear stuck agents
npm run agents:clear-stuck

# Restart agent manager
npm run agents:manager:restart
```

#### Queue Backlog

```bash
# Check queue depth
npm run queue:depth

# Check queue processing rate
npm run queue:rate

# Scale workers if needed
npm run workers:scale --count=20

# If necessary, drain and restart queue
npm run queue:drain
npm run queue:restart
```

#### High Error Rate

```bash
# Check error logs
tail -1000 logs/error.log | grep ERROR

# Get error breakdown
npm run errors:breakdown

# Identify top errors
npm run errors:top --limit=10

# Check recent deployments
npm run deploy:history --limit=5

# If deployment-related, consider rollback
npm run rollback:check --last-hours=1
```

### P2 - Medium Priority

**Impact:** Minor functionality issues or performance degradation

**Response Time:** 1 hour

#### Performance Degradation

```bash
# Check current metrics
npm run metrics:current

# Compare to baseline
npm run metrics:compare --hours=24

# Check for resource exhaustion
npm run metrics:resources

# Review slow queries
npm run db:slow-queries

# Clear caches if needed
npm run cache:clear
```

#### Memory Leaks

```bash
# Monitor memory usage
watch -n 5 'npm run metrics:memory'

# Get heap dumps
npm run debug:heapdump

# Analyze heap
cd /Users/jasontang/clawd/projects/godel && npm run debug:heap:analyze

# Restart service with memory limits
npm run restart -- --max-old-space-size=4096
```

---

## Deployment Procedures

### Standard Deployment

```bash
# 1. Pre-deployment checks
npm run deploy:precheck

# 2. Create snapshot
npm run deploy:snapshot --version=v2.1.0

# 3. Deploy with canary
npm run deploy:canary --version=v2.1.0

# 4. Monitor canary (15 min)
npm run deploy:monitor --stage=canary-1

# 5. Approve next stage
npm run deploy:approve

# 6. Complete rollout
npm run deploy:complete
```

### Hotfix Deployment

```bash
# Emergency hotfix (skip canary)
npm run deploy:hotfix --version=v2.1.1-hotfix

# Fast rollback if issues
npm run rollback --to=v2.1.0
```

### Deployment Rollback

```bash
# Standard rollback
npm run rollback --version=v2.0.0

# Emergency rollback (<15 min)
npm run rollback:emergency --version=v2.0.0

# Database-only rollback
npm run rollback:db --version=v2.0.0

# Configuration rollback
npm run rollback:config --version=v2.0.0
```

### Canary Deployment Steps

```bash
# Step 1: Deploy 1%
npm run deploy:canary --stage=1 --version=v2.1.0
npm run deploy:monitor --duration=15m

# Step 2: Deploy 5% (requires approval)
npm run deploy:approve
npm run deploy:canary --stage=5
npm run deploy:monitor --duration=30m

# Step 3: Deploy 25% (requires approval)
npm run deploy:approve
npm run deploy:canary --stage=25
npm run deploy:monitor --duration=60m

# Step 4: Full rollout
npm run deploy:canary --stage=100
```

---

## Monitoring & Alerting

### Health Check Endpoints

```bash
# Basic health
curl http://localhost:3000/health

# Detailed health
curl http://localhost:3000/health/details

# Readiness probe
curl http://localhost:3000/ready

# Liveness probe
curl http://localhost:3000/live

# Metrics endpoint
curl http://localhost:3000/metrics
```

### Key Metrics to Monitor

```bash
# Real-time metrics dashboard
npm run metrics:dashboard

# Critical metrics watch
watch -n 5 '
  echo "=== Critical Metrics ===" && \
  curl -s http://localhost:3000/metrics | grep -E "(error_rate|latency|queue_depth)"
'
```

| Metric | Warning | Critical | Check Command |
|--------|---------|----------|---------------|
| Error Rate | > 1% | > 5% | `npm run metrics:error-rate` |
| Avg Latency | > 500ms | > 2000ms | `npm run metrics:latency` |
| Queue Depth | > 1000 | > 5000 | `npm run queue:depth` |
| CPU Usage | > 70% | > 90% | `npm run metrics:cpu` |
| Memory Usage | > 80% | > 95% | `npm run metrics:memory` |
| Agent Count | > 80% max | > 95% max | `npm run agents:count` |
| DB Connections | > 80% pool | > 95% pool | `npm run db:connections` |

### Alerting Configuration

```bash
# Check alert rules
npm run alerts:config

# Test alerts
npm run alerts:test

# Silence alerts (maintenance)
npm run alerts:silence --duration=2h --reason="Scheduled maintenance"

# Unsilence alerts
npm run alerts:unsilence
```

### Log Analysis

```bash
# View recent errors
tail -1000 logs/error.log

# Search for specific error
npm run logs:search --pattern="AGENT_SPAWN_FAILED"

# Get error statistics
npm run logs:stats --last-hours=24

# Export logs for analysis
npm run logs:export --start="2026-02-08T00:00:00Z" --end="2026-02-08T23:59:59Z"
```

---

## Backup & Recovery

### Automated Backups

Backups run automatically every 6 hours:
- Database: Full PostgreSQL dump
- Files: Incremental backup
- Configuration: Version-controlled

```bash
# Check backup status
npm run backup:status

# List available backups
npm run backup:list

# Verify backup integrity
npm run backup:verify --id=backup-20260208-120000
```

### Manual Backup

```bash
# Create immediate backup
npm run backup:create --name=pre-change-$(date +%Y%m%d-%H%M%S)

# Backup specific components
npm run backup:db
npm run backup:files
npm run backup:config
```

### Database Recovery

```bash
# List available snapshots
npm run db:snapshots

# Restore from snapshot
npm run db:restore --snapshot=snapshot-20260208-120000

# Point-in-time recovery
npm run db:restore --time="2026-02-08T10:30:00Z"
```

### Full System Recovery

```bash
# Disaster recovery procedure
npm run recovery:full --backup=backup-20260208-120000

# Verify recovery
npm run health:check
npm run test:integration
```

---

## Performance Tuning

### Database Optimization

```bash
# Analyze query performance
npm run db:analyze-queries

# Rebuild indexes
npm run db:reindex

# Vacuum database
npm run db:vacuum

# Update statistics
npm run db:analyze

# Connection pool tuning
# Edit: config/database.json
{
  "pool": {
    "min": 10,
    "max": 50,
    "acquire": 30000,
    "idle": 10000
  }
}
```

### Cache Tuning

```bash
# Check cache hit rate
npm run cache:stats

# Clear cache
npm run cache:clear

# Warm cache
npm run cache:warm

# Configure cache size
# Edit: config/cache.json
{
  "maxSizeMB": 1024,
  "ttlSeconds": 3600,
  "cleanupIntervalMinutes": 10
}
```

### Worker Scaling

```bash
# Check current worker count
npm run workers:count

# Scale workers
npm run workers:scale --count=20

# Auto-scaling configuration
# Edit: config/scaling.json
{
  "enabled": true,
  "minWorkers": 5,
  "maxWorkers": 50,
  "scaleUpThreshold": 0.8,
  "scaleDownThreshold": 0.3,
  "scaleUpCooldownSeconds": 300,
  "scaleDownCooldownSeconds": 600
}
```

### Agent Pool Tuning

```bash
# Check agent pool stats
npm run agents:pool:stats

# Adjust pool size
npm run agents:pool:resize --min=5 --max=20

# Configure agent timeouts
# Edit: config/agents.json
{
  "spawnTimeoutSeconds": 30,
  "taskTimeoutSeconds": 1800,
  "idleTimeoutSeconds": 300,
  "maxConcurrent": 10
}
```

---

## Security Procedures

### Security Incident Response

#### Unauthorized Access Detected

```bash
# 1. Isolate affected systems
npm run security:isolate --scope=agents

# 2. Rotate credentials
npm run security:rotate-credentials --scope=all

# 3. Audit access logs
npm run security:audit --last-hours=24

# 4. Generate incident report
npm run security:report --incident=SEC-001
```

#### Data Breach Response

```bash
# 1. Immediate containment
npm run security:freeze

# 2. Preserve evidence
npm run security:preserve-evidence

# 3. Notify security team
npm run alert:security --severity=critical

# 4. Follow legal/compliance procedures
# See: SECURITY_RESPONSE_PLAYBOOK.md
```

### Security Hardening

```bash
# Run security scan
npm run security:scan

# Check dependencies for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Review access controls
npm run security:access:review
```

### Credential Rotation

```bash
# Rotate database credentials
npm run security:rotate:db

# Rotate API keys
npm run security:rotate:api-keys

# Rotate service tokens
npm run security:rotate:tokens

# Update all at once
npm run security:rotate:all
```

---

## Routine Maintenance

### Daily Tasks

```bash
# Check system health
npm run health:check

# Review error logs
tail -100 logs/error.log

# Check disk space
df -h

# Check memory usage
free -h

# Verify backups
npm run backup:status
```

### Weekly Tasks

```bash
# Performance review
npm run metrics:weekly-report

# Clean old logs
npm run logs:cleanup --days=7

# Update dependencies
npm outdated
npm update

# Security scan
npm run security:scan
```

### Monthly Tasks

```bash
# Full system audit
npm run audit:full

# Capacity planning review
npm run capacity:review

# Disaster recovery test
npm run recovery:test

# Documentation review
npm run docs:review
```

---

## Contact Information

### Escalation Matrix

| Level | Role | Contact | Response Time |
|-------|------|---------|---------------|
| L1 | On-Call Engineer | oncall@company.com | 5 min |
| L2 | Senior Engineer | senior@company.com | 15 min |
| L3 | Engineering Lead | lead@company.com | 30 min |
| L4 | VP Engineering | vp@company.com | 1 hour |

### Emergency Contacts

- **Security:** security@company.com
- **Infrastructure:** infra@company.com
- **Database:** dba@company.com

### Communication Channels

- **Slack:** #incident-response
- **PagerDuty:** [ON-CALL ROTATION]
- **War Room:** [ZOOM LINK]

---

## Appendix

### Quick Reference Commands

```bash
# Full status check
npm run status:full

# Emergency stop
npm run stop:emergency

# Emergency restart
npm run restart:emergency

# Quick health check
curl http://localhost:3000/health

# Generate diagnostics
npm run support:diagnostics
```

### Runbook Update Procedure

1. Make changes to this file
2. Submit PR for review
3. After merge, notify team
4. Update any automation references

---

**Last Updated:** 2026-02-08  
**Version:** 2.0.0  
**Owner:** Operations Team  
**Review Cycle:** Monthly

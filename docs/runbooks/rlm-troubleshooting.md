# RLM Hypervisor Troubleshooting Runbook

Step-by-step troubleshooting for common production issues.

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Common Issues](#common-issues)
3. [Performance Issues](#performance-issues)
4. [Quota Issues](#quota-issues)
5. [Security Issues](#security-issues)
6. [Storage Issues](#storage-issues)

---

## Quick Diagnosis

### 1-Minute Health Check

```bash
#!/bin/bash
# quick-health.sh

echo "=== RLM Quick Health Check ==="

# API Health
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.rlm-hypervisor.io/health)
echo "API Status: $HTTP_STATUS"

# Error Rate (last 5 min)
ERROR_RATE=$(curl -s $API_URL/v1/metrics/error-rate)
echo "Error Rate: $ERROR_RATE"

# Active Tasks
ACTIVE_TASKS=$(curl -s $API_URL/v1/metrics/active-tasks)
echo "Active Tasks: $ACTIVE_TASKS"

# Queue Depth
QUEUE_DEPTH=$(curl -s $API_URL/v1/metrics/queue-depth)
echo "Queue Depth: $QUEUE_DEPTH"

# Check for critical alerts
ALERTS=$(curl -s $API_URL/v1/alerts/active | jq '.critical | length')
echo "Critical Alerts: $ALERTS"

echo "=== End Health Check ==="
```

### Diagnostic Commands

```bash
# Get all pod statuses
kubectl get pods -n rlm-production

# Get recent events
kubectl get events -n rlm-production --sort-by='.lastTimestamp' | tail -20

# Check resource usage
kubectl top pods -n rlm-production

# View recent logs
kubectl logs -l app=rlm-api -n rlm-production --tail=500

# Check service endpoints
kubectl get endpoints -n rlm-production

# Check ingress status
kubectl get ingress -n rlm-production
```

---

## Common Issues

### Issue 1: API Returns 500 Errors

**Symptoms:**
- HTTP 500 responses
- Error spike in metrics

**Diagnosis:**
```bash
# Check logs for errors
kubectl logs -l app=rlm-api -n rlm-production | grep ERROR

# Check specific error patterns
kubectl logs -l app=rlm-api -n rlm-production | grep -i "exception\|error\|fail"

# Check database connections
kubectl exec -it deployment/rlm-api -n rlm-production -- \
  curl localhost:8080/health/database
```

**Solutions:**

1. **Database Connection Pool Exhausted:**
```bash
# Scale database connection pool
kubectl set env deployment/rlm-api \
  DB_MAX_CONNECTIONS=100 -n rlm-production

# Restart pods to apply
kubectl rollout restart deployment/rlm-api -n rlm-production
```

2. **Memory Issues:**
```bash
# Check memory usage
kubectl top pods -n rlm-production

# Increase memory limit
kubectl set resources deployment/rlm-api \
  --limits=memory=2Gi --requests=memory=1Gi -n rlm-production
```

3. **Recent Deployment Issue:**
```bash
# Check recent deployments
kubectl rollout history deployment/rlm-api -n rlm-production

# Rollback if needed
kubectl rollout undo deployment/rlm-api -n rlm-production
```

---

### Issue 2: Tasks Failing with Timeout

**Symptoms:**
- Tasks marked as failed
- Timeout errors in logs

**Diagnosis:**
```bash
# Check timeout configuration
curl -s $API_URL/v1/config/timeouts | jq

# Check task execution times
curl -s $API_URL/v1/metrics/task-durations | jq

# Check for resource constraints
kubectl describe pods -l app=rlm-oolong -n rlm-production | grep -A 5 "Events"
```

**Solutions:**

1. **Increase Task Timeout:**
```typescript
const result = await client.execute({
  type: 'recursive',
  input: data,
  options: {
    timeoutMs: 600000  // 10 minutes
  }
});
```

2. **Optimize Task Decomposition:**
```typescript
// Use smaller chunks for parallel processing
const result = await client.execute({
  type: 'parallel',
  input: {
    items: largeDataset,
    operation: 'process',
    chunkSize: 50  // Smaller chunks
  }
});
```

3. **Scale Executor Resources:**
```bash
# Scale OOLONG executors
kubectl scale deployment rlm-oolong --replicas=20 -n rlm-production

# Check resource limits
kubectl set resources deployment rlm-oolong \
  --limits=cpu=2,memory=4Gi -n rlm-production
```

---

### Issue 3: High Latency

**Symptoms:**
- Slow API responses
- High P99 latency metrics

**Diagnosis:**
```bash
# Check latency breakdown
curl -s $API_URL/v1/metrics/latency | jq

# Check database query times
curl -s $API_URL/v1/metrics/db-latency | jq

# Check storage latency
curl -s $API_URL/v1/metrics/storage-latency | jq

# Profile API endpoints
curl -s $API_URL/v1/metrics/endpoint-latency | jq
```

**Solutions:**

1. **Database Optimization:**
```bash
# Check slow queries
kubectl exec -it deployment/rlm-api -n rlm-production -- \
  psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Add missing indexes
kubectl exec -it deployment/rlm-api -n rlm-production -- \
  psql -c "CREATE INDEX CONCURRENTLY idx_tasks_status ON tasks(status);"
```

2. **Enable Caching:**
```typescript
const result = await client.execute({
  type: 'recursive',
  input: data,
  options: {
    cacheResults: true,
    cacheTtlSeconds: 3600
  }
});
```

3. **Connection Pool Tuning:**
```bash
# Increase connection pool
kubectl set env deployment/rlm-api \
  HTTP_KEEP_ALIVE=true \
  HTTP_MAX_SOCKETS=100 -n rlm-production
```

---

## Performance Issues

### Issue 4: Slow Recursive Task Execution

**Symptoms:**
- Recursive tasks taking longer than expected
- High decomposition depth

**Diagnosis:**
```bash
# Check decomposition metrics
curl -s $API_URL/v1/metrics/decomposition | jq

# Analyze task tree
curl -s $API_URL/v1/tasks/TASK_ID/tree | jq

# Check executor utilization
curl -s $API_URL/v1/metrics/executor-utilization | jq
```

**Solutions:**

1. **Adjust Decomposition Strategy:**
```typescript
const result = await client.execute({
  type: 'recursive',
  input: {
    items: data,
    operation: 'process',
    // Stop decomposition at reasonable depth
    maxDepth: 5,
    // Minimum chunk size
    minChunkSize: 100
  },
  options: {
    maxDepth: 5
  }
});
```

2. **Use Parallel Instead:**
```typescript
// For predictable workloads, parallel may be faster
const result = await client.execute({
  type: 'parallel',
  input: {
    items: data,
    operation: 'process',
    chunkSize: 500  // Fixed chunks
  }
});
```

---

### Issue 5: Storage Connector Slow

**Symptoms:**
- High storage latency
- Slow data reads/writes

**Diagnosis:**
```bash
# Check storage connector metrics
curl -s $API_URL/v1/metrics/storage | jq

# Test direct storage access
kubectl exec -it deployment/rlm-storage -n rlm-production -- \
  curl localhost:8080/health/storage

# Check network connectivity
kubectl exec -it deployment/rlm-storage -n rlm-production -- \
  traceroute storage.googleapis.com
```

**Solutions:**

1. **Enable Transfer Acceleration (S3):**
```typescript
const connector = new S3Connector({
  bucketName: 'my-bucket',
  useTransferAcceleration: true,
  enableIntelligentTiering: true
});
```

2. **Use Local Caching:**
```typescript
const connector = new LocalStorageConnector({
  basePath: '/cache',
  useMmap: true,
  cacheSizeMB: 1024
});
```

3. **Switch Connector:**
```typescript
// Use fastest available connector for region
const connector = region === 'us-east-1' 
  ? new S3Connector(config)
  : new GCSConnector(config);
```

---

## Quota Issues

### Issue 6: Quota Exceeded Errors

**Symptoms:**
- `QUOTA_EXCEEDED` errors
- Tasks rejected

**Diagnosis:**
```bash
# Check quota status
curl -s $API_URL/v1/quotas/user/USER_ID | jq

# Check daily usage
curl -s $API_URL/v1/quotas/user/USER_ID/usage/daily | jq

# Check active sessions
curl -s $API_URL/v1/quotas/user/USER_ID/sessions | jq
```

**Solutions:**

1. **Emergency Quota Increase:**
```bash
# Admin: temporary quota boost
./scripts/emergency-quota-boost.sh \
  --user USER_ID \
  --agents 100 \
  --duration 24h
```

2. **Release Unused Sessions:**
```bash
# Clean up orphaned sessions
curl -X POST $API_URL/v1/admin/cleanup-sessions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"olderThanMinutes": 60}'
```

3. **Optimize Resource Usage:**
```typescript
// Reduce concurrent agents
const result = await client.execute({
  type: 'parallel',
  input: {
    items: data,
    operation: 'process',
    chunkSize: 200  // Larger chunks = fewer agents
  }
});
```

---

### Issue 7: Team Quota Not Allocating

**Symptoms:**
- Team members cannot get quota
- Quota transfers failing

**Diagnosis:**
```bash
# Check team quota status
curl -s $API_URL/v1/quotas/team/TEAM_ID | jq

# Check pending transfers
curl -s $API_URL/v1/quotas/team/TEAM_ID/transfers | jq

# Verify member quotas
curl -s $API_URL/v1/quotas/team/TEAM_ID/members | jq
```

**Solutions:**

1. **Approve Pending Transfers:**
```bash
curl -X POST $API_URL/v1/quotas/team/TEAM_ID/transfers/TRANSFER_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

2. **Increase Team Pool:**
```bash
curl -X PATCH $API_URL/v1/quotas/team/TEAM_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"totalAgentPool": 500}'
```

---

## Security Issues

### Issue 8: Security Alert Triggered

**Symptoms:**
- Security monitoring alerts
- Suspicious activity detected

**Diagnosis:**
```bash
# Check security events
curl -s $API_URL/v1/security/events?severity=critical | jq

# Check failed authentication attempts
curl -s $API_URL/v1/security/events?category=authentication | jq

# Review policy violations
curl -s $API_URL/v1/security/policy-violations | jq
```

**Solutions:**

1. **Block Suspicious IP:**
```bash
curl -X POST $API_URL/v1/security/block-ip \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"ip": "SUSPICIOUS_IP", "durationHours": 24, "reason": "Suspicious activity"}'
```

2. **Revoke Compromised Tokens:**
```bash
# Revoke user tokens
curl -X POST $API_URL/v1/admin/revoke-tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"userId": "USER_ID", "reason": "Security incident"}'
```

3. **Enable Enhanced Monitoring:**
```bash
# Increase audit logging
curl -X PATCH $API_URL/v1/security/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"auditLevel": "detailed", "logRetentionDays": 90}'
```

---

### Issue 9: Input Sanitization Failure

**Symptoms:**
- Malformed input errors
- Injection attempts in logs

**Diagnosis:**
```bash
# Check sanitization logs
curl -s $API_URL/v1/security/events?category=input_validation | jq

# Test input validation
curl -X POST $API_URL/v1/security/validate \
  -d '{"input": "test<script>alert(1)</script>"}' | jq
```

**Solutions:**

1. **Update Blocked Patterns:**
```typescript
// Add new patterns
securityHardening.addBlockedPattern(/new_attack_pattern/);
```

2. **Enable Strict Mode:**
```typescript
const result = await client.execute({
  type: 'sequential',
  input: userInput,
  options: {
    strictValidation: true,
    rejectOnSanitization: true
  }
});
```

---

## Storage Issues

### Issue 10: Storage Access Denied

**Symptoms:**
- `403 Forbidden` from storage
- Cannot read/write data

**Diagnosis:**
```bash
# Check storage credentials
curl -s $API_URL/v1/storage/health | jq

# Verify IAM permissions
gcloud projects get-iam-policy PROJECT_ID | grep rlm-service-account

# Test direct access
kubectl exec -it deployment/rlm-storage -n rlm-production -- \
  gsutil ls gs://bucket-name/
```

**Solutions:**

1. **Refresh Credentials:**
```bash
# Rotate storage keys
kubectl create secret generic storage-credentials \
  --from-file=key.json=new-key.json \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart storage deployment
kubectl rollout restart deployment/rlm-storage -n rlm-production
```

2. **Verify Bucket Permissions:**
```bash
# GCS
gsutil iam ch serviceAccount:rlm@project.iam.gserviceaccount.com:roles/storage.objectAdmin gs://bucket-name

# S3
aws s3api put-bucket-acl --bucket bucket-name --grant-full-control id=rlm-user
```

---

## Emergency Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Security Incident | security@rlm-hypervisor.io | 15 minutes |
| Production Outage | oncall@rlm-hypervisor.io | 5 minutes |
| Quota Emergency | support@rlm-hypervisor.io | 30 minutes |
| General Support | help@rlm-hypervisor.io | 4 hours |

---

## Escalation Path

```
L1: On-Call Engineer
  ↓ (If unresolved in 30 min)
L2: SRE Team Lead
  ↓ (If unresolved in 1 hour)
L3: Engineering Manager
  ↓ (If unresolved in 2 hours)
L4: VP Engineering / CTO
```

---

## Useful Scripts

```bash
# Full diagnostic dump
./scripts/full-diagnostic.sh > diagnostic-$(date +%Y%m%d-%H%M%S).log

# Export metrics for analysis
./scripts/export-metrics.sh --since 24h > metrics-$(date +%Y%m%d).json

# Generate incident report
./scripts/incident-report.sh --incident INCIDENT_ID > report.md
```

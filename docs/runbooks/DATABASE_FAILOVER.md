# Database Failover Runbook

## Overview

This runbook covers procedures for handling PostgreSQL database failures and failovers in the Dash platform.

## Symptoms

- API returning 500 errors with database connection errors
- Health check failures on `/health` and `/ready` endpoints
- Dashboard showing "Database Connection Error"
- Metrics showing PostgreSQL connection errors
- Alert: `DashDatabaseConnectionFailed`

## Initial Assessment

1. **Check database connectivity:**
   ```bash
   kubectl exec -it -n dash deploy/dash-api -- nc -zv postgres 5432
   ```

2. **Check database logs:**
   ```bash
   kubectl logs -n dash -l app.kubernetes.io/name=postgres --tail=100
   ```

3. **Verify connection pool status:**
   ```bash
   kubectl exec -it -n dash deploy/dash-api -- curl localhost:9090/metrics | grep pg_pool
   ```

## Response Procedures

### Scenario 1: Temporary Connection Issue

1. **Check if issue is transient:**
   ```bash
   # Wait 30 seconds and re-check
   sleep 30
   kubectl get pods -n dash
   ```

2. **If pods are crashing, check resource usage:**
   ```bash
   kubectl top pods -n dash -l app.kubernetes.io/component=database
   ```

3. **Restart database if needed:**
   ```bash
   kubectl rollout restart statefulset/postgres -n dash
   ```

### Scenario 2: Database Corruption

1. **Stop all writes immediately:**
   ```bash
   kubectl scale deployment dash-api --replicas=0 -n dash
   ```

2. **Verify backup exists:**
   ```bash
   # Check latest backup
   ls -la /backups/dash/postgres/
   ```

3. **Restore from backup:**
   ```bash
   # Stop postgres
   kubectl delete statefulset postgres -n dash
   
   # Delete PVC (caution: destructive)
   kubectl delete pvc postgres-storage-postgres-0 -n dash
   
   # Restore from backup (example using pg_restore)
   kubectl exec -it postgres-0 -n dash -- pg_restore -U dash_user -d dash /backups/dash/postgres/latest.dump
   ```

### Scenario 3: Primary-Replica Failover (if HA enabled)

1. **Check replication status:**
   ```sql
   -- On primary
   SELECT * FROM pg_stat_replication;
   
   -- On replica
   SELECT * FROM pg_stat_wal_receiver;
   ```

2. **Promote replica to primary:**
   ```bash
   kubectl exec postgres-replica-0 -n dash -- pg_ctl promote
   ```

3. **Update application connection strings:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"DATABASE_HOST":"postgres-replica"}}'
   ```

4. **Restart applications:**
   ```bash
   kubectl rollout restart deployment dash-api -n dash
   ```

### Scenario 4: Connection Pool Exhaustion

1. **Check current connections:**
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```

2. **Identify long-running queries:**
   ```sql
   SELECT pid, usename, application_name, state, 
          EXTRACT(EPOCH FROM (now() - query_start)) as duration_sec,
          query
   FROM pg_stat_activity 
   WHERE state != 'idle' 
   ORDER BY duration_sec DESC;
   ```

3. **Kill problematic connections if necessary:**
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE state = 'idle in transaction' AND 
         EXTRACT(EPOCH FROM (now() - query_start)) > 300;
   ```

4. **Increase connection pool temporarily:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"DATABASE_POOL_SIZE":"50"}}'
   kubectl rollout restart deployment dash-api -n dash
   ```

## Recovery Verification

1. **Verify database connectivity:**
   ```bash
   kubectl exec -it -n dash deploy/dash-api -- curl localhost:3001/ready
   ```

2. **Check application logs:**
   ```bash
   kubectl logs -n dash -l app.kubernetes.io/name=dash-api --tail=50
   ```

3. **Verify metrics:**
   ```bash
   kubectl exec -it -n dash deploy/dash-api -- curl localhost:9090/metrics | grep pg_
   ```

4. **Run smoke tests:**
   ```bash
   curl http://api.dash.local/health
   curl http://api.dash.local/ready
   ```

## Post-Incident

1. **Document incident timeline**
2. **Update runbook if procedures changed**
3. **Review and optimize connection pool settings**
4. **Consider enabling HA if not already active**

## Emergency Contacts

- **Database Admin:** db-oncall@company.com
- **Dash Team:** dash-oncall@company.com
- **PagerDuty:** Dash Critical

## Related Runbooks

- [REDIS_OUTAGE.md](./REDIS_OUTAGE.md)
- [AGENT_STORM.md](./AGENT_STORM.md)

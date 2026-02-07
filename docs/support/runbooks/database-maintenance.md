# Runbook: Database Maintenance

**Purpose:** Database operations and maintenance procedures  
**Scope:** PostgreSQL backup, restore, and optimization  
**Last Updated:** 2026-02-06

---

## 1. Backup Procedures

### 1.1 Automated Backups

Backups are configured via CronJob:

```bash
# Check backup status
kubectl get cronjobs -n godel
kubectl get jobs -n godel | grep backup

# View recent backups
kubectl exec -it deployment/postgres -n godel -- \
  ls -la /backups/
```

### 1.2 Manual Backup

```bash
# 1. Create backup directory
mkdir -p /backups/$(date +%Y%m%d)

# 2. Run pg_dump
kubectl exec -it deployment/postgres -n godel -- \
  pg_dump -U godel -d godel_production \
  -f /backups/godel_$(date +%Y%m%d_%H%M%S).sql

# 3. Compress backup
kubectl exec -it deployment/postgres -n godel -- \
  gzip /backups/godel_*.sql

# 4. Verify backup
kubectl exec -it deployment/postgres -n godel -- \
  ls -lh /backups/
```

### 1.3 Backup Verification

```bash
# Test restore to temporary database
kubectl exec -it deployment/postgres -n godel -- bash -c "
  createdb -U godel godel_test_restore
  gunzip < /backups/godel_YYYYMMDD_HHMMSS.sql.gz | psql -U godel godel_test_restore
  echo 'Row counts:'
  psql -U godel godel_test_restore -c 'SELECT count(*) FROM sessions;'
  dropdb -U godel godel_test_restore
"
```

---

## 2. Restore Procedures

### 2.1 Full Restore

**⚠️ WARNING:** This will overwrite current data. Use with caution.

```bash
# 1. Stop application
kubectl scale deployment/godel --replicas=0 -n godel

# 2. Drop and recreate database
kubectl exec -it deployment/postgres -n godel -- bash -c "
  psql -U godel postgres -c 'DROP DATABASE godel_production;'
  psql -U godel postgres -c 'CREATE DATABASE godel_production;'
"

# 3. Restore from backup
kubectl exec -it deployment/postgres -n godel -- bash -c "
  gunzip < /backups/godel_YYYYMMDD_HHMMSS.sql.gz | psql -U godel godel_production
"

# 4. Verify restore
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c '\dt'

# 5. Restart application
kubectl scale deployment/godel --replicas=3 -n godel

# 6. Verify application
curl http://localhost:7373/health
```

### 2.2 Point-in-Time Recovery (PITR)

If WAL archiving is enabled:

```bash
# Restore to specific point in time
kubectl exec -it deployment/postgres -n godel -- bash -c "
  pg_basebackup -D /var/lib/postgresql/recovery -X stream
  # Edit recovery.conf for target time
  # Start PostgreSQL in recovery mode
"
```

---

## 3. Maintenance Tasks

### 3.1 Regular Maintenance Schedule

| Task | Frequency | Command/Procedure |
|------|-----------|-------------------|
| VACUUM | Daily | Automated (autovacuum) |
| ANALYZE | Weekly | Manual run |
| REINDEX | Monthly | Check bloat first |
| Backup verification | Weekly | Automated test restore |

### 3.2 Manual VACUUM

```bash
# Check table bloat
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
    FROM pg_stat_user_tables
    WHERE n_tup_del > n_tup_ins * 0.1;
  "

# Run VACUUM ANALYZE on specific table
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "VACUUM ANALYZE sessions;"

# Full VACUUM (locks table - use during maintenance window)
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "VACUUM FULL;"
```

### 3.3 Index Maintenance

```bash
# Check index bloat
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    ORDER BY pg_relation_size(indexrelid) DESC;
  "

# REINDEX specific index
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "REINDEX INDEX sessions_status_idx;"

# REINDEX entire database (maintenance window only)
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "REINDEX DATABASE godel_production;"
```

### 3.4 Statistics Update

```bash
# Update all table statistics
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "ANALYZE;"

# Update specific table
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "ANALYZE sessions;"
```

---

## 4. Performance Optimization

### 4.1 Query Performance Analysis

```bash
# Find slow queries
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT query, calls, mean_time, total_time
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 10;
  "

# Reset statistics
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "SELECT pg_stat_statements_reset();"
```

### 4.2 Connection Pool Tuning

```bash
# Check current connections
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT count(*), state FROM pg_stat_activity GROUP BY state;
  "

# View connection limits
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "SHOW max_connections;"
```

### 4.3 Storage Monitoring

```bash
# Check database size
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT pg_size_pretty(pg_database_size('godel_production'));
  "

# Check table sizes
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  "
```

---

## 5. Migration Procedures

### 5.1 Pre-Migration Checklist

- [ ] Full backup completed
- [ ] Migration SQL reviewed
- [ ] Rollback plan prepared
- [ ] Maintenance window scheduled
- [ ] Team notified

### 5.2 Running Migrations

```bash
# 1. Create backup first
./scripts/backup.sh

# 2. Run migrations
npm run migrate

# 3. Verify migrations
npm run migrate:status

# 4. Test application
curl http://localhost:7373/health
npm run test:integration

# 5. If issues, rollback
npm run migrate:rollback
```

### 5.3 Zero-Downtime Migration

For large tables, use pt-online-schema-change or similar:

```bash
# Example: Add column without locking
kubectl exec -it deployment/postgres -n godel -- \
  pg-online-schema-change \
    --alter 'ADD COLUMN new_field VARCHAR(255)' \
    --database godel_production \
    --table sessions
```

---

## 6. Troubleshooting

### 6.1 Connection Issues

```bash
# Check PostgreSQL status
kubectl exec -it deployment/postgres -n godel -- \
  pg_isready -U godel

# Check active connections
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT pid, usename, application_name, client_addr, state
    FROM pg_stat_activity;
  "

# Kill stuck connection
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "SELECT pg_terminate_backend(<pid>);"
```

### 6.2 Disk Space Issues

```bash
# Check disk usage
kubectl exec -it deployment/postgres -n godel -- df -h

# Check WAL size
kubectl exec -it deployment/postgres -n godel -- \
  du -sh /var/lib/postgresql/data/pg_wal/

# Force WAL rotation
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "SELECT pg_switch_wal();"

# Clean old logs
kubectl exec -it deployment/postgres -n godel -- \
  find /var/log/postgresql -name '*.log' -mtime +7 -delete
```

### 6.3 Replication Lag

```bash
# Check replication status
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel godel_production -c "
    SELECT * FROM pg_stat_replication;
  "

# Check lag on replica
kubectl exec -it deployment/postgres-replica -n godel -- \
  psql -U godel godel_production -c "
    SELECT * FROM pg_stat_wal_receiver;
  "
```

---

## 7. Disaster Recovery

### 7.1 DR Scenario: Complete Data Loss

```bash
# 1. Provision new database instance
# 2. Restore from latest backup
./scripts/restore.sh /backups/godel_YYYYMMDD_HHMMSS.sql.gz

# 3. Apply any WAL files for PITR
# 4. Verify data integrity
npm run test:integration

# 5. Update application connection string
kubectl apply -f k8s/new-db-secret.yaml

# 6. Restart application
kubectl rollout restart deployment/godel -n godel
```

### 7.2 DR Testing

```bash
# Quarterly DR drill
./scripts/dr-test.sh

# Verify RPO/RTO
# RPO: < 1 hour (with hourly backups)
# RTO: < 30 minutes (automated restore)
```

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-02-06  
**Next Review:** 2026-03-06

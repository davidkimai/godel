# Migration Guide

Step-by-step guide for migrating to Godel v2.0 (Kata Architecture).

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Migration Steps](#migration-steps)
4. [Post-Migration Verification](#post-migration-verification)
5. [Troubleshooting](#troubleshooting)
6. [Rollback Procedures](#rollback-procedures)

---

## Overview

This guide covers migrating from Godel v1.x (Worktree Architecture) to Godel v2.0 (Kata Architecture). The migration process is designed to be:

- **Non-disruptive**: Zero-downtime migration
- **Reversible**: Full rollback capability within 15 minutes
- **Data-preserving**: All worktrees, sessions, and agents migrated
- **Validated**: Comprehensive integrity checks

### Key Changes

| Feature | v1.x (Worktree) | v2.0 (Kata) |
|---------|----------------|-------------|
| Architecture | Git worktrees | Isolated Kata projects |
| Storage | Filesystem-based | Database + Filesystem |
| Scaling | Limited by git | Horizontal scaling |
| Isolation | Process-level | Container-level |
| Performance | ~100 concurrent | ~1000+ concurrent |

---

## Pre-Migration Checklist

### 1. System Requirements

Ensure your system meets the following requirements:

- [ ] **PostgreSQL 14+** with 10GB+ free space
- [ ] **Node.js 20+** installed
- [ ] **50GB+** disk space available
- [ ] **8GB+** RAM available
- [ ] **Backup storage** configured

### 2. Database Preparation

```bash
# Verify database connectivity
npm run db:validate

# Create migration tables
npm run migrate

# Check database version
psql $DATABASE_URL -c "SELECT version();"
```

### 3. Backup Current State

```bash
# Create full backup
npm run backup:create

# Verify backup integrity
npm run backup:verify

# Store backup in safe location
# Backup location: ./backups/pre-migration-$(date +%Y%m%d-%H%M%S)
```

### 4. Check Current System Health

```bash
# Run health checks
npm run health:check

# Review active sessions
npm run sessions:list -- --status=active

# Check agent status
npm run agents:list -- --status=running
```

### 5. Notify Stakeholders

Send migration notification to:
- [ ] Engineering team
- [ ] Operations team
- [ ] Product stakeholders
- [ ] Users (if applicable)

Template notification:
```
Subject: Scheduled Migration - Godel v2.0

Migration Window: [DATE] [TIME] - [TIME + 2 hours]
Impact: Brief read-only mode during final cutover
Rollback Plan: 15-minute rollback available
Contact: [ON-CALL ENGINEER]
```

---

## Migration Steps

### Phase 1: Preparation (30 minutes)

#### 1.1 Enter Maintenance Mode

```bash
# Enable maintenance mode
curl -X POST http://localhost:3000/api/v1/maintenance/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify maintenance mode
curl http://localhost:3000/health
# Expected: {"status": "maintenance", "maintenance": true}
```

#### 1.2 Stop Background Jobs

```bash
# Stop queue workers
npm run queue:stop

# Stop scheduled tasks
npm run cron:stop

# Wait for completion (check queue depth)
npm run queue:status
```

#### 1.3 Create Final Backup

```bash
# Create pre-migration snapshot
npm run migrate:snapshot -- --name pre-migration-$(date +%Y%m%d)

# Verify snapshot
cat ./backups/snapshots/pre-migration-*.json
```

### Phase 2: Schema Migration (15 minutes)

#### 2.1 Run Database Migrations

```bash
# Apply v2.0 schema migrations
npm run migrate:up

# Verify migrations applied
npm run migrate:status
```

#### 2.2 Create Kata Infrastructure

```bash
# Initialize Kata directories
npm run kata:init

# Set up Kata permissions
chmod -R 755 ./katas
```

### Phase 3: Data Migration (60-120 minutes)

#### 3.1 Start Migration Script

```bash
# Run migration with progress tracking
npm run migrate:worktree-to-kata \
  -- --source ./.claude/worktrees \
     --target ./katas \
     --batch-size 100 \
     --verbose
```

**Migration Progress Output:**
```
[migration-1234567890] Starting Worktree to Kata migration
  Source: ./.claude/worktrees
  Target: ./katas
  Mode: LIVE

Phase 1: Validating prerequisites...
  ✓ All prerequisites validated

Phase 2: Creating source data backup...
  ✓ Backup created at: ./katas/.migration-backup/backup-1234567890

Phase 3: Migrating worktrees...
  Progress: 100/1000
  ...
  ✓ Migrated 1000 worktrees

Phase 4: Migrating sessions...
  ✓ Migrated 5000 sessions

Phase 5: Migrating agents...
  ✓ Migrated 20000 agents

Phase 6: Migrating tasks...
  ✓ Migrated 100000 tasks

Phase 7: Migrating events...
  ✓ Migrated 500000 events

Phase 8: Verifying data integrity...
  ✓ Integrity verified: a1b2c3d4...

Phase 9: Cleaning up source data...
  ✓ Source worktrees archived to: ./.claude/worktrees-archived
```

#### 3.2 Monitor Migration Progress

In a separate terminal:
```bash
# Watch migration logs
tail -f logs/migration-$(date +%Y%m%d).log

# Check database activity
watch -n 5 'psql $DATABASE_URL -c "SELECT COUNT(*) FROM sessions WHERE migrated = true;"'

# Monitor resource usage
htop
```

#### 3.3 Dry Run Option (Optional)

To preview migration without executing:

```bash
npm run migrate:worktree-to-kata -- --dry-run --verbose
```

### Phase 4: Configuration Migration (15 minutes)

#### 4.1 Migrate Configuration Files

```bash
# Migrate .godel configuration
npm run migrate:config

# Update environment variables
cp .env.v1 .env.v1.backup
cat >> .env << EOF

# Godel v2.0 Configuration
GODEL_RUNTIME_PROVIDER=kata
GODEL_KATA_PATH=./katas
GODEL_MAX_AGENTS=1000
GODEL_AUTO_SCALE=true
EOF
```

#### 4.2 Update Scripts

Update package.json scripts:
```json
{
  "scripts": {
    "start": "node dist/index.js --provider=kata",
    "dev": "ts-node src/index.ts --provider=kata",
    "migrate": "npm run migrate:kata"
  }
}
```

### Phase 5: Validation (30 minutes)

#### 5.1 Data Integrity Check

```bash
# Run integrity validation
npm run migrate:verify

# Expected output:
# ✓ Worktree count: 1000 → 1000 Kata projects
# ✓ Session count: 5000 → 5000 migrated
# ✓ Agent count: 20000 → 20000 migrated
# ✓ Task count: 100000 → 100000 migrated
# ✓ Event count: 500000 → 500000 migrated
# ✓ Checksum verified
```

#### 5.2 Smoke Tests

```bash
# Run smoke tests
npm run test:smoke

# Expected: All tests pass
```

#### 5.3 Performance Validation

```bash
# Run quick load test
npm run test:load:10

# Verify performance is acceptable
```

### Phase 6: Cutover (15 minutes)

#### 6.1 Update DNS/Load Balancer (if applicable)

```bash
# Point traffic to new instance
# Or update local symlinks
ln -sf ./katas ./active-projects
```

#### 6.2 Start Services

```bash
# Start with new provider
npm start

# Verify startup
npm run health:check

# Expected: {"status": "healthy", "provider": "kata"}
```

#### 6.3 Disable Maintenance Mode

```bash
# Disable maintenance mode
curl -X POST http://localhost:3000/api/v1/maintenance/disable \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify normal operation
curl http://localhost:3000/health
# Expected: {"status": "healthy", "maintenance": false}
```

### Phase 7: Post-Migration (30 minutes)

#### 7.1 Monitor System

```bash
# Watch for errors
tail -f logs/godel.log | grep ERROR

# Monitor metrics
npm run metrics:watch

# Check agent spawning
npm run agents:list -- --status=running
```

#### 7.2 Run Validation Tests

```bash
# Run integration tests
npm run test:integration

# Run full test suite
npm test
```

#### 7.3 Cleanup (Optional - after 24 hours)

```bash
# Remove archived worktrees (after confirming stability)
rm -rf ./.claude/worktrees-archived

# Remove old backups (keep last 3)
npm run backup:cleanup -- --keep=3
```

---

## Post-Migration Verification

### Automated Verification Script

```bash
npm run migrate:verify -- --comprehensive
```

This checks:
- [ ] All worktrees migrated to Kata
- [ ] Database records consistent
- [ ] File permissions correct
- [ ] Configuration valid
- [ ] Agents can spawn
- [ ] Tasks execute successfully
- [ ] Events flow correctly

### Manual Verification Checklist

- [ ] Create test session
- [ ] Spawn agents in session
- [ ] Submit test task
- [ ] Verify task completion
- [ ] Check event stream
- [ ] Review logs for errors
- [ ] Verify metrics collection

---

## Troubleshooting

### Issue: Migration Fails Partway Through

**Symptoms:** Migration stops with errors

**Resolution:**
```bash
# Check error logs
tail -100 logs/migration-error.log

# Identify failed entities
npm run migrate:status -- --failed

# Retry failed migrations
npm run migrate:retry -- --from-checkpoint

# If needed, rollback and retry
npm run migrate:rollback -- --to=pre-migration
cd /Users/jasontang/clawd/projects/godel && npm run migrate:worktree-to-kata
```

### Issue: Data Integrity Check Fails

**Symptoms:** Checksum mismatch or count discrepancy

**Resolution:**
```bash
# Get detailed comparison
npm run migrate:diff

# Identify missing records
npm run migrate:audit

# Repair specific entities
npm run migrate:repair -- --entity=sessions --ids=session1,session2
```

### Issue: High Memory Usage During Migration

**Symptoms:** System runs out of memory

**Resolution:**
```bash
# Reduce batch size
npm run migrate:worktree-to-kata -- --batch-size=50

# Enable memory-efficient mode
npm run migrate:worktree-to-kata -- --memory-efficient

# Monitor memory
watch -n 1 'ps aux | grep node | grep migrate'
```

### Issue: Database Connection Errors

**Symptoms:** Connection timeouts or pool exhaustion

**Resolution:**
```bash
# Increase connection pool
export DATABASE_POOL_SIZE=50

# Check connection status
npm run db:status

# Restart with larger pool
npm run migrate:worktree-to-kata
```

### Issue: Permission Denied

**Symptoms:** Cannot read worktrees or write to katas

**Resolution:**
```bash
# Fix permissions
chmod -R +r ./.claude/worktrees
chmod -R +w ./katas

# Fix ownership (if needed)
chown -R $(whoami) ./.claude/worktrees ./katas

# Retry migration
npm run migrate:worktree-to-kata
```

### Issue: Agents Fail to Spawn After Migration

**Symptoms:** Agent creation returns errors

**Resolution:**
```bash
# Check Kata directories
ls -la ./katas/

# Verify Kata configuration
npm run kata:validate

# Re-initialize Katas if needed
npm run kata:init -- --force

# Test agent spawn
npm run test:agent-spawn
```

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| `MIGRATION_PREREQ_FAILED` | Prerequisites not met | Check disk space, memory, database |
| `WORKTREE_READ_FAILED` | Cannot read worktree | Check permissions, path exists |
| `KATA_CREATE_FAILED` | Cannot create Kata | Check disk space, permissions |
| `DB_CONNECTION_FAILED` | Database error | Check connection string, pool size |
| `CHECKSUM_MISMATCH` | Data integrity failed | Run repair or rollback |
| `PHASE_TIMEOUT` | Phase took too long | Increase timeout, reduce batch size |

---

## Rollback Procedures

### Emergency Rollback (<15 minutes)

If critical issues are discovered post-migration:

```bash
# Stop current services
npm run stop

# Execute emergency rollback
npm run rollback:emergency -- --version=pre-migration

# Verify rollback
npm run health:check

# Expected: System restored to v1.x state
```

### Manual Rollback Steps

1. **Stop v2.0 services:**
```bash
npm run stop
```

2. **Restore database:**
```bash
# Restore from pre-migration backup
pg_restore -d $DATABASE_URL ./backups/pre-migration-*.sql
```

3. **Restore worktrees:**
```bash
# Restore archived worktrees
mv ./.claude/worktrees-archived ./.claude/worktrees
```

4. **Restore configuration:**
```bash
# Restore v1.x config
cp .env.v1.backup .env
```

5. **Start v1.x services:**
```bash
npm run start:v1
```

### Rollback Verification

```bash
# Verify v1.x is running
curl http://localhost:3000/health
# Expected: {"version": "1.x.x", "provider": "worktree"}

# Test basic operations
npm run test:smoke
```

---

## Getting Help

### Support Channels

- **Slack:** #godel-migration-support
- **Email:** migration-support@company.com
- **On-call:** [ESCALATION_PROCEDURE]

### Diagnostic Information

When reporting issues, include:

```bash
# Generate diagnostic bundle
npm run support:diagnostics > diagnostics-$(date +%Y%m%d).zip
```

This includes:
- Migration logs
- System info
- Database state
- Configuration files
- Error traces

---

## Appendix

### Migration Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `migrate:worktree-to-kata` | Main migration | `npm run migrate:worktree-to-kata -- --source ./worktrees` |
| `migrate:status` | Check migration status | `npm run migrate:status` |
| `migrate:verify` | Verify integrity | `npm run migrate:verify` |
| `migrate:rollback` | Rollback migration | `npm run migrate:rollback -- --to=version` |
| `migrate:retry` | Retry failed | `npm run migrate:retry -- --from-checkpoint` |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GODEL_MIGRATION_BATCH_SIZE` | Batch size | 100 |
| `GODEL_MIGRATION_VERBOSE` | Verbose logging | false |
| `GODEL_MIGRATION_DRY_RUN` | Dry run mode | false |
| `GODEL_MIGRATION_TIMEOUT` | Phase timeout (ms) | 3600000 |
| `GODEL_MIGRATION_PRESERVE` | Preserve source | true |

---

**Last Updated:** 2026-02-08  
**Version:** 2.0.0  
**Migration ID:** PHASE4-GA-2026

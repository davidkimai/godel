# Godel Support: Troubleshooting Guide

**Purpose:** Common issues and resolution steps for Godel operators  
**Audience:** DevOps engineers, system administrators, developers  
**Last Updated:** 2026-02-06

---

## Quick Diagnosis

### System Health Check

```bash
# Complete health check
godel status

# Or via API
curl http://localhost:7373/health | jq
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "components": {
    "database": "connected",
    "redis": "connected",
    "api": "operational"
  }
}
```

---

## Installation Issues

### Issue: npm install fails with permission errors

**Symptoms:**
```
npm ERR! Error: EACCES: permission denied
```

**Solutions:**

1. **Option 1: Change npm default directory**
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   export PATH=~/.npm-global/bin:$PATH
   ```

2. **Option 2: Use npx**
   ```bash
   npx @jtan15010/godel <command>
   ```

3. **Option 3: Fix npm permissions (macOS/Linux)**
   ```bash
   sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
   ```

### Issue: Cannot find module errors

**Symptoms:**
```
Error: Cannot find module '@jtan15010/godel'
```

**Solutions:**

1. **Clean and rebuild**
   ```bash
   rm -rf node_modules dist
   npm install
   npm run build
   ```

2. **Verify build output**
   ```bash
   ls -la dist/
   ```

3. **Check TypeScript version**
   ```bash
   npx tsc --version  # Should be 5.7+
   ```

### Issue: TypeScript compilation errors

**Symptoms:**
```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Solutions:**

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run type check**
   ```bash
   npm run typecheck
   ```

3. **Fix linting issues**
   ```bash
   npm run lint:fix
   ```

---

## Runtime Issues

### Issue: Database connection failed

**Symptoms:**
```
[ERROR] Database: Connection failed: ECONNREFUSED
```

**Diagnosis:**
```bash
# Check PostgreSQL status
pg_isready -h localhost -p 5432

# Test from Godel pod
kubectl exec -it deployment/godel -n godel -- \
  pg_isready -h postgres -p 5432
```

**Solutions:**

1. **Start PostgreSQL (local)**
   ```bash
   # macOS
   brew services start postgresql
   
   # Ubuntu
   sudo service postgresql start
   ```

2. **Start with Docker**
   ```bash
   docker-compose up -d postgres
   ```

3. **Use SQLite (development only)**
   ```bash
   # Add to .env
   DATABASE_URL=sqlite://./godel.db
   ```

4. **Check connection string**
   ```bash
   # Verify .env
   cat .env | grep DATABASE_URL
   ```

### Issue: Redis connection failed

**Symptoms:**
```
[ERROR] Cache: Connection failed to Redis
```

**Diagnosis:**
```bash
# Check Redis
redis-cli ping

# Should return: PONG
```

**Solutions:**

1. **Start Redis**
   ```bash
   # macOS
   brew services start redis
   
   # Manual
   redis-server
   ```

2. **Start with Docker**
   ```bash
   docker-compose up -d redis
   ```

3. **Disable Redis (use in-memory)**
   ```bash
   # Remove REDIS_URL from .env
   # Falls back to in-memory cache
   ```

### Issue: Gateway connection failed

**Symptoms:**
```
[ERROR] Gateway: Connection failed: ENOTFOUND
```

**Solutions:**

1. **Check gateway status**
   ```bash
   openclaw gateway status
   ```

2. **Start gateway**
   ```bash
   openclaw gateway start
   ```

3. **Test connection**
   ```bash
   curl $OPENCLAW_GATEWAY_URL/health
   ```

4. **Disable notifications (optional)**
   ```bash
   # Remove OPENCLAW_GATEWAY_URL from .env
   ```

---

## Agent Issues

### Issue: Agent spawn failed

**Symptoms:**
```
[ERROR] AgentManager: Failed to spawn agent
[ERROR] WorktreeManager: EACCES: permission denied
```

**Diagnosis:**
```bash
# List worktrees
git worktree list

# Check disk space
df -h

# Check permissions
ls -la .claude-worktrees/
```

**Solutions:**

1. **Clean stale worktrees**
   ```bash
   git worktree prune
   rm -rf .claude-worktrees/*
   ```

2. **Check permissions**
   ```bash
   chmod 755 .claude-worktrees/
   ```

3. **Check disk space**
   ```bash
   # Free up space if needed
   docker system prune -f
   ```

### Issue: Agent timeout

**Symptoms:**
```
[ERROR] Agent: Execution timeout after 300000ms
```

**Solutions:**

1. **Increase timeout**
   ```bash
   godel agents spawn "task" --timeout 600000  # 10 minutes
   ```

2. **Set in team config**
   ```yaml
   spec:
     safety:
       maxExecutionTime: 600000
   ```

### Issue: Budget exceeded

**Symptoms:**
```
[ERROR] BudgetManager: Budget exceeded: $52.00 / $50.00
```

**Solutions:**

1. **Check current usage**
   ```bash
   godel budget status
   ```

2. **Increase budget**
   ```bash
   godel budget set --amount 100.00
   ```

3. **Adjust in .env**
   ```bash
   GODEL_BUDGET_TOTAL=100.00
   ```

---

## Team Issues

### Issue: Team creation failed

**Symptoms:**
```
[ERROR] TeamManager: Max teams reached (10/10)
```

**Solutions:**

1. **List active teams**
   ```bash
   godel team list
   ```

2. **Destroy old teams**
   ```bash
   godel team destroy <team-id>
   ```

3. **Increase limit**
   ```bash
   # Add to .env
   GODEL_MAX_SWARMS=20
   ```

### Issue: No agents spawned

**Symptoms:**
```
[WARN] Team: No agents spawned in team team-xxx
```

**Solutions:**

1. **Check team config**
   ```bash
   godel team status <team-id>
   ```

2. **Recreate with initial agents**
   ```bash
   godel team create --name test --task "test" --initial-agents 5
   ```

---

## Workflow Issues

### Issue: Workflow validation failed

**Symptoms:**
```
[ERROR] Workflow: Validation failed - invalid YAML structure
```

**Solutions:**

1. **Validate workflow**
   ```bash
   godel workflow validate workflow.yaml
   ```

2. **Check for common issues:**
   - Duplicate step IDs
   - Missing required fields
   - Circular dependencies
   - Invalid YAML syntax

### Issue: Workflow execution stuck

**Symptoms:**
```
[INFO] Workflow: Step "build" waiting for dependencies...
```

**Solutions:**

1. **Check workflow status**
   ```bash
   godel workflow status <workflow-id>
   ```

2. **Cancel and retry**
   ```bash
   godel workflow cancel <workflow-id>
   godel workflow run workflow.yaml
   ```

3. **Check agent logs**
   ```bash
   godel logs tail --agent <agent-id>
   ```

---

## Performance Issues

### Issue: High latency

**Symptoms:**
```
[WARN] API: Request took 2500ms (threshold: 500ms)
```

**Diagnosis:**
```bash
# Check metrics
curl http://localhost:7373/metrics | grep latency

# Check resource usage
kubectl top pods -n godel
```

**Solutions:**

1. **Scale horizontally**
   ```bash
   kubectl scale deployment/godel --replicas=5 -n godel
   ```

2. **Optimize database**
   ```bash
   # Run VACUUM ANALYZE
   kubectl exec -it deployment/postgres -n godel -- \
     psql -U godel -c "VACUUM ANALYZE;"
   ```

3. **Check Redis memory**
   ```bash
   redis-cli INFO memory
   ```

### Issue: Memory pressure

**Symptoms:**
```
[WARN] System: Memory usage at 85%
```

**Solutions:**

1. **Identify memory-hungry agents**
   ```bash
   godel agent list --sort-by=memory
   ```

2. **Kill problematic agents**
   ```bash
   godel agent terminate <agent-id>
   ```

3. **Scale up resources**
   ```bash
   kubectl set resources deployment/godel \
     --limits=memory=4Gi \
     --requests=memory=2Gi \
     -n godel
   ```

---

## Kubernetes Issues

### Issue: Pod stuck in Pending

**Symptoms:**
```
kubectl get pods -n godel
# STATUS: Pending
```

**Diagnosis:**
```bash
# Check events
kubectl get events -n godel --sort-by=.lastTimestamp

# Describe pod
kubectl describe pod <pod-name> -n godel
```

**Common Causes:**

1. **Insufficient resources**
   ```bash
   # Check node resources
   kubectl describe node
   
   # Scale node pool if needed
   ```

2. **PVC not bound**
   ```bash
   kubectl get pvc -n godel
   kubectl describe pvc <pvc-name> -n godel
   ```

3. **Image pull failure**
   ```bash
   # Check image availability
   kubectl describe pod <pod-name> -n godel | grep -A5 Events
   ```

### Issue: CrashLoopBackOff

**Symptoms:**
```
kubectl get pods -n godel
# STATUS: CrashLoopBackOff
```

**Diagnosis:**
```bash
# Check logs
kubectl logs <pod-name> -n godel --previous

# Describe pod
kubectl describe pod <pod-name> -n godel
```

**Solutions:**

1. **Check configuration**
   ```bash
   # Verify secrets
   kubectl get secrets -n godel
   
   # Verify configmap
   kubectl get configmap -n godel
   ```

2. **Fix and restart**
   ```bash
   kubectl rollout restart deployment/godel -n godel
   ```

---

## Emergency Recovery

### Complete System Failure

If Godel is completely broken:

```bash
# 1. Stop all Godel processes
pkill -f "godel"

# 2. Backup state
cp -r .godel .godel.backup.$(date +%Y%m%d)

# 3. Clean worktrees
git worktree prune
rm -rf .claude-worktrees/*

# 4. Reset to clean state
rm -rf .godel/logs/*

# 5. Restart
npm run build
godel status
```

### Database Corruption

```bash
# 1. Stop application
kubectl scale deployment/godel --replicas=0 -n godel

# 2. Restore from backup
./scripts/restore.sh /backups/godel_YYYYMMDD_HHMMSS.sql.gz

# 3. Verify
kubectl exec -it deployment/postgres -n godel -- \
  psql -U godel -c "SELECT count(*) FROM sessions;"

# 4. Restart
kubectl scale deployment/godel --replicas=3 -n godel
```

---

## Getting Help

### Self-Service Resources

1. **Documentation**: Check the [docs/](../) directory
2. **Examples**: Review [examples/](../../examples/) for working code
3. **CLI Help**: Use `--help` flag for any command
4. **Status Check**: Run `godel status` for system health

### Community Support

- **GitHub Issues**: [github.com/davidkimai/godel/issues](https://github.com/davidkimai/godel/issues)
- **GitHub Discussions**: [github.com/davidkimai/godel/discussions](https://github.com/davidkimai/godel/discussions)

### Professional Support

For enterprise support:
- Email: support@godel-ai.io
- Include your organization and support tier

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-02-06  
**Next Review:** 2026-03-06

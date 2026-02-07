# Redis Outage Runbook

## Overview

This runbook covers procedures for handling Redis cache and queue failures in the Godel platform. Godel has automatic fallback to in-memory storage when Redis is unavailable.

## Symptoms

- Events being queued but not processed
- Queue depth increasing
- Dashboard showing "Redis Connection Error"
- API slower than usual (fallback mode)
- Alert: `DashRedisConnectionFailed`
- Logs showing "Entering fallback mode"

## Initial Assessment

1. **Check Redis connectivity:**
   ```bash
   kubectl exec -it -n godel deploy/godel-api -- nc -zv redis 6379
   ```

2. **Check Redis health:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli ping
   ```

3. **Check memory usage:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli info memory
   ```

4. **Check queue depth:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli llen godel:queue:pending
   ```

## Response Procedures

### Scenario 1: Redis Pod Crash

1. **Check pod status:**
   ```bash
   kubectl get pods -n godel -l app.kubernetes.io/name=redis
   ```

2. **Check pod logs:**
   ```bash
   kubectl logs -n godel -l app.kubernetes.io/name=redis --previous
   ```

3. **Restart Redis:**
   ```bash
   kubectl rollout restart statefulset/redis -n godel
   ```

4. **Verify recovery:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli ping
   # Should return PONG
   ```

### Scenario 2: Memory Exhaustion (OOM)

1. **Check memory usage:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli info memory | grep used_memory
   ```

2. **Check for large keys:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli --bigkeys
   ```

3. **Evict expired keys manually:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli EVAL \
     "return redis.call('del', unpack(redis.call('keys', 'godel:queue:dead:*')))" 0
   ```

4. **Increase memory limit (temporary fix):**
   ```bash
   kubectl patch statefulset redis -n godel --type merge -p \
     '{"spec":{"template":{"spec":{"containers":[{"name":"redis","resources":{"limits":{"memory":"2Gi"}}}]}}}}'
   ```

### Scenario 3: Persistence Failure

1. **Check persistence status:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli info persistence
   ```

2. **Check disk space:**
   ```bash
   kubectl exec -it redis-0 -n godel -- df -h /data
   ```

3. **If AOF is corrupt, rebuild:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli BGREWRITEAOF
   ```

### Scenario 4: Extended Outage (Fallback Mode)

The system automatically enters fallback mode. Monitor these metrics:

1. **Check fallback statistics:**
   ```bash
   curl http://api.godel.local/metrics | grep redis_fallback
   ```

2. **Monitor memory cache usage:**
   ```bash
   curl http://api.godel.local/metrics | grep memory_cache_
   ```

3. **Check queued events:**
   ```bash
   curl http://api.godel.local/metrics | grep queued_events
   ```

4. **If approaching memory limits, consider:**
   - Scaling API pods to distribute cache
   - Increasing pod memory limits
   - Temporarily reducing queue retention

## Recovery Procedures

When Redis comes back online:

1. **Verify Redis is ready:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli ping
   kubectl exec -it redis-0 -n godel -- redis-cli info replication
   ```

2. **Force recovery if needed:**
   ```bash
   # This triggers event replay
   curl -X POST http://api.godel.local/admin/recovery/redis
   ```

3. **Monitor event replay:**
   ```bash
   watch 'curl -s http://api.godel.local/metrics | grep replayed_events'
   ```

4. **Verify queue processing:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli llen godel:queue:pending
   ```

## Preventive Measures

1. **Configure proper memory limits:**
   ```yaml
   # In values.yaml
   redis:
     master:
       resources:
         limits:
           memory: 1Gi
       persistence:
         enabled: true
         size: 5Gi
   ```

2. **Set up Redis monitoring:**
   ```bash
   # Monitor memory usage
   kubectl exec -it redis-0 -n godel -- redis-cli info memory | grep used_memory_human
   
   # Set up alerts for >80% memory usage
   ```

3. **Enable Redis persistence:**
   ```bash
   kubectl exec -it redis-0 -n godel -- redis-cli CONFIG SET appendonly yes
   kubectl exec -it redis-0 -n godel -- redis-cli CONFIG SET save "60 1000"
   ```

## Rollback Plan

If recovery fails:

1. **Clear Redis data and restart:**
   ```bash
   kubectl delete statefulset redis -n godel
   kubectl delete pvc redis-storage-redis-0 -n godel
   kubectl apply -f k8s/redis.yaml
   ```

2. **Clear application caches:**
   ```bash
   kubectl rollout restart deployment godel-api -n godel
   ```

3. **Repopulate cache from database:**
   ```bash
   curl -X POST http://api.godel.local/admin/cache/warm
   ```

## Post-Incident

1. **Review queued events that were dropped**
2. **Analyze memory usage patterns**
3. **Consider Redis Cluster for HA**
4. **Update memory limits if needed**

## Related Runbooks

- [DATABASE_FAILOVER.md](./DATABASE_FAILOVER.md)
- [AGENT_STORM.md](./AGENT_STORM.md)

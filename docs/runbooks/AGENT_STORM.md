# Agent Storm Runbook

## Overview

An "Agent Storm" occurs when too many agents are spawned simultaneously, overwhelming the system resources. This runbook covers detection and mitigation procedures.

## Symptoms

- API response times > 5 seconds
- CPU/Memory usage > 90% on API pods
- Queue depth increasing rapidly
- Dashboard showing "High Load" warning
- Many agents in "pending" state
- Alert: `DashHighAgentSpawnRate`
- Alert: `DashResourceExhaustion`

## Initial Assessment

1. **Check current agent counts:**
   ```bash
   curl http://api.dash.local/metrics | grep dash_active_agents
   curl http://api.dash.local/metrics | grep dash_pending_agents
   ```

2. **Check resource usage:**
   ```bash
   kubectl top pods -n dash -l app.kubernetes.io/name=dash-api
   kubectl top nodes
   ```

3. **Check HPA status:**
   ```bash
   kubectl get hpa -n dash
   kubectl describe hpa dash-api-hpa -n dash
   ```

4. **Identify source of spawn requests:**
   ```bash
   kubectl logs -n dash -l app.kubernetes.io/name=dash-api --tail=100 | grep spawn
   ```

## Response Procedures

### Immediate Actions (First 2 minutes)

1. **Enable circuit breaker (if not already):**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"ENABLE_CIRCUIT_BREAKER":"true"}}'
   ```

2. **Reduce max concurrent agents:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"MAX_CONCURRENT_AGENTS":"25"}}'
   ```

3. **Scale up API pods (if resources available):**
   ```bash
   kubectl scale deployment dash-api --replicas=10 -n dash
   ```

### Scenario 1: Runaway Swarm

If a specific swarm is spawning too many agents:

1. **Identify the problematic swarm:**
   ```bash
   curl http://api.dash.local/api/swarms | jq '.swarms | sort_by(.agentCount) | reverse | .[0:5]'
   ```

2. **Pause the swarm:**
   ```bash
   curl -X POST http://api.dash.local/api/swarms/{swarmId}/pause
   ```

3. **Kill excessive pending agents:**
   ```bash
   # Get list of pending agents for this swarm
   curl "http://api.dash.local/api/swarms/{swarmId}/agents?status=pending&limit=100" | \
     jq -r '.agents[].id' | \
     xargs -I {} curl -X DELETE http://api.dash.local/api/agents/{}
   ```

4. **Set maximum agents for the swarm:**
   ```bash
   curl -X PATCH http://api.dash.local/api/swarms/{swarmId} \
     -H "Content-Type: application/json" \
     -d '{"config":{"maxAgents":10}}'
   ```

### Scenario 2: DDoS-style Attack

If external requests are spawning agents:

1. **Enable rate limiting:**
   ```bash
   kubectl patch ingress dash-ingress -n dash --type merge \
     -p '{"metadata":{"annotations":{"nginx.ingress.kubernetes.io/rate-limit":"10"}}}'
   ```

2. **Block suspicious IP addresses:**
   ```bash
   # Add to nginx config or WAF
   kubectl patch configmap dash-nginx-config -n dash --type merge \
     -p '{"data":{"blocked-ips":"10.0.0.1,10.0.0.2"}}'
   ```

3. **Require authentication:**
   ```bash
   kubectl set env deployment/dash-api -n dash REQUIRE_AUTH=true
   ```

### Scenario 3: Resource Exhaustion

If cluster resources are exhausted:

1. **Check node capacity:**
   ```bash
   kubectl describe nodes | grep -A 5 "Allocated resources"
   ```

2. **Scale down non-critical services:**
   ```bash
   kubectl scale deployment dash-dashboard --replicas=1 -n dash
   ```

3. **Add nodes to cluster (if auto-scaling enabled):**
   ```bash
   # For managed Kubernetes
   kubectl patch nodepool primary -p '{"spec":{"replicas":5}}'
   ```

4. **Enable agent queueing (don't spawn immediately):**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"QUEUE_BATCH_SIZE":"1","QUEUE_POLL_INTERVAL_MS":"1000"}}'
   kubectl rollout restart deployment dash-api -n dash
   ```

## Monitoring During Incident

1. **Watch agent spawn rate:**
   ```bash
   watch -n 5 'curl -s http://api.dash.local/metrics | grep dash_agents_spawned_rate'
   ```

2. **Monitor queue depth:**
   ```bash
   watch -n 5 'curl -s http://api.dash.local/metrics | grep queue_depth'
   ```

3. **Track HPA scaling:**
   ```bash
   watch -n 5 'kubectl get hpa -n dash'
   ```

## Recovery Procedures

1. **Gradually increase limits:**
   ```bash
   # Every 5 minutes, increase by 10
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"MAX_CONCURRENT_AGENTS":"35"}}'
   kubectl rollout restart deployment dash-api -n dash
   ```

2. **Resume paused swarms:**
   ```bash
   curl -X POST http://api.dash.local/api/swarms/{swarmId}/resume
   ```

3. **Normalize rate limits:**
   ```bash
   kubectl patch ingress dash-ingress -n dash --type merge \
     -p '{"metadata":{"annotations":{"nginx.ingress.kubernetes.io/rate-limit":"100"}}}'
   ```

4. **Restore replica counts:**
   ```bash
   kubectl scale deployment dash-dashboard --replicas=2 -n dash
   ```

## Prevention

1. **Set up proactive alerts:**
   ```yaml
   # Prometheus alert rule
   - alert: DashAgentStormImminent
     expr: rate(dash_agents_spawned_total[1m]) > 50
     for: 2m
     labels:
       severity: warning
     annotations:
       summary: "High agent spawn rate detected"
   ```

2. **Configure automatic throttling:**
   ```yaml
   # In configmap
   MAX_SPAWN_RATE_PER_MINUTE: "30"
   CIRCUIT_BREAKER_THRESHOLD: "5"
   ```

3. **Set up horizontal pod autoscaling:**
   ```bash
   kubectl apply -f k8s/hpa.yaml
   ```

## Post-Incident Review

1. **Document peak agent count**
2. **Identify trigger (specific swarm, API call, etc.)**
3. **Review if limits were appropriate**
4. **Update monitoring thresholds**
5. **Consider implementing admission control**

## Related Runbooks

- [DATABASE_FAILOVER.md](./DATABASE_FAILOVER.md)
- [BUDGET_EXCEEDED.md](./BUDGET_EXCEEDED.md)

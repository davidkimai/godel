# Budget Exceeded Runbook

## Overview

This runbook covers procedures for handling budget overruns and cost management in the Dash platform.

## Symptoms

- Swarms automatically pausing due to budget limits
- Alert: `DashBudgetThresholdExceeded`
- Alert: `DashBudgetHardLimitReached`
- Dashboard showing "Budget Alert" warnings
- Agents failing with "Budget exceeded" error
- Unexpectedly high cloud bills

## Initial Assessment

1. **Check current budget status:**
   ```bash
   curl http://api.dash.local/api/budgets/summary
   ```

2. **Identify high-cost swarms:**
   ```bash
   curl "http://api.dash.local/api/swarms?sortBy=budgetConsumed&limit=10"
   ```

3. **Check spending rate:**
   ```bash
   curl http://api.dash.local/metrics | grep budget_consumption_rate
   ```

4. **Review recent expensive operations:**
   ```bash
   kubectl logs -n dash -l app.kubernetes.io/name=dash-api --since=1h | grep -i "budget\|cost"
   ```

## Response Procedures

### Scenario 1: Budget Threshold Alert (80%)

When a swarm approaches its budget limit:

1. **Review the swarm's spending:**
   ```bash
   curl http://api.dash.local/api/swarms/{swarmId}/budget
   ```

2. **Check which agents are consuming budget:**
   ```bash
   curl "http://api.dash.local/api/swarms/{swarmId}/agents?sortBy=cost&limit=20"
   ```

3. **Option A: Increase budget (if approved):**
   ```bash
   curl -X PATCH http://api.dash.local/api/swarms/{swarmId}/budget \
     -H "Content-Type: application/json" \
     -d '{"allocated": 100.00}'
   ```

4. **Option B: Pause the swarm:**
   ```bash
   curl -X POST http://api.dash.local/api/swarms/{swarmId}/pause
   ```

5. **Option C: Optimize remaining agents:**
   ```bash
   # Switch to cheaper model
   curl -X PATCH http://api.dash.local/api/swarms/{swarmId} \
     -H "Content-Type: application/json" \
     -d '{"config":{"model":"gpt-3.5-turbo"}}'
   ```

### Scenario 2: Hard Budget Limit Reached

When a swarm has exceeded its budget:

1. **Immediate containment:**
   ```bash
   # Pause all running agents in the swarm
   curl -X POST http://api.dash.local/api/swarms/{swarmId}/pause
   ```

2. **Generate cost report:**
   ```bash
   curl "http://api.dash.local/api/swarms/{swarmId}/budget/report?detailed=true" > cost_report.json
   ```

3. **Review for anomalies:**
   ```bash
   # Check for unexpectedly expensive agents
   cat cost_report.json | jq '.agents | sort_by(.cost) | reverse | .[0:10]'
   ```

4. **Emergency budget increase (requires approval):**
   ```bash
   # Document justification before increasing
   curl -X PATCH http://api.dash.local/api/swarms/{swarmId}/budget \
     -H "Content-Type: application/json" \
     -d '{"allocated": 150.00, "reason": "Emergency extension - incident #1234"}'
   ```

### Scenario 3: Runaway Cost Agent

If a single agent is consuming excessive budget:

1. **Identify the agent:**
   ```bash
   curl http://api.dash.local/metrics | grep agent_budget_consumption
   ```

2. **Get agent details:**
   ```bash
   curl http://api.dash.local/api/agents/{agentId}
   ```

3. **Kill the agent if it's stuck:**
   ```bash
   curl -X DELETE http://api.dash.local/api/agents/{agentId}
   ```

4. **Check for infinite loops or runaway processes:**
   ```bash
   kubectl logs -n dash -l app.kubernetes.io/name=dash-api | grep {agentId}
   ```

### Scenario 4: Organization-Wide Budget Alert

When total platform spending exceeds forecasts:

1. **Get overall budget status:**
   ```bash
   curl http://api.dash.local/api/budgets/total
   ```

2. **Enable global budget protection:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"BUDGET_PROTECTION_MODE":"strict"}}'
   kubectl rollout restart deployment dash-api -n dash
   ```

3. **Pause all non-critical swarms:**
   ```bash
   # Get all active swarms
   curl "http://api.dash.local/api/swarms?status=active" | \
     jq -r '.swarms[].id' | \
     xargs -I {} curl -X POST http://api.dash.local/api/swarms/{}/pause
   ```

4. **Notify stakeholders:**
   ```bash
   # Trigger notification (customize for your alerting)
   curl -X POST http://api.dash.local/admin/alert \
     -H "Content-Type: application/json" \
     -d '{"severity":"critical","message":"Platform budget exceeded"}'
   ```

## Budget Recovery

1. **Gradual restoration:**
   ```bash
   # Resume critical swarms first
   curl -X POST http://api.dash.local/api/swarms/{criticalSwarmId}/resume
   ```

2. **Monitor spending:**
   ```bash
   watch -n 30 'curl -s http://api.dash.local/metrics | grep budget_consumption_rate'
   ```

3. **Adjust thresholds:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"BUDGET_ALERT_THRESHOLD":"0.7"}}'
   ```

## Prevention

1. **Set up budget alerts:**
   ```yaml
   # Prometheus alert rules
   - alert: DashBudgetThresholdWarning
     expr: |
       (
         dash_budget_consumed / dash_budget_allocated
       ) > 0.8
     for: 5m
     labels:
       severity: warning
     annotations:
       summary: "Swarm {{ $labels.swarm_id }} at 80% budget"
   
   - alert: DashBudgetCritical
     expr: |
       (
         dash_budget_consumed / dash_budget_allocated
       ) > 0.95
     for: 1m
     labels:
       severity: critical
     annotations:
       summary: "Swarm {{ $labels.swarm_id }} at 95% budget"
   ```

2. **Configure default budgets:**
   ```yaml
   # In values.yaml
   config:
     DEFAULT_BUDGET_LIMIT: "50.00"
     BUDGET_ALERT_THRESHOLD: "0.8"
     BUDGET_HARD_LIMIT_MULTIPLIER: "1.0"
   ```

3. **Implement spending rate limits:**
   ```bash
   kubectl patch configmap dash-config -n dash --type merge \
     -p '{"data":{"MAX_SPEND_RATE_PER_HOUR":"100.00"}}'
   ```

4. **Set up cost allocation tags:**
   ```bash
   # Tag resources for cost tracking
   kubectl label namespace dash cost-center=platform-team
   kubectl label deployment dash-api -n dash project=dash
   ```

## Cost Analysis

1. **Generate daily cost report:**
   ```bash
   curl "http://api.dash.local/api/budgets/report?start=$(date -d '1 day ago' -I)&end=$(date -I)"
   ```

2. **Find cost optimization opportunities:**
   ```bash
   # Agents with high cost but low completion rate
   curl "http://api.dash.local/api/agents?status=failed&sortBy=cost&limit=20"
   ```

3. **Model cost comparison:**
   ```bash
   curl http://api.dash.local/api/budgets/model-comparison
   ```

## Post-Incident Review

1. **Document actual vs. budgeted costs**
2. **Identify root cause (misconfiguration, bug, attack)**
3. **Review budget allocation appropriateness**
4. **Update forecasting models**
5. **Adjust alerting thresholds**

## Related Runbooks

- [AGENT_STORM.md](./AGENT_STORM.md)
- [DATABASE_FAILOVER.md](./DATABASE_FAILOVER.md)

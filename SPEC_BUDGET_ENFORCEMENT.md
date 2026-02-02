# SPEC: Budget Enforcement for Dash Phase 4

**Version:** 1.0  
**Date:** 2026-02-01  
**Status:** Draft  
**Source:** Interview via Claude Code CLI subagent + existing Dash documentation

---

## Executive Summary

This spec defines token/cost budget limits per task, agent, and project for Dash Phase 4 safety framework. Key requirements:
- Track token usage per agent/swarm/task
- Enforce cost limits with configurable actions
- Alert on budget thresholds
- Integrate with quality gates for cost-aware quality

**Current State:** No budget tracking  
**Target State:** Full budget enforcement with alerting and reporting

---

## Problem Statement

Without budget enforcement, Dash agents can:
- Generate excessive tokens, driving up costs
- Run indefinitely without stopping
- Exhaust project budgets without visibility
- Create unpredictable cost spikes

This creates unacceptable financial risk for enterprise deployments.

---

## User Personas

1. **Finance Manager** - Sets and monitors project budgets
2. **DevOps Lead** - Configures per-agent cost limits
3. **Security Officer** - Ensures budget rules are enforced
4. **On-call Engineer** - Responds to budget alerts during incidents

---

## Functional Requirements

### FR1: Budget Model

#### FR1.1: Budget Types

| Budget Type | Scope | Typical Values | Override |
|-------------|-------|----------------|----------|
| Per-Task | Single task | 100K tokens / $5.00 | Task-level config |
| Per-Agent | Single agent | 1M tokens / $50.00 | Agent-level config |
| Per-Swarm | Agent swarm | 5M tokens / $250.00 | Swarm-level config |
| Per-Project | All work | Unlimited / $1000/day | Project-level config |
| Per-Day | Calendar day | 500K tokens / $100.00 | Daily reset |
| Per-Month | Calendar month | 10M tokens / $2000.00 | Monthly reset |

#### FR1.2: Budget Configuration Schema

```typescript
interface BudgetConfig {
  // Task-level (most granular)
  task?: {
    tokens: number;
    cost: number;  // USD
    timeout: number;  // seconds
  };
  
  // Agent-level
  agent?: {
    tokens: number;
    cost: number;
    timeout: number;
    maxRetries: number;
  };
  
  // Swarm-level
  swarm?: {
    tokens: number;
    cost: number;
    timeout: number;
    parallelAgents: number;
  };
  
  // Project-level
  project?: {
    daily?: {
      tokens: number;
      cost: number;
      resetHour: number;  // UTC hour for reset
    };
    weekly?: {
      tokens: number;
      cost: number;
      resetDay: number;  // 0-6, Sunday = 0
    };
    monthly?: {
      tokens: number;
      cost: number;
      resetDay: number;  // 1-28
    };
    unlimited?: boolean;
  };
  
  // Default fallbacks
  defaults?: {
    tokensPerThousandTokens: number;  // For cost calculation
    maxTaskDuration: number;  // seconds
    maxAgentRetries: number;
  };
}

interface BudgetTracking {
  agentId: string;
  taskId: string;
  swarmId?: string;
  projectId: string;
  
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  
  costUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  
  startedAt: Date;
  lastUpdated: Date;
  completedAt?: Date;
  
  retryCount: number;
  budgetSource: 'task' | 'agent' | 'swarm' | 'project';
}
```

#### FR1.3: Cost Calculation

```typescript
interface ModelPricing {
  [modelId: string]: {
    promptPerThousand: number;  // Cost per 1K prompt tokens
    completionPerThousand: number;  // Cost per 1K completion tokens
  };
}

const MODEL_PRICING: ModelPricing = {
  'claude-sonnet-4-5': {
    promptPerThousand: 0.003,  // $3 per 1M
    completionPerThousand: 0.015,  // $15 per 1M
  },
  'moonshot/kimi-k2-5': {
    promptPerThousand: 0.001,  // $1 per 1M
    completionPerThousand: 0.002,  // $2 per 1M
  },
};

function calculateCost(tokens: TokenCount, model: string): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) throw new Error(`Unknown model: ${model}`);
  
  const promptCost = (tokens.prompt / 1000) * pricing.promptPerThousand;
  const completionCost = (tokens.completion / 1000) * pricing.completionPerThousand;
  
  return promptCost + completionCost;
}
```

### FR2: Enforcement Actions

#### FR2.1: Threshold Levels

| Threshold | Action | Description |
|-----------|--------|-------------|
| 50% | Warn | Log warning, continue |
| 75% | Warn | Log warning, notify configured channels |
| 90% | Block | Pause agent, request approval to continue |
| 100% | Kill | Immediately terminate agent |
| 110% | Audit | Flag for compliance review |

#### FR2.2: Enforcement Actions

```typescript
type EnforcementAction = 'warn' | 'block' | 'kill' | 'audit';

interface ThresholdConfig {
  percentage: number;
  action: EnforcementAction;
  notify?: string[];  // Webhook URLs, email addresses
  coolDown?: number;  // Seconds before re-triggering
}

const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { percentage: 50, action: 'warn' },
  { percentage: 75, action: 'warn', notify: ['webhook:alerts'] },
  { percentage: 90, action: 'block', notify: ['webhook:alerts', 'email:admin'] },
  { percentage: 100, action: 'kill', notify: ['webhook:critical', 'email:admin'] },
  { percentage: 110, action: 'audit' },
];
```

#### FR2.3: Enforcement Flow

```
Agent Execution → Token Usage Tracking → Threshold Check → Enforcement Action

1. Agent makes API call
2. Track tokens used (prompt + completion)
3. Calculate cost
4. Check against budget thresholds
5. If threshold crossed:
   - 50-74%: Log warning, continue
   - 75-89%: Log warning, notify, continue
   - 90-99%: Block, request approval to continue
   - 100%+: Kill immediately, notify
6. Log all enforcement actions to audit
```

### FR3: CLI Commands

#### FR3.1: Budget Management

```bash
# Set task budget
dash budget set --task 100000 --cost 5.00 --agent my-agent

# Set project daily budget
dash budget set --daily 500000 --cost 100.00 --project myproject

# Set custom thresholds
dash budget set --threshold 80% block --threshold 100% kill

# View current budget status
dash budget status
dash budget status --agent my-agent
dash budget status --project myproject

# View budget usage
dash budget usage
dash budget usage --project myproject --period week
dash budget usage --agent my-agent --since "1h ago"
```

#### FR3.2: Budget Alerts

```bash
# Configure alerts
dash budget alert add --threshold 75% --webhook https://hooks.slack.com/xxx
dash budget alert add --threshold 90% --email admin@company.com
dash budget alert add --threshold 100% --sms +1234567890

# Test alert
dash budget alert test --threshold 90%

# List configured alerts
dash budget alert list

# Remove alert
dash budget alert remove --id alert_abc123
```

#### FR3.3: Budget History & Reporting

```bash
# View budget history
dash budget history --project myproject --since "30d ago"

# Generate cost report
dash budget report --project myproject --period month --format json

# Compare budgets across projects
dash budget compare --project project-a --project project-b --period week

# Export for finance
dash budget export --project myproject --since "1m" --format csv --output budget.csv
```

### FR4: Integration with Quality Gates

#### FR4.1: Cost-Aware Quality Gates

Quality gates can be configured to consider cost:

```typescript
const qualityGates: QualityGate[] = [
  {
    type: 'cost',
    required: true,
    config: {
      maxCost: 5.00,  // Maximum cost for this task
      maxTokens: 100000,
      failOnBudgetExceeded: true,
    }
  },
  {
    type: 'critique',
    required: true
  },
  {
    type: 'test',
    required: true
  }
];
```

#### FR4.2: Cost Optimization Suggestions

When costs exceed expected values, suggest optimizations:

```bash
$ dash agent run --agent my-agent
[COST] Warning: 75% of budget used (3.75/5.00)
[COST] Suggestions:
  - Reduce max tokens per response
  - Use cheaper model for non-critical operations
  - Enable context caching
```

### FR5: Audit Trail

#### FR5.1: Budget Events

| Event Type | Description | Recorded |
|------------|-------------|----------|
| budget_set | Budget configured | Always |
| budget_exceeded | Budget threshold crossed | Always |
| budget_killed | Agent killed for budget | Always |
| budget_warning | Warning threshold crossed | If configured |
| budget_alert | Alert notification sent | Always |

#### FR5.2: Audit Queries

```bash
# Query budget events
dash audit query --type budget --agent my-agent --since "7d ago"

# Query budget overruns
dash audit query --type budget --event budget_exceeded --since "30d ago"

# Export for compliance
dash audit query --type budget --since "90d" --format json --output budget_audit.json
```

---

## UX/CLI Design

### Interactive Budget Dashboard

```bash
$ dash budget dashboard
╔════════════════════════════════════════════════════════════════════╗
║                        BUDGET DASHBOARD                            ║
╠════════════════════════════════════════════════════════════════════╣
║ PROJECT: myproject                         Period: Today          ║
╠════════════════════════════════════════════════════════════════════╣
║ Budget: $100.00                                                    ║
║ Used:   $42.50 (42.5%)                                             ║
║ Remaining: $57.50                                                  ║
╠════════════════════════════════════════════════════════════════════╣
║ AGENTS                        COST    TOKENS    STATUS             ║
║ ────────────────────────────────────────────────────────────────  ║
║ api-agent                    $22.00   450K      Running (68%)      ║
║ frontend-agent               $15.50   320K      Running (45%)      ║
║ test-agent                   $5.00    100K      Completed (100%)   ║
║ ────────────────────────────────────────────────────────────────  ║
║ TOTAL                        $42.50   870K                        ║
╠════════════════════════════════════════════════════════════════════╣
║ ALERTS: 1 active                                                 ║
║ - api-agent at 75% threshold (15:23 UTC)                         ║
╚════════════════════════════════════════════════════════════════════╝
```

### Budget Configuration Editor

```bash
$ dash budget edit
Opening budget configuration in editor...
# Edit the YAML configuration and save
```

---

## Technical Constraints

### Performance

| Operation | Target Latency |
|-----------|----------------|
| Token tracking per API call | < 5ms |
| Cost calculation | < 1ms |
| Threshold check | < 1ms |
| Budget status query | < 50ms |

### Scalability

- Maximum tracked agents: 1000
- Maximum budget events per day: 1M
- Maximum configured alerts: 100 per project

### Integration Points

| Component | Integration Method |
|-----------|-------------------|
| Dash Agents | Direct function calls for token tracking |
| Dash Quality | Event-driven cost gates |
| Dash Audit | Log all budget events |
| External Alerts | Webhook, email, SMS |

---

## Edge Cases & Error Handling

### EC1: Model Pricing Unknown

**Scenario:** Agent uses model without configured pricing

**Handling:**
1. Log warning
2. Use fallback pricing (highest tier)
3. Alert administrator to configure pricing
4. Continue execution (with tracked estimate)

### EC2: Budget Config Invalid

**Scenario:** Budget configuration is malformed

**Handling:**
1. Reject configuration with error
2. Use fallback defaults
3. Log configuration error
4. Continue with defaults

### EC3: Agent Continues After Block

**Scenario:** Agent ignores budget block signal

**Handling:**
1. Force kill agent
2. Log security event
3. Alert administrator
4. Investigate agent implementation

### EC4: Budget Reset During Execution

**Scenario:** Daily reset occurs while agent is running

**Handling:**
1. Check if agent started before reset
2. If yes, count against previous period
3. If no, count against new period
4. Log reset event for clarity

---

## Trade-offs

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| Per-token tracking | Slight performance overhead | Required for accurate billing |
| Immediate kill at 100% | May interrupt valid operations | Prevents runaway costs |
| Fallback to highest pricing | May overcharge | Safer than undercharging |
| Separate thresholds per level | Configuration complexity | Allows granular control |

---

## Future Considerations

### FC1: Predictive Budgeting

Use historical data to predict budget needs and suggest limits.

### FC2: Context Caching Integration

Track context cache hits to reduce token counts and costs.

### FC3: Multi-Cloud Cost Aggregation

Aggregate costs across multiple LLM providers (OpenAI, Anthropic, etc.).

### FC4: Budget Anomaly Detection

Detect unusual spending patterns and flag for review.

---

## Open Questions

1. **Q:** Should budget tracking include internal Dash operations (not just LLM calls)?
   **A:** Yes, include all billable operations

2. **Q:** How to handle refunds/credits from providers?
   **A:** Manual adjustment via `dash budget adjust`

3. **Q:** Should budgets support carryover from unused allocation?
   **A:** Optional per configuration

4. **Q:** How to handle budget transfers between projects?
   **A:** Via `dash budget transfer` command with audit trail

---

## Implementation Plan

### Phase 1: Core Budget System
1. Define BudgetConfig and BudgetTracking schemas
2. Implement token usage tracking
3. Implement cost calculation
4. Create CLI commands for budget management

### Phase 2: Enforcement
1. Implement threshold checking
2. Create enforcement actions (warn, block, kill)
3. Add webhook/email notifications
4. Integrate with agent execution

### Phase 3: Integration & Reporting
1. Integrate with quality gates
2. Create dashboard and reporting
3. Add audit trail logging
4. Implement budget history

---

## Acceptance Criteria

- [ ] Token usage tracked per agent/task
- [ ] Cost calculated per operation
- [ ] Thresholds trigger appropriate actions
- [ ] Alerts sent at configured thresholds
- [ ] CLI commands work as specified
- [ ] Audit trail captures all budget events
- [ ] Integration with quality gates
- [ ] All tests pass
- [ ] Documentation complete

---

**Document Version:** 1.0  
**Created:** 2026-02-01  
**Next Review:** After implementation prototype

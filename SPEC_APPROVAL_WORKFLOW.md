# Dash Approval Workflow Specification

**Version:** 1.0  
**Date:** 2026-02-01  
**Phase:** Phase 4 - Safety Framework  
**Status:** Draft  
**Related Specs:** MISSION_CONTROL_SPEC_V3.md, DASH_PRD_V2.md

---

## Table of Contents

1. [Overview](#1-overview)
2. [Approval Types Taxonomy](#2-approval-types-taxonomy)
3. [Request/Response Flow](#3-requestresponse-flow)
4. [Timeout and Escalation Logic](#4-timeout-and-escalation-logic)
5. [CLI Command Design](#5-cli-command-design)
6. [Integration with Safety Framework](#6-integration-with-safety-framework)
7. [Audit Trail Specification](#7-audit-trail-specification)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

This specification defines the human-in-loop approval workflow system for Dash Phase 4, enabling safe execution of critical operations while maintaining operational velocity for routine tasks.

### 1.2 Key Requirements

| Requirement | Source |
|------------|--------|
| Human-in-loop for critical operations | Phase 4.4 |
| Budget enforcement (token/cost limits) | Phase 4.5 |
| Ethics boundaries (doNotHarm, preservePrivacy, noDeception) | DASH_PRD_V2.md |
| Dangerous action classification | DASH_PRD_V2.md |
| Human escalation path | DASH_PRD_V2.md |

### 1.3 Design Principles

- **Safety First**: Critical operations always require human approval
- **Non-Blocking by Default**: Standard operations should not block agent workflow
- **Audit Everything**: All approval decisions are recorded and retained
- **Configurable Granularity**: Allowlist patterns reduce approval fatigue
- **Emergency Override**: Break-glass procedures for urgent scenarios

---

## 2. Approval Types Taxonomy

### 2.1 Approval Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                    APPROVAL TYPE HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  CRITICAL   │    │  STANDARD   │    │   MINOR     │             │
│  │  (Manual)   │    │  (Hybrid)   │    │  (Auto)     │             │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ Human Only  │    │ Configurable│    │ Auto-       │             │
│  │ Block Agent │    │ Sync/Async  │    │ Approve     │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Operation Types and Required Approval

#### 2.2.1 File Write Operations

| Pattern | Approval Required | Risk Level | Timeout |
|---------|-------------------|------------|---------|
| `config/**/*` | Yes (Critical) | Medium | 5 min |
| `*.prod.*` | Yes (Critical) | High | 5 min |
| `src/**/*` | Yes (Standard) | Medium | 30 min |
| `tests/**/*` | Auto-approve | Low | N/A |
| `docs/**/*` | Auto-approve | Low | N/A |

**Configuration Example (`safety.yaml`):**
```yaml
fileWriteApproval:
  patterns:
    - pattern: "config/**/*"
      approvalType: "critical"
      timeout: "5m"
    - pattern: "*.prod.*"
      approvalType: "critical"
      timeout: "5m"
    - pattern: "src/**/*"
      approvalType: "standard"
      timeout: "30m"
    - pattern: "**/*.test.ts"
      approvalType: "auto"
```

#### 2.2.2 Delete Operations

| Operation | Approval Required | Risk Level | Timeout |
|-----------|-------------------|------------|---------|
| Recursive delete (`rm -rf`) | Yes (Critical) | Critical | 5 min |
| Git-tracked file delete | Yes (Standard) | High | 30 min |
| Non-tracked file delete | Auto-approve | Low | N/A |
| Directory delete | Yes (Standard) | High | 30 min |
| `.git` directory | Block (no override) | Critical | N/A |

#### 2.2.3 External API Calls

| Condition | Approval Required | Risk Level | Timeout |
|-----------|-------------------|------------|---------|
| Non-allowlisted domain | Yes (Critical) | Critical | 5 min |
| Allowlisted domain, GET | Auto-approve | Low | N/A |
| Allowlisted domain, POST/PUT/DELETE | Yes (Standard) | Medium | 30 min |
| Sensitive scopes (`write:admin`, `delete:*`) | Yes (Critical) | Critical | 5 min |
| Rate limit exceeded | Yes (Standard) | Medium | 30 min |

**Allowlist Configuration:**
```yaml
apiApproval:
  allowlist:
    - domain: "api.github.com"
      methods: ["GET", "POST"]
      scopes: ["repo", "user"]
    - domain: "*.openai.azure.com"
      methods: ["POST"]
      scopes: ["default"]
  sensitiveScopes:
    - "write:admin"
    - "delete:*"
    - "root:write"
```

#### 2.2.4 Budget Overruns

| Budget Type | Threshold | Approval Required | Timeout |
|-------------|-----------|-------------------|---------|
| Token limit per agent | 100K tokens | Warning only | N/A |
| Token limit per agent | 500K tokens | Yes (Standard) | 30 min |
| Cost per operation | >$1.00 | Warning only | N/A |
| Cost per operation | >$10.00 | Yes (Standard) | 30 min |
| Daily cost cap | >$100.00 | Yes (Critical) | 5 min |
| Weekly budget | >$500.00 | Yes (Critical) | 5 min |

**Budget Configuration:**
```yaml
budgetApproval:
  perAgent:
    tokens:
      warning: 100000
      approvalRequired: 500000
    cost:
      warning: 1.00
      approvalRequired: 10.00
  global:
    dailyLimit: 100.00
    weeklyLimit: 500.00
    monthlyLimit: 2000.00
```

### 2.3 Approval Priority Matrix

| Operation | Approver Required | Auto-Escalate | Emergency Override |
|-----------|-------------------|---------------|-------------------|
| Agent termination | Human only | After 5 min timeout | No |
| Data destruction | Human only | After 5 min timeout | No |
| Config change | Human or agent parent | After 30 min timeout | Yes |
| External API (non-allowlist) | Human only | After 5 min timeout | Yes |
| Budget overrun (daily) | Human only | After 5 min timeout | Yes |
| Standard file write | Human or webhook | After 30 min timeout | Yes |
| Auto-approved operations | None | N/A | N/A |

---

## 3. Request/Response Flow

### 3.1 Synchronous Flow (Critical Operations)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Agent   │────▶│ Safety   │────▶│ Approval │────▶│  Human   │────▶│ Execute  │
│          │     │  Check   │     │  Queue   │     │ Approver │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                 │                 │               │
     │  Request       │                 │                 │               │
     │  Write         │                 │                 │               │
     │                │                 │                 │               │
     │                ▼                 │                 │               │
     │         ┌──────────┐            │                 │               │
     │         │ Critical?│───────────▶│                 │               │
     │         └──────────┘            │                 │               │
     │              │                  │                 │               │
     │              ▼                  │                 │               │
     │         ┌──────────┐            │                 │               │
     │         │ Block &  │            │                 │               │
     │         │ Wait     │◀───────────│   Request       │               │
     │         └──────────┘            │   Pending       │               │
     │              │                  │                 │               │
     │              │                  │                 │               │
     │              │    ┌─────────────┴─────────────┐   │               │
     │              │    │                           │   │               │
     │              │    │   Human Reviews Request   │   │               │
     │              │    │   - Operation details     │   │               │
     │              │    │   - Risk level            │   │               │
     │              │    │   - Impact analysis       │   │               │
     │              │    │                           │   │               │
     │              │    └─────────────┬─────────────┘   │               │
     │              │                  │                 │               │
     │              │                  │  Approve/Deny   │               │
     │              │                  │  with reason    │               │
     │              │                  │                 │               │
     │              ▼                  ▼                 ▼               │
     │         ┌──────────┐       ┌──────────┐     ┌──────────┐          │
     │         │ Resume   │◀──────│ Decision │◀────│  Human   │          │
     │         │ or Fail  │       │ Handler  │     │ Response │          │
     │         └──────────┘       └──────────┘     └──────────┘          │
     │              │                                                       │
     │              ▼                                                       │
     │         ┌──────────┐                                                │
     │         │ Execute  │◀───────────────────────────────────────────────┘
     │         │ or Abort │
     │         └──────────┘
```

### 3.2 Asynchronous Flow (Standard Operations)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Agent   │────▶│ Safety   │────▶│ Approval │────▶│ Continue │
│          │     │  Check   │     │  Queue   │     │ (Non-    │
└──────────┘     └──────────┘     └──────────┘     │  Block)  │
     │                │                 │               │
     │  Request       │                 │               │
     │  Write         │                 │               │
     │                │                 │               │
     │                ▼                 │               │
     │         ┌──────────┐            │               │
     │         │ Standard?│───────────▶│               │
     │         └──────────┘            │               │
     │              │                  │               │
     │              ▼                  │               │
     │         ┌──────────┐            │               │
     │         │ Queue &  │            │               │
     │         │ Continue │            │               │
     │         └──────────┘            │               │
     │              │                  │               │
     │              │                  │               │
     │              │    ┌─────────────┴─────────────┐  │
     │              │    │                           │  │
     │              │    │  Parallel:                │  │
     │              │    │  - Store in queue         │  │
     │              │    │  - Send webhook/Slack     │  │
     │              │    │  - Log audit trail        │  │
     │              │    │  - Update dashboard       │  │
     │              │    │                           │  │
     │              │    └─────────────┬─────────────┘  │
     │              │                  │                │
     │              ▼                  ▼                │
     │         ┌──────────┐       ┌──────────┐          │
     │         │ Execute  │       │ Pending  │          │
     │         │ Other    │       │ Queue    │          │
     │         │ Tasks    │       │ (Awaiting│          │
     │         └──────────┘       │ Review)  │          │
     │                             └──────────┘          │
     │                                   │               │
     │                                   │ Approve/Deny  │
     │                                   │               │
     │                                   ▼               │
     │                             ┌──────────┐          │
     │                             │ Execute  │          │
     │                             │ Delayed  │          │
     │                             │ Op       │          │
     │                             └──────────┘          │
```

### 3.3 Request Data Model

```typescript
interface ApprovalRequest {
  // Identity
  id: string;
  requestId: string;
  createdAt: Date;
  expiresAt?: Date;
  
  // Requester
  requestingAgent: {
    agentId: string;
    agentLabel?: string;
    swarmId?: string;
    parentAgentId?: string;
  };
  
  // Operation Details
  operation: {
    type: 'file_write' | 'file_delete' | 'api_call' | 'budget_overrun' | 'agent_termination';
    target: string;           // File path, API endpoint, etc.
    details: Record<string, any>;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    estimatedImpact?: string;
  };
  
  // Classification
  approvalType: 'critical' | 'standard' | 'auto';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Context
  task?: {
    taskId: string;
    taskTitle: string;
  };
  context?: {
    previousOperations?: string[];
    relatedRequests?: string[];
    userConfig?: string;
  };
  
  // State
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'escalated';
  decision?: ApprovalDecision;
}

interface ApprovalDecision {
  decision: 'approve' | 'deny' | 'escalate';
  decidedAt: Date;
  approver: ApproverIdentity;
  justification?: string;
  notes?: string;
}

interface ApproverIdentity {
  type: 'human' | 'agent' | 'webhook' | 'system';
  identity: string;        // User ID, agent ID, webhook URL
  sessionId?: string;
  ipAddress?: string;
}
```

### 3.4 Response Data Model

```typescript
interface ApprovalResponse {
  requestId: string;
  decision: 'approve' | 'deny' | 'escalate';
  approver: ApproverIdentity;
  justification: string;
  notes?: string;
  respondedAt: Date;
  effectiveAt: Date;
  expiresAt?: Date;
}

interface BatchApprovalRequest {
  filter: {
    agentId?: string;
    operationType?: string;
    riskLevel?: string;
    status?: 'pending';
    pattern?: string;  // File path pattern
  };
  count?: number;  // Max to approve, default all matching
}

interface BatchApprovalResponse {
  approved: string[];   // Request IDs approved
  denied: string[];     // Request IDs denied
  skipped: string[];    // Request IDs skipped (didn't match)
  errors: Array<{
    requestId: string;
    error: string;
  }>;
}
```

---

## 4. Timeout and Escalation Logic

### 4.1 Default Timeout Values

| Approval Type | Default Timeout | Max Escalations | Final Action |
|---------------|-----------------|-----------------|--------------|
| Critical | 5 minutes | 3 | Block operation |
| Standard | 30 minutes | 2 | Block operation |
| Urgent | 2 minutes | 2 | Block operation |

### 4.2 Timeout Configuration

```yaml
timeouts:
  critical:
    default: "5m"
    maxDuration: "30m"
    escalationCount: 3
  standard:
    default: "30m"
    maxDuration: "2h"
    escalationCount: 2
  urgent:
    default: "2m"
    maxDuration: "15m"
    escalationCount: 2

escalation:
  enabled: true
  notifyOriginalApprover: true
  alternateApprovers:
    - type: "human"
      priority: 1
    - type: "webhook"
      priority: 2
    - type: "agent"
      role: "supervisor"
```

### 4.3 Escalation Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Request  │────▶│  Wait    │────▶│ Timeout? │────▶│ Escalate │
│ Created  │     │          │     │          │     │ to Next  │
└──────────┘     └──────────┘     └──────────┘     │ Approver │
     │                                   │         └──────────┘
     │                                   │              │
     │                                   │              ▼
     │                                   │         ┌──────────┐
     │                                   │         │ Max      │
     │                                   │         │ Esclation│
     │                                   │         │ Reached? │
     │                                   │         └──────────┘
     │                                   │              │
     │                                   │     Yes     │ No
     │                                   │              ▼
     │                                   │         ┌──────────┐
     │                                   │         │ Notify   │
     │                                   │         │ New      │
     │                                   │         │ Approver │
     │                                   │         └──────────┘
     │                                   │              │
     │                                   │              ▼
     │                                   │         ┌──────────┐
     │                                   │         │ New      │
     │                                   │         │ Timeout  │
     │                                   │         │ Window   │
     │                                   │         └──────────┘
     │                                   │              │
     │                                   │              ▼
     │                                   │     ┌───────────────┐
     │                                   │     │ Repeat Wait   │
     │                                   │     │ Loop           │
     │                                   │     └───────────────┘
     │                                   │
     No ◀─────────────────────────────────┘
     │
     ▼
┌──────────┐
│ Complete │◀──────────────────────────────────────────────────┐
│ or Fail  │                                                   │
└──────────┘                                                   │
     │                                                         │
     │  If Approved:                                           │
     │  - Execute operation                                    │
     │  - Log success                                          │
     │  - Update metrics                                       │
     │                                                         │
     │  If Denied:                                             │
     │  - Log denial with reason                               │
     │  - Notify requesting agent                              │
     │  - Offer alternative approach                           │
     │                                                         │
     │  If Expired (max escalations):                          │
     │  - Auto-deny with "timeout" reason                      │
     │  - Notify all stakeholders                              │
     │  - Log as security event (if critical)                  │
     └─────────────────────────────────────────────────────────┘
```

### 4.4 Emergency Override Procedure

Emergency overrides are available for critical operations when standard approval would cause unacceptable delays.

**Activation Conditions:**
1. Operation is time-critical (e.g., production security patch)
2. All standard approvers are unavailable
3. Override is justified with written explanation
4. Override is logged with enhanced audit trail

**Override Workflow:**
```yaml
emergencyOverride:
  enabled: true
  requireJustification: true
  notifyAfterExecution:
    - security_team@company.com
    - manager@company.com
  cooldownPeriod: "1h"  # Min time between overrides
  maxOverridesPerDay: 3
  auditEnhancement: true  # Additional logging for overrides
```

**Emergency Override CLI:**
```bash
dash approval emergency-override <request-id> \
  --reason "Production security vulnerability CVE-2026-1234" \
  --justification "Standard approvers unavailable, risk of exploit within 2 hours" \
  --notify "security@company.com"
```

---

## 5. CLI Command Design

### 5.1 Approval Management Commands

```bash
# List pending approval requests
dash approval list [--status pending|approved|denied|all] \
  [--agent <agent-id>] \
  [--type file_write|file_delete|api_call|budget] \
  [--risk high|critical] \
  [--format table|json] \
  [--limit <n>]

# Show details of a specific request
dash approval show <request-id> \
  [--include-context] \
  [--include-history]

# Approve a request
dash approval approve <request-id> \
  [--notes "Reason for approval"] \
  [--valid-for <duration>]  # Optional: auto-expire approval

# Deny a request
dash approval deny <request-id> \
  --reason <reason> \
  [--suggest-alternative "Use config/test.env instead"]

# Batch operations
dash approval approve --agent <agent-id> \
  [--type file_write] \
  [--pattern "src/**/*"] \
  [--dry-run]

dash approval deny --older-than <duration> \
  --reason "Stale request, no longer needed"

# Escalate a request
dash approval escalate <request-id> \
  --to <approver-identity> \
  --reason <reason>

# Emergency override
dash approval emergency-override <request-id> \
  --reason <critical-reason> \
  --justification <detailed-justification> \
  [--force]  # Skip confirmation if reason is provided

# View approval history
dash approval history [--agent <agent-id>] \
  [--from <date>] \
  [--to <date>] \
  [--format table|json]

# Statistics and metrics
dash approval stats [--agent <agent-id>] \
  [--period day|week|month] \
  [--include-risk-breakdown]

# Configuration
dash approval config show
dash approval config set default-timeout.critical "5m"
dash approval config add-allowlist domain "api.example.com"
```

### 5.2 Example CLI Output

#### `dash approval list --status pending`

```
PENDING APPROVAL REQUESTS
═══════════════════════════════════════════════════════════════════════

ID            TYPE         TARGET              RISK    AGE     AGENT
───────────────────────────────────────────────────────────────────────
apr-001       file_write   config/prod.yaml    HIGH    2m      agent-123
apr-002       api_call     https://api.new...  CRIT    5m      agent-456
apr-003       budget       $45.00 > $10.00     HIGH    12m     agent-789

3 pending requests (2 critical, 1 high)
Last updated: 2026-02-01 22:30:00 CST
```

#### `dash approval show apr-001`

```
APPROVAL REQUEST: apr-001
═══════════════════════════════════════════════════════════════════════

Status:      PENDING
Created:     2026-02-01 22:28:00 CST
Expires:     2026-02-01 22:33:00 CST (5m timeout)
Risk Level:  HIGH

REQUESTING AGENT
───────────────────────────────────────────────────────────────────────
Agent ID:    agent-123
Label:       file-cleanup-worker
Swarm:       swarm-abc123
Parent:      orchestrator-main

OPERATION DETAILS
───────────────────────────────────────────────────────────────────────
Type:        file_write
Target:      config/prod.yaml
Operation:   Modify production configuration

PROPOSED CHANGES
───────────────────────────────────────────────────────────────────────
- database.host: "prod.db.example.com" → "10.0.0.5"
- database.ssl: false → true
- logLevel: "debug" → "info"

IMPACT ANALYSIS
───────────────────────────────────────────────────────────────────────
- Affects: Production database connection
- Risk: Misconfiguration could cause service outage
- Mitigation: Changes are incremental and reversible

CONTEXT
───────────────────────────────────────────────────────────────────────
Task:        task-998 - Production hardening
Previous:    5 successful config changes this session
User Config: default approval for config/* pattern

═══════════════════════════════════════════════════════════════════════
ACTIONS: [approve] [deny] [escalate] [view-changes]
```

### 5.3 Interactive Approval Mode

```bash
# Enable interactive approval mode (blocks agent until approval)
dash agents spawn <task> --require-approval critical

# Or set in config
dash config set approval.mode.interactive true
dash config set approval.timeout.critical "5m"
```

### 5.4 Webhook Configuration

```bash
# Register webhook for approval notifications
dash approval webhook register https://hooks.slack.com/services/xxx/yyy/zzz \
  --events approved,denied,pending

# Test webhook
dash approval webhook test <webhook-id>

# List webhooks
dash approval webhook list

# Delete webhook
dash approval webhook delete <webhook-id>
```

---

## 6. Integration with Safety Framework

### 6.1 Safety Boundary Types (from DASH_PRD_V2.md)

```typescript
interface SafetyConfig {
  // Ethics boundaries (uncrossable)
  ethicsBoundaries: {
    doNotHarm: boolean;
    preservePrivacy: boolean;
    noDeception: boolean;
    authorizedAccessOnly: boolean;
  };
  
  // Dangerous action classification
  dangerousActions: {
    dataDestruction: 'block' | 'confirm' | 'allow';
    agentTermination: 'confirm' | 'allow';
    externalPublishing: 'confirm' | 'block';
    resourceExhaustion: 'block' | 'confirm';
  };
  
  // Human escalation triggers
  escalationTriggers: {
    ethicsViolation: 'immediate';
    costExceeded: 'threshold';
    recursiveModification: 'approval';
    persistentFailure: 'threshold';
    securityBreach: 'immediate';
  };
}
```

### 6.2 Approval Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SAFETY FRAMEWORK INTEGRATION                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    SAFETY CHECK POINTS                      │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  1. ETHICS CHECK (Pre-Operation)                           │   │
│  │     - Check doNotHarm, preservePrivacy, noDeception        │   │
│  │     - Block immediately if violated                         │   │
│  │                                                             │   │
│  │  2. BOUNDARY CHECK (Pre-Operation)                         │   │
│  │     - Classify operation by dangerousActions config        │   │
│  │     - Route to appropriate approval path                   │   │
│  │                                                             │   │
│  │  3. APPROVAL CHECK (Human-in-Loop)                         │   │
│  │     - If confirm: require approval before proceeding       │   │
│  │     - If block: require approval with escalation           │   │
│  │     - If allow: proceed without approval                   │   │
│  │                                                             │   │
│  │  4. BUDGET CHECK (Pre-Operation)                           │   │
│  │     - Verify tokens, costs against limits                  │   │
│  │     - Request approval if threshold exceeded               │   │
│  │                                                             │   │
│  │  5. ESCALATION CHECK (On Trigger)                          │   │
│  │     - Monitor escalationTriggers                           │   │
│  │     - Immediate escalation for ethics/security             │   │
│  │     - Threshold-based for cost/failure                     │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 QUALITY GATE INTEGRATION                    │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  ┌─────────┐     ┌─────────┐     ┌─────────┐               │   │
│  │  │Approval │────▶│ Critique│────▶│  Test   │               │   │
│  │  │  Gate   │     │  Gate   │     │  Gate   │               │   │
│  │  └─────────┘     └─────────┘     └─────────┘               │   │
│  │       │               │               │                     │   │
│  │       ▼               ▼               ▼                     │   │
│  │  Human review    AI analysis      Automated                 │   │
│  │  of operation    of code          testing                  │   │
│  │                                                             │   │
│  │  ORDER: Approval → Critique → Test                         │   │
│  │  (Must approve before critique, must pass critique)         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Quality Gate Integration

```typescript
interface ApprovalQualityGate {
  type: 'approval';
  approvalType: 'critical' | 'standard';
  autoContinueOnTimeout: boolean;  // If true, fail gate on timeout
  approvers: {
    primary: ApproverConfig;
    fallback?: ApproverConfig[];
  };
}

interface QualityGatePipeline {
  gates: [
    { type: 'approval'; mustPass: true },
    { type: 'critique'; threshold: 0.8 },
    { type: 'test'; threshold: 1.0 }
  ];
}
```

**Configuration:**
```yaml
qualityGates:
  - type: approval
    approvalType: critical
    approvers:
      - type: human
        required: true
    autoContinueOnTimeout: false

  - type: critique
    dimensions:
      correctness: 0.8
      security: 0.9
    maxIterations: 2

  - type: test
    coverage:
      statements: 0.8
      branches: 0.7
```

### 6.4 Event System Integration

All approval events integrate with the Dash event system:

```typescript
type ApprovalEventType =
  | 'approval.requested'
  | 'approval.pending'
  | 'approval.approved'
  | 'approval.denied'
  | 'approval.expired'
  | 'approval.escalated'
  | 'approval.emergency_override';

interface ApprovalEvent {
  type: ApprovalEventType;
  requestId: string;
  timestamp: Date;
  requestingAgent: string;
  operationType: string;
  riskLevel: string;
  approver?: ApproverIdentity;
  decision?: string;
}
```

### 6.5 Context Manager Integration

When an approval request is created, the requesting agent's context is snapshotted:

```typescript
interface ApprovalContextSnapshot {
  requestId: string;
  agentContext: {
    inputContext: string[];
    outputContext: string[];
    sharedContext: string[];
  };
  reasoningTrace?: {
    hypothesis: string;
    alternatives: string[];
  };
  fileTree?: FileNode;
  dependencies?: DependencyGraph;
}
```

---

## 7. Audit Trail Specification

### 7.1 Audit Log Schema

```typescript
interface ApprovalAuditLog {
  // Request Identification
  id: string;
  requestId: string;
  
  // Timestamps
  createdAt: Date;           // When request was created
  respondedAt?: Date;        // When decision was made
  completedAt?: Date;        // When operation executed (if approved)
  
  // Requester Information
  requestingAgent: {
    agentId: string;
    agentLabel?: string;
    swarmId?: string;
    parentAgentId?: string;
    model: string;
  };
  
  // Operation Details
  operation: {
    type: string;            // file_write, file_delete, api_call, budget
    target: string;          // File path, API endpoint, etc.
    details: Record<string, any>;
    estimatedCost?: number;
    estimatedTokens?: number;
  };
  
  // Risk Classification
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    classificationReason: string;
    affectedSystems?: string[];
  };
  
  // Approver Information
  approver?: {
    type: 'human' | 'agent' | 'webhook' | 'system';
    identity: string;        // User ID, agent ID, webhook URL
    displayName?: string;
    sessionId?: string;
    ipAddress?: string;
  };
  
  // Decision
  decision?: {
    action: 'approve' | 'deny' | 'escalate' | 'expire' | 'emergency_override';
    justification: string;
    notes?: string;
    alternativeSuggestion?: string;
  };
  
  // Escalation History
  escalationHistory?: Array<{
    fromApprover: ApproverIdentity;
    toApprover: ApproverIdentity;
    reason: string;
    timestamp: Date;
  }>;
  
  // Execution Details (if approved)
  execution?: {
    executedAt: Date;
    success: boolean;
    actualCost?: number;
    actualTokens?: number;
    error?: string;
  };
  
  // Metadata
  metadata: {
    taskId?: string;
    taskTitle?: string;
    userConfig?: string;
    sessionId: string;
    correlationId?: string;
  };
}
```

### 7.2 Audit Log Storage

```yaml
auditStorage:
  backend: "file" | "database" | "remote"
  retention:
    standard: "90d"
    critical: "1y"
    emergencyOverride: "7y"
  encryption: true
  compression: true
  archive:
    enabled: true
    threshold: "1y"
    storage: "s3://dash-audit-archive"
```

### 7.3 Audit Log Commands

```bash
# View audit logs
dash audit approval --request-id <id>
dash audit approval --agent <agent-id>
dash audit approval --from <date> --to <date>
dash audit approval --risk critical

# Export audit logs
dash audit export --start 2026-01-01 --end 2026-01-31 --format jsonl

# Audit summary
dash audit summary --period week --include-risk-breakdown

# Compliance report
dash audit compliance --standard SOC2 --year 2026
```

### 7.4 Sample Audit Log Entry

```json
{
  "id": "audit-001",
  "requestId": "apr-001",
  "createdAt": "2026-02-01T22:28:00Z",
  "respondedAt": "2026-02-01T22:30:15Z",
  "completedAt": "2026-02-01T22:30:20Z",
  "requestingAgent": {
    "agentId": "agent-123",
    "agentLabel": "file-cleanup-worker",
    "swarmId": "swarm-abc123",
    "parentAgentId": "orchestrator-main",
    "model": "moonshot/kimi-k2-5"
  },
  "operation": {
    "type": "file_write",
    "target": "config/prod.yaml",
    "details": {
      "changes": [
        { "field": "database.host", "old": "prod.db.example.com", "new": "10.0.0.5" },
        { "field": "database.ssl", "old": false, "new": true }
      ]
    },
    "estimatedCost": 0.05
  },
  "risk": {
    "level": "high",
    "classificationReason": "Production configuration change",
    "affectedSystems": ["production-database", "api-gateway"]
  },
  "approver": {
    "type": "human",
    "identity": "user:jason@company.com",
    "displayName": "Jason",
    "sessionId": "sess-abc123",
    "ipAddress": "192.168.1.100"
  },
  "decision": {
    "action": "approve",
    "justification": "Verified changes match security hardening requirements",
    "notes": "SSL enablement is critical for compliance"
  },
  "execution": {
    "executedAt": "2026-02-01T22:30:20Z",
    "success": true,
    "actualCost": 0.03
  },
  "metadata": {
    "taskId": "task-998",
    "taskTitle": "Production hardening",
    "sessionId": "sess-abc123"
  }
}
```

### 7.5 Compliance Requirements

| Requirement | Implementation |
|-------------|----------------|
| **SOC 2 CC6.1** | All external API calls require approval |
| **SOC 2 CC6.6** | Logical access controls for approval system |
| **SOC 2 CC7.2** | System monitoring for approval anomalies |
| **GDPR Art. 32** | Audit logging for data access operations |
| **PCI-DSS Req. 7** | Access control for approval decisions |

---

##
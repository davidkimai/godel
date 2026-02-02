# SPEC: Claude Code Bidirectional Sync for Dash

**Version:** 1.0
**Date:** 2026-02-01
**Status:** Draft
**Priority:** P1 (High)

---

## Executive Summary

This specification defines the bidirectional synchronization protocol between Dash (agent orchestration platform) and Claude Code CLI. The goal is to evolve from the current one-way logging integration (`scripts/dash-claude-code.sh`) to a full bidirectional sync where:

- **Dash → Claude Code**: Task definitions, quality gates, context, and reasoning requirements flow into Claude Code sessions
- **Claude Code → Dash**: Reasoning traces, quality results, session outcomes, and success metrics flow back to Dash
- **Bidirectional Reasoning**: Reasoning traces flow both ways, enabling unified observability
- **Quality Gate Sharing**: Status and confidence scores share between systems in real-time

**Current State:** One-way integration that logs Claude Code output to JSON files
**Target State:** Full bidirectional sync with real-time context exchange and quality enforcement

---

## 1. Data Flow Specification

### 1.1 Dash → Claude Code Context Flow

| Context Type | Format | Trigger | Description |
|--------------|--------|---------|-------------|
| **Task Definition** | JSON | Session start | Task description, success criteria, constraints |
| **Quality Gates** | JSON | Session start | Linting, testing, security, type-checking requirements |
| **Reasoning Requirements** | JSON | Session start | Trace format, confidence thresholds, evidence requirements |
| **Shared Context** | MD/JSON | On change | File tree, dependencies, symbol index |
| **Safety Boundaries** | JSON | Session start | Ethics boundaries, dangerous action rules |
| **Budget Limits** | JSON | Session start | Token limits, cost caps per session |

**Example Task Definition:**
```json
{
  "taskId": "task-123",
  "title": "Implement user authentication",
  "description": "Add JWT-based auth to API",
  "successCriteria": ["tests pass", "quality gate score > 0.9", "security scan clean"],
  "qualityGates": {
    "lint": { "threshold": "pass" },
    "types": { "threshold": "pass" },
    "tests": { "coverage": 0.80, "passRate": 1.0 },
    "security": { "threshold": "pass", "cweBlocklist": ["CWE-89", "CWE-79"] }
  },
  "reasoningRequirements": {
    "traceOnDecision": true,
    "minConfidence": 0.7,
    "evidenceRequired": true
  },
  "safetyBoundaries": {
    "doNotHarm": true,
    "preservePrivacy": true,
    "authorizedAccessOnly": true
  },
  "budget": {
    "maxTokens": 50000,
    "maxCostUSD": 5.00
  }
}
```

### 1.2 Claude Code → Dash Context Flow

| Context Type | Format | Trigger | Description |
|--------------|--------|---------|-------------|
| **Reasoning Traces** | JSON | Real-time | Hypothesis, analysis, decisions, corrections |
| **Quality Results** | JSON | On completion | Lint results, test coverage, security scan output |
| **Session Outcome** | JSON | Session end | Success/failure, final state, artifacts created |
| **Code Changes** | Git diff | Session end | Files modified, additions, deletions |
| **Confidence Scores** | JSON | Real-time | Per-decision confidence, evidence alignment |
| **Error Logs** | JSON | On error | Error type, stack trace, recovery attempts |

**Example Reasoning Trace:**
```json
{
  "traceId": "trace-456",
  "agentId": "claude-session-789",
  "timestamp": "2026-02-01T22:30:00Z",
  "type": "decision",
  "content": "Using JWT for authentication instead of session-based auth",
  "alternatives": ["Session cookies", "OAuth 2.0", "API keys"],
  "evaluation": "JWT provides stateless verification, better scalability, and works well with mobile clients",
  "confidence": 0.85,
  "evidence": ["src/auth/jwt.ts", "tests/auth/jwt.test.ts"],
  "parentTraceId": "trace-455"
}
```

### 1.3 Bidirectional Reasoning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Reasoning Sync Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   DASH                              CLAUDE CODE                │
│     │                                   │                      │
│     │  1. Task Definition + Gates       │                      │
│     │ ──────────────────────────────────>                      │
│     │                                   │                      │
│     │                         ┌─────────▼─────────┐            │
│     │                         │  Claude Code      │            │
│     │                         │  Reasoning        │            │
│     │                         │  • Hypothesis     │            │
│     │                         │  • Analysis       │            │
│     │                         │  • Decisions      │            │
│     │                         │  • Corrections    │            │
│     │                         └─────────┬─────────┘            │
│     │                                   │                      │
│     │  2. Reasoning Traces              │                      │
│     │ <─────────────────────────────────                       │
│     │                                   │                      │
│     │  3. Quality Gate Status           │                      │
│     │ <─────────────────────────────────                       │
│     │                                   │                      │
│     │  4. Success/Failure + Context     │                      │
│     │ <─────────────────────────────────                       │
│     │                                   │                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Sync Trigger & Frequency

### 2.1 Automatic Triggers

| Event | Direction | Latency | Blocking |
|-------|-----------|---------|----------|
| Session Start | Dash → Claude Code | Immediate | Blocking |
| Reasoning Trace Created | Claude Code → Dash | <1 second | Non-blocking |
| Quality Gate Update | Claude Code → Dash | Immediate | Non-blocking |
| Confidence Change | Claude Code → Dash | <1 second | Non-blocking |
| Session End | Claude Code → Dash | Immediate | Blocking |
| Error Occurred | Claude Code → Dash | Immediate | Non-blocking |

### 2.2 Manual Triggers (CLI Commands)

```bash
# Import context FROM Claude Code INTO Dash
dash sync --from-claude                    # Sync all pending context
dash sync --from-claude --session <id>     # Sync specific session
dash sync --from-claude --type reasoning   # Sync only reasoning traces
dash sync --from-claude --type quality     # Sync only quality results
dash sync --from-claude --force            # Force full resync

# Export context FROM Dash TO Claude Code
dash push --to-claude                      # Push pending context
dash push --to-claude --session <id>       # Push to specific session
dash push --to-claude --task <id>          # Push task context
dash push --to-claude --gates              # Push quality gate config
dash push --to-claude --safety             # Push safety boundaries

# Bi-directional sync
dash sync bidirection --session <id>       # Full sync both directions
dash sync status                           # Show sync queue status
dash sync resolve --conflict <id>          # Resolve conflict manually
```

### 2.3 Sync Frequency

| Data Type | Frequency | Batch Window | Priority |
|-----------|-----------|--------------|----------|
| Reasoning Traces | Real-time | N/A (individual) | High |
| Quality Results | On completion | N/A | High |
| Session State | Event-driven | N/A | High |
| Full Context | On demand or session start/end | N/A | Low |

---

## 3. Context Format Specification

### 3.1 JSON Schema for Structured Data

**Reasoning Trace Schema:**
```typescript
interface ReasoningTrace {
  id: string;
  agentId: string;
  sessionId: string;
  taskId: string;
  timestamp: string; // ISO 8601
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction';
  content: string;
  alternatives?: string[];
  evaluation?: string;
  confidence: number; // 0.0 - 1.0
  evidence: string[]; // File paths
  parentTraceId?: string;
  childTraceIds: string[];
  metadata?: {
    tokensUsed?: number;
    model?: string;
    duration?: number; // ms
  };
}

interface DecisionLog {
  id: string;
  agentId: string;
  sessionId: string;
  timestamp: string;
  decision: string;
  alternatives: string[];
  criteria: string[];
  evaluation: string;
  outcome?: string; // Filled after execution
  confidence: number;
}

interface ConfidenceTracking {
  traceId: string;
  confidenceOverTime: { timestamp: string; confidence: number }[];
  evidenceCount: number;
  lastEvidenceUpdate: string;
  warningThreshold: number; // e.g., 0.7
}
```

**Quality Result Schema:**
```typescript
interface QualityResult {
  sessionId: string;
  taskId: string;
  timestamp: string;
  dimensions: {
    correctness: { score: number; details: string };
    test_coverage: { score: number; percentage: number };
    security: { score: number; vulnerabilities: string[] };
    types: { score: number; errors: number };
    style: { score: number; issues: number };
  };
  overallScore: number;
  passingThreshold: number;
  passed: boolean;
  gateType: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
}

interface QualityGateConfig {
  type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
  criteria: {
    dimension: string;
    weight: number;
    threshold: number;
  }[];
  passingThreshold: number;
  maxIterations: number;
  autoRetry: boolean;
}
```

### 3.2 Markdown Format for Human-Readable

```markdown
# Claude Code Session Report

## Session Info
- **Session ID:** session-789
- **Agent:** Claude Code CLI
- **Task:** Implement user authentication
- **Duration:** 4m 32s
- **Status:** ✅ Success

## Reasoning Summary
The session made 3 key decisions:
1. **JWT over sessions** (confidence: 0.85) - Stateless, scalable
2. **RS256 signing** (confidence: 0.92) - Better security than HS256
3. **Token refresh flow** (confidence: 0.78) - Balances security UX

## Quality Metrics
| Dimension | Score | Threshold | Status |
|-----------|-------|-----------|--------|
| Correctness | 0.95 | 0.90 | ✅ Pass |
| Test Coverage | 0.87 | 0.85 | ✅ Pass |
| Security | 1.00 | 0.95 | ✅ Pass |
| Types | 0.98 | 0.95 | ✅ Pass |
| Style | 0.91 | 0.80 | ✅ Pass |

**Overall: 0.94/1.00 ✅ PASS**

## Files Changed
- `src/auth/jwt.ts` (新增: 142 lines)
- `src/auth/middleware.ts` (修改: 23 行)
- `tests/auth/jwt.test.ts` (新增: 89 行)

## Next Steps
- Integrate with existing user database
- Add rate limiting for auth endpoints
```

### 3.3 Hybrid Approach

| Data Type | Format | Rationale |
|-----------|--------|-----------|
| Reasoning traces | JSON | Structured, queryable, supports hierarchy |
| Quality results | JSON | Metrics, scores, thresholds |
| Session reports | Markdown | Human-readable summaries |
| Code changes | Git diff | Standard format, mergeable |
| Safety violations | JSON + Markdown | Audit trail + human notification |

---

## 4. Conflict Resolution Strategy

### 4.1 Conflict Types

| Conflict Type | Example | Resolution Strategy |
|---------------|---------|---------------------|
| **Quality Score Conflict** | Claude Code reports 0.95, Dash expects 0.90 | Merge with confidence weighting |
| **Status Conflict** | Claude Code: success, Dash: pending_review | Last-write-wins with audit trail |
| **Reasoning Trace Conflict** | Same trace ID with different content | Immutable append (never modify) |
| **Context Conflict** | Both systems modify shared context | Context version tracking |
| **Safety Boundary Conflict** | Claude Code attempts, Dash blocks | Dash wins (safety first) |

### 4.2 Resolution Rules

**Rule 1: Safety Boundaries (Hard Override)**
```
IF Claude Code attempts action that violates Dash safety boundary
THEN Block action immediately
AND Log violation to audit trail
AND Notify human if escalation threshold met
```

**Rule 2: Reasoning Traces (Append-Only)**
```
Reasoning traces are IMMUTABLE after creation
- Cannot be modified or deleted
- Corrections must be new traces with parent reference
- Conflicts resolved by accepting both versions (divergent reasoning)
```

**Rule 3: Quality Scores (Confidence-Weighted Merge)**
```
IF Claude Code Quality != Dash Quality
THEN Calculate: Final = (ClaudeScore * ClaudeConfidence + DashScore * DashConfidence) / 2
IF Final >= Threshold THEN Pass ELSE Fail
```

**Rule 4: Task Status (Priority-Based)**
```
Priority Order: Human > Claude Code > Dash Auto
- Human approval overrides all
- Claude Code success/fail overrides Dash pending
- Dash pending is default state
```

**Rule 5: Context Conflicts (Versioned Merge)**
```
- Each context version has monotonically increasing version number
- On conflict: Accept higher version number
- Log conflict for manual review if version difference < 2
```

### 4.3 Conflict Detection & Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Conflict Resolution Flow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Incoming sync request                                      │
│                    │                                           │
│                    ▼                                           │
│  2. Check for conflicts with existing data                     │
│         ┌─────────────────┐                                    │
│         │ No Conflict?    │───→ Accept and store               │
│         └────────┬────────┘                                    │
│                  │ No                                           │
│                  ▼                                             │
│         ┌─────────────────┐                                    │
│         │ Conflict Type?  │                                    │
│         └────────┬────────┘                                    │
│                  │                                             │
│    ┌─────────────┼─────────────┐                               │
│    │             │             │                               │
│    ▼             ▼             ▼                               │
│ Safety       Quality       Context                            │
│ Override     Merge         Versioned                           │
│    │             │             │                               │
│    │             │             │                               │
│    └─────────────┴─────────────┘                               │
│                  │                                             │
│                  ▼                                             │
│  3. Apply resolution rule                                      │
│                  │                                             │
│                  ▼                                             │
│  4. Log resolution to audit trail                              │
│                  │                                             │
│                  ▼                                             │
│  5. Notify if manual review required                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. CLI Commands Reference

### 5.1 Sync Commands

```bash
# Import from Claude Code
dash sync --from-claude [OPTIONS]

Options:
  --session <id>     Specific session to sync (default: all pending)
  --type <type>      Filter by type: reasoning|quality|context|all
  --force            Force full resync (ignore cached)
  --format <fmt>     Output format: json|table|markdown
  --verbose          Show detailed sync status

Examples:
  dash sync --from-claude                          # Sync all pending
  dash sync --from-claude --session sess-123       # Specific session
  dash sync --from-claude --type reasoning         # Reasoning only
  dash sync --from-claude --format markdown        # Human-readable
```

```bash
# Export to Claude Code
dash push --to-claude [OPTIONS]

Options:
  --session <id>     Specific session to push to
  --task <id>        Push task context
  --gates            Push quality gate configuration
  --safety           Push safety boundaries
  --context          Push shared context files
  --format <fmt>     Output format: json|markdown

Examples:
  dash push --to-claude                     # Push all pending
  dash push --to-claude --gates             # Push quality gates
  dash push --to-claude --session sess-123  # To specific session
```

```bash
# Bi-directional sync
dash sync bidirection --session <id>        # Full sync both ways
dash sync status                            # Queue and conflict status
dash sync resolve --conflict <id> [accept|reject|merge]
dash sync history --session <id>            # Show sync history
dash sync pause                             # Pause auto-sync
dash sync resume                            # Resume auto-sync
```

### 5.2 Integration Commands

```bash
# Start Claude Code with Dash context
dash claude start <task-id> [OPTIONS]

Options:
  --context <path>       Additional context files
  --gates <config>       Custom quality gate config
  --budget <limit>       Token/cost budget
  --auto-commit          Auto-commit on success
  --monitor              Monitor session in real-time

Examples:
  dash claude start task-456                  # Start with default config
  dash claude start task-456 --auto-commit    # Auto-commit on success
  dash claude start task-456 --monitor        # Real-time monitoring
```

```bash
# Worktree-based parallel execution
dash claude worktree <name> <branch> <task>  # Create worktree + run
dash claude parallel <task1> <task2> ...     # Run multiple in parallel
dash claude attach <session-id>              # Attach to running session
dash claude terminate <session-id>           # Terminate session
dash claude status <session-id>              # Show session status
```

### 5.3 Quality Gate Commands

```bash
# Enforce quality gates on Claude Code output
dash quality enforce <session-id>            # Run all gates
dash quality lint <session-id>               # Linting only
dash quality types <session-id> --strict     # Type checking
dash quality security <session-id>           # Security scan
dash quality gate <session-id> --threshold 0.9  # Custom threshold

# Results
dash quality report <session-id>             # Full quality report
dash quality summary <session-id>            # Brief summary
dash quality export <session-id> --format json
```

### 5.4 Reasoning Trace Commands

```bash
# Reasoning visibility
dash reasoning trace <session-id> --type all|decision|analysis
dash reasoning decisions <session-id>        # All decisions
dash reasoning summarize <task-id>           # Chain summary
dash reasoning analyze <session-id>          # Confidence-evidence alignment
dash reasoning compare <session-a> <session-b>

# Export
dash reasoning export <session-id> --format markdown|json
dash reasoning stream <session-id>           # Real-time streaming
```

---

## 6. Security Model

### 6.1 Authentication

```typescript
interface ClaudeCodeAuth {
  method: 'api_key' | 'oauth2' | 'machine_token';
  credentials: {
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    machineToken?: string;
  };
  scopes: {
    read: ('reasoning' | 'quality' | 'context' | 'sessions')[];
    write: ('reasoning' | 'quality' | 'context' | 'sessions')[];
    admin: boolean;
  };
}
```

### 6.2 Permission Scopes

| Scope | Read | Write | Description |
|-------|------|-------|-------------|
| `reasoning` | View traces | Append traces | Reasoning visibility |
| `quality` | View results | Update status | Quality gate access |
| `context` | Read files | Write files | Context file access |
| `sessions` | List/Create | Manage lifecycle | Session management |
| `safety` | View boundaries | Escalate | Safety configuration |

### 6.3 Data Filtering

```typescript
interface SyncFilter {
  // Exclude patterns (regex)
  excludePatterns: string[];
  
  // PII detection and redaction
  piiRedaction: {
    enabled: boolean;
    patterns: ('email' | 'phone' | 'ssn' | 'credit_card' | 'custom')[];
  };
  
  // Secret detection
  secretDetection: {
    enabled: boolean;
    blockOnDetect: boolean;
    allowedPatterns: string[];
  };
  
  // Size limits
  maxPayloadSize: number; // bytes
  maxFileSize: number; // bytes
}
```

**Default Filter Rules:**
```yaml
excludePatterns:
  - "**/.env*"
  - "**/secrets/**"
  - "**/*.key"
  - "**/id_rsa"
  - "**/credentials.json"

piiRedaction:
  enabled: true
  patterns: [email, phone, ssn, credit_card]

secretDetection:
  enabled: true
  blockOnDetect: false
  allowedPatterns: []
```

### 6.4 Security Events

| Event | Action | Notification |
|-------|--------|--------------|
| Unauthorized sync attempt | Log + block | Security alert |
| PII detected | Redact + log | Privacy alert |
| Secret detected | Quarantine | Security alert |
| Boundary violation | Block + escalate | Immediate alert |
| Rate limit exceeded | Reject + backoff | Rate limit warning |

---

## 7. Offline & Reliability

### 7.1 Offline Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    Offline Sync Strategy                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ONLINE STATE                          OFFLINE STATE            │
│  ─────────────                         ─────────────            │
│                                                                 │
│  ┌─────────────────┐                  ┌─────────────────┐       │
│  │ Sync immediately│                  │ Queue writes    │       │
│  │ Real-time events│                  │ Store locally   │       │
│  └─────────────────┘                  └────────┬────────┘       │
│         ▲                                    │                 │
│         │ Network                           │ Offline          │
│         │ Available                         │                  │
│         └───────────────────────────────────┘                  │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────────┐                            │
│              │ Reconnection        │                            │
│              │ 1. Flush queue      │                            │
│              │ 2. Resolve conflicts│                            │
│              │ 3. Resume sync      │                            │
│              └─────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Queue Management

```typescript
interface SyncQueue {
  // Queue entry
  id: string;
  direction: 'inbound' | 'outbound';
  dataType: 'reasoning' | 'quality' | 'context' | 'session';
  payload: any;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: 'high' | 'normal' | 'low';
  
  // Conflict info (if applicable)
  conflict?: {
    resolved: boolean;
    resolution?: 'accept' | 'reject' | 'merge';
    resolvedAt?: string;
  };
}
```

### 7.3 Reconnection Strategy

| Phase | Action | Retry Logic |
|-------|--------|-------------|
| **Detection** | Network down detected | Immediate |
| **Queueing** | Writes queued locally | N/A |
| **Retry** | Attempt reconnection | Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s max |
| **Flush** | Process queued items | Priority order (high → low) |
| **Conflict Resolution** | Handle sync conflicts | Rule-based + manual escalation |

### 7.4 Reliability Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| **At-least-once delivery** | Queue with ACK confirmation |
| **Eventual consistency** | Conflict resolution on reconnect |
| **No data loss** | Local persistence before sync |
| **Ordered delivery** | Sequence numbers per data type |
| **Idempotent operations** | Deduplication via operation IDs |

---

## 8. Integration with Dash Reasoning Traces

### 8.1 Trace Integration Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                 Reasoning Trace Integration                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DASH NATIVE TRACES          CLAUDE CODE TRACES                 │
│  ┌─────────────────┐         ┌─────────────────┐                │
│  │ • Dash-generated│         │ • Claude Code   │                │
│  │ • Agent actions │         │ • Thinking      │                │
│  │ • Task events   │         │ • Decisions     │                │
│  └────────┬────────┘         └────────┬────────┘                │
│           │                           │                         │
│           │          ┌────────────────┴───────────────┐         │
│           │          │                                │         │
│           │          ▼                                ▼         │
│           │   ┌─────────────────────────────────────────┐       │
│           │   │         UNIFIED TRACE VIEW              │       │
│           │   │  • Single timeline                      │       │
│           │   │  • Cross-reference capability          │       │
│           │   │  • Unified confidence tracking         │       │
│           │   └─────────────────────────────────────────┘       │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Trace Storage                         │   │
│  │  • Source tracking (dash vs claude-code)                │   │
│  │  • Hierarchical relationships preserved                 │   │
│  │  • Confidence scores aggregated                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Trace Schema Extension

```typescript
interface UnifiedTrace {
  id: string;
  source: 'dash' | 'claude-code';
  originalId?: string; // ID in source system
  
  // Common fields
  timestamp: string;
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction' | 'action' | 'event';
  content: string;
  confidence: number;
  evidence: string[];
  
  // Cross-references
  parentTraceId?: string;
  childTraceIds: string[];
  linkedTraces: {
    system: 'dash' | 'claude-code';
    traceId: string;
    relationship: 'equivalent' | 'related' | 'caused' | 'resulted-in';
  }[];
  
  // Context
  agentId: string;
  sessionId: string;
  taskId: string;
}
```

### 8.3 Confidence Aggregation

```typescript
function aggregateConfidence(traces: UnifiedTrace[]): number {
  // Weighted average based on evidence count
  const weightedSum = traces.reduce((sum, trace) => {
    const weight = Math.log2(trace.evidence.length + 1); // Evidence-based weighting
    return sum + (trace.confidence * weight);
  }, 0);
  
  const totalWeight = traces.reduce((sum, trace) => {
    return sum + Math.log2(trace.evidence.length + 1);
  }, 0);
  
  return weightedSum / totalWeight;
}
```

---

## 9. Auto-Commit on Claude Code Success

### 9.1 Success Criteria

```typescript
interface SuccessCriteria {
  // Must all be true for auto-commit
  conditions: {
    allTestsPass: boolean;
    qualityGateScore: number; // >= threshold
    securityScanClean: boolean;
    noSafetyViolations: boolean;
    humanApprovalNotRequired: boolean;
  };
  
  // Optional conditions
  optional: {
    documentationUpdated?: boolean;
    changelogUpdated?: boolean;
    coverageImproved?: boolean;
  };
}
```

### 9.2 Auto-Commit Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Auto-Commit Workflow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code Session Complete                                   │
│                    │                                            │
│                    ▼                                            │
│  ┌───────────────────────────────────────────┐                  │
│  │ 1. Run Quality Gates                      │                  │
│  │    • Linting                              │                  │
│  │    • Type checking                        │                  │
│  │    • Test execution                       │                  │
│  │    • Security scan                        │                  │
│  └───────────────────┬───────────────────────┘                  │
│                      │                                           │
│                      ▼                                           │
│  ┌───────────────────────────────────────────┐                  │
│  │ 2. Evaluate Success Criteria              │                  │
│  │    All mandatory conditions met?          │                  │
│  └───────────────────┬───────────────────────┘                  │
│                      │                                           │
│           ┌──────────┴──────────┐                               │
│           │                     │                               │
│           ▼ No                  ▼ Yes                            │
│  ┌─────────────────┐    ┌─────────────────────┐                 │
│  │ Log failure     │    │ 3. Check auto-commit│                 │
│  │ Notify human    │    │     flag            │                 │
│  │ Create ticket   │    └─────────┬───────────┘                 │
│  └─────────────────┘              │                              │
│                                   ▼ No                           │
│                          ┌─────────────────┐                     │
│                          │ Wait for human  │                     │
│                          │ approval        │                     │
│                          └─────────────────┘                     │
│                                   │                              │
│                                   ▼ Yes                          │
│                          ┌─────────────────────┐                 │
│                          │ 4. Stage changes   │                 │
│                          │ git add -A          │                 │
│                          └─────────┬───────────┘                 │
│                                    │                              │
│                                    ▼                              │
│                          ┌─────────────────────┐                 │
│                          │ 5. Commit           │                 │
│                          │ git commit -m "... "│                 │
│                          └─────────┬───────────┘                 │
│                                    │                              │
│                                    ▼                              │
│                          ┌─────────────────────┐                 │
│                          │ 6. Sync to Dash     │                 │
│                          │ Update session      │                 │
│                          │ outcome + commit    │                 │
│                          └─────────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Commit Message Format

```bash
# Automatic commit message template
feat(<type>): <summary>

<task-description>

Reasoning:
- <key-decision-1>
- <key-decision-2>

Quality:
- Tests: <pass|fail>
- Coverage: <percentage>%
- Quality Score: <score>/1.0

Claude Code Session: <session-id>
Generated: <timestamp>
```

### 9.4 Configuration

```yaml
# .dash/config.yaml
claudeCode:
  autoCommit:
    enabled: true
    onSuccess: true
    onQualityGatePass: true
    requireHumanApproval: false
    commitTypes:
      - feat
      - fix
      - refactor
      - test
      - docs
    maxRetries: 3
    pushAfterCommit: false
```

---

## 10. Error Handling

### 10.1 Error Types

| Error Code | Type | Description | Recovery |
|------------|------|-------------|----------|
| `SYNC_001` | Network | Connection failed | Retry with backoff |
| `SYNC_002` | Auth | Invalid credentials | Re-authenticate |
| `SYNC_003` | Conflict | Data conflict detected | Apply resolution rules |
| `SYNC_004` | Validation | Invalid data format | Reject, log error |
| `SYNC_005` | Quota | Rate limit exceeded | Backoff + retry |
| `SYNC_006` | Security | Security violation | Block + alert |
| `SYNC_007` | Offline | Cannot reach remote | Queue for later |
| `SYNC_008` | Timeout | Sync operation timed out | Retry once |

### 10.2 Error Response Format

```json
{
  "error": {
    "code": "SYNC_003",
    "message": "Data conflict detected",
    "details": {
      "conflictType": "quality_score",
      "localValue": 0.95,
      "remoteValue": 0.90,
      "suggestedResolution": "merge"
    },
    "timestamp": "2026-02-01T22:30:00Z",
    "requestId": "req-123",
    "retryable": true
  }
}
```

### 10.3 Retry Strategy

| Retry | Delay | Jitter | Max Retries |
|-------|-------|--------|-------------|
| 1 | 1s | ±100ms | - |
| 2 | 2s | ±200ms | - |
| 3 | 4s | ±400ms | - |
| 4 | 8s | ±800ms | - |
| 5+ | 32s | ±1000ms | 10 total |

---

## 11. Implementation Plan

### 11.1 Phase 1: Foundation (Week 1)

| Task | Files | Description |
|------|-------|-------------|
| Sync Queue | `src/sync/queue.ts` | Local queue with persistence |
| Protocol | `src/sync/protocol.ts` | JSON protocol definition |
| Auth | `src/sync/auth.ts` | API key/OAuth2 authentication |
| CLI Commands | `src/cli/sync.ts` | `dash sync --from-claude`, `dash push --to-claude` |
| Tests | `tests/sync/` | Queue, protocol, auth tests |

### 11.2 Phase 2: Core Sync (Week 2)

| Task | Files | Description |
|------|-------|-------------|
| Reasoning Sync | `src/sync/reasoning.ts` | Bidirectional reasoning trace sync |
| Quality Sync | `src/sync/quality.ts` | Quality result sharing |
| Conflict Resolution | `src/sync/conflict.ts` | Rule-based conflict resolution |
| Offline Support | `src/sync/offline.ts` | Queue + reconnection logic |
| Integration | `src/sync/integrate.ts` | Hook into Claude Code session lifecycle |

### 11.3 Phase 3: Advanced Features (Week 3)

| Task | Files | Description |
|------|-------|-------------|
| Auto-Commit | `src/sync/commit.ts` | Success-triggered commit workflow |
| Unified Traces | `src/reasoning/unified.ts` | Cross-system trace integration |
| Safety Integration | `src/sync/safety.ts` | Safety boundary enforcement |
| Observability | `src/sync/observe.ts` | Sync metrics and monitoring |
| Documentation | `docs/sync.md` | User documentation |

### 11.4 Files to Create

```
src/sync/
├── index.ts              # Main export
├── queue.ts              # Sync queue management
├── protocol.ts           # JSON schemas and serialization
├── auth.ts               # Authentication and permissions
├── reasoning.ts          # Reasoning trace sync
├── quality.ts            # Quality result sync
├── context.ts            # Context file sync
├── conflict.ts           # Conflict detection/resolution
├── offline.ts            # Offline handling
├── commit.ts             # Auto-commit workflow
├── safety.ts             # Safety boundary sync
└── observe.ts            # Metrics and monitoring

src/cli/
├── sync.ts               # Sync commands (sync, push, status)
├── claude.ts             # Claude Code integration commands
└── quality.ts            # Quality gate commands (existing)

tests/sync/
├── queue.test.ts
├── protocol.test.ts
├── auth.test.ts
├── reasoning.test.ts
├── quality.test.ts
├── conflict.test.ts
└── offline.test.ts
```

---

## 12. Appendix: Current Integration Reference

### 12.1 Existing `dash-claude-code.sh` Commands

The current script provides:
- `quick [prompt]` - Run quick Claude Code task
- `worktree [name] [branch] [task]` - Create worktree and run Claude
- `parallel [task1] [task2] ...` - Run multiple tasks in parallel
- `analyze [file]` - Analyze a file or directory
- `test [description]` - Write/improve tests
- `fix [description]` - Fix bugs or issues
- `refactor [description]` - Refactor code
- `review [description]` - Code review
- `self-improve` - Run full self-improvement cycle

### 12.2 Evolution Path

| Current Feature | Bidirectional Enhancement |
|-----------------|---------------------------|
| Output logged to `claude-*.log` | Real-time streaming to Dash |
| Worktree spawning | Context-aware worktree creation |
| Self-improvement cycle | Automated quality-gated improvement |
| Manual quality analysis | Automatic quality gate enforcement |

---

## 13. Open Questions & Assumptions

### 13.1 Assumptions

1. **Claude Code CLI exposes an API for sync** - We assume Claude Code can be configured to emit traces and accept context via stdin/stdout or a local socket
2. **Git worktree isolation** - Worktrees provide sufficient isolation for parallel Claude Code sessions
3. **JSON format for structured data** - JSON is acceptable for both systems; no need for binary formats
4. **Local-first sync** - Sync happens via local filesystem or localhost HTTP, not remote API calls

### 13.2 Open Questions

1. **Claude Code API Access** - Does Claude Code expose hooks for receiving
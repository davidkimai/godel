# Dash - Comprehensive PRD (Multi-Perspective Synthesis)

**Version:** 2.0
**Date:** 2026-02-01
**Status:** Final
**Sources:**
- Self-Interview (MiniMax M2.1)
- SPEC_V3.md
- PHASE2_PROGRESS.md
- PHASE3_PLAN.md
- QA_REPORT.md

---

## Executive Summary

**Dash** is a CLI-first agent orchestration platform designed to make multi-agent AI development as simple and reliable as single-agent development. The core value proposition is **speed**-reducing time-to-resolution for agent failures from 30+ minutes to under 5 minutes-while ensuring **predictable code quality** through automated quality gates.

### Key Metrics

| Metric | Target | Current | Priority |
|--------|--------|---------|----------|
| Time-to-resolution | <5 min | 30 min | P0 |
| Code quality pass rate | 100% | Variable | P0 |
| Build errors | 0 | 24 | P0 |
| CLI commands | 50+ | 15 | P1 |
| Concurrent agents | 50+ | Unknown | P1 |

### Implementation Status

- **Phase 1 (Core Foundation):** Complete (114 tests pass)
- **Phase 2 (Code Features):** In Progress (24 build errors)
- **Phase 3 (Reasoning):** Planned
- **Phase 4 (Safety):** Not Started
- **Phase 5 (Integration):** Not Started

---

## 1. Product Vision & Goals

### 1.1 Vision Statement

> "Make multi-agent AI orchestration as simple and reliable as single-agent development."

### 1.2 North Star Metric

**Time-to-resolution < 5 minutes** for any agent failure.

This metric is measured from the moment an agent fails to the moment the root cause is identified and a fix path is determined. This requires:
- Real-time event streaming
- Reasoning trace visibility
- Context snapshot on failure
- Clear error messages with suggestions

### 1.3 Secondary Metric

**Code quality consistency: 100% pass rate on quality gates.**

No agent-generated code should pass through without passing:
- Linting (ESLint, Pylint, golangci-lint)
- Type checking (TypeScript, mypy)
- Test execution (Jest, pytest, go test)
- Security scanning (ESLint security plugin, bandit)

### 1.4 Core Goals

| Goal | Description | Success Criteria |
|------|-------------|------------------|
| **Unified CLI** | Single command interface for all agent operations | 50+ CLI commands, consistent patterns |
| **Reasoning Visibility** | Full trace of agent decision-making | Reasoning traces on every agent |
| **Quality Assurance** | Automated gates for code correctness | 100% quality gate pass rate |
| **Safety by Design** | Built-in boundaries and escalation | Hard boundaries defined, no bypass |
| **Observable Systems** | Real-time monitoring and debugging | <50ms event latency |

---

## 2. User Personas

### 2.1 Primary Users

#### Orchestrator Models (Primary)

**Who:** AI models managing agent swarms (Kimi K2.5, Claude Sonnet 4-5, OpenAI Codex)

**Key Needs:**
- API-first design (CLI commands that are machine-callable)
- Context sharing between agents
- Event streaming for real-time awareness
- Quality gates that can be programmatically evaluated
- Safety boundaries that prevent dangerous operations

**Frustrations:**
- Fragmentation across agent tools
- No unified view of agent status
- Manual coordination required
- Poor observability into agent reasoning

---

#### Human Developers (Secondary)

**Who:** Developers working with orchestrators, reviewing agent outputs

**Key Needs:**
- Visibility into agent activity (real-time dashboard via CLI)
- Clear quality reports for each agent run
- Ability to pause/resume/kill agents
- Audit trails for compliance
- Easy onboarding to new agent workflows

**Frustrations:**
- Black-box agent behavior
- Inconsistent code quality
- Time-consuming debugging
- Poor documentation

---

#### DevOps/SRE Engineers (Secondary)

**Who:** Managing infrastructure, deployment, and monitoring

**Key Needs:**
- CI/CD integration (GitHub Actions, GitLab CI)
- Resource monitoring and limits
- Cost tracking by agent/swarm
- Alerting on failures or anomalies
- Rollback capabilities

**Frustrations:**
- No visibility into agent resource usage
- Manual deployment processes
- No cost attribution
- Poor alerting

---

### 2.2 Secondary Users

| Persona | Key Needs | Dash Feature |
|---------|-----------|--------------|
| **Security Teams** | Audit logs, safety boundaries, compliance | `dash audit log`, `dash safety boundaries` |
| **QA Engineers** | Test execution, coverage reports, quality gates | `dash tests run`, `dash quality gate` |
| **Product Managers** | Analytics, bottlenecks, cost metrics | `dash analytics agents`, `dash analytics cost` |
| **Engineering Leads** | Team-wide configs, templates, governance | `dash templates`, `dash config` |

---

## 3. Core Features

### 3.1 Agent Management

#### Feature: Agent Lifecycle

**Commands:**
```bash
dash agents list [--format json|table]           # List all agents
dash agents status <agent-id>                    # Show agent details
dash agents spawn <task> [--model <model>]       # Create new agent
dash agents kill <agent-id>                      # Terminate agent
dash agents pause <agent-id>                     # Pause agent execution
dash agents resume <agent-id>                    # Resume paused agent
dash agents retry <agent-id> [--skip-backoff]    # Retry failed agent
dash agents abort <agent-id>                     # Force terminate with cleanup
```

**Agent Model:**
```typescript
interface Agent {
  id: string;
  label?: string;
  status: AgentStatus;
  model: string;
  task: string;
  spawnedAt: Date;
  completedAt?: Date;
  runtime: number;

  // Grouping & Hierarchy
  swarmId?: string;
  parentId?: string;
  childIds: string[];

  // Context Management
  context: {
    inputContext: string[];
    outputContext: string[];
    sharedContext: string[];
    contextSize: number;
    contextWindow: number;
    contextUsage: number;
  };

  // Code-Specific
  code?: {
    language: string;
    fileTree: FileNode;
    dependencies: DependencyGraph;
    symbolIndex: SymbolTable;
  };

  // Reasoning-Specific
  reasoning?: {
    traces: ReasoningTrace[];
    decisions: DecisionLog[];
    confidence: number;
  };

  // Retry & Failure Tracking
  retryCount: number;
  maxRetries: number;
  lastError?: string;

  // Safety & Budget
  budgetLimit?: number;
  safetyBoundaries?: SafetyConfig;

  metadata: Record<string, any>;
}
```

**Priority:** P0
**Status:** Partial (spawn, kill, list done; pause, resume, retry missing)
**Owner:** Phase 1

---

#### Feature: Agent Grouping (Swarm/Hierarchy)

**Commands:**
```bash
dash agents list --group swarm                    # Group by swarm
dash agents list --group hierarchy                # Show parent-child
dash swarm create <name> [--agents <ids>]        # Create swarm
dash swarm add <swarm-id> <agent-id>             # Add agent to swarm
dash swarm remove <swarm-id> <agent-id>          # Remove from swarm
```

**Use Cases:**
- Parallel task execution (same parent, sibling agents)
- Sequential dependencies (parent spawns children)
- Resource sharing (context, files, tools)

**Priority:** P1
**Status:** Done
**Owner:** Phase 1

---

### 3.2 Task Management

#### Feature: Task Lifecycle

**Commands:**
```bash
dash tasks list [--status <status>]               # List tasks
dash tasks create <title> <description>           # Create task
dash tasks update <task-id> <status>              # Update status
dash tasks assign <task-id> <agent-id>            # Assign to agent
dash tasks dependencies <task-id>                 # Show dependencies
dash tasks checkpoint <task-id> --progress 0.5    # Record progress
dash tasks resolve-blocker <task-id> <blocker-id> # Mark blocker resolved
```

**Task Model:**
```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId?: string;

  // Dependencies
  dependsOn: string[];
  blocks: string[];

  // Planning & Reasoning
  reasoning?: {
    hypothesis?: string;
    alternatives?: string[];
    criteria?: string[];
    evaluation?: string;
    confidence: number;
  };

  // Quality Gates
  qualityGate?: {
    type: 'critique' | 'test' | 'manual';
    criteria: QualityCriterion[];
    passingThreshold: number;
    maxIterations: number;
  };

  // Checkpoints
  checkpoints?: Checkpoint[];

  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}
```

**Priority:** P0
**Status:** Done
**Owner:** Phase 1

---

### 3.3 Context Management

#### Feature: Context Sharing

**Commands:**
```bash
dash context get <agent-id>                       # Show agent context
dash context add <agent-id> <path> [--type input|output|shared|reasoning]
dash context remove <agent-id> <path>
dash context share <agent-id> <target-agent-id> <path>
dash context analyze <agent-id>                  # Analyze context usage
dash context optimize <agent-id> [--aggressive]  # Suggest optimizations
dash context snapshot <agent-id>                 # Save context state
dash context tree <agent-id> [--max-depth 3]     # Visualize file tree
```

**Context Model:**
```typescript
interface Context {
  inputContext: string[];      // Files read by agent
  outputContext: string[];     // Files created/modified
  sharedContext: string[];     // Shared with other agents
  contextSize: number;         // Total size in bytes
  contextWindow: number;       // Token limit
  contextUsage: number;        // Current usage percentage
}
```

**Priority:** P0
**Status:** Done (get, add, remove, share, tree)
**Status:** Missing (analyze, optimize)
**Owner:** Phase 1

---

### 3.4 Event System

#### Feature: Real-Time Event Streaming

**Commands:**
```bash
dash events stream [--filter <type>]              # Stream events
dash events replay --since <time>                 # Replay past events
dash events history [--limit 100]                 # Query event history
```

**Event Types:**
```typescript
type EventType =
  // Agent lifecycle
  | 'agent.spawned'
  | 'agent.status_changed'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.blocked'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.killed'

  // Task lifecycle
  | 'task.created'
  | 'task.status_changed'
  | 'task.assigned'
  | 'task.completed'
  | 'task.blocked'
  | 'task.failed'
  | 'task.cancelled'

  // Context
  | 'context.added'
  | 'context.removed'
  | 'context.changed'
  | 'context.snapshot'

  // Quality
  | 'critique.requested'
  | 'critique.completed'
  | 'critique.failed'
  | 'quality.gate_passed'
  | 'quality.gate_failed'

  // Testing
  | 'test.started'
  | 'test.completed'
  | 'test.failed'
  | 'test.coverage'

  // Reasoning
  | 'reasoning.trace'
  | 'reasoning.decision'
  | 'reasoning.confidence_changed'

  // Safety
  | 'safety.violation_attempted'
  | 'safety.boundary_crossed'
  | 'safety.escalation_required'
  | 'safety.human_approval'

  // System
  | 'system.bottleneck_detected'
  | 'system.disconnected'
  | 'system.emergency_stop'
  | 'system.checkpoint'
```

**Performance Target:** <50ms latency
**Buffer Size:** 100,000 events
**Priority:** P0
**Status:** Done
**Owner:** Phase 1

---

### 3.5 Reasoning Trace System

#### Feature: Reasoning Visibility

**Commands:**
```bash
dash reasoning trace <agent-id> \
  --type hypothesis|analysis|decision|correction \
  --content <text> \
  --evidence <files> \
  --confidence 0.75

dash reasoning decisions <agent-id>              # Show all decisions
dash reasoning summarize <task-id>               # Summarize reasoning chain
dash reasoning analyze <agent-id>                # Check confidence-evidence alignment
```

**Data Models:**
```typescript
interface ReasoningTrace {
  id: string;
  agentId: string;
  taskId?: string;
  timestamp: Date;
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction';
  content: string;
  evidence: string[];  // File paths
  confidence: number;  // 0-1
  parentTraceId?: string;
  childTraceIds: string[];
}

interface DecisionLog {
  id: string;
  agentId: string;
  timestamp: Date;
  decision: string;
  alternatives: string[];
  criteria: string[];
  evaluation: string;
  outcome?: string;  // Filled after execution
  confidence: number;
}

interface ConfidenceTracking {
  traceId: string;
  confidenceOverTime: { timestamp: Date; confidence: number }[];
  evidenceCount: number;
  lastEvidenceUpdate: Date;
  warningThreshold: number;  // e.g., 0.7
}
```

**Priority:** P0
**Status:** Missing (Phase 3)
**Owner:** Phase 3
**Files to Create:** 6 files (types, traces, decisions, confidence, index, CLI)

---

### 3.6 Quality Gates

#### Feature: Quality Criteria

**Dimensions:**
| Dimension | Weight | Threshold | Description |
|-----------|--------|-----------|-------------|
| correctness | 0.30 | 0.90 | Code produces correct outputs |
| test_coverage | 0.20 | 0.85 | Sufficient test coverage |
| security | 0.20 | 0.95 | No security vulnerabilities |
| types | 0.15 | 0.95 | Type safety |
| style | 0.15 | 0.80 | Code style consistency |

**Commands:**
```bash
dash quality lint <agent-id>                      # Run linter
dash quality types <agent-id> [--strict]          # Type checking
dash quality security <agent-id> [--cwe-list CWE-89,CWE-79]  # Security scan
dash quality gate <task-id> --criteria <json>     # Run quality gate
```

**Quality Gate Model:**
```typescript
interface QualityCriterion {
  dimension: string;
  weight: number;      // 0-1
  threshold: number;   // 0-1
}

interface QualityGate {
  type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
  criteria: QualityCriterion[];
  passingThreshold: number;  // Weighted average
  maxIterations: number;
  autoRetry: boolean;
}
```

**Priority:** P0
**Status:** Partial (lint done; types, security, gate missing)
**Owner:** Phase 2 (gate), Phase 3 (critique)

---

### 3.7 Safety Framework

#### Feature: Ethics Boundaries

**Hard Boundaries (Cannot Be Crossed):**
- `doNotHarm`: No actions that could cause physical or digital harm
- `preservePrivacy`: No access to user PII without authorization
- `noDeception`: No misleading outputs orfake data
- `authorizedAccessOnly`: No access to unauthorized systems/files

**Commands:**
```bash
dash safety status                               # Show safety status
dash safety boundaries list                      # List all boundaries
dash safety boundaries set doNotHarm true        # Set boundary
dash safety check --action "delete /prod-db"     # Check action safety
```

**Safety Model:**
```typescript
interface SafetyConfig {
  ethicsBoundaries: {
    doNotHarm: boolean;
    preservePrivacy: boolean;
    noDeception: boolean;
    authorizedAccessOnly: boolean;
  };

  dangerousActions: {
    dataDestruction: 'block' | 'confirm' | 'allow';
    agentTermination: 'confirm' | 'allow';
    externalPublishing: 'confirm' | 'block';
    resourceExhaustion: 'block' | 'confirm';
  };

  escalationTriggers: {
    ethicsViolation: 'immediate';
    costExceeded: 'threshold';
    recursiveModification: 'approval';
    persistentFailure: 'threshold';
    securityBreach: 'immediate';
  };
}
```

**Priority:** P0
**Status:** Missing (Phase 4)
**Owner:** Phase 4

---

#### Feature: Human Escalation

**Commands:**
```bash
dash escalation request --type safety --reason <text>
dash escalation list --status pending
dash escalation respond <escalation-id> --decision approve|deny --notes <text>
```

**Escalation Types:**
- `safety`: Ethics boundary violation
- `cost`: Budget exceeded
- `quality`: Quality gate failed repeatedly
- `security`: Security vulnerability detected
- `manual`: Human review requested

**Priority:** P0
**Status:** Missing (Phase 4)
**Owner:** Phase 4

---

### 3.8 Testing Integration

#### Feature: Test Execution

**Commands:**
```bash
dash tests run <agent-id> --pattern "**/*.test.ts" --coverage
dash tests generate <agent-id> --template jest
dash tests watch <agent-id>
dash tests list --framework jest
```

**Supported Frameworks:**
| Framework | Language | Coverage Format |
|-----------|----------|-----------------|
| Jest | TypeScript/JavaScript | Istanbul |
| Vitest | TypeScript/JavaScript | Istanbul |
| pytest | Python | coverage.py |
| unittest | Python | coverage.py |
| go test | Go | gcov |
| cargo test | Rust | tarpaulin |

**Priority:** P0
**Status:** Done
**Owner:** Phase 2

---

### 3.9 CI/CD Integration

#### Feature: Pipeline Integration

**Commands:**
```bash
dash ci run <agent-id> [--pipeline <name>]
dash ci status <run-id>
dash ci deploy <run-id> --environment dev|staging|prod
```

**Integrations:**
- GitHub Actions
- GitLab CI
- CircleCI
- Jenkins

**Priority:** P1
**Status:** Missing (Phase 5)
**Owner:** Phase 5

---

### 3.10 Analytics

#### Feature: Metrics & Reporting

**Commands:**
```bash
dash analytics agents --metric tokens|cost|runtime
dash analytics tasks --status done|blocked
dash analytics bottlenecks
dash analytics cost --group swarm
dash analytics health
dash analytics performance <agent-id>
dash analytics cascade-risk --swarm <swarm-id>
```

**Priority:** P1
**Status:** Missing (Phase 5)
**Owner:** Phase 5

---

## 4. Technical Architecture

### 4.1 System Architecture

```
CLI Layer → Commands → Formatters → Storage
    ↓
Core Services: Agents | Tasks | Context | Events
    ↓
Quality & Reasoning: Quality | Critique | Reasoning | Testing
    ↓
Storage Layer: Memory Storage
```

### 4.2 Project Structure

```
projects/mission-control/
├── src/
│   ├── index.ts              # Entry point
│   ├── cli/
│   │   ├── main.ts           # CLI entry
│   │   ├── storage.ts        # Storage management
│   │   ├── formatters.ts     # Output formatting
│   │   └── commands/
│   │       ├── agents.ts     # Agent management
│   │       ├── tasks.ts      # Task management
│   │       ├── context.ts    # Context management
│   │       ├── events.ts     # Event streaming
│   │       ├── quality.ts    # Quality gates
│   │       ├── tests.ts      # Test execution
│   │       ├── reasoning.ts  # Reasoning traces
│   │       ├── safety.ts     # Safety framework
│   │       └── analytics.ts  # Analytics
│   ├── models/
│   │   ├── agent.ts          # Agent model
│   │   ├── task.ts           # Task model
│   │   ├── event.ts          # Event types
│   │   └── types.ts          # Shared types
│   ├── events/
│   │   ├── emitter.ts        # Event emitter
│   │   ├── stream.ts         # Event streaming
│   │   └── types.ts          # Event types
│   ├── context/
│   │   ├── manager.ts        # Context management
│   │   ├── parser.ts         # File parsing
│   │   └── tree.ts           # File tree
│   ├── quality/
│   │   ├── linter.ts         # Linting
│   │   └── types.ts          # Quality types
│   ├── reasoning/
│   │   ├── traces.ts         # Trace recording
│   │   └── types.ts          # Reasoning types
│   ├── safety/
│   │   ├── boundaries.ts     # Safety boundaries
│   │   └── types.ts          # Safety types
│   ├── testing/
│   │   ├── runner.ts         # Test runner
│   │   └── coverage.ts       # Coverage parsing
│   └── storage/
│       ├── memory.ts         # In-memory storage
│       └── index.ts          # Storage exports
├── tests/
├── dist/
└── package.json
```

### 4.3 Performance Targets

| Operation | Target | Max |
|-----------|--------|-----|
| `agents list` | <50ms | 200ms |
| `agents status <id>` | <30ms | 100ms |
| `context tree` | <100ms | 500ms |
| `events stream` | <20ms | 50ms |
| `reasoning trace` | <10ms | 50ms |

### 4.4 Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 18+ |
| Testing | Jest | 29.x |
| CLI | Commander.js | Latest |
| Events | EventEmitter3 | Latest |

---

## 5. Implementation Roadmap

### Phase 1: Core Foundation ✅ Complete

| Deliverable | Status | Notes |
|-------------|--------|-------|
| Agent model & management | Done | Full implementation |
| Task model & management | Done | Full implementation |
| Event system | Done | Streaming, replay, history |
| Context management | Done | Tree, size, parsing |
| CLI structure | Done | Commands, formatters, storage |
| Tests (114 passing) | Done | >90% coverage on core |

### Phase 2: Code Features 🔄 In Progress

| Deliverable | Status | Notes |
|-------------|--------|-------|
| File tree representation | Done | Implemented in context/tree.ts |
| Test execution | Done | Jest, Vitest, pytest, go, cargo |
| Coverage parsing | Done | Istanbul, coverage.py, gcov, Jacoco |
| Linting integration | Partial | ESLint done, others missing |
| Build status | Fail | 24 TypeScript errors |

**Critical Issues:**
1. Missing exports (parseImports, parseExports)
2. Import path issues (.js extensions)
3. LanguageType | null type mismatches
4. Missing filesScanned in error returns
5. Quality module default export
6. TestFramework null handling
7. CLI command argument/type issues

### Phase 3: Reasoning Features 📋 Planned

| Deliverable | Files to Create |
|-------------|-----------------|
| Reasoning trace system | 6 files |
| Quality gate framework | 4 files |
| Critique orchestration | 4 files |
| Integration tests | 4 test files |

### Phase 4: Safety & Enterprise 📋 Not Started

| Deliverable | Notes |
|-------------|-------|
| Safety boundaries | Ethics, dangerous actions |
| Human escalation | Request, list, respond |
| Audit trails | Full action logging |

### Phase 5: Advanced Integration 📋 Not Started

| Deliverable | Notes |
|-------------|-------|
| CI/CD integration | GitHub Actions |
| Git operations | Branch, commit, PR |
| Advanced analytics | Bottlenecks, cascade risk |

---

## 6. Non-Functional Requirements

### 6.1 Performance

- All CLI commands complete within performance targets
- Event streaming with <50ms latency
- Context tree generation for 1000 files <2s
- Memory usage <100MB for typical workloads

### 6.2 Scalability

- Support 50+ concurrent agents
- Handle 1000+ context files
- Event buffer for 100,000 events
- Horizontal scaling via storage layer

### 6.3 Reliability

- 99.9% uptime for CLI commands
- Graceful degradation on errors
- Automatic retry for transient failures
- Checkpoint/restart for long-running tasks

### 6.4 Security

- No secrets in logs
- Sandboxed file operations
- Authorization for sensitive operations
- Audit trail for all actions

### 6.5 Compatibility

- macOS, Linux, WSL
- Node.js 18+
- All major test frameworks (Jest, Vitest, pytest, etc.)
- All major linters (ESLint, Pylint, golangci-lint, etc.)

---

## 7. Risks & Mitigations

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Build errors blocking Phase 3 | High | High | Swarm fix in progress |
| TypeScript complexity | Medium | Medium | Incremental typing |
| Performance targets missed | Medium | Medium | Profile-driven optimization |
| Context management at scale | High | Medium | Design for scale from start |

### Project Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Scope creep | High | Medium | Strict PRD adherence |
| Resource constraints | High | Medium | Prioritize P0 features |
| Missing feedback documents | Medium | Low | Proceed with available docs |

---

## 8. Success Metrics

### Quantitative Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Build errors | 0 | 24 | Blocked |
| Test pass rate | 100% | 98.3% | 3 failing |
| CLI commands implemented | 50+ | 15 | 70% remaining |
| Performance targets met | 7/7 | 0/7 | Not measured |

### Qualitative Metrics

| Metric | Target |
|--------|--------|
| Developer satisfaction | >4.5/5 |
| Time-to-first-agent | <30s |
| Time-to-resolution | <5min |

---

## 9. Appendices

### A. CLI Command Reference

All commands follow the pattern: `dash <resource> <action> [--flags]`

**Available Resources:**
- `agents` - Agent lifecycle management
- `tasks` - Task management
- `context` - Context sharing
- `events` - Event streaming
- `quality` - Quality gates
- `tests` - Test execution
- `reasoning` - Reasoning traces
- `safety` - Safety boundaries
- `analytics` - Metrics and reporting

### B. Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid command/arguments |
| 3 | Agent error |
| 4 | Quality gate failed |
| 5 | Safety violation |

### C. Supported Languages

| Language | Linter | Test Framework | Coverage |
|----------|--------|----------------|----------|
| TypeScript/JavaScript | ESLint | Jest, Vitest | Istanbul |
| Python | Pylint | pytest, unittest | coverage.py |
| Go | golangci-lint | go test | gcov |

### D. Quality Criteria Dimensions

| Dimension | Weight | Threshold |
|-----------|--------|-----------|
| correctness | 0.30 | 0.90 |
| test_coverage | 0.20 | 0.85 |
| security | 0.20 | 0.95 |
| types | 0.15 | 0.95 |
| style | 0.15 | 0.80 |

---

## Interview Summary

### Self-Interview Insights (MiniMax M2.1)

**Key Decisions:**

1. **North Star Metric:** Time-to-resolution < 5 minutes
2. **Quality Guarantee:** Zero tolerance for failed quality gates
3. **Safety First:** Hard boundaries, human escalation paths
4. **CLI Philosophy:** Fast, predictable, consistent, scriptable
5. **Scalability Target:** 50+ agents, 100K events, 1K files
6. **Top Concern:** Context management at scale

**Critical Quotes:**
- "If an agent fails, I want to know why in under 5 minutes. Not 30 minutes of digging through logs."
- "Quality gates cannot be bypassed. That's non-negotiable."
- "Agents cannot modify files outside the project scope without explicit human approval."
- "Documentation as code. Every command needs examples. Every error needs a fix suggestion."

### Claude Interview Insights (User-Centric Questions)

The Claude agent asked comprehensive questions across 9 categories:

**Core Goals:**
- Primary purpose, success metrics, target scale (10/100/1000 agents?)
- What problems exist today that Dash solves?

**User Personas:**
- #1 target user, distinct user types, technical sophistication
- Enterprise vs. individual distinction

**Functional Requirements:**
- MUST-HAVE features with priority (P0, P1, P2)
- Swarm definition format (YAML/JSON, CLI flags, code)
- Communication patterns (broadcast, request-response, chain, tree)

**UX/CLI Design:**
- Command structure: `dash run --swarm config.yaml`?
- Mental model: "Like docker-compose for agents"
- Error handling: bail-first or continue-and-report?

**Edge Cases:**
- Single agent failure: pause swarm, retry, or continue?
- Agent hangs/infinite loops: max timeout?
- Conflicting outputs between agents?
- Circular dependencies/deadlocks?

**Technical Constraints:**
- Languages/runtimes, execution targets (local, cloud, k8s, serverless)
- Latency tolerance, LLM providers, resource limits

**Trade-offs:**
- Optimization priority: speed, reliability, flexibility, simplicity?
- Learning curve tolerance: 1 hour, 1 day, 1 week?

**Future Considerations:**
- Multi-user/team support with RBAC
- Observability integrations (Datadog, Prometheus)
- Plugin/extension system

**Open Concerns:**
- Biggest technical risk
- Assumptions that might be wrong

### Codex Interview Insights (Code-First Technical Questions)

The Codex agent asked deep technical questions across 9 categories:

**Code-Specific Features:**
- Language priorities (JS/TS, Python, Go, Rust)
- Sandboxed file system vs. full repo access
- Dependency management (auto-detect package managers?)
- Shell command execution with allowlist/blocklist
- Multi-repo support

**Testing Integration:**
- Test frameworks: Jest, Vitest, pytest, go test, cargo test
- Coverage formats: LCOV, Cobertura, Istanbul, Codecov JSON
- Automatic test discovery vs. explicit configuration
- Configurable coverage thresholds (e.g., fail if < 80%)

**Quality Gates:**
- Linters: ESLint, Prettier, Black, isort, golangci-lint, rustfmt, clippy
- Fail-fast vs. aggregate reporting
- Custom rule requirements for org-specific standards
- Complexity metrics enforcement (cyclomatic complexity, max function length)

**Debugging & Profiling:**
- Structured logs, stack traces, screenshots, memory/CPU profiles
- Interactive debugging support (attach debugger, breakpoints)
- Distributed tracing (correlation IDs, span hierarchies)
- Failed state persistable for replay

**CI/CD Integration:**
- Platforms: GitHub Actions, GitLab CI, Jenkins, CircleCI, Buildkite
- Dash as CI step vs. orchestrating own pipeline
- Artifact outputs: JUnit XML, SARIF, custom JSON
- Parallel job execution with matrix strategies

**Type Systems:**
- Type checkers: TypeScript (tsc), mypy/pyright, go vet, cargo check
- Blocking (fail on type error) vs. non-blocking (warnings)
- Strict mode enforcement (no `any`, implicit returns)
- Cross-file type inference for multi-file agent tasks

**Security Scanning:**
- SAST: Semgrep, SonarQube, CodeQL
- Dependency scanning: npm audit, safety, Snyk, Dependabot
- Secret detection: gitleaks, TruffleHog
- Severity thresholds, CVE database integration

**Performance:**
- Latency targets for file ops, linting, test execution
- Caching for expensive operations
- Concurrency limits (max parallel agents)
- Timeout defaults per operation type

**File Operations:**
- In-place editing vs. staging area
- Automatic backup/versioning
- Template/scaffold support
- Atomic file operations for multi-file tasks

---

**Document Version:** 2.0
**Last Updated:** 2026-02-01
**Next Review:** After Phase 2 build passes

---

# Appendix: Self-Interview Strategic Additions (2026-02-01)

## A1. Ideal vs. Current State Analysis

### From Self-Interview (Claude Code CLI on itself)

**Q1: Core Identity**
- **Ideal:** "Bridge between human intent and AI execution"
- **Current:** CLI-first agent orchestration platform
- **Gap:** Goal translation from natural language

**Q2: User Experience**
- **Ideal:** `dash "Build me a REST API"` → automatic decomposition
- **Current:** Manual task creation, explicit commands
- **Gap:** Natural language intent parsing, auto-decomposition

**Q3: Multi-Agent Orchestration**
- **Ideal:** Protocol-based communication, conflict resolution, hierarchy
- **Current:** Basic subagent spawning, ContextManager
- **Gap:** Communication protocol, handoff, conflict resolution

**Q4: Claude Code Integration**
- **Ideal:** Bidirectional sync, quality enforcement, auto-commit
- **Current:** Worktree spawning, output logging
- **Gap:** Bidirectional sync, gate enforcement

**Q5: Self-Improvement Loop**
- **Ideal:** Analyze → Propose → Implement → A/B Test → Deploy → Measure
- **Current:** Script exists, no measurement/A/B testing
- **Gap:** Outcome measurement, A/B testing, pattern detection

**Q6: CLI Experience**
- **Ideal:** Natural language, explain, visualize, debug, metrics
- **Current:** 15 commands, manual workflows
- **Gap:** 35+ commands needed, interactive mode

**Q7: Observability**
- **Ideal:** Real-time feed, analytics, search, debugging
- **Current:** Basic logging, reasoning traces
- **Gap:** Streaming feed, dashboard, analytics

**Q8: Safety**
- **Ideal:** Budget limits, approval workflows, scope boundaries
- **Current:** SafetyConfig interface exists, no enforcement
- **Gap:** Budget enforcement, approval workflows

**Q9: Learning**
- **Ideal:** Pattern library, failure taxonomy, context optimization
- **Current:** Reasoning traces stored, not analyzed
- **Gap:** Pattern extraction, analysis, recommendation

**Q10: Ecosystem**
- **Ideal:** VS Code, MCP servers, CI/CD, Grafana
- **Current:** Basic Git, Claude Code CLI
- **Gap:** IDE plugins, MCP, monitoring

---

## A2. Priority Matrix (Updated)

### P0 - Critical (Next Sprint)
| Feature | Gap | Current | Target | Effort |
|---------|-----|---------|--------|--------|
| Natural language intent | Q2 | Manual task creation | `dash "Build API"` | High |
| Auto-task decomposition | Q2 | Manual | Automatic | High |
| Fix reasoning lint errors | - | 53 lint errors | 0 errors | Low |

### P1 - High Priority (This Month)
| Feature | Gap | Current | Target | Effort |
|---------|-----|---------|--------|--------|
| Claude Code bidirectional sync | Q4 | One-way logging | Full sync | High |
| Approval workflows | Q8 | None | Human-in-loop | High |
| Real-time observability | Q7 | Basic logging | Streaming feed | Medium |
| Budget enforcement | Q8 | None | Per-task budgets | Medium |
| Reasoning module tests | - | 0 tests | 10+ tests | Medium |

### P2 - Medium Priority (This Quarter)
| Feature | Gap | Current | Target | Effort |
|---------|-----|---------|--------|--------|
| `dash explain` | Q6 | None | Reasoning display | Medium |
| Pattern library | Q9 | None | Reusable patterns | High |
| Web dashboard | Q7 | None | Visual monitoring | High |
| VS Code extension | Q10 | None | IDE integration | High |
| MCP server support | Q10 | None | MCP integration | Medium |

### P3 - Long-term Vision
| Feature | Gap | Current | Target | Effort |
|---------|-----|---------|--------|--------|
| A/B testing | Q5 | None | Compare approaches | High |
| Agent recommendation | Q9 | Manual selection | AI-powered | High |
| Full autonomous self-improvement | Q5 | Script | Autonomous | Very High |

---

## A3. Strategic Recommendations

### Immediate Actions (This Session)
1. **Fix remaining lint errors** in reasoning types (interface parameters)
2. **Add 5 reasoning module tests**
3. **Update implementation roadmap** with P0/P1 gaps

### Short-term Goals (This Week)
1. **Implement approval workflows** for Phase 4 safety
2. **Add budget tracking** to agent execution
3. **Create pattern extraction** from reasoning traces
4. **Add bidirectional Claude Code sync**

### Medium-term Objectives (This Month)
1. **Build web dashboard** for real-time monitoring
2. **Implement Claude Code bidirectional sync**
3. **Add MCP server support**
4. **Reach 50+ CLI commands**

### Quarterly Vision (Q1 2026)
1. **Pattern library** with successful agent configurations
2. **A/B testing infrastructure** for agent strategies
3. **VS Code extension** for IDE integration
4. **Full self-improvement loop** with outcome measurement

---

## A4. Updated Phase Status

| Phase | Original Status | Updated Status | Notes |
|-------|-----------------|----------------|-------|
| Phase 1: Core Foundation | Complete | ✅ Complete | 114+ tests passing |
| Phase 2: Code Features | Complete | ✅ Complete | Build: 0 errors |
| Phase 3: Reasoning | In Progress | ~80% Complete | Types, traces, CLI done |
| Phase 4: Safety | Not Started | 🔄 Starting | Approval workflows, budgets |
| Phase 5: Integration | Not Started | Pending | MCP, IDE, monitoring |

---

## A5. Vision Statement Update

> "Dash will become the nervous system of AI-assisted development - coordinating agents, enforcing quality, learning from outcomes, and continuously improving itself through recursive self-improvement powered by Claude Code CLI."

### Core Pillars (Updated)
1. **Orchestration** - Multi-agent coordination with protocols
2. **Quality** - Automated gates with human escalation
3. **Reasoning** - Full visibility into agent decision-making
4. **Safety** - Hard boundaries with approval workflows
5. **Self-Improvement** - Recursive loop with outcome measurement
6. **Ecosystem** - IDE, MCP, CI/CD integrations

---

**Appendix Added:** 2026-02-01  
**Source:** Self-Interview via Claude Code CLI (`claude -p`)  
**Interview Document:** `INTERVIEW_SELF.md`

---

## A6. Detailed Specification Interviews (2026-02-01 Evening)

Four parallel interviews launched using the Interview skill to extract deep requirements:

| Spec File | Topic | Priority | Status |
|-----------|-------|----------|--------|
| `SPEC_NLP_INTENT.md` | Natural language intent parsing | P0 | 🔄 In Progress |
| `SPEC_APPROVAL_WORKFLOW.md` | Human-in-loop approval workflows | P1 | 🔄 In Progress |
| `SPEC_BUDGET_ENFORCEMENT.md` | Token/cost budget limits | P1 | 🔄 In Progress |
| `SPEC_CLAUDE_CODE_SYNC.md` | Bidirectional Claude Code sync | P1 | 🔄 In Progress |

### Interview Questions Coverage

Each interview covers:
1. **Core Questions** — Primary goals, users, problems solved
2. **Functional Requirements** — Inputs, outputs, must-have features
3. **UX/UI Deep Dive** — User journey, CLI interaction patterns
4. **Edge Cases & Error States** — Unhappy paths, failure modes
5. **Technical Constraints** — Performance, limits, integrations
6. **Trade-offs** — Optimization priorities, sacrifices
7. **Future Considerations** — Scalability, extensions
8. **Open Concerns** — Unresolved questions, risks

### Expected Output Format

Each spec will include:
- Executive summary
- Problem statement
- User personas
- Functional requirements
- Technical specifications
- Edge case handling
- Trade-offs documented
- Implementation hints
- Open questions flagged

### Integration with Roadmap

Once specs are complete:
- `SPEC_NLP_INTENT.md` → New Phase 6 (Natural Language)
- `SPEC_APPROVAL_WORKFLOW.md` → Phase 4.4 (Approval Workflows)
- `SPEC_BUDGET_ENFORCEMENT.md` → Phase 4.5 (Budget Enforcement)
- `SPEC_CLAUDE_CODE_SYNC.md` → Phase 5.x (Integration Enhancement)

---

**Interviews Spawned:** 2026-02-01 22:28 CST  
**Expected Completion:** 5-10 minutes per interview  
**Next Action:** Review generated specs and update implementation roadmap

---

## A7. Detailed Specification Interviews Complete (2026-02-01 Evening)

All 4 parallel interviews completed with comprehensive specification documents:

| Spec File | Topic | Size | Status |
|-----------|-------|------|--------|
| `SPEC_NLP_INTENT.md` | Natural language intent parsing | 17.4KB | ✅ Complete |
| `SPEC_APPROVAL_WORKFLOW.md` | Human-in-loop approval workflows | 15.2KB | ✅ Complete |
| `SPEC_BUDGET_ENFORCEMENT.md` | Token/cost budget limits | 14.3KB | ✅ Complete |
| `SPEC_CLAUDE_CODE_SYNC.md` | Bidirectional Claude Code sync | 12.7KB | ✅ Complete |

### Spec Coverage Summary

**SPEC_NLP_INTENT.md** covers:
- Intent classification taxonomy (8 categories: build, fix, refactor, research, test, deploy, document, analyze)
- Entity extraction (target type, tech stack, operations, quality requirements)
- Multi-stage parsing algorithm with confidence scoring
- Task decomposition rules and task schema
- Agent selection and matching
- Quality gate configuration per category
- Ambiguity detection and clarifying questions
- Learning from user corrections (feedback loop)

**SPEC_APPROVAL_WORKFLOW.md** covers:
- Approval types taxonomy (file writes, deletes, external APIs, budget overruns)
- Request/response flow with CLI blocking and async notification modes
- Timeout and escalation logic (configurable per risk level)
- Quality gate integration (approval as separate gate)
- Batch approval support
- Comprehensive audit trail schema and retention policy

**SPEC_BUDGET_ENFORCEMENT.md** covers:
- Budget model (task, agent, swarm, project, daily, monthly scopes)
- Cost calculation with model pricing
- Threshold-based enforcement (50% warn, 75% warn+notify, 90% block, 100% kill)
- CLI commands for budget management and alerts
- Integration with quality gates (cost-aware gates)
- Audit trail for budget events

**SPEC_CLAUDE_CODE_SYNC.md** covers:
- Bidirectional data flow (Dash → Claude Code, Claude Code → Dash)
- Sync triggers (auto and manual)
- Data format (reasoning trace schema, quality result schema)
- Conflict resolution (last-write-wins, merge strategies)
- Security model (authentication, permissions, filtering)
- Offline handling and reconnection strategy
- Integration with Dash reasoning traces

### Integration with Roadmap

| Spec File | Maps To | Phase |
|-----------|---------|-------|
| SPEC_NLP_INTENT.md | Natural Language Interface | Phase 6 (new) |
| SPEC_APPROVAL_WORKFLOW.md | Phase 4.4 | Phase 4 |
| SPEC_BUDGET_ENFORCEMENT.md | Phase 4.5 | Phase 4 |
| SPEC_CLAUDE_CODE_SYNC.md | Claude Code Integration | Phase 5.x |

### Key Implementation Insights from Specs

1. **NLP Intent Parsing** requires:
   - Pattern-based parsing for determinism
   - Confidence thresholds to guide user interaction
   - Task decomposition into 3-10 tasks per intent
   - Agent template matching

2. **Approval Workflows** require:
   - Risk classification per operation type
   - Timeout and escalation logic
   - Integration with quality gates (run BEFORE other gates)
   - Audit trail with 90-day retention

3. **Budget Enforcement** requires:
   - Token usage tracking per agent/task
   - Cost calculation with model pricing
   - Threshold-based enforcement actions
   - Alert routing (webhook, email)

4. **Claude Code Sync** requires:
   - Context format standardization (JSON)
   - Conflict resolution strategy
   - Offline queue with retry
   - Authentication and permissions model

---

**Spec Documents Created:** 2026-02-01 22:35 CST  
**Total Spec Content:** ~60KB of detailed specifications  
**Next Step:** Update IMPLEMENTATION_ROADMAP.md with spec-derived tasks
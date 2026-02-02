# Dash Orchestrator Platform - Product Requirements Document (PRD)

**Version:** 2.0  
**Date:** 2026-02-02  
**Status:** Draft  
**Theme:** Simple yet powerful, modular yet extensible, practical yet professional

---

## 1. Executive Summary

Dash is an **agent-first orchestration platform** designed for primary models to orchestrate 10-50+ OpenClaw agents in parallel. It is **CLI/OpenTUI-first, API-native**, optimized for agent workflows rather than human click-through interfaces.

### Core Value Proposition

> "Set intent, the platform handles execution topology."

Dash transforms agent orchestration from manual session management into **ambient awareness** - orchestrators maintain a sixth sense of their swarm's pulse without constant polling.

---

## 2. Target Users

### Primary: Agent Orchestrator Models
- Daily usage: 20-50 agents orchestrated
- Need: Real-time visibility, automatic recovery, cost control
- Interface: CLI/TUI primary, API for automation

### Secondary: Human Developers (Future)
- Usage: Monitoring, debugging, high-level decisions
- Interface: TUI for power users, optional web dashboard

---

## 3. User Stories

### Story 1: Daily Orchestration
> As an orchestrator, I want to spawn 20 agents with one command and watch them complete without constant checking, so I can focus on high-level coordination.

**Acceptance Criteria:**
- `dash swarm create --task "refactor" --agents 20` succeeds
- TUI dashboard shows live progress
- I receive notifications only on failures or completion
- Aggregate results delivered automatically

### Story 2: Failure Recovery
> As an orchestrator, I want failed agents to auto-retry with different strategies before escalating to me, so I'm only interrupted for truly novel problems.

**Acceptance Criteria:**
- Failed agents retry with exponential backoff
- Auto-switch models if retries fail
- Escalate with full context and suggested fixes
- Learn from my decisions for future similar cases

### Story 3: Cost Control
> As an orchestrator, I want hard budget limits with predictive warnings, so I never get surprised by runaway costs.

**Acceptance Criteria:**
- Set swarm budget: `--budget $50`
- Warning at 75%, critical at 90%, hard stop at 100%
- Predictive: "You'll exceed budget in 3 minutes at current rate"
- Per-agent cost attribution

### Story 4: Recursive Delegation
> As an orchestrator, I want agents to spawn sub-agents safely with inherited budgets and scope, so I can delegate without micromanaging.

**Acceptance Criteria:**
- Child agents inherit parent's remaining budget
- Scope enforcement: can't touch files outside parent context
- Complete audit trail: X spawned Y spawned Z
- Circuit breakers: pause if N sub-agents fail

---

## 4. Core Features

### 4.1 Swarm Orchestration

| Feature | Priority | Description |
|---------|----------|-------------|
| Swarm Creation | P0 | One-command spawn with configurable topology |
| Auto-scaling | P1 | Start small, scale based on work discovered |
| Swarm Strategies | P1 | Parallel, map-reduce, pipeline, tree patterns |
| Self-healing | P1 | Auto-retry, failover, escalation |
| Hierarchical Control | P2 | Parent→child budget/scope inheritance |

### 4.2 OpenTUI Dashboard

| Feature | Priority | Description |
|---------|----------|-------------|
| Live Agent Grid | P0 | htop-style view of all agents |
| Event Stream | P0 | Real-time log tail |
| Command Palette | P0 | Vim-style quick actions |
| Progress Tracking | P1 | Visual completion status |
| Cost Monitoring | P1 | Token burn rate sparklines |
| Focus Mode | P2 | Full-screen single agent debug |

### 4.3 API & Integration

| Feature | Priority | Description |
|---------|----------|-------------|
| REST API | P0 | Full programmatic access |
| WebSocket Events | P0 | Real-time event streaming |
| Message Bus | P1 | Agent-to-agent pub/sub |
| CI/CD Integration | P2 | GitHub Actions, etc. |

### 4.4 Safety & Cost

| Feature | Priority | Description |
|---------|----------|-------------|
| Budget Enforcement | P0 | Hard limits with predictive warnings |
| File Sandbox | P0 | Scope enforcement per agent |
| Command Whitelist | P1 | Block dangerous operations |
| Approval Gates | P1 | Human-in-loop for critical actions |
| Complete Audit | P2 | Log of all decisions |

### 4.5 Intelligence

| Feature | Priority | Description |
|---------|----------|-------------|
| Performance Learning | P2 | "Last 5 swarms took 4min, suggest 15 agents" |
| Failure Pattern Detection | P2 | Auto-identify common failure modes |
| Model Selection | P2 | Route to best model per task type |
| Auto-tuning | P3 | Adjust retries, batch sizes based on history |

---

## 5. Non-Goals

- **Web dashboard is P2** - TUI-first, web optional later
- **No drag-and-drop** - Keyboard-first interface
- **No persistent server required** - Works standalone
- **No multi-tenancy** - Single orchestrator per instance

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Time to spawn 20 agents | < 5 seconds |
| Dashboard refresh latency | < 100ms |
| Auto-retry success rate | > 80% |
| Orchestrator interruptions | < 10% of agent count |
| Cost predictability | Within 10% of budget |

---

## 7. Release Phases

### Phase 1: Core Swarm (v2.0)
- Swarm creation/management
- OpenTUI dashboard
- Basic auto-scaling
- Budget enforcement

### Phase 2: Intelligence (v2.1)
- Self-healing with retry
- Performance learning
- Failure pattern detection
- Message bus

### Phase 3: Scale (v2.2)
- Advanced strategies (map-reduce, pipeline)
- Plugin system
- Optional web dashboard
- CI/CD integrations

---

## 8. Open Questions

1. Should we support non-OpenClaw agents (raw shell commands, etc.)?
2. What's the max swarm size we should optimize for (50, 100, 500)?
3. Do we need multi-region/agent distribution?

---

*PRD Version: 2.0*  
*Last Updated: 2026-02-02*

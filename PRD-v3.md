# Godel v3.0 Product Requirements Document

**Status:** Draft  
**Date:** 2026-02-06  
**Product Owner:** Godel Team  
**Target Release:** Q2 2026

---

## 1. Executive Summary

Godel v3.0 transforms the platform from a simple agent orchestrator into a **production-grade multi-agent work management system** by integrating proven patterns from Gas Town (git-backed persistence), Loom (server-side proxy + K8s execution), and Conductor (UI polish + simplicity).

### Key Value Propositions

1. **Never Lose Work** - Git-backed persistence survives crashes
2. **Scale Infinitely** - K8s remote execution beyond local limits  
3. **Secure by Default** - Server-side LLM proxy, keys never exposed
4. **Simple & Visual** - One-click agent spawning, kanban work board

---

## 2. User Personas

### Persona 1: Senior Developer (Alex)
- Manages 5-10 agents on complex features
- Needs work persistence across sessions
- Wants visual overview of all agent activity

**Pain Points:**
- "I lose agent context when I restart"
- "Hard to track what 10 agents are doing"
- "API keys scattered across configs"

**Needs:**
- Git-backed work persistence
- Visual agent dashboard
- Centralized credential management

### Persona 2: Tech Lead (Sarah)
- Coordinates team of developers
- Needs cost tracking and audit trails
- Wants resource limits per project

**Pain Points:**
- "No visibility into LLM spend"
- "Can't enforce resource limits"
- "No audit trail for compliance"

**Needs:**
- Server-side proxy with cost tracking
- K8s resource limits
- Audit logging

### Persona 3: Solo Founder (Mike)
- Uses agents for rapid prototyping
- Needs simple onboarding
- Wants local-first development

**Pain Points:**
- "Too complex to set up"
- "Don't want to manage K8s"
- "Need macOS and Linux support"

**Needs:**
- Simple UI with one-click actions
- Local-first with optional K8s
- Cross-platform support

---

## 3. Feature Requirements

### 3.1 Git-Backed Persistence (Beads)

**User Story:**
> As a developer, I want my agent work to persist across restarts, so I never lose context.

**Requirements:**

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| B1 | Create work units (beads) | P0 | `godel bead create "Fix bug"` creates godel-abc12 |
| B2 | Assign beads to agents | P0 | `godel bead assign godel-abc12 --agent worker-1` |
| B3 | Bundle beads into convoys | P0 | `godel convoy create "Sprint 1" godel-abc12 godel-def34` |
| B4 | Track bead status | P0 | Convoy list shows all beads and their status |
| B5 | Git integration | P0 | Each bead links to git commits |
| B6 | Survive crashes | P0 | State recovered from git on restart |

**Bead Schema:**
```typescript
interface Bead {
  id: string;              // godel-[5-char] format
  type: 'task' | 'bug' | 'feature' | 'refactor';
  title: string;
  description?: string;
  status: 'open' | 'in-progress' | 'review' | 'done';
  agent?: string;          // Assigned agent ID
  worktree?: string;       // Git worktree path
  commits: string[];       // Associated git commits
  parentBead?: string;     // For sub-tasks
  createdAt: Date;
  updatedAt: Date;
}
```

**Convoy Schema:**
```typescript
interface Convoy {
  id: string;
  name: string;
  description?: string;
  beads: string[];
  status: 'active' | 'completed' | 'archived';
  createdAt: Date;
  completedAt?: Date;
}
```

---

### 3.2 Server-Side LLM Proxy

**User Story:**
> As a tech lead, I want API keys secured server-side with cost tracking, so I can manage spend and compliance.

**Requirements:**

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| P1 | Proxy all LLM calls | P0 | No direct API calls from agents |
| P2 | Server-side key storage | P0 | Keys in env vars, never exposed to clients |
| P3 | Rate limiting | P0 | Token bucket per user/project |
| P4 | Cost tracking | P0 | Per-agent, per-convoy, per-project cost reports |
| P5 | Audit logging | P0 | All requests logged with metadata |
| P6 | Provider fallback | P1 | Auto-switch on provider failure |

**Proxy Architecture:**
```
┌─────────┐      HTTP       ┌──────────┐     Provider API     ┌──────────┐
│  CLI    │ ───────────────▶│  Server  │ ───────────────────▶ │ Anthropic│
│ Agent   │  /proxy/{prov}  │  Proxy   │                      │  OpenAI  │
│         │                 │          │                      │   etc.   │
└─────────┘ ◀─────────────  └──────────┘ ◀──────────────────  └──────────┘
                SSE stream                    SSE stream
```

**API Endpoints:**
- `POST /proxy/v1/chat/completions` - OpenAI-compatible
- `POST /proxy/v1/models` - List available models
- `GET /proxy/v1/usage` - Cost and usage reports
- `GET /proxy/v1/audit` - Audit log

---

### 3.3 K8s Remote Execution (Weaver)

**User Story:**
> As a developer, I want to run agents in K8s pods, so I can scale beyond my local machine.

**Requirements:**

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| W1 | Spawn K8s pods | P1 | `godel agent spawn --remote` creates pod |
| W2 | Resource limits | P1 | CPU/memory limits per agent |
| W3 | Health monitoring | P1 | Auto-restart unhealthy pods |
| W4 | Local fallback | P0 | Works locally without K8s |
| W5 | Multi-cluster | P2 | Deploy to multiple K8s clusters |

**Pod Spec:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: godel-agent-{id}
  labels:
    app: godel-agent
    bead: {bead-id}
spec:
  containers:
  - name: agent
    image: godel/agent:latest
    resources:
      limits:
        cpu: "2"
        memory: "4Gi"
      requests:
        cpu: "100m"
        memory: "256Mi"
```

---

### 3.4 Visual Dashboard

**User Story:**
> As a developer, I want a visual dashboard to see all agents and their work, so I can manage them easily.

**Requirements:**

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| D1 | Agent grid view | P0 | See all agents, status, current bead |
| D2 | Kanban board | P0 | Drag-and-drop bead management |
| D3 | Real-time updates | P0 | WebSocket updates for agent status |
| D4 | One-click spawn | P0 | Button to spawn new agent |
| D5 | Code review UI | P1 | Side-by-side diff for agent changes |
| D6 | Cost dashboard | P1 | Visual cost tracking |

**Dashboard Views:**

**Agent Grid:**
```
┌─────────────────────────────────────────────────────────┐
│ Agents (6 active)                    [+ Spawn Agent]    │
├─────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │worker-1 │ │worker-2 │ │worker-3 │ │reviewer │        │
│ │ 🟢 Idle │ │ 🟡 Busy │ │ 🟢 Idle │ │ 🟢 Idle │        │
│ │ No bead │ │godel-abc│ │ No bead │ │ No bead │        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Kanban Board:**
```
┌─────────────────────────────────────────────────────────┐
│ Convoy: Sprint 1                                        │
├─────────────┬─────────────┬─────────────┬───────────────┤
│ Open        │ In Progress │ Review      │ Done          │
│ (3 beads)   │ (2 beads)   │ (1 bead)    │ (5 beads)     │
├─────────────┼─────────────┼─────────────┼───────────────┤
│ godel-abc12 │ godel-def34 │ godel-ghi56 │ godel-jkl78   │
│ Fix auth    │ Implement   │ Code review │ Done          │
└─────────────┴─────────────┴─────────────┴───────────────┘
```

---

### 3.5 Cross-Platform Support

**User Story:**
> As a developer, I want Godel to work on macOS, Linux, and Windows, so I can use it on any machine.

**Requirements:**

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| X1 | macOS support | P0 | Native macOS binary |
| X2 | Linux support | P0 | Native Linux binary |
| X3 | Windows support | P1 | Native Windows binary or WSL2 |
| X4 | Docker option | P1 | Docker image for all platforms |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|--------|--------|
| Agent spawn time | < 5 seconds |
| Dashboard load time | < 2 seconds |
| Proxy latency | < 100ms overhead |
| Git operations | < 1 second |

### 4.2 Security

- API keys never exposed to agents
- All communication over TLS
- Audit log of all actions
- RBAC for team access

### 4.3 Reliability

- 99.9% uptime for proxy server
- Graceful degradation on K8s failure
- Automatic retry with exponential backoff
- State recovery from git on restart

### 4.4 Usability

- One-command installation
- Setup wizard for first-time users
- Helpful error messages
- Comprehensive documentation

---

## 5. Success Metrics

### 5.1 Adoption

- 100+ GitHub stars in first month
- 50+ active users by end of Q2
- 10+ external contributors

### 5.2 Technical

- 95%+ test coverage
- < 50ms p99 proxy latency
- 0 critical security issues

### 5.3 Business

- <$0.10 cost per agent-hour
- < 5% error rate for agent tasks

---

## 6. Timeline

### Phase 1: Foundation (Weeks 1-4)
- Git-backed persistence (beads + convoys)
- Core data models
- CLI commands

### Phase 2: Proxy (Weeks 5-8)
- Server-side LLM proxy
- Rate limiting
- Cost tracking

### Phase 3: Scale (Weeks 9-12)
- K8s remote execution
- Resource limits
- Health monitoring

### Phase 4: Polish (Weeks 13-16)
- Visual dashboard
- Kanban board
- Code review UI
- Documentation

---

## 7. Open Questions

1. Should we support non-K8s remote execution (EC2, etc.)?
2. What's the pricing model for SaaS version?
3. Do we need real-time collaboration features?
4. Should we integrate with Jira/GitHub Issues?

---

**Next Step:** Write technical specifications.md

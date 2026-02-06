# Research Synthesis: Gas Town, Loom, Conductor

**Date:** 2026-02-06  
**Status:** Strategic Analysis Complete

---

## Executive Summary

Analysis of three multi-agent orchestration systems reveals key patterns for Godel v3.0:

| Framework | Core Innovation | Best Feature | Key Weakness |
|-----------|-----------------|--------------|--------------|
| **Gas Town** | Git-backed persistence (Beads) | GUPP principle | Complexity barrier |
| **Loom** | Rust performance + K8s Weaver | Server-side LLM proxy | Research-only, no product |
| **Conductor** | UI polish + simplicity | Visual agent dashboard | macOS-only limitation |

---

## 1. Gas Town Analysis

### What to Borrow: Git-Backed Persistence

**Beads System:**
- Git-backed issue tracking (structured data in git)
- Work state survives crashes/restarts
- Bead IDs: `prefix + 5-char alphanumeric` (e.g., `gt-abc12`)
- Convoys bundle multiple beads for agent assignment

**GUPP Principle:**
- **G**it-backed: All state in git
- **U**nix-philosophy: Do one thing well
- **P**ersistent: Survive crashes
- **P**olyglot: Multiple agent runtimes

**Architecture Patterns:**
```
Mayor (AI Coordinator)
  ↓
Town Workspace (~/gt/)
  ↓
Rig (Project Container)
  ├── Crew Member (Your workspace)
  ├── Hooks (Git worktree persistence)
  └── Polecats (Ephemeral workers)
```

**Commands to Emulate:**
- `gt sling <bead-id> <project>` - Assign work to agent
- `gt convoy create "Feature X" <beads...>` - Bundle work units
- `gt convoy list` - Track progress
- `gt mayor attach` - Start coordinator session

### What to Avoid: Complexity

**Barriers in Gas Town:**
- Requires tmux for full experience
- Multiple CLI tools (gt, bd, sqlite3)
- Complex terminology (Rigs, Polecats, Convoys, Beads)
- Go-based extension requires compilation

---

## 2. Loom Analysis

### What to Borrow: Performance & Architecture

**Rust Performance Patterns:**
- 30+ crate workspace architecture
- Core abstractions in `loom-core`
- Clean trait-based extensibility
- Robust error handling with retries

**Server-Side LLM Proxy:**
```
┌─────────┐     HTTP      ┌──────────┐    Provider API    ┌──────────┐
│  CLI    │ ─────────────▶│  Server  │ ─────────────────▶ │ Anthropic│
│         │ /proxy/{provider}          │                   │  OpenAI  │
│ Client  │                 │  Proxy   │                   │   etc.   │
└─────────┘ ◀─────────────  └──────────┘ ◀────────────────  └──────────┘
                SSE stream                    SSE stream
```
- API keys never leave server
- Clients communicate through proxy
- Rate limiting at proxy layer

**Kubernetes Remote Execution (Weaver):**
- Remote execution environments via K8s pods
- Scalable agent isolation
- Resource management per agent

**Additional Patterns:**
- Thread system for conversation persistence (FTS5 search)
- Feature flags and experiments
- ABAC authorization
- Analytics with identity resolution

### What to Avoid: Research-Only Trap

**Loom's Mistake:**
- "If your name is not Geoffrey Huntley then do not use"
- No product, no support
- Experimental/unstable APIs
- No documentation guarantees

**Lesson:** Build for users, not just research.

---

## 3. Conductor Analysis

### What to Borrow: UI Polish & Simplicity

**Core Simplicity:**
- "Create parallel agents in isolated workspaces"
- "See at a glance what they're working on"
- "Review and merge their changes"

**User Experience:**
1. Add repo (clones locally)
2. Deploy agents (each gets isolated workspace)
3. Conduct (visual dashboard + review)

**Technical Simplicity:**
- Works entirely on your Mac (local-first)
- Git worktrees for isolation
- Claude Code + Codex support
- Uses existing Claude Code login (no separate auth)

### What to Avoid: Platform Lock-in

**Conductor's Limitation:**
- macOS only
- Limits market significantly
- No Linux/Windows support mentioned

**Lesson:** Support multiple platforms from day one.

---

## Strategic Integration Plan

### Phase 1: Git-Backed Persistence (From Gas Town)

**Implementation:**
```typescript
// Core abstraction: Bead
interface Bead {
  id: string;           // godel-abc12 format
  type: 'task' | 'bug' | 'feature';
  status: 'open' | 'in-progress' | 'done';
  agent?: string;       // Assigned agent
  worktree?: string;    // Git worktree path
  commits: string[];    // Git commits for this bead
  createdAt: Date;
  updatedAt: Date;
}

// Convoy: Bundle of related beads
interface Convoy {
  id: string;
  name: string;
  beads: string[];
  status: 'active' | 'completed';
}
```

**Commands:**
- `godel bead create "Fix auth bug"` → Creates godel-abc12
- `godel bead assign godel-abc12 --agent worker-1`
- `godel convoy create "Sprint 1" godel-abc12 godel-def34`
- `godel convoy status` → Shows all beads in convoy

**Storage:**
- `.godel/beads/` - JSON files per bead
- `.godel/convoys/` - Convoy definitions
- Git commits link to bead IDs in messages

### Phase 2: Server-Side LLM Proxy (From Loom)

**Implementation:**
```typescript
// Proxy server handles all LLM calls
interface LlmProxy {
  // API keys stored server-side only
  providers: Map<ProviderId, ProviderConfig>;
  
  // Rate limiting
  rateLimiter: TokenBucket;
  
  // Request/response logging
  auditLog: AuditLog;
}

// Client calls through proxy
POST /proxy/v1/chat/completions
{
  "model": "claude-sonnet-4",
  "messages": [...],
  "routing": {
    "fallback_allowed": true,
    "cost_limit": 0.50
  }
}
```

**Benefits:**
- API keys never exposed to agents
- Centralized rate limiting
- Cost tracking per agent/team
- Audit trail for compliance

### Phase 3: K8s Remote Execution (From Loom)

**Implementation:**
```typescript
interface Weaver {
  // Kubernetes pod per agent
  spawnPod(agentConfig: AgentConfig): Pod;
  
  // Resource limits
  setResourceLimits(pod: Pod, limits: Resources);
  
  // Health monitoring
  watchPodHealth(pod: Pod): Observable<HealthStatus>;
}
```

**Use Cases:**
- Scale beyond local machine
- Isolated execution environments
- GPU access for ML tasks
- Resource-intensive workloads

### Phase 4: UI Polish (From Conductor)

**Dashboard Features:**
```typescript
interface Dashboard {
  // Real-time agent grid
  agentGrid: AgentCard[];
  
  // Bead/convoy status
  workBoard: KanbanBoard;
  
  // Quick actions
  quickActions: {
    spawnAgent: () => void;
    createBead: () => void;
    reviewChanges: () => void;
  };
}
```

**Simplicity Principles:**
- One-click agent spawning
- Visual work board (kanban)
- Side-by-side code review
- No complex terminology

---

## Implementation Roadmap

### v3.0-M1: Git-Backed Persistence
- [ ] Bead data model
- [ ] Convoy bundling
- [ ] Git worktree integration
- [ ] `godel bead` commands
- [ ] `godel convoy` commands

### v3.0-M2: Server-Side Proxy
- [ ] LLM proxy server
- [ ] Provider configuration
- [ ] Rate limiting
- [ ] Cost tracking
- [ ] Audit logging

### v3.0-M3: K8s Execution
- [ ] Weaver K8s integration
- [ ] Pod lifecycle management
- [ ] Resource limits
- [ ] Remote agent spawning

### v3.0-M4: UI Dashboard
- [ ] React dashboard
- [ ] Agent grid view
- [ ] Kanban work board
- [ ] Code review interface

---

## Architecture Decisions

### 1. Polyglot Runtimes (Gas Town ✓)
**Decision:** Support Claude Code, Codex, Pi, and custom agents

**Rationale:** Users have preferences, don't lock them in

### 2. Server-Side Proxy (Loom ✓)
**Decision:** All LLM calls through server-side proxy

**Rationale:** Security, cost control, audit trail

### 3. Cross-Platform (Avoid Conductor's Mistake)
**Decision:** Support macOS, Linux, Windows from day one

**Rationale:** Maximize addressable market

### 4. Simplicity First (Conductor ✓)
**Decision:** Simple terminology, visual UI, one-click actions

**Rationale:** Lower barriers to adoption

### 5. Git-Native (Gas Town ✓)
**Decision:** All state in git, worktrees for isolation

**Rationale:** Survivability, auditability, developer familiarity

---

## Anti-Patterns to Avoid

| Don't | From | Why |
|-------|------|-----|
| Complex terminology | Gas Town | Confuses users |
| Platform lock-in | Conductor | Limits market |
| Research-only | Loom | No product value |
| Require tmux | Gas Town | Not user-friendly |
| Manual compilation for extensions | Gas Town | Friction |

---

## Next Steps

1. **Write PRD.md** - Product requirements for v3.0
2. **Write specifications.md** - Technical specifications
3. **Orchestrate agent teams** - Build M1-M4
4. **Validate with tests** - Robust test coverage

---

## References

- Gas Town: https://github.com/steveyegge/gastown
- Loom: https://github.com/ghuntley/loom
- Conductor: https://www.conductor.build/

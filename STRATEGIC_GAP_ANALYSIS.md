# Dash Orchestrator Platform - Strategic Gap Analysis

**Analysis Date:** 2026-02-02  
**PRD Version:** 2.0.0  
**SPEC Version:** 2.0  
**Implementation Status:** Phase 1 (Core Foundation) - Partially Complete

---

## Executive Summary

The Dash implementation is **approximately 60-70% complete** relative to PRD_v2_DETAILED.md and SPEC_v2.md requirements. Core infrastructure is solid, but critical user-facing features—particularly the **OpenTUI Dashboard**—remain incomplete or are simulated stubs.

### Key Findings

| Category | Status | Coverage |
|----------|--------|----------|
| **Core Infrastructure** | ✅ Strong | 85% |
| **CLI Commands** | ✅ Good | 80% |
| **Agent Lifecycle** | ✅ Good | 85% |
| **Budget/Safety** | ⚠️ Partial | 60% |
| **Dashboard/TUI** | ❌ Missing | 15% |
| **REST API** | ❌ Missing | 0% |
| **Advanced Features** | ❌ Missing | 0% |

### Critical Gaps

1. **Dashboard is Simulated** - The `dash dashboard` command outputs static text, not a real TUI
2. **No REST API Server** - Port 7373 is mentioned but not implemented
3. **No Persistent Storage** - Only in-memory storage exists (SQLite/PostgreSQL planned)
4. **File Sandbox Not Enforced** - Config exists but no actual filesystem restrictions
5. **No Predictive Cost Analysis** - Budget stops at limit but doesn't predict overruns

---

## Full Gap Analysis

### 1. Swarm Orchestration

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| `dash swarm create` | ✅ Full | All options working (--name, --task, --initial-agents, --strategy, --budget) |
| `dash swarm destroy` | ✅ Full | With --force support |
| `dash swarm scale` | ✅ Full | Up/down scaling implemented |
| `dash swarm status` | ✅ Full | JSON and table output formats |
| `dash swarm list` | ✅ Full | Active/all filter support |
| Swarm strategies | ⚠️ Partial | Parallel works; map-reduce/pipeline/tree have stub implementations |

#### ❌ MISSING

| Feature | Spec Reference | Severity | Effort |
|---------|---------------|----------|--------|
| `dash swarm report` | PRD §4.1 AC5 | **High** | Medium |
| Auto-scaling based on queue depth | SPEC §2.1 | **Medium** | High |
| Dynamic work distribution | PRD §5.2.1 | **Medium** | High |

**Details:**
- The `splitTaskIntoStages()` method in SwarmManager is a stub that just appends "(stage N)" to task names
- No actual work queue or load balancing exists

---

### 2. Agent Lifecycle

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| State machine | ✅ Full | IDLE → SPAWNING → RUNNING → COMPLETED/FAILED |
| `dash agents spawn` | ✅ Full | All options supported |
| `dash agents kill` | ✅ Full | With force option |
| `dash agents pause/resume` | ✅ Full | Working via OpenClaw integration |
| `dash agents retry` | ✅ Full | Exponential backoff implemented |
| Auto-retry | ✅ Full | 3 retries with 2^attempt * 1000ms delay |
| Model failover | ✅ Full | `retryWithAlternateModel()` implemented |

#### ⚠️ PARTIAL

| Feature | Implementation | Gap |
|---------|---------------|-----|
| `dash agents tree` | ❌ Stub only | Shows hierarchy in status but no dedicated tree view |
| `dash agents logs` | ❌ Not implemented | SPEC §6.1 command structure exists but not functional |

#### ❌ MISSING

| Feature | Spec Reference | Severity | Effort |
|---------|---------------|----------|--------|
| Escalation to orchestrator with context | PRD §4.2 AC3 | **Critical** | Medium |
| Learning from escalation decisions | PRD §4.2 AC4 | **Medium** | High |
| Circuit breaker pattern | PRD §4.4 AC4 | **Medium** | Medium |

---

### 3. Dashboard & Visibility

#### ❌ CRITICAL GAPS

| Feature | PRD Reference | Severity | Effort |
|---------|--------------|----------|--------|
| **Real OpenTUI Dashboard** | PRD §4.5, §5.2.2 | **CRITICAL** | High |
| Agent Grid with live updates | PRD §5.2.2 | **Critical** | High |
| Event Stream panel | PRD §5.2.2 | **High** | Medium |
| Budget Panel with sparklines | PRD §5.2.2 | **High** | Medium |
| Command Palette (vim-style) | PRD §4.5 AC5 | **Medium** | Medium |
| Focus Mode (single agent debug) | PRD §5.2.2 | **Medium** | Medium |
| Keyboard navigation (j/k, gg, G, /) | PRD §4.5 AC2 | **High** | Medium |

**Current State:**
The `dash dashboard` command in `/src/cli/commands/dashboard.ts` is a **simulated view** that:
- Prints static text output
- Lists agents in a simple table
- Shows "💡 This is a simulated dashboard view" message
- Has no real TUI library integration (blessed, ink, etc.)

**What Needs to Be Built:**
```bash
# Current (simulated)
$ dash dashboard
🎯 Dash Dashboard

Launching interactive dashboard...
(This is a simulated dashboard view.)

# Required (real TUI)
$ dash dashboard
┌──────────────────────────────────────────────────────┐
│ ID        STATUS    TASK              PROGRESS COST  │
│ agent-001 RUNNING   Refactor auth     ████████ $2.34 │
│ agent-002 COMPLETED Fix login         ████████ $1.89 │
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

---

### 4. Communication & API

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Message Bus | ✅ Full | Pub/sub with wildcards, filtering, persistence |
| WebSocket Events | ✅ Full | `/events/stream` endpoint with filters |
| Topic patterns | ✅ Full | `agent.*.events`, `swarm.#.broadcast` |

#### ❌ MISSING

| Feature | SPEC Reference | Severity | Effort |
|---------|---------------|----------|--------|
| **REST API Server** | SPEC §3.1 | **CRITICAL** | High |
| POST /api/swarm | SPEC §3.1 | **Critical** | Medium |
| GET /api/swarm/:id | SPEC §3.1 | **Critical** | Medium |
| DELETE /api/swarm/:id | SPEC §3.1 | **High** | Low |
| POST /api/agents | SPEC §3.1 | **High** | Medium |
| GET /api/agents/:id | SPEC §3.1 | **High** | Low |
| Agent-to-agent message bus usage | SPEC §2.4 | **Medium** | Medium |

**Current State:**
- Port 7373 is mentioned in CLI options but no HTTP server exists
- `dashboard --headless` just keeps process alive, no actual API

---

### 5. Cost & Safety

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Budget configuration | ✅ Full | Project/task/agent/swarm level |
| Token usage tracking | ✅ Full | Prompt/completion/total with cost calc |
| Threshold actions | ✅ Full | warn @ 75%, block @ 90%, kill @ 100% |
| Hard stop enforcement | ✅ Full | Swarm paused at budget exhausted |
| Per-agent attribution | ✅ Full | Cost breakdown by agent |
| Budget history/audit | ✅ Full | Full history logging |

#### ⚠️ PARTIAL

| Feature | Implementation | Gap |
|---------|---------------|-----|
| Predictive warnings | ❌ Not implemented | PRD §4.3 AC2 requires burn rate projection |
| Hierarchical budget inheritance | ⚠️ Basic | Children get budget limit but no enforcement chain |
| File sandbox | ⚠️ Config only | `fileSandbox: true` in config but no enforcement |

#### ❌ MISSING

| Feature | PRD Reference | Severity | Effort |
|---------|---------------|----------|--------|
| Predictive cost analysis | PRD §4.3 AC2 | **High** | High |
| Scope enforcement (file access) | PRD §4.4 AC2 | **Critical** | Medium |
| Command whitelist/blacklist | SPEC §2.6 | **High** | Medium |
| Dangerous pattern detection | SPEC §2.6 | **High** | Low |
| Network allowlist enforcement | SPEC §2.6 | **Medium** | Medium |
| Approval gates (human-in-loop) | PRD §4.4, SPEC §2.6 | **High** | Medium |

**Note:** Approval workflow types exist in `/src/safety/approval.ts` but aren't integrated into agent execution flow.

---

### 6. Storage

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| In-memory storage | ✅ Full | AgentStorage, TaskStorage, EventStorage with indexing |
| CRUD operations | ✅ Full | Create, read, update, delete for all entities |
| Status indexing | ✅ Full | O(1) lookups by status, swarm, parent |

#### ❌ MISSING

| Feature | SPEC Reference | Severity | Effort |
|---------|---------------|----------|--------|
| **SQLite backend** | SPEC §4.2 | **CRITICAL** | Medium |
| **PostgreSQL backend** | SPEC §4.2 | **Medium** | High |
| Persistent storage | SPEC §4.2 | **Critical** | Medium |
| Data migrations | SPEC §4.2 | **Low** | Medium |

**Current State:**
All data is lost on process exit. Storage interface exists but only memory implementation is provided.

---

### 7. OpenClaw Integration

#### ✅ IMPLEMENTED

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Session spawning | ✅ Full | `sessionsSpawn()` with all options |
| Session lifecycle mapping | ✅ Full | pause/resume/kill mapped to OpenClaw |
| Bidirectional ID mapping | ✅ Full | agentId ↔ sessionId |
| Token usage events | ✅ Full | Published to message bus |
| Mock client for testing | ✅ Full | Full simulation for testing |

#### ⚠️ PARTIAL

| Feature | Implementation | Gap |
|---------|---------------|-----|
| Real OpenClaw client | ❌ Not implemented | Only MockOpenClawClient exists |
| Session log streaming | ⚠️ Basic | `sessionLogs()` returns mock data |

---

### 8. Intelligence & Learning

#### ❌ MISSING (All Features)

| Feature | PRD Reference | Severity | Effort |
|---------|---------------|----------|--------|
| **Self-healing** (beyond retry) | PRD §5.1 | **High** | High |
| **Performance learning** | PRD §5.1 | **Medium** | High |
| **Failure pattern detection** | PRD §5.1 | **Medium** | High |
| **Predictive scaling** | PRD §5.1 | **Low** | High |
| Learning from escalation decisions | PRD §4.2 AC4 | **Medium** | High |

---

### 9. Configuration

#### ⚠️ PARTIAL

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Config file structure | ⚠️ Documented | SPEC §6.1 shows YAML structure but no loader |
| Environment variables | ⚠️ Partial | Some checks exist but not comprehensive |
| Config CLI commands | ❌ Not implemented | `dash config get/set/edit` missing |

---

## Prioritized Fix Roadmap

### Phase 1: Critical (Weeks 1-2)

**Goal:** Make the platform actually usable for basic workflows

| Priority | Feature | Files to Modify | Effort |
|----------|---------|-----------------|--------|
| P0 | **Real TUI Dashboard** | `/src/cli/commands/dashboard.ts` | 3-4 days |
| | - Integrate blessed or ink | Add dependency | |
| | - Implement Agent Grid | New components | |
| | - Implement keyboard nav | Event handling | |
| P0 | **SQLite Storage** | `/src/storage/` | 2-3 days |
| | - SQLite adapter | New file | |
| | - Migration system | New file | |
| P0 | **REST API Server** | `/src/api/` | 2-3 days |
| | - Express/Fastify setup | New directory | |
| | - All SPEC endpoints | Route handlers | |

### Phase 2: High Priority (Weeks 3-4)

**Goal:** Complete safety and cost controls

| Priority | Feature | Files to Modify | Effort |
|----------|---------|-----------------|--------|
| P1 | **Predictive Budget Warnings** | `/src/safety/budget.ts` | 1-2 days |
| P1 | **File Sandbox Enforcement** | `/src/safety/` | 2-3 days |
| | - Filesystem wrapper | New file | |
| | - Scope validation | Safety middleware | |
| P1 | **Command Whitelist** | `/src/safety/` | 1-2 days |
| P1 | **Approval Gate Integration** | `/src/cli/commands/approve.ts` | 2 days |
| | - Wire into agent execution | Lifecycle hooks | |

### Phase 3: Medium Priority (Weeks 5-6)

**Goal:** Polish and advanced features

| Priority | Feature | Files to Modify | Effort |
|----------|---------|-----------------|--------|
| P2 | **Complete Swarm Strategies** | `/src/core/swarm.ts` | 2-3 days |
| | - Real map-reduce | Strategy implementation | |
| | - Real pipeline | Strategy implementation | |
| | - Real tree | Strategy implementation | |
| P2 | **Escalation with Context** | `/src/core/lifecycle.ts` | 1-2 days |
| P2 | **Agent Tree Command** | `/src/cli/commands/agents.ts` | 1 day |
| P2 | **Agent Logs Command** | `/src/cli/commands/agents.ts` | 1 day |
| P2 | **PostgreSQL Backend** | `/src/storage/` | 2-3 days |

### Phase 4: Low Priority (Weeks 7-8)

**Goal:** Intelligence and optimization

| Priority | Feature | Effort |
|----------|---------|--------|
| P3 | Self-healing beyond retry | 3-4 days |
| P3 | Performance learning | 4-5 days |
| P3 | Failure pattern detection | 3-4 days |
| P3 | Config CLI commands | 1-2 days |

---

## Risk Assessment

### Critical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **No persistent storage** | Data loss on crash | High | Implement SQLite in Week 1 |
| **Simulated dashboard** | Core value prop missing | High | Prioritize real TUI |
| **No file sandbox** | Security vulnerability | Medium | Implement path validation |

### Technical Debt

| Area | Debt Level | Impact |
|------|-----------|--------|
| MockOpenClawClient | High | Must implement real client before production |
| In-memory storage only | High | Cannot persist state |
| Simulated dashboard | Critical | Users cannot monitor swarms effectively |
| Missing REST API | Medium | Limits CI/CD integration |

### Performance Risks

| Risk | Current State | Target |
|------|--------------|--------|
| Dashboard refresh | N/A (simulated) | <100ms for 50 agents |
| Event latency | ~10ms | <50ms end-to-end |
| Swarm creation | <1s | <5s for 20 agents |
| Memory usage | Unknown | <200MB |

---

## Test Coverage Analysis

### ✅ Well Tested

| Module | Coverage | Test Files |
|--------|----------|------------|
| MessageBus | High | `/tests/bus.test.ts` |
| OpenClaw Integration | High | `/tests/integration/openclaw-integration.test.ts` |
| Models | Medium | `/tests/models/*.test.ts` |

### ❌ Missing Tests

| Module | Needed Tests |
|--------|-------------|
| CLI Commands | Integration tests for all commands |
| SwarmManager | Strategy-specific tests |
| Budget enforcement | Threshold trigger tests |
| Dashboard | UI/UX tests (once real TUI exists) |
| REST API | Endpoint tests |
| Safety guards | File sandbox, command whitelist tests |

---

## Recommendations

### Immediate Actions (This Week)

1. **Implement SQLite Storage** - Critical for data persistence
2. **Choose and Integrate TUI Library** - blessed, ink, or react-blessed
3. **Create Real Dashboard** - The simulated version is blocking user adoption
4. **Add File Sandbox** - Security requirement before any real usage

### Short-term (Next 2 Weeks)

1. **Build REST API** - Required for CI/CD integration
2. **Implement Predictive Budget Warnings** - Core differentiator from competitors
3. **Complete Swarm Strategies** - Map-reduce and pipeline are stubs
4. **Wire Approval Gates** - Human-in-loop for critical operations

### Long-term (Month 2+)

1. **Self-Healing Intelligence** - Learn from failures
2. **Performance Optimization** - Historical analysis
3. **Plugin Architecture** - Enable community extensions
4. **Web Dashboard** - For human operators (secondary to TUI)

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Source Files | ~60 |
| Lines of TypeScript | ~12,000 |
| Test Files | 8 |
| Implemented Features | ~35 |
| Missing Features | ~25 |
| Stub Implementations | 5 |

### Effort Estimates

| Phase | Duration | FTE Developers |
|-------|----------|----------------|
| Phase 1 (Critical) | 2 weeks | 2 |
| Phase 2 (High) | 2 weeks | 2 |
| Phase 3 (Medium) | 2 weeks | 1-2 |
| Phase 4 (Low) | 2 weeks | 1 |
| **Total to PRD Compliance** | **8 weeks** | **2 FTE** |

---

## Conclusion

The Dash platform has a **solid foundation** with well-architected core components:
- Message bus with pub/sub and filtering
- Agent lifecycle management with retry/failover
- Budget tracking with thresholds
- OpenClaw integration pattern

However, **critical user-facing features are missing or simulated**:
- The dashboard is the primary interface but doesn't exist
- No persistent storage means data loss on restart
- No REST API limits integration options
- File sandbox is configured but not enforced

**Recommendation:** Focus the next 2-4 weeks on Phase 1 (Critical) items. The platform cannot be considered "working" without a real dashboard and persistent storage. Once these are in place, the remaining features can be added incrementally.

The codebase is well-structured and the existing tests show good patterns. With focused effort on the gaps identified above, Dash can achieve PRD compliance within 8 weeks with 2 full-time developers.

---

*Report Generated: 2026-02-02*  
*Analyst: Strategic Gap Analysis Subagent*  
*Files Analyzed: PRD_v2_DETAILED.md, SPEC_v2.md, 60+ source files*

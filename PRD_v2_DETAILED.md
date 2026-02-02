# Dash Orchestrator Platform v2.0
# Product Requirements Document (PRD)

**Version:** 2.0.0  
**Date:** 2026-02-02  
**Status:** Draft - Ready for Implementation  
**Theme:** Simple yet powerful, modular yet extensible, practical yet professional

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Target Users & Personas](#3-target-users--personas)
4. [User Stories & Acceptance Criteria](#4-user-stories--acceptance-criteria)
5. [Core Features](#5-core-features)
6. [User Experience Design](#6-user-experience-design)
7. [Non-Goals & Out of Scope](#7-non-goals--out-of-scope)
8. [Success Metrics & KPIs](#8-success-metrics--kpis)
9. [Release Roadmap](#9-release-roadmap)
10. [Open Questions](#10-open-questions)

---

## 1. Executive Summary

### 1.1 What is Dash?

Dash is an **agent-first orchestration platform** designed specifically for AI primary models to orchestrate 10-50+ OpenClaw agents in parallel. Unlike traditional workflow tools designed for humans clicking through web interfaces, Dash is **CLI/OpenTUI-first and API-native**, optimized for the way agents actually work.

### 1.2 Core Value Proposition

> "Set intent, the platform handles execution topology."

Dash transforms agent orchestration from manual session management (spawning agents, checking completion, aggregating results) into **ambient awareness** — the orchestrator maintains a "sixth sense" of their swarm's pulse without constant polling or cognitive overhead.

### 1.3 Key Differentiators

| Aspect | Traditional Tools | Dash |
|--------|------------------|------|
| **Interface** | Web dashboards, click-heavy | CLI/TUI, keyboard-driven |
| **User** | Human operators | AI orchestrator models |
| **Latency** | 100-500ms HTTP round trips | <10ms local function calls |
| **Scaling** | Manual instance management | Auto-scaling based on work |
| **Recovery** | Manual failure triage | Self-healing with escalation |
| **Cost Control** | Post-hoc billing surprises | Predictive hard stops |

### 1.4 Why This Matters Now

As AI systems scale from single agents to swarms of 20-50+ agents, the coordination overhead becomes the bottleneck. Current solutions require orchestrators to:
- Remember what each agent is doing across multiple sessions
- Check completion status individually
- Aggregate results manually
- Handle failures reactively

Dash solves this by providing **hierarchical autonomy with progressive disclosure** — agents self-coordinate, self-heal, and only escalate when truly necessary.

---

## 2. Product Vision

### 2.1 Vision Statement

> Dash enables AI orchestrators to manage agent swarms with the same ease that a senior developer manages a team — set direction, delegate tasks, monitor progress at a glance, and intervene only when necessary.

### 2.2 Design Principles

#### Simple Yet Powerful
- **Simple**: One command to spawn a swarm (`dash swarm create --agents 20`)
- **Powerful**: Each agent self-heals, auto-retries, escalates intelligently
- **The magic**: Intent-driven orchestration — state the goal, the platform handles execution topology

**Example:**
```bash
# Simple input
 dash swarm create --task "refactor codebase" --agents 20 --strategy map-reduce

# Powerful result: Platform handles
# - Work distribution across 20 agents
# - Parallel execution where possible
# - Automatic aggregation of results
# - Retry on failure with backoff
# - Escalation if retries exhausted
```

#### Modular Yet Extensible
- **Modular**: Use only what you need — core is minimal, features are additive
- **Extensible**: Plugin architecture for custom swarm strategies, agent types, integrations

**Example:**
```javascript
// Use only core
import { Swarm, Agent } from '@dash/core'

// Add budget enforcement
import { BudgetEnforcement } from '@dash/budget'

// Add custom strategy
import { MyCustomStrategy } from './my-strategy'

// All compose together
const swarm = new Swarm({
  plugins: [BudgetEnforcement, MyCustomStrategy]
})
```

#### Practical Yet Professional
- **Practical**: Works immediately with existing OpenClaw infrastructure
- **Professional**: Enterprise-grade audit trails, security guardrails, cost controls

**Practical:** Zero-config setup, uses existing session spawning  
**Professional:** Complete audit logs, SOC-2 ready security, predictable costs

### 2.3 Target Scale

- **Immediate:** 10-20 agents per swarm
- **Short-term:** 50 agents per swarm
- **Long-term:** 100+ agents with intelligent grouping/collapsing

---

## 3. Target Users & Personas

### 3.1 Primary User: Agent Orchestrator Models

**Name:** Orchestrator-X (Claude, Kimi, GPT-4 class models)  
**Daily Usage:** 20-50 agents orchestrated across multiple projects  
**Technical Proficiency:** Expert — comfortable with CLI, APIs, complex workflows  
**Pain Points:**
- Context fragmentation across sessions
- Manual polling for completion
- Cognitive overhead of tracking agent states
- Surprise cost overruns
- Silent failures

**Needs:**
- Real-time visibility without constant checking
- Automatic recovery from failures
- Predictable costs with hard limits
- Clear escalation paths
- Keyboard-driven efficiency

**Quote:** *"I want to spawn 20 agents, see them working in my peripheral vision, and only be interrupted when something truly needs my attention."*

### 3.2 Secondary User: Human Developer (Future)

**Name:** Senior Engineer reviewing AI work  
**Usage:** Monitoring, debugging, high-level decisions  
**Interface:** TUI for power users, optional web dashboard for casual review  
**Needs:**
- Understand what the AI swarm did
- Debug failures when they occur
- Adjust high-level parameters
- Audit trails for compliance

### 3.3 Tertiary User: CI/CD Systems

**Usage:** Automated pipeline integration  
**Interface:** REST API exclusively  
**Needs:**
- Programmatic swarm creation
- Webhook notifications
- Exit codes for pipeline control
- Cost attribution per build

---

## 4. User Stories & Acceptance Criteria

### Story 1: Daily Orchestration with Ambient Awareness

> **As an** orchestrator model,  
> **I want** to spawn 20 agents with one command and watch them complete without constant checking,  
> **So that** I can focus on high-level coordination instead of session management.

#### Acceptance Criteria

**AC1: One-Command Swarm Creation**
```bash
Given I have the dash CLI installed
When I run: dash swarm create --task "refactor authentication" --agents 20
Then a swarm is created with 20 agents
And each agent receives the task context
And I see confirmation: "Swarm 'swarm-abc123' created with 20 agents"
```

**AC2: Live Dashboard Visibility**
```bash
Given a swarm is running
When I run: dash dashboard
Then I see a live TUI with:
  - Agent grid showing all 20 agents
  - Status indicators (running/paused/failed/completed)
  - Progress bars for each agent
  - Aggregate metrics (tokens used, cost, completion %)
And the dashboard refreshes automatically every 1 second
```

**AC3: Progressive Disclosure**
```bash
Given the dashboard is showing
When I press 'j' to navigate to an agent
And press 'Enter' to focus
Then I see detailed view:
  - Full task description
  - Current reasoning/trace
  - Token usage breakdown
  - Recent log output
And I can press 'q' to return to summary view
```

**AC4: Minimal Interruptions**
```bash
Given a swarm is running
When 15 agents complete successfully
Then I receive no notifications (silent success)

When 3 agents fail
Then I receive a batched notification:
  "3 agents failed in swarm 'swarm-abc123'. Auto-retry in progress."

When 2 agents fail after max retries
Then I receive an escalation:
  "2 agents need attention. Suggested actions: [Retry with different model] [Kill] [Debug]"
```

**AC5: Aggregate Results**
```bash
Given all agents have completed
When I run: dash swarm report swarm-abc123
Then I see:
  - Summary: "20 agents: 18 success, 2 failed"
  - Total tokens: 45,230
  - Total cost: $2.34
  - Duration: 4m 32s
  - Failed agents with error details
  - Suggested follow-up actions
```

---

### Story 2: Intelligent Failure Recovery

> **As an** orchestrator model,  
> **I want** failed agents to auto-retry with different strategies before escalating to me,  
> **So that** I'm only interrupted for truly novel problems, not transient failures.

#### Acceptance Criteria

**AC1: Automatic Retry with Backoff**
```typescript
Given an agent fails with a transient error (network timeout)
When the failure is detected
Then the platform:
  1. Waits 2^attempt * 1000ms (exponential backoff)
  2. Retries the same task
  3. Repeats up to 3 times
  4. Logs each retry attempt

After 3 retries:
  If still failing, proceed to model failover
```

**AC2: Model Failover**
```typescript
Given an agent fails after 3 retries with kimi-k2.5
When the retry limit is reached
Then the platform:
  1. Spawns a new agent with claude-sonnet-4-5
  2. Preserves the original task context
  3. Logs: "Failover: kimi-k2.5 → claude-sonnet-4-5"
  4. Tracks both attempts in the agent history

If the failover succeeds:
  Then the agent continues as normal
  
If the failover also fails:
  Then escalate to orchestrator
```

**AC3: Smart Escalation with Context**
```typescript
Given an agent has exhausted all recovery options
When escalation occurs
Then I receive a notification with:
  - Agent ID and swarm context
  - Full error logs (last 100 lines)
  - Attempted recovery actions:
    ✓ Retry 1: 2s delay, failed: network timeout
    ✓ Retry 2: 4s delay, failed: network timeout  
    ✓ Retry 3: 8s delay, failed: network timeout
    ✓ Model failover: kimi-k2.5 → claude-sonnet-4-5, failed: same error
  - Suggested actions based on error pattern:
    - "Network errors to api.openai.com. Check connectivity?"
    - "Retry with longer timeout?"
    - "Split task into smaller chunks?"
```

**AC4: Learning from Decisions**
```typescript
Given I've handled 5 similar network timeout escalations
When the 6th occurs with the same pattern
Then the platform suggests:
  "Similar to 5 previous cases where you chose:
   - 3x: Retry with longer timeout (success rate: 100%)
   - 2x: Split task (success rate: 50%)
   Suggested: Retry with longer timeout"

If I choose the suggestion:
  Then it auto-applies and learns
```

---

### Story 3: Predictive Cost Control

> **As an** orchestrator model,  
> **I want** hard budget limits with predictive warnings,  
**So that** I never get surprised by runaway costs.

#### Acceptance Criteria

**AC1: Budget Setting**
```bash
Given I'm creating a swarm
When I run: dash swarm create --budget $50 --agents 20
Then the budget is allocated:
  - Swarm total: $50
  - Per-agent default: $2.50 (5% each)
  - Reserve: $30 (60% for scaling/overruns)

And I can override per-agent:
  dash swarm create --budget $50 --agent-budgets "agent-1:10,agent-2:5"
```

**AC2: Predictive Warnings**
```typescript
Given a swarm is running with $50 budget
When current burn rate is $15/min
And 5 minutes have elapsed with $15 spent
Then the platform calculates:
  "At current rate: $15/min × remaining work (est. 10 min) = $150 needed
   Budget: $50
   Projected overrun: $100 in ~3 minutes"

And displays a warning:
  ⚠️  BUDGET WARNING: Projected overrun in 3 minutes
      Current: $15 / $50 (30%)
      Projected need: $150
      Suggestions:
      - Reduce agent count from 20 to 7
      - Use cheaper model (kimi-k2 → claude-haiku)
      - Split work across multiple swarms
```

**AC3: Hard Stop Enforcement**
```typescript
Given a swarm with $50 budget
When spending reaches $50 (100%)
Then the platform:
  1. Immediately pauses all running agents
  2. Sends notification: "Budget exhausted. Swarm paused."
  3. Provides options:
     - [Approve $10 extension] → Resume with new budget
     - [Kill remaining] → Complete partial results
     - [Review and adjust] → Enter debugging mode

And no additional costs accrue while paused
```

**AC4: Per-Agent Attribution**
```bash
Given a swarm has completed
When I run: dash swarm costs swarm-abc123
Then I see:
  SWARM: swarm-abc123 (Budget: $50)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  agent-001  $12.34  24,500 tokens  [top consumer]
  agent-002   $8.92  18,200 tokens
  agent-003   $2.10   4,500 tokens
  ...
  agent-020   $1.23   2,800 tokens
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TOTAL      $47.12  98,500 tokens
  REMAINING   $2.88
```

---

### Story 4: Safe Recursive Delegation

> **As an** orchestrator model,  
> **I want** agents to spawn sub-agents safely with inherited budgets and scope,  
> **So that** I can delegate without micromanaging.

#### Acceptance Criteria

**AC1: Hierarchical Budget Inheritance**
```typescript
Given Parent Agent has $10 budget remaining
When Parent spawns Child Agent
Then Child inherits:
  - Budget: $3 (30% of parent's remaining)
  - Scope: Same file context as parent
  - Constraints: Same safety rules

When Child spawns Grandchild
Then Grandchild inherits:
  - Budget: $0.90 (30% of child's $3)
  - Scope: Subset of child's context

And the platform tracks:
  Parent (agent-1) $10
  └── Child (agent-1.1) $3
      └── Grandchild (agent-1.1.1) $0.90
```

**AC2: Scope Enforcement**
```typescript
Given Parent Agent has context: /project/src/auth/
When Parent spawns Child with same context
Then Child CAN read/write:
  - /project/src/auth/login.ts
  - /project/src/auth/oauth.ts

When Child tries to access:
  - /project/src/payments/ (outside scope)
Then access is BLOCKED with error:
  "Scope violation: Attempted access to /project/src/payments/
   Allowed scope: /project/src/auth/**"
```

**AC3: Complete Audit Trail**
```bash
Given a recursive delegation occurred
When I run: dash agent tree agent-1
Then I see:
  agent-1 (root) [COMPLETED]
  ├── Task: "Refactor authentication"
  ├── Budget: $10 → $7.12 spent
  ├── agent-1.1 [COMPLETED]
  │   ├── Task: "Refactor login.ts"
  │   ├── Budget: $3 → $2.10 spent
  │   └── agent-1.1.1 [FAILED]
  │       ├── Task: "Fix password validation"
  │       ├── Budget: $0.90 → $0.85 spent
  │       └── Error: "Timeout after 3 retries"
  └── agent-1.2 [RUNNING]
      ├── Task: "Refactor oauth.ts"
      └── Budget: $3 → $1.20 spent so far
```

**AC4: Circuit Breakers**
```typescript
Given Parent Agent has spawned 5 sub-agents
When 3 sub-agents fail
Then the platform:
  1. Pauses any additional sub-agent spawning
  2. Notifies Parent: "Circuit breaker triggered: 3/5 sub-agents failed"
  3. Suggests: "Review failures before continuing"
  4. Requires explicit: "circuit-breaker override" to continue

And tracks the failure pattern for learning
```

---

### Story 5: Keyboard-First Dashboard Navigation

> **As an** orchestrator model,  
> **I want** a TUI dashboard optimized for keyboard navigation,  
> **So that** I can monitor and control swarms without leaving the terminal or using a mouse.

#### Acceptance Criteria

**AC1: Launch Dashboard**
```bash
Given dash is installed
When I run: dash dashboard
Then a TUI opens with:
  - Full-screen terminal interface
  - No mouse required
  - Immediate display of any active swarms
  - Help hint at bottom: "Press ? for help"
```

**AC2: Agent Grid Navigation**
```
Given the dashboard is showing the agent grid
When I press:
  'j' → cursor moves down to next agent
  'k' → cursor moves up to previous agent
  'gg' → jump to top of list
  'G' → jump to bottom of list
  '/search' → filter agents by name/status
  'n' → next search result
  'N' → previous search result
Then the cursor moves accordingly
And the selected agent is highlighted
```

**AC3: Agent Actions**
```
Given I've selected an agent
When I press:
  'Enter' → open agent detail view
  'Space' → pause/resume agent
  'x' → kill agent (with confirmation)
  'r' → retry failed agent
  'l' → view agent logs
Then the action executes immediately
And the grid updates to reflect changes
```

**AC4: Panel Navigation**
```
Given the dashboard has multiple panels
When I press:
  'Tab' → cycle between panels (Grid → Events → Budget)
  '1' → jump to Agent Grid
  '2' → jump to Event Stream
  '3' → jump to Budget Panel
  '0' → show all panels (default layout)
Then focus switches to the selected panel
```

**AC5: Command Palette**
```
Given I'm in the dashboard
When I press ':' (colon)
Then a command palette appears at bottom:
  :spawn 5 agents for "testing"
  :kill swarm-abc123
  :budget status
  :help

And I can:
  - Type commands with tab completion
  - See command history with up/down arrows
  - Execute with Enter
  - Cancel with Escape
```

**AC6: Real-Time Updates**
```
Given I'm watching the dashboard
When an agent completes
Then its status changes in real-time:
  - Status column updates: RUNNING → COMPLETED
  - Progress bar fills to 100%
  - Color changes: yellow → green
  - A brief notification appears: "agent-007 completed"

And the updates occur without requiring screen refresh
```

---

## 5. Core Features

### 5.1 Feature Matrix

| Feature | Priority | Description | Effort |
|---------|----------|-------------|--------|
| **Swarm Orchestration** | | | |
| Swarm Creation/Destruction | P0 | One-command spawn with topology config | M |
| Agent Lifecycle Management | P0 | Spawn, pause, resume, kill, retry | M |
| Auto-Scaling | P1 | Dynamic scaling based on queue/work | L |
| Swarm Strategies | P1 | Parallel, map-reduce, pipeline, tree | L |
| Hierarchical Delegation | P2 | Parent→child agent relationships | M |
| **Dashboard & Visibility** | | | |
| OpenTUI Dashboard | P0 | Real-time terminal dashboard | L |
| Agent Grid (htop-style) | P0 | Live status grid with progress | M |
| Event Stream | P0 | Real-time log tail | M |
| Budget Panel | P1 | Cost tracking with sparklines | M |
| Command Palette | P1 | Fuzzy search quick actions | M |
| Focus Mode | P2 | Full-screen single agent debug | S |
| **Communication** | | | |
| Message Bus | P1 | Pub/sub agent-to-agent messaging | M |
| WebSocket Events | P1 | Real-time event streaming | M |
| REST API | P0 | Full programmatic access | M |
| **Cost & Safety** | | | |
| Budget Enforcement | P0 | Hard limits with predictive warnings | M |
| Hierarchical Budgets | P1 | Parent→child budget inheritance | M |
| File Sandbox | P0 | Scope enforcement per agent | M |
| Command Whitelist | P1 | Block dangerous patterns | M |
| Approval Gates | P1 | Human-in-loop for critical actions | M |
| **Intelligence** | | | |
| Self-Healing | P1 | Auto-retry with failover | M |
| Performance Learning | P2 | Historical optimization suggestions | L |
| Failure Pattern Detection | P2 | Auto-identify common issues | L |
| Predictive Scaling | P3 | Suggest optimal agent counts | L |

### 5.2 Feature Details

#### 5.2.1 Swarm Strategies

**Parallel (Default)**
```
All agents work independently on similar tasks
Best for: Embarrassingly parallel work (linting, testing)
```

**Map-Reduce**
```
Map: Agents process chunks independently
Reduce: Results aggregated by a coordinator agent
Best for: Large dataset processing, distributed analysis
```

**Pipeline**
```
Agent A → Agent B → Agent C
Each stage passes output to next
Best for: Sequential processing with handoffs
```

**Tree**
```
       Root Agent
       /    |    \
  Agent1  Agent2  Agent3
   /  \     |      /
 A1   A2   A3   A4
Best for: Hierarchical decomposition
```

#### 5.2.2 OpenTUI Dashboard Panels

**Agent Grid Panel**
```
┌──────────────────────────────────────────────────────┐
│ ID        STATUS    TASK              PROGRESS COST  │
│ agent-001 RUNNING   Refactor auth     ████████ $2.34 │
│ agent-002 COMPLETED Fix login         ████████ $1.89 │
│ agent-003 PAUSED    OAuth flow        ████░░░░ $0.92 │
│ agent-004 FAILED    Token validation  ░░░░░░░░ $0.45 │
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

**Event Stream Panel**
```
┌──────────────────────────────────────────────────────┐
│ [14:32:01] agent-002: Completed task (3m 12s)       │
│ [14:32:05] agent-004: Failed - timeout              │
│ [14:32:05] agent-004: Retrying (attempt 2/3)        │
│ [14:32:45] agent-001: Progress 75%                  │
│ [14:33:02] swarm-abc: Budget warning - 75% used     │
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

**Budget Panel**
```
┌──────────────────────────────────────────────────────┐
│ BUDGET: $47.12 / $50.00 (94%)                       │
│ ████████████████████████████████████████████░░░░    │
│                                                      │
│ Burn Rate: $12/min    Trend: ↑ Increasing           │
│ Projected: Depleted in 14 seconds                   │
│                                                      │
│ ⚠️  WARNING: Approaching limit                      │
└──────────────────────────────────────────────────────┘
```

---

## 6. User Experience Design

### 6.1 Command Structure

```
dash
├── swarm
│   ├── create    Create new swarm
│   ├── destroy   Terminate swarm
│   ├── scale     Adjust agent count
│   ├── status    Show swarm status
│   ├── list      List all swarms
│   └── report    Generate completion report
├── agents
│   ├── spawn     Spawn single agent
│   ├── kill      Kill agent
│   ├── pause     Pause agent
│   ├── resume    Resume agent
│   ├── retry     Retry failed agent
│   ├── logs      View agent logs
│   └── tree      Show agent hierarchy
├── dashboard     Launch TUI dashboard
├── events
│   ├── stream    Stream real-time events
│   ├── list      List historical events
│   └── export    Export events to file
├── budget
│   ├── status    Show budget status
│   ├── set       Configure budget
│   └── history   Show spending history
├── config
│   ├── get       Get config value
│   ├── set       Set config value
│   └── edit      Open config in editor
└── api
    ├── start     Start API server
    └── status    Check API status
```

### 6.2 Error Messages

**Good Error (Clear + Actionable):**
```
❌ ERROR: Swarm creation failed

Reason: Budget limit exceeded
  Requested: $100
  Available: $50 (current account balance)

Suggested actions:
  1. Reduce agent count: dash swarm create --agents 10 --budget 50
  2. Request increase: dash account request-budget-increase
  3. Check usage: dash budget history
```

**Bad Error (Vague):**
```
Error: Something went wrong
```

### 6.3 Success Messages

**Concise (for scripted use):**
```
Swarm swarm-abc123 created with 20 agents
```

**Verbose (for interactive use):**
```
✅ Swarm Created Successfully

Swarm ID: swarm-abc123
Agents: 20
Strategy: parallel
Budget: $50.00
Status: RUNNING

Dashboard: dash dashboard --swarm swarm-abc123
```

---

## 7. Non-Goals & Out of Scope

### Explicitly Out of Scope for v2.0

| Item | Reason | Future Consideration |
|------|--------|---------------------|
| **Web Dashboard (primary)** | TUI-first philosophy | P2 - Optional web view for humans |
| **Multi-tenancy** | Single orchestrator per instance | P3 - Enterprise feature |
| **Persistent Server** | Should work standalone | P2 - Optional hosted service |
| **Drag-and-drop Interface** | Keyboard-first design | Never - Against core philosophy |
| **GUI Application** | CLI/TUI only | Never - Use web dashboard instead |
| **Non-OpenClaw Agents** | Scope focus | P3 - Generic agent support |
| **Multi-region Distribution** | Complexity | P3 - Global scaling feature |
| **Machine Learning Training** | Scope creep | Never - Use other tools |

### Why These Are Excluded

- **Web-first approach** contradicts "CLI/TUI-first, API-native" principle
- **Multi-tenancy** adds complexity for a single-user tool
- **GUI** would require Electron or similar, bloating the tool
- **Non-OpenClaw agents** would dilute focus and integration depth

---

## 8. Success Metrics & KPIs

### 8.1 Performance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Swarm Creation (20 agents) | < 5 seconds | Time from command to confirmation |
| Dashboard Refresh Latency | < 100ms | Time to update display with 50 agents |
| Event Latency (end-to-end) | < 50ms | Agent event → dashboard display |
| Memory Usage | < 200MB | Dashboard + API server combined |
| Max Agents per Swarm | 100 | Tested performance limit |
| Max Concurrent Swarms | 10 | Tested performance limit |

### 8.2 Usability Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to First Swarm | < 2 minutes | Install → create swarm |
| Command Discovery | < 30 seconds | Find needed command |
| Dashboard Navigation | < 1 second | Switch between panels |
| Error Recovery | < 3 attempts | User successfully recovers |

### 8.3 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auto-retry Success Rate | > 80% | Failures resolved without escalation |
| Budget Accuracy | ±10% | Predicted vs actual costs |
| Escalation Rate | < 10% | % of agents needing human intervention |
| Silent Failure Rate | 0% | Failures without notification |

---

## 9. Release Roadmap

### Phase 1: Core Foundation (v2.0.0) - Weeks 1-4

**Theme:** "Make it work"

- [ ] Swarm Manager with basic lifecycle
- [ ] OpenTUI dashboard with Agent Grid
- [ ] Event streaming
- [ ] Budget tracking with hard limits
- [ ] REST API
- [ ] File-based storage (SQLite)

**Success Criteria:**
- Can spawn 20 agents
- Dashboard shows live status
- Budget stops at limit
- API responds to all endpoints

### Phase 2: Intelligence (v2.1.0) - Weeks 5-8

**Theme:** "Make it smart"

- [ ] Auto-retry with exponential backoff
- [ ] Model failover
- [ ] Self-healing (auto-recovery)
- [ ] Message bus for agent communication
- [ ] Performance learning (historical optimization)
- [ ] Failure pattern detection

**Success Criteria:**
- 80% of failures auto-resolved
- Dashboard shows learning suggestions
- Agents communicate via message bus

### Phase 3: Scale & Extensibility (v2.2.0) - Weeks 9-12

**Theme:** "Make it scale"

- [ ] Advanced swarm strategies (map-reduce, pipeline, tree)
- [ ] Plugin architecture
- [ ] PostgreSQL backend option
- [ ] Hierarchical delegation (parent/child agents)
- [ ] Optional web dashboard
- [ ] CI/CD integrations (GitHub Actions, etc.)

**Success Criteria:**
- 100 agents in a swarm
- Custom plugins load successfully
- Web dashboard accessible

### Phase 4: Polish (v2.3.0) - Weeks 13-16

**Theme:** "Make it delightful"

- [ ] Advanced TUI features (search, filtering)
- [ ] Shell completions (bash, zsh, fish)
- [ ] Migration tools
- [ ] Documentation site
- [ ] Community plugins marketplace

---

## 10. Open Questions

### Technical Decisions Pending

1. **Max Swarm Size:** Should we optimize for 50, 100, or 500 agents?
   - Trade-off: Complexity vs. future-proofing
   - Default: 100, with intelligent grouping for larger

2. **Non-OpenClaw Agents:** Should we support raw shell commands?
   - Pros: More flexible
   - Cons: Less integrated, harder to track
   - Decision: P3, focus on OpenClaw first

3. **Multi-region:** Should agents be distributed across regions?
   - Pros: Lower latency, fault tolerance
   - Cons: Complexity, cost
   - Decision: P3, single-region for v2.0

### Business Decisions Pending

1. **Pricing Model:** Open source vs. hosted service?
   - Default: Open source (MIT)
   - Future: Optional hosted service with usage-based pricing

2. **Plugin Marketplace:** Curated or open?
   - Default: Open, community-driven
   - Future: Optional verified plugins

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Swarm** | A collection of agents working together on a common task |
| **Orchestrator** | The primary AI model managing the swarm |
| **Agent** | An individual AI worker (OpenClaw session) |
| **TUI** | Terminal User Interface (text-based GUI) |
| **Ambient Awareness** | Passive knowledge of system state without active checking |
| **Progressive Disclosure** | Show summary by default, details on demand |
| **Hierarchical Delegation** | Parent agents spawning child agents with inherited constraints |
| **Self-healing** | Automatic recovery from failures without human intervention |

---

## Appendix B: References

- [OpenTUI Documentation](https://github.com/anomalyco/opentui)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [SPEC_v2.md](./SPEC_v2.md) - Technical Specification

---

*PRD Version: 2.0.0*  
*Last Updated: 2026-02-02*  
*Status: Ready for Implementation*

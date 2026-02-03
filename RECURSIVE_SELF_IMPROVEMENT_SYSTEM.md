# RECURSIVE SELF-IMPROVEMENT SYSTEM

> Dash analyzing itself, identifying improvements, and autonomously improving - 24/7

## Vision

Dash becomes a self-improving system that:
- Runs continuously without human intervention
- Identifies its own weaknesses through self-interviews
- Spawns swarms to fix issues
- Learns from each improvement cycle
- Operates safely overnight with hard limits

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS DASH                          │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Health      │───▶│  Self-       │───▶│  Swarm       │  │
│  │  Monitor     │    │  Interview   │    │  Spawner     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Cron        │    │  /interview  │    │  Codex       │  │
│  │  Scheduler   │    │  Analysis    │    │  Executor    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │            │
│         └───────────────────┴───────────────────┘            │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              IMPROVEMENT ENGINE                       │   │
│  │  • Identify gaps → Spawn swarm → Verify → Document   │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PERSISTENCE LAYER                        │   │
│  │  • State saved to SQLite                             │   │
│  │  • Learnings to MEMORY.md                            │   │
│  │  • Metrics tracked over time                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Health Monitor

**Purpose:** Detect when Dash or OpenClaw is unhealthy

**Checks:**
```typescript
interface HealthCheck {
  name: string;
  severity: 'critical' | 'warning' | 'info';
  check: () => Promise<CheckResult>;
}

const HEALTH_CHECKS: HealthCheck[] = [
  {
    name: 'api_health',
    severity: 'critical',
    check: async () => {
      const res = await fetch('http://localhost:7373/health');
      return res.ok ? 'ok' : 'failed';
    }
  },
  {
    name: 'openclaw_gateway',
    severity: 'critical', 
    check: async () => {
      // Check if gateway is reachable
      const state = await loadOpenClawState();
      return state.connected ? 'connected' : 'disconnected';
    }
  },
  {
    name: 'agent_pool',
    severity: 'warning',
    check: async () => {
      const count = await countActiveAgents();
      return count >= 10 ? 'healthy' : 'low';
    }
  },
  {
    name: 'budget_status',
    severity: 'warning',
    check: async () => {
      const budgets = await loadBudgets();
      const overBudget = budgets.filter(b => b.spent >= b.limit);
      return overBudget.length === 0 ? 'ok' : 'over_budget';
    }
  }
];
```

**Actions on Failure:**
- Critical: Restart service, notify if human available
- Warning: Log, schedule deeper investigation
- Info: Log for metrics

---

### 2. Self-Interview Module

**Purpose:** Dash interviews itself using `/interview` methodology

**Recursive Questioning Prompts:**

```typescript
const SELF_INTERVIEW_PROMPTS = {
  // Health-focused questions
  health: [
    'What broke since my last check?',
    'What errors am I seeing in my logs?',
    'Which agents failed and why?',
    'What tests are failing?',
    'What feedback have I received from users?'
  ],
  
  // Performance questions
  performance: [
    'Where am I slowest?',
    'What operations take longest?',
    'Am I hitting rate limits?',
    'Is my memory/cpu usage trending up?'
  ],
  
  // Feature questions  
  features: [
    'What features are requested but missing?',
    'What existing features feel incomplete?',
    'What would make me more useful?'
  ],
  
  // Code quality questions
  code: [
    'What code smells do I notice?',
    'Where are the most bugs?',
    'What needs refactoring?',
    'What tests am I missing?'
  ],
  
  // Learning questions
  learning: [
    'What did I learn this cycle?',
    'What patterns repeat in my errors?',
    'What should I remember for next time?'
  ]
};
```

**Interview Workflow:**
```bash
# Every 4 hours, Dash interviews itself
dash self-interview --depth quick --output INTERVIEW_YYYY-MM-DD_HH.md

# Every 24 hours, deep interview
dash self-interview --depth full --output INTERVIEW_WEEKLY.md
```

---

### 3. Swarm Spawner

**Purpose:** Automatically spawn swarms based on interview findings

**Auto-Spawn Rules:**

```typescript
interface SwarmRule {
  trigger: string;           // Pattern that triggers this rule
  priority: number;          // Lower = higher priority
  maxSpend: number;          // Budget cap for this swarm
  autoApprove: boolean;      // Run without human approval?
  swarmTemplate: string;     // Which template to use
}

const AUTO_SPAWN_RULES: SwarmRule[] = [
  {
    trigger: 'test.*fail',
    priority: 1,
    maxSpend: 2.00,
    autoApprove: true,
    swarmTemplate: 'fix-tests'
  },
  {
    trigger: 'critical.*bug',
    priority: 2,
    maxSpend: 5.00,
    autoApprove: true, 
    swarmTemplate: 'fix-critical-bug'
  },
  {
    trigger: 'performance.*slow',
    priority: 3,
    maxSpend: 3.00,
    autoApprove: true,
    swarmTemplate: 'optimize-performance'
  },
  {
    trigger: 'feature.*request',
    priority: 5,
    maxSpend: 10.00,
    autoApprove: false,  // Human approval needed
    swarmTemplate: 'implement-feature'
  },
  {
    trigger: 'refactor.*needed',
    priority: 4,
    maxSpend: 5.00,
    autoApprove: false,
    swarmTemplate: 'refactor-code'
  }
];
```

---

### 4. Verification Loop

**Purpose:** Confirm swarm outputs actually improve things

**Verification Steps:**
```typescript
async function verifyImprovement(swarmId: string): Promise<VerificationResult> {
  // 1. Check that swarm completed
  const swarm = await getSwarmStatus(swarmId);
  if (swarm.status !== 'completed') {
    return { passed: false, reason: 'Swarm did not complete' };
  }
  
  // 2. Run affected tests
  const testResult = await runTests();
  if (!testResult.passed) {
    return { passed: false, reason: 'Tests failed after swarm' };
  }
  
  // 3. Check build passes
  const buildResult = await runBuild();
  if (!buildResult.success) {
    return { passed: false, reason: 'Build failed after swarm' };
  }
  
  // 4. Measure improvement
  const beforeMetrics = await loadMetrics(swarm.startedAt);
  const afterMetrics = await loadMetrics('now');
  
  return {
    passed: true,
    metrics: {
      testImprovement: testResult.passRate - beforeMetrics.testPassRate,
      buildTimeChange: buildResult.duration - beforeMetrics.buildDuration,
      errorReduction: beforeMetrics.errorCount - afterMetrics.errorCount
    }
  };
}
```

---

### 5. Persistence Layer

**Purpose:** State survives restarts, learnings compound

**Storage Strategy:**
```
~/.config/dash/
├── state.json              # Current running state
├── metrics.json            # Time-series metrics
├── budgets.json            # Budget tracking
├── openclaw-state.json     # OpenClaw connection state
├── agents.db               # SQLite agent registry
├── interviews/             # All self-interviews
│   └── YYYY-MM-DD/
│       ├── HH-00.md        # Quick interviews
│       └── DD-0000.md      # Deep interviews
├── swarms/                 # Swarm outcomes
│   └── YYYY-MM-DD/
│       └── swarm-id.json   # Swarm results + metrics
└── learnings/              # Aggregated learnings
    └── MEMORY.md           # Long-term memory
```

---

## Cron Schedule

### 24/7 Operation Schedule

| Interval | Cron Expression | Action | Autonomy |
|----------|-----------------|--------|----------|
| **Every 5 min** | `*/5 * * * *` | Health check | Auto |
| **Every 15 min** | `*/15 * * * *` | Agent pool check | Auto |
| **Every 30 min** | `*/30 * * * *` | Build verification | Auto |
| **Every 1 hour** | `0 * * * *` | Quick self-interview | Auto |
| **Every 4 hours** | `0 */4 * * *` | Deep self-interview | Auto |
| **Every 6 hours** | `0 */6 * * *` | Budget reconciliation | Auto |
| **Every 12 hours** | `0 */12 * * *` | Metrics review | Auto |
| **Daily (2 AM)** | `0 2 * * *` | Comprehensive review | Auto |
| **Weekly (Sun 3 AM)** | `0 3 * * 0` | Strategic planning | Auto |

### Night Mode (11 PM - 7 AM)

Conservative operation while human sleeps:

```yaml
night_mode:
  enabled: true
  schedule: "0 23 * * *"    # Enable at 11 PM
  end: "0 7 * * *"          # End at 7 AM
  
  limits:
    max_agents: 5            # Reduce from 10
    max_spend_per_hour: 5.00 # Conservative spending
    max_spend_per_night: 20.00
    allow_new_swarms: false  # Only finish existing
    allow_autofixes: true    # Critical fixes only
    
  notifications:
    critical_failure: true   # Wake human for critical
    budget_warning: false    # Wait until morning
    swarm_complete: false    # Log only
```

---

## Safety Limits

### Hard Boundaries (Cannot Override)

```typescript
const HARD_LIMITS = {
  // Absolute maximums
  max_total_spend_per_day: 100.00,
  max_concurrent_agents: 50,
  max_swarms_per_day: 20,
  
  // Swarm limits
  max_spend_per_swarm: 10.00,
  max_swarm_duration_hours: 4,
  
  // Emergency stops
  emergency_budget_cap: 50.00,    # Per day
  emergency_agent_cap: 10,
  
  // AFK mode (human not seen for 4+ hours)
  afk_budget_cap: 25.00,
  afk_agent_cap: 5,
  afk_allow_new_swarms: false
};
```

### Soft Boundaries (Warning + Confirmation)

```typescript
const SOFT_LIMITS = {
  warn_spend_per_hour: 10.00,      # Warning at this spend
  warn_agents_count: 20,           # Warning at this agent count
  warn_swarms_in_flight: 5,        # Warning at this swarm count
  warn_test_coverage_drop: 5       # Percentage points
};
```

---

## Feedback Loop Design

### The Recursive Loop

```
┌────────────────────────────────────────────────────────────────┐
│                     RECURSIVE IMPROVEMENT CYCLE                │
│                                                                 │
│  1. 📊 COLLECT         2. 🔍 ANALYZE        3. 🎯 IDENTIFY    │
│     Metrics               Interview           Gaps              │
│     Logs                   Self               Issues            │
│     Feedback             Questions            Improvements      │
│                            /interview                            │
│                              │                                  │
│                              ▼                                  │
│  4. 🚀 ACT             5. ✅ VERIFY         6. 📚 REMEMBER    │
│     Spawn                 Tests               MEMORY.md         │
│     Swarm                 Build               Learnings         │
│     Fixes                 Review              Metrics           │
│                              │                                  │
│                              └──────────────────────────────────┘
│                                        │
│                                        ▼
│                              7. 🔄 ITERATE
│                                 (Back to #1)
└────────────────────────────────────────────────────────────────┘
```

### Feedback Types

**Positive Feedback (Reinforce):**
- "This fix improved test pass rate by 5%" → Document pattern
- "This refactor reduced build time" → Add to best practices
- "This agent design worked well" → Reuse template

**Negative Feedback (Correct):**
- "Swarm created regressions" → Add verification step
- "This approach made things worse" → Blacklist pattern
- "Budget overrun" → Tighten limits

**Neutral Feedback (Investigate):**
- "Mixed results" → Deep dive in next interview
- "Unclear impact" → Add metrics to track

---

## Implementation Plan

### Phase 1: Foundation (Sprints 1-2)

**Sprint 1: Health Monitor**
- [ ] Create `src/core/health-monitor.ts`
- [ ] Implement health check functions
- [ ] Add cron for every 5 min checks
- [ ] Create dashboard widget for health status

**Sprint 2: Self-Interview Integration**
- [ ] Create `src/core/self-interview.ts`
- [ ] Adapt `/interview` skill for self-assessment
- [ ] Add cron for hourly quick interviews
- [ ] Store interviews in `interviews/` directory

### Phase 2: Autonomous Operation (Sprints 3-4)

**Sprint 3: Auto-Swarm Spawner**
- [ ] Create `src/core/auto-swarm.ts`
- [ ] Implement rule matching system
- [ ] Add budget controls per swarm type
- [ ] Integrate with `codex exec`

**Sprint 4: Verification Loop**
- [ ] Create `src/core/verification.ts`
- [ ] Implement automatic test runs
- [ ] Build verification reporting
- [ ] Add rollback on failure

### Phase 3: Persistence & Learning (Sprints 5-6)

**Sprint 5: Persistence Layer**
- [ ] Create SQLite schema for metrics
- [ ] Implement state save/load
- [ ] Build metrics aggregation
- [ ] Add historical trending

**Sprint 6: Learning System**
- [ ] Create `MEMORY.md` updater
- [ ] Implement pattern recognition
- [ ] Build recommendation engine
- [ ] Add strategic planning assistant

### Phase 4: Night Mode (Sprints 7-8)

**Sprint 7: Safety Systems**
- [ ] Implement hard limits
- [ ] Add emergency stop button
- [ ] Build notification system
- [ ] Create human detection

**Sprint 8: Optimization**
- [ ] Tune budgets for overnight
- [ ] Optimize for low-resource mode
- [ ] Add predictive scaling
- [ ] Build autonomous mode toggle

---

## Command Interface

```bash
# Health & Status
dash autonomous status              # Show system health
dash autonomous metrics             # Show trending metrics
dash autonomous dashboard           # Open dashboard

# Manual Controls
dash autonomous start               # Enable autonomous mode
dash autonomous stop                # Disable (emergency stop)
dash autonomous pause               # Pause for maintenance

# Interview Controls
dash autonomous interview           # Run self-interview now
dash autonomous interview --deep    # Deep analysis
dash autonomous interview --report  # Generate report

# Swarm Controls
dash autonomous swarms list         # Show running swarms
dash autonomous swarms approve ID   # Approve pending swarm
dash autonomous swarms kill ID      # Emergency stop swarm

# Night Mode
dash autonomous night start         # Enable night mode
dash autonomous night stop          # Disable night mode
dash autonomous night status        # Show night mode state

# Learning
dash autonomous learn --summary     # Show recent learnings
dash autonomous learn --patterns    # Show identified patterns
dash autonomous learn --recommend   # Get recommendations
```

---

## Success Metrics

### Operational Metrics
- Uptime: Target 99.9%
- Mean Time to Recovery (MTTR): Target < 5 min
- Self-heal rate: Target 80% of issues auto-fixed

### Improvement Metrics
- Interview backlog: Target cleared within 2 cycles
- Regression rate: Target trending down over 7 days
- Verification pass rate: Target >= 95%

### Learning Metrics
- Time-to-resolution: Target trending down over 7 days
- Pattern recognition: Target identify 5+ patterns/month
- Budget efficiency: Target 90% of spend on improvements

---

## Emergency Procedures

### What Happens When Things Go Wrong

**Scenario 1: Swarm Creating Regressions**
```bash
# Detection: Verification loop fails
# Action: Automatic rollback
# Notification: Log only (or wake if severe)
autonomous swarms kill $SWARM_ID
git checkout -- .
npm test  # Verify rollback
```

**Scenario 2: Budget Runaway**
```bash
# Detection: Hourly spend > limit
# Action: Immediate pause
# Notification: Wake human immediately
autonomous pause
send_notification("Budget exceeded: $X")
await human_approval()
```

**Scenario 3: OpenClaw Gateway Down**
```bash
# Detection: Health check fails 3x
# Action: Fallback to mock mode
# Notification: Log only
autonomous status --fallback
continue with degraded functionality
```

**Scenario 4: Human Returns**
```bash
# Detection: Message from human in last 30 min
# Action: Exit night mode, resume full autonomy
# Notification: Show summary of overnight activity
autonomous night stop
dashboard show --overnight-summary
await human input
```

---

## Example: Overnight Operation

```
11:00 PM - Night mode enabled
├── Budget reduced to $20/night
├── Agent count capped at 5
├── New swarms blocked
└── Critical fixes only

11:05 PM - Health check passed
├── API: healthy
├── OpenClaw: connected
├── Agents: 5 (at limit)
└── Budget: $0.00 spent

2:00 AM - Daily comprehensive review
├── Self-interview: deep analysis
├── Identified: 3 improvement areas
├── Spawned: 1 critical-fix swarm (budget: $3.00)
└── Verification: pending

6:00 AM - Pre-wake check
├── Swarm completed successfully
├── All tests passing
├── Metrics improved 5%
└── Ready for human return

7:00 AM - Night mode disabled
├── Budget: $3.00 spent
├── Improvement: 3 fixes applied
└── Report: Ready for human review
```

---

## Conclusion

This recursive self-improvement system transforms Dash from a tool into a living system that:
- **Runs continuously** without human intervention
- **Identifies its own weaknesses** through honest self-assessment
- **Improves itself** through automated swarms
- **Learns over time** through persistent memory
- **Operates safely** with hard limits and emergency stops

The result: A self-improving orchestration platform that gets better every cycle, even while you sleep. 🌙🚀

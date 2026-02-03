# /interview: Preventing Stale Swarms & Self-Healing Orchestration

**Interviewer:** Claude Code (analyzing failure)  
**Interviewee:** Claude Code (designing solution)  
**Topic:** Why 17 swarms ran stale for 2+ hours and how to prevent

---

## Q1: What went wrong?

**A:** Multiple systemic failures:

### Failure 1: No Progress Tracking
```
Problem: Swarms spawned without success criteria
Evidence: 17 swarms running 2+ hours, no clear output
Impact: Resource waste, unclear progress
```

### Failure 2: No Lifecycle Management
```
Problem: No automatic termination of unproductive swarms
Evidence: Oldest PID 36939 running since 7:53 PM
Impact: Stale processes consuming resources
```

### Failure 3: No Health Checks
```
Problem: No automated swarm health verification
Evidence: System only checked when Jae asked
Impact: Issues detected too late
```

### Failure 4: Over-spawning
```
Problem: Too many concurrent swarms (17)
Evidence: Swarm count > reasonable capacity
Impact: Resource contention, unclear ownership
```

---

## Q2: What patterns should we extract?

**A: Anti-Patterns to Avoid**

| Anti-Pattern | Symptom | Fix |
|--------------|---------|-----|
| **Infinite Swarms** | Swarms run >1 hour | Auto-terminate after 45 min |
| **Silent Failures** | No output for 30 min | Progress check every 10 min |
| **Over-spawning** | >10 concurrent swarms | Cap at 6-8 |
| **Orphaned Swarms** | PIDs exist, no progress | Kill zombie processes |
| **Unclear Ownership** | Multiple swarms on same task | Single swarm per task type |

**Patterns to Enforce**

| Pattern | Implementation |
|---------|----------------|
| **Timeboxed Execution** | Max 30-45 min per swarm |
| **Progress Checkpoints** | Log progress every 10 min |
| **Health Verification** | Verify output every 5 min |
| **Auto-Termination** | Kill swarms >1 hour old |
| **Concurrent Cap** | Max 6-8 swarms |
| **Single Ownership** | One swarm per task type |

---

## Q3: What systems should we build?

**A: 4 Self-Healing Systems**

### System 1: Swarm Lifecycle Manager
```
Purpose: Enforce time limits and auto-terminate

Features:
- Track swarm start time
- Log checkpoint every 10 min
- Auto-terminate after 45 min
- Send alert if terminated
- Restart only if needed

Output: scripts/swarm-lifecycle.js
```

### System 2: Swarm Health Monitor
```
Purpose: Verify swarms are making progress

Features:
- Check log file size increase
- Check for "working on" markers
- Detect silence >15 min
- Auto-restart unhealthy swarms
- Log health score

Output: scripts/swarm-health-monitor.js
```

### System 3: Swarm Concurrency Controller
```
Purpose: Prevent over-spawning

Features:
- Enforce max 6 concurrent swarms
- Queue excess swarms
- Prioritize by importance
- Auto-release when one completes
- Warn before capping

Output: scripts/swarm-queue.js
```

### System 4: Recursive Self-Improvement
```
Purpose: Learn from failures and improve

Features:
- Log all swarm failures
- Analyze patterns weekly
- Generate improvement suggestions
- Auto-apply low-risk fixes
- Flag high-risk for human review

Output: scripts/self-improvement.js
```

---

## Q4: What should the ideal swarm look like?

**A: Each swarm should have:**

```
1. MISSION (clear goal)
2. SUCCESS_CRITERIA (measurable)
3. TIMEOUT (max 45 min)
4. CHECKPOINT_INTERVAL (every 10 min)
5. OUTPUT_FILE (for tracking)
6. HEALTH_MARKER (periodic "still working")
7. TERMINATION_SIGNAL (graceful exit)
```

### Example Swarm Prompt Template

```
You are a [ROLE] swarm for Dash v2.0.

MISSION: [Clear goal - one sentence]

SUCCESS_CRITERIA:
- [ ] Measurable outcome 1
- [ ] Measurable outcome 2
- [ ] File created/modified

TIMEOUT: This swarm will auto-terminate after 30 minutes.

OUTPUT: Log all progress to .dash/logs/swarm-[name].log

CHECKPOINTS: Every 5 minutes, log:
- What you're working on
- What you've completed
- What remains

TERMINATION: When success criteria met, exit gracefully.
Do not continue after 30 minutes.
```

---

## Q5: What metrics should we track?

**A: Swarm Metrics Dashboard**

| Metric | Target | Alert If |
|--------|--------|----------|
| **Avg Swarm Duration** | <30 min | >45 min |
| **Success Rate** | >80% | <50% |
| **Concurrent Count** | 4-6 | >8 |
| **Stale Swarm %** | 0% | >10% |
| **Restart Rate** | <20% | >50% |

**Per-Swarm Metrics**
- Start time
- End time
- Duration
- Output file size
- Success/failure
- Restart count

---

## Q6: How to implement recursively?

**A: Self-Improving Loop**

```
┌─────────────────────────────────────────────────────────┐
│                  SELF-IMPROVEMENT LOOP                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. COLLECT                                              │
│     └── Log all swarm runs (success/failure)            │
│                                                         │
│  2. ANALYZE                                              │
│     └── Weekly pattern analysis                         │
│                                                         │
│  3. IMPROVE                                              │
│     └── Auto-apply fixes for common issues              │
│                                                         │
│  4. VALIDATE                                             │
│     └── Verify improvements work                        │
│                                                         │
│  5. DOCUMENT                                             │
│     └── Save learnings to AGENTS.md                     │
│                                                         │
│  6. REPEAT                                               │
│     └── Continuous improvement                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Q7: What immediate actions?

**A: 5-Point Fix Plan**

### Immediate (Tonight)
1. **Create Swarm Lifecycle Manager** (`scripts/swarm-lifecycle.js`)
2. **Add timeout to all swarm prompts** (30 min max)
3. **Implement checkpoint logging** (every 10 min)
4. **Create swarm health check script** (`scripts/swarm-health.js`)
5. **Set max concurrent swarms = 6**

### Short-Term (This Week)
1. **Build concurrency controller** (queue excess swarms)
2. **Create self-improvement analyzer** (weekly reports)
3. **Add swarm metrics dashboard** (track all swarms)
4. **Implement zombie killer** (auto-terminate stale)
5. **Document anti-patterns** (AGENTS_ORCHESTRATION_LEARNINGS.md)

### Long-Term (This Month)
1. **Full self-healing system** (auto-detect, auto-fix)
2. **Predictive swarm spawning** (AI decides when to spawn)
3. **Autonomous recovery** (no human intervention needed)

---

## Q8: How to test the system?

**A: Test Scenarios**

| Scenario | Expected Behavior |
|----------|-------------------|
| Swarm runs 45 min | Auto-terminates, logs reason |
| Swarm silent 15 min | Health check triggers, restart if needed |
| >8 concurrent | Queue excess, warn on spawn |
| Swarm completes | Clean exit, metrics logged |
| Swarm fails | Auto-restart once, then flag for review |

---

## Summary: Key Takeaways

### The Problem
- 17 swarms ran stale for 2+ hours
- No progress tracking
- No lifecycle management
- Over-spawning

### The Solution
1. **Timebox** all swarms (30-45 min max)
2. **Checkpoint** every 10 min
3. **Health check** every 5 min
4. **Cap concurrency** at 6 swarms
5. **Auto-terminate** stale swarms
6. **Self-improve** recursively

### The Payoff
- No more stale swarms
- Clear progress visibility
- Resource efficiency
- Autonomous operation
- Continuous improvement

---

Now I'll implement these systems.

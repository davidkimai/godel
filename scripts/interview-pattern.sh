#!/bin/bash
# Interview Pattern for Self-Assessment
# This script simulates the /interview skill pattern for feedback loops

WORKSPACE="/Users/jasontang/clawd/projects/dash"
INTERVIEW_LOG="$WORKSPACE/logs/interview-$(date +%Y-%m-%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INTERVIEW] $1" | tee -a "$INTERVIEW_LOG"
}

# =============================================================================
# INTERVIEW PATTERN: SELF-ASSESSMENT WITH FEEDBACK LOOPS
# =============================================================================

cat << 'EOF' > "$WORKSPACE/logs/interview-$(date +%Y%m%d-%H%M%S).md"
# Self-Interview: Dash Production Readiness

## Interviewer: Self-Orchestration System
## Interviewee: Main Session
## Timestamp: $(date '+%Y-%m-%d %H:%M:%S')

---

### Question 1: What is the current situation?

**Context:** Assess overall project status, subagent health, and blockers.

**Follow-up Questions:**
- What phase are we in?
- What subagents are running?
- What is the git status?
- What tests are passing/failing?

**Answer Pattern:**
```
Phase: [X]
Subagents: [running/stopped]
Git: [clean/dirty]
Tests: [passing/failing]
Blocker: [description]
```

---

### Question 2: What recursive critique is needed?

**Context:** Prevent false positives by verifying actual progress.

**Critique Dimensions:**
1. **Subagent Verification:** Are processes actually running or stubbed?
2. **Test Verification:** Are tests passing or skipped/ignored?
3. **Console.log Verification:** Is cleanup real or just logged?
4. **Integration Verification:** Are pi-mono files real or empty?

**Answer Pattern:**
```
Verification Status: [green/yellow/red]
Stub Detected: [yes/no]
False Positive: [yes/no]
Correction Needed: [action]
```

---

### Question 3: What feedback loops are active?

**Context:** Identify improvement mechanisms and their effectiveness.

**Feedback Loop Types:**
1. **Cron Heartbeats** - Every 10 minutes
2. **Subagent Critiques** - On completion
3. **Test Verification** - On each run
4. **Console.log Scanning** - Continuous
5. **Git Status Monitoring** - Continuous

**Answer Pattern:**
```
Active Loops: [list]
Effectiveness: [high/medium/low]
Improvement: [recommendation]
```

---

### Question 4: What should be launched next?

**Context:** Determine next subagent or action based on assessment.

**Decision Matrix:**
| Condition | Action |
|-----------|--------|
| Subagent stuck > 30 min | Kill and relaunch |
| Tests failing > 20% | Fix dependencies |
| Console.log > 100 | Prioritize cleanup |
| Pi-mono incomplete | Continue integration |
| All complete | Merge to main |

**Answer Pattern:**
```
Priority: [1-5]
Action: [launch/fix/wait]
Subagent: [name or none]
Deadline: [timestamp]
```

---

### Question 5: What lessons learned?

**Context:** Continuous improvement of orchestration itself.

**Categories:**
1. **What worked well?**
2. **What needs improvement?**
3. **What to automate next?**
4. **What to avoid?**

**Answer Pattern:**
```
Wins: [list]
Improvements: [list]
Automation: [list]
Avoid: [list]
```

---

## Output Format

```json
{
  "timestamp": "ISO timestamp",
  "phase": "current phase",
  "subagent_status": {
    "running": ["list"],
    "stuck": ["list"],
    "completed": ["list"]
  },
  "critique": {
    "verified": true,
    "false_positives": [],
    "corrections_needed": []
  },
  "feedback_loops": {
    "active": ["cron", "subagent", "test"],
    "effectiveness": "high"
  },
  "next_action": {
    "priority": "high",
    "type": "launch/fix/wait",
    "target": "subagent-name or null",
    "reason": "description"
  },
  "lessons": {
    "wins": [],
    "improvements": [],
    "automation": [],
    "avoid": []
  }
}
```

---

*This interview pattern enables recursive self-assessment and continuous improvement.*
EOF

log "Interview template created: logs/interview-*.md"
cat "$WORKSPACE/logs/interview-$(date +%Y%m%d-%H%M%S).md"

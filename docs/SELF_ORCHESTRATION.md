# Self-Orchestration System for Dash

## Overview

A self-managing orchestration system that:
- Assesses Dash project status every 10 minutes
- Launches recursive critique subagents to prevent false positives
- Implements feedback loops for continuous improvement
- Queries itself using the `/interview` skill pattern

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   CRON (every 10 min)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SELF-ORCHESTRATION SCRIPT                        │
│  scripts/self-orchestration.sh                              │
├─────────────────────────────────────────────────────────────┤
│  1. Data Collection (git, subagents, tests, console.log)    │
│  2. Interview Pattern (self-assessment questions)            │
│  3. Recursive Critique Trigger                              │
│  4. Recommendation Engine                                   │
│  5. Next Steps Calendar                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              INTERVIEW PATTERN                                │
│  scripts/interview-pattern.sh                               │
│  logs/interview-*.md                                       │
├─────────────────────────────────────────────────────────────┤
│  Q1: What is the current situation?                         │
│  Q2: What recursive critique is needed?                     │
│  Q3: What feedback loops are active?                       │
│  Q4: What should be launched next?                          │
│  Q5: What lessons learned?                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              RECURSIVE CRITIQUE SUBAGENT                     │
│  scripts/recursive-critique.sh                             │
│  worktree: .claude-worktrees/critique-*                    │
├─────────────────────────────────────────────────────────────┤
│  Verify: subagents, tests, console.log, pi-mono, git        │
│  Output: logs/critique-report-*.json                       │
│  Prevent: false positives from stubbed work                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              FEEDBACK LOOP                                   │
├─────────────────────────────────────────────────────────────┤
│  - Cron Heartbeats (every 10 min)                          │
│  - Subagent Critiques (on completion)                      │
│  - Test Verification (continuous)                          │
│  - Console.log Scanning (continuous)                       │
│  - Git Status Monitoring (continuous)                      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Self-Orchestration Script
**Location:** `scripts/self-orchestration.sh`
**Schedule:** Every 10 minutes (cron)
**Purpose:** Main orchestration cycle

**What it does:**
- Collects project status (git, worktrees, subagents)
- Runs interview pattern for self-assessment
- Launches recursive critique subagent
- Generates recommendations
- Creates next-steps calendar

### 2. Interview Pattern
**Location:** `scripts/interview-pattern.sh`
**Purpose:** Structured self-questioning for feedback loops

**Questions:**
1. What is the current situation?
2. What recursive critique is needed?
3. What feedback loops are active?
4. What should be launched next?
5. What lessons learned?

### 3. Recursive Critique Subagent
**Location:** `scripts/recursive-critique.sh`
**Purpose:** Verify actual progress, prevent false positives

**Verification Tasks:**
- `verify_subagents` - Check if actually running
- `verify_tests` - Check real test results
- `verify_consolelog` - Count actual console.log
- `verify_pimono` - Check pi-mono files
- `verify_git` - Check git status
- `generate_report` - Output JSON report

## Log Files

| Log | Purpose |
|-----|---------|
| `logs/self-orchestration-*.log` | Main orchestration cycle |
| `logs/interview-*.md` | Interview pattern output |
| `logs/critique-*.log` | Recursive critique results |
| `logs/critique-report-*.json` | JSON status report |
| `logs/next-steps-*.txt` | Action items |
| `logs/heartbeats.log` | Heartbeat signals |

## Cron Jobs

### System Cron
```bash
*/10 * * * * /Users/jasontang/clawd/projects/dash/scripts/self-orchestration.sh
```

### OpenClaw Cron
```json
{
  "name": "dash-self-orchestrator",
  "schedule": { "everyMs": 600000, "kind": "every" },
  "payload": { "kind": "systemEvent", "text": "SELF_ORCHESTRATION_TRIGGER..." },
  "sessionTarget": "main"
}
```

## Usage

### Manual Trigger
```bash
# Run self-orchestration
./scripts/self-orchestration.sh

# Run interview pattern
./scripts/interview-pattern.sh

# Run recursive critique
./scripts/recursive-critique.sh
```

### View Status
```bash
# Latest orchestration log
tail -f logs/self-orchestration-$(date +%Y-%m-%d).log

# Latest critique report
cat logs/critique-report-*.json | jq .

# Heartbeats
tail logs/heartbeats.log

# Next steps
cat logs/next-steps-$(date +%Y-%m-%d).txt
```

## Feedback Loop Pattern

### The Interview Loop

```
┌─────────────┐
│   Assess    │◄─────────────────────┐
│  Situation  │                      │
└──────┬──────┘                      │
       │                              │
       ▼                              │
┌─────────────┐     ┌─────────────┐  │
│   Ask       │────►│   Launch    │  │
│  Questions  │     │  Critique   │  │
└──────┬──────┘     └──────┬──────┘  │
       │                  │          │
       ▼                  ▼          │
┌─────────────┐     ┌─────────────┐  │
│  Generate    │     │  Verify &    │  │
│  Insights   │◄────│  Critique   │  │
└──────┬──────┘     └──────┬──────┘  │
       │                  │          │
       ▼                  │          │
┌─────────────┐          │          │
│   Update    │          │          │
│  Status     │──────────┘          │
└─────────────┘                      │
                                       │
        ◄──────────────────────────────┘
```

## Preventing False Positives

### The Stub Problem

**Problem:** Subagents appear to complete but only created stub files.

**Solution:** Recursive critique verification:

1. **Process Check** - Are PID files active?
2. **Output Check** - Are output files populated?
3. **Test Check** - Do tests actually run?
4. **Log Check** - Are logs being written?

### Verification Matrix

| Condition | Status | Action |
|-----------|--------|--------|
| Subagent running, output populated | ✅ Green | Continue |
| Subagent running, no output | ⚠️ Yellow | Investigate |
| No subagent, stub files exist | 🔴 Red | Relaunch |
| Tests failing >20% | 🔴 Red | Fix deps |
| Console.log >100 | ⚠️ Yellow | Prioritize cleanup |

## Metrics Collected

### Orchestration Metrics
- Cycle execution time
- Subagent count
- Active feedback loops
- Recommendation count

### Project Metrics
- Git dirty/clean status
- Worktree count
- Console.log count
- Test pass/fail ratio
- Pi-mono file count

### Health Metrics
- Heartbeat latency
- Critique findings
- Error frequency
- Recovery time

## Integration with Dash

### Phase 4 Integration
```bash
# Self-orchestration monitors Phase 4 progress
tail -f logs/self-orchestration.log | grep "Phase 4"
```

### Pi-Mono Integration
```bash
# Check pi-mono integration status
cat logs/critique-report-*.json | jq '.findings.pimono'
```

### Subagent Health
```bash
# Monitor subagent status
ps aux | grep "codex.*dash-phase"
```

## Troubleshooting

### No Heartbeats
```bash
# Check cron is running
crontab -l

# Manual trigger
./scripts/self-orchestration.sh
```

### Critique Finding Issues
```bash
# Review latest critique
cat logs/critique-report-*.json | jq .

# Rerun critique
./scripts/recursive-critique.sh
```

### Interview Not Running
```bash
# Check interview log
cat logs/interview-*.md

# Manual run
./scripts/interview-pattern.sh
```

## Best Practices

1. **Run Full Cycle** - Don't skip critique verification
2. **Review Reports** - Check critique reports after each cycle
3. **Fix Root Causes** - Don't just acknowledge warnings
4. **Automate Repetition** - Script recurring fixes
5. **Document Learnings** - Update this README with lessons

## Future Enhancements

- [ ] Auto-launch fix subagents based on critique
- [ ] ML-based anomaly detection
- [ ] Predictive subagent timing
- [ ] Cross-project orchestration
- [ ] Slack/Discord notifications
- [ ] Grafana dashboard integration

---

*This self-orchestration system enables Dash to self-manage, self-assess, and continuously improve.*

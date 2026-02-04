#!/bin/bash
# Self-Orchestrating Assessment Script
# Runs every 10 minutes to assess Dash project status
# Queries main session for current situation, launches critique subagents

set -e

WORKSPACE="/Users/jasontang/clawd/projects/dash"
LOG_FILE="$WORKSPACE/logs/self-orchestration-$(date +%Y-%m-%d).log"
INTERVIEW_LOG="$WORKSPACE/logs/interview-feedback-$(date +%Y-%m-%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

interview() {
    local question="$1"
    echo "=== INTERVIEW: $question ===" | tee -a "$INTERVIEW_LOG"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$INTERVIEW_LOG"
    echo "" | tee -a "$INTERVIEW_LOG"
}

# =============================================================================
# SELF-ASSESSMENT INTERVIEW PATTERN
# =============================================================================

log "========================================="
log "SELF-ORCHESTRATION CYCLE STARTED"
log "========================================="

# Interview 1: Current Situation
interview "What is the current state of the Dash project?"
interview "What subagents are currently running?"
interview "What is the git status and recent commits?"
interview "What phase of production readiness are we in?"

# Assessment Areas
ASSESSMENT_AREAS=(
    "Subagent Status"
    "Test Results"
    "Console.log Count"
    "Pi-Mono Integration"
    "Git Status"
    "Worktree Status"
    "Cron Jobs"
    "Recent Progress"
)

for area in "${ASSESSMENT_AREAS[@]}"; do
    log "ASSESSING: $area"
done

# =============================================================================
# DATA COLLECTION
# =============================================================================

log "Collecting project status..."

# Git Status
cd "$WORKSPACE"
GIT_STATUS=$(git status --short 2>/dev/null || echo "git error")
GIT_LOG=$(git log --oneline -5 2>/dev/null || echo "git log error")

log "Git Status: $GIT_STATUS"
log "Recent Commits:"
echo "$GIT_LOG" | while read line; do
    log "  $line"
done

# Worktree Status
WORKTREES=$(git worktree list 2>/dev/null || echo "worktree error")
log "Worktrees:"
echo "$WORKTREES" | while read line; do
    log "  $line"
done

# Subagent Processes
SUBAGENTS=$(ps aux | grep -E "codex.*dash-phase" | grep -v grep || echo "No subagents found")
log "Active Subagents:"
if [ -n "$SUBAGENTS" ]; then
    echo "$SUBAGENTS" | while read line; do
        log "  $line"
    done
else
    log "  None detected"
fi

# Test Status (if recent)
if [ -f "$WORKSPACE/test-results.json" ]; then
    TEST_RESULTS=$(cat "$WORKSPACE/test-results.json" 2>/dev/null || echo "No test results")
    log "Test Results: $TEST_RESULTS"
fi

# Console.log Count
CONSOLE_COUNT=$(grep -r "console.log" --include="*.ts" "$WORKSPACE/src" 2>/dev/null | wc -l || echo "0")
log "Console.log count in src: $CONSOLE_COUNT"

# =============================================================================
# INTERVIEW PATTERN - SELF-ASSESSMENT QUESTIONS
# =============================================================================

log ""
log "=== SELF-INTERVIEW FOR FEEDBACK LOOP ==="
log ""

INTERVIEW_Q1="What is the biggest blocker to production readiness right now?"
log "Q: $INTERVIEW_Q1"
log "A: [Awaiting assessment]"

INTERVIEW_Q2="Which subagent is making the most progress?"
log "Q: $INTERVIEW_Q2"
log "A: [Awaiting assessment]"

INTERVIEW_Q3="What recursive critique is needed to prevent false positives?"
log "Q: $INTERVIEW_Q3"
log "A: [Awaiting assessment]"

INTERVIEW_Q4="What feedback loop improvements are recommended?"
log "Q: $INTERVIEW_Q4"
log "A: [Awaiting assessment]"

INTERVIEW_Q5="What should be launched next?"
log "Q: $INTERVIEW_Q5"
log "A: [Awaiting assessment]"

# =============================================================================
# RECURSIVE CRITIQUE TRIGGER
# =============================================================================

log ""
log "=== LAUNCHING RECURSIVE CRITIQUE SUBAGENT ==="

# Launch a critique subagent in isolated context
CRITIQUE_PROMPT="Perform a recursive critique of Dash project status:

1. VERIFY current progress:
   - Check git status and worktrees
   - Count actual subagent processes
   - Verify test results file
   - Check console.log removal progress

2. IDENTIFY false positives:
   - Are subagents actually running or stubbed?
   - Are tests really passing or skipped?
   - Is console.log really removed or just ignored?

3. FEEDBACK LOOP recommendations:
   - What improvements to orchestration?
   - What additional subagents needed?
   - What blockers to address?

4. NEXT STEPS:
   - Launch new subagents if needed
   - Fix any verification gaps
   - Report findings

CRITIQUE OUTPUT FORMAT:
- Status: [green/yellow/red]
- Blocker: [description]
- Progress: [percentage]
- Recommendation: [action item]
- New Subagents: [list if any]

Execute now and report back."

# Store critique prompt for manual review or subagent launch
echo "$CRITIQUE_PROMPT" > "$WORKSPACE/logs/critique-prompt-$(date +%Y%m%d-%H%M%S).txt"
log "Critique prompt saved to logs/critique-prompt-*.txt"

# =============================================================================
# RECOMMENDATION ENGINE
# =============================================================================

log ""
log "=== GENERATING RECOMMENDATIONS ==="

# Analyze collected data
if echo "$GIT_STATUS" | grep -q "M "; then
    log "RECOMMENDATION: Uncommitted changes - consider committing"
fi

if [ "$CONSOLE_COUNT" -gt 100 ]; then
    log "RECOMMENDATION: Console.log count high ($CONSOLE_COUNT) - prioritize cleanup"
fi

if echo "$SUBAGENTS" | grep -q "dash-phase4"; then
    log "RECOMMENDATION: Phase 4 subagents running - monitor for completion"
else
    log "RECOMMENDATION: No Phase 4 subagents detected - consider launching"
fi

# =============================================================================
# NEXT STEPS CALENDAR
# =============================================================================

log ""
log "=== NEXT STEPS CALENDAR ==="

cat << 'EOF' | tee -a "$WORKSPACE/logs/next-steps-$(date +%Y-%m-%d).txt"
IMMEDIATE (Next 10 min):
- [ ] Review critique prompt in logs/
- [ ] Check subagent completion status
- [ ] Verify test results

SHORT-TERM (Next hour):
- [ ] Complete Phase 4 subagents
- [ ] Fix test dependencies
- [ ] Remove remaining console.log

MEDIUM-TERM (Today):
- [ ] Merge Phase 4 to main
- [ ] Complete pi-mono integration
- [ ] Deploy to staging

LONG-TERM (This week):
- [ ] Production deployment
- [ ] Full test coverage >80%
- [ ] Documentation complete
EOF

log "Next steps saved to logs/next-steps-*.txt"

# =============================================================================
# HEARTBEAT SIGNAL
# =============================================================================

log ""
log "=== HEARTBEAT ==="
log "Status: ORCHESTRATION_ACTIVE"
log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
log "Next Cycle: $(date -v+10M '+%Y-%m-%d %H:%M:%S')"
log "========================================="

# Send heartbeat signal
echo "$(date '+%Y-%m-%d %H:%M:%S') HEARTBEAT ORCHESTRATION_ACTIVE" >> "$WORKSPACE/logs/heartbeats.log"

exit 0

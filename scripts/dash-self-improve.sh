#!/bin/bash
# ============================================================================
# Dash Self-Improvement Orchestration Script
# 
# Orchestrates recursive self-improvement using Claude Code agents
# Creates parallel workstreams, runs quality gates, and feeds results back
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DASH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DASH_DIR"
CLAUDE_BIN="/Users/jasontang/.local/bin/claude"
LOG_DIR="$DASH_DIR/logs"
WORKTREE_BASE="../dash-improve"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠️]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌]${NC} $1"
}

log_phase() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

log_agent() {
    echo -e "${MAGENTA}[🤖 AGENT]${NC} $1"
}

# Create timestamped log file
init_logs() {
    mkdir -p "$LOG_DIR"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    MAIN_LOG="$LOG_DIR/self-improve-$TIMESTAMP.log"
    echo "# Self-Improvement Run: $TIMESTAMP" > "$MAIN_LOG"
    echo "=====================================" >> "$MAIN_LOG"
}

# ============================================================================
# ORCHESTRATION ENGINE
# ============================================================================

# Spawn a Claude Code agent in a worktree
spawn_agent() {
    local name="$1"
    local task="$2"
    local worktree="$WORKTREE_BASE-$name"
    local log_file="$LOG_DIR/agent-$name.log"
    
    log_agent "Spawning agent: $name"
    log_info "Task: $task"
    log_info "Worktree: $worktree"
    
    # Create worktree if needed
    if [ ! -d "$worktree" ]; then
        git worktree add -b "improve-$name" "$worktree" main 2>/dev/null || true
    fi
    
    # Run Claude Code in worktree (in background)
    (
        cd "$worktree"
        $CLAUDE_BIN "$task" > "$log_file" 2>&1
    ) &
    
    echo $! > "$LOG_DIR/agent-$name.pid"
    log_success "Agent $name started (PID: $(cat $LOG_DIR/agent-$name.pid))"
}

# Wait for all agents to complete
wait_agents() {
    local pids=("$@")
    local running=${#pids[@]}
    
    log_info "Waiting for $running agent(s) to complete..."
    
    while [ $running -gt 0 ]; do
        for i in "${!pids[@]}"; do
            if kill -0 "${pids[$i]}" 2>/dev/null; then
                continue
            else
                unset "pids[$i]"
                running=$((running - 1))
            fi
        done
        sleep 2
    done
    
    log_success "All agents completed!"
}

# ============================================================================
# QUALITY GATES
# ============================================================================

run_quality_gates() {
    log_phase "PHASE 1: Quality Assessment"
    
    # Run quality checks
    log_info "Running quality gates..."
    
    local lint_result=$(npm run lint 2>&1 | tail -5)
    local type_result=$(npm run typecheck 2>&1 | tail -5)
    local test_result=$(npm test 2>&1 | grep -E "Tests:" | tail -1)
    
    echo "$lint_result" >> "$MAIN_LOG"
    echo "$type_result" >> "$MAIN_LOG"
    echo "$test_result" >> "$MAIN_LOG"
    
    log_info "Linting: $lint_result"
    log_info "TypeScript: $type_result"
    log_info "Tests: $test_result"
    
    # Return pass/fail
    if echo "$lint_result" | grep -q "passed"; then
        log_success "Linting: PASSED"
        return 0
    else
        log_error "Linting: FAILED"
        return 1
    fi
}

# ============================================================================
# SELF-IMPROVEMENT CYCLES
# ============================================================================

# Main self-improvement cycle
run_self_improve() {
    log_phase "🚀 DASH SELF-IMPROVEMENT CYCLE"
    echo "Starting at $(date)" >> "$MAIN_LOG"
    
    # Initialize
    init_logs
    log_info "Self-improvement cycle started at $(date)"
    
    # PHASE 1: Quality Assessment
    log_phase "PHASE 1: Quality Assessment"
    run_quality_gates || {
        log_warn "Quality gates failed - proceeding with fixes"
    }
    
    # PHASE 2: Spawn Parallel Claude Code Agents
    log_phase "PHASE 2: Spawning Claude Code Agents"
    
    log_info "Creating parallel workstreams for self-improvement..."
    
    # Spawn multiple agents for different improvement tasks
    spawn_agent "lint-fix" \
        "Fix all linting errors in src/ using npm run lint:fix. Report what was fixed."
    
    spawn_agent "test-add" \
        "Add 5 new unit tests to improve test coverage. Focus on untested modules."
    
    spawn_agent "docs-update" \
        "Update CHANGELOG.md with recent improvements. Add section for 'Self-Improvement Cycle'."
    
    spawn_agent "types-fix" \
        "Fix any TypeScript type errors. Run npm run typecheck and resolve all issues."
    
    # Wait for all agents
    local pids=($(cat "$LOG_DIR"/agent-*.pid 2>/dev/null))
    wait_agents "${pids[@]}"
    
    # PHASE 3: Verify Improvements
    log_phase "PHASE 3: Verification"
    
    log_info "Running final quality gates..."
    npm run quality >> "$MAIN_LOG" 2>&1
    npm test >> "$MAIN_LOG" 2>&1
    
    local final_tests=$(npm test 2>&1 | grep -E "Tests:" | tail -1)
    log_success "Final test result: $final_tests"
    
    # PHASE 4: Commit Improvements
    log_phase "PHASE 4: Commit & Push"
    
    local branch=$(git branch --show-current)
    log_info "Current branch: $branch"
    
    # Stage and commit
    git add -A
    local commit_msg="chore(self-improve): automated self-improvement cycle $(date +%Y-%m-%d)"
    
    if git diff --cached --quiet; then
        log_info "No changes to commit"
    else
        git commit -m "$commit_msg" >> "$MAIN_LOG" 2>&1
        log_success "Committed: $commit_msg"
        
        # Push
        git push origin "$branch" >> "$MAIN_LOG" 2>&1
        log_success "Pushed to origin/$branch"
    fi
    
    # PHASE 5: Feedback Loop Analysis
    log_phase "PHASE 5: Feedback Analysis"
    
    # Analyze what was improved
    log_info "Self-improvement cycle complete!"
    log_info "Results saved to: $MAIN_LOG"
    
    # Return summary
    echo ""


    echo "SELF-IMPROVEMENT SUMMARY"


    echo "Completed: $(date)"
    echo "Log file: $MAIN_LOG"
    echo "Changes: Check git diff"
    echo ""
    echo "Next cycle recommendations:"
    grep -E "RECOMMEND|Recommendation|fix|update" "$MAIN_LOG" 2>/dev/null | head -5 || echo "  - Review log for specific items"
    
    echo "" >> "$MAIN_LOG"
    echo "Self-improvement cycle completed at $(date)" >> "$MAIN_LOG"
}

# ============================================================================
# QUICK IMPROVE
# ============================================================================

quick_improve() {
    local task="$1"
    
    log_phase "⚡ QUICK IMPROVE"
    log_info "Task: $task"
    
    # Run Claude Code directly
    $CLAUDE_BIN "$task"
    
    log_success "Quick improve complete!"
}

# ============================================================================
# PARALLEL SWARM
# ============================================================================

run_swarm() {
    local tasks=("$@")
    
    log_phase "🐝 PARALLEL SWARM"
    log_info "Running ${#tasks[@]} tasks in parallel..."
    
    for i in "${!tasks[@]}"; do
        spawn_agent "swarm-$i" "${tasks[$i]}"
    done
    
    # Wait for all
    local pids=($(cat "$LOG_DIR"/agent-*.pid 2>/dev/null))
    wait_agents "${pids[@]}"
    
    log_success "Swarm complete!"
}

# ============================================================================
# ANALYSIS & RECOMMENDATIONS
# ============================================================================

analyze_improvements() {
    log_phase "📊 IMPROVEMENT ANALYSIS"
    
    # Analyze recent commits
    log_info "Recent self-improvement commits:"
    git log --oneline -10 --grep="self-improve" 2>/dev/null || echo "  No self-improve commits found"
    
    # Analyze quality trends
    log_info "\nQuality metrics trend:"
    npm run quality 2>&1 | grep -E "score|passed|failed" || echo "  Run npm run quality for metrics"
    
    # Recommendations
    log_info "\n💡 Recommendations for next improvement cycle:"
    echo "  1. Review failing tests and add coverage"
    echo "  2. Address any new lint warnings"
    echo "  3. Update documentation for new features"
    echo "  4. Add integration tests for CLI commands"
}

# ============================================================================
# USAGE
# ============================================================================

usage() {
    echo "Dash Self-Improvement Orchestration"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  self-improve     Run full self-improvement cycle"
    echo "  quick <task>     Run quick improvement task"
    echo "  swarm <task1> <task2> ...  Run parallel swarm"
    echo "  analyze          Analyze improvement trends"
    echo "  status           Check current quality status"
    echo ""
    echo "Examples:"
    echo "  $0 self-improve"
    echo "  $0 quick 'Fix all lint errors'"
    echo "  $0 swarm 'Fix lint' 'Add tests' 'Update docs'"
    echo "  $0 analyze"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    cd "$DASH_DIR"
    
    case "${1:-}" in
        self-improve)
            run_self_improve
            ;;
        quick)
            shift
            quick_improve "$*"
            ;;
        swarm)
            shift
            run_swarm "$@"
            ;;
        analyze)
            analyze_improvements
            ;;
        status)
            log_phase "📊 QUALITY STATUS"
            npm run quality
            npm test 2>&1 | grep -E "Tests:|Test Suites:"
            ;;
        help|--help|-h)
            usage
            ;;
        "")
            usage
            ;;
        *)
            echo "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

main "$@"

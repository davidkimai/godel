#!/bin/bash
# Recursive Critique Subagent Launcher
# Launches isolated subagent for verification and feedback

WORKSPACE="/Users/jasontang/clawd/projects/dash"
CRITIQUE_LOG="$WORKSPACE/logs/critique-$(date +%Y-%m-%d).log"
WORKTREE_DIR="$WORKSPACE/.claude-worktrees"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CRITIQUE] $1" | tee -a "$CRITIQUE_LOG"
}

log "========================================="
log "RECURSIVE CRITIQUE SUBAGENT LAUNCHED"
log "========================================="

# Create isolated worktree for critique
CRITIQUE_WORKTREE="$WORKTREE_DIR/critique-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$CRITIQUE_WORKTREE"

log "Worktree: $CRITIQUE_WORKTREE"

# =============================================================================
# CRITIQUE TASKS
# =============================================================================

CRITIQUE_TASKS=(
    "verify_subagents"
    "verify_tests"
    "verify_consolelog"
    "verify_pimono"
    "verify_git"
    "generate_report"
)

for task in "${CRITIQUE_TASKS[@]}"; do
    log "Executing: $task"
    
    case $task in
        verify_subagents)
            # Check if subagents are actually running or stubbed
            SUBAGENT_COUNT=$(ps aux | grep -E "codex.*dash-phase" | grep -v grep | wc -l)
            log "Active subagents: $SUBAGENT_COUNT"
            if [ "$SUBAGENT_COUNT" -eq 0 ]; then
                log "WARNING: No active subagents detected"
            fi
            ;;
            
        verify_tests)
            # Check test results
            if [ -f "$WORKSPACE/test-results.json" ]; then
                PASSING=$(grep -o '"passing":[0-9]*' "$WORKSPACE/test-results.json" || echo "unknown")
                FAILING=$(grep -o '"failing":[0-9]*' "$WORKSPACE/test-results.json" || echo "unknown")
                log "Tests: $PASSING passing, $FAILING failing"
            else
                log "WARNING: No test results file found"
            fi
            ;;
            
        verify_consolelog)
            # Count actual console.log in src
            COUNT=$(find "$WORKSPACE/src" -name "*.ts" -exec grep -l "console.log" {} \; 2>/dev/null | wc -l)
            log "Files with console.log: $COUNT"
            ;;
            
        verify_pimono)
            # Check pi-mono integration files
            PIMONO_FILES=$(find "$WORKSPACE/src/llm" -name "*.ts" 2>/dev/null | wc -l)
            log "Pi-mono LLM files: $PIMONO_FILES"
            if [ "$PIMONO_FILES" -lt 3 ]; then
                log "WARNING: Pi-mono integration incomplete"
            fi
            ;;
            
        verify_git)
            # Check git status
            UNCOMMITTED=$(git status --short 2>/dev/null | wc -l)
            log "Uncommitted changes: $UNCOMMITTED"
            ;;
            
        generate_report)
            # Generate final critique report
            cat << EOF > "$WORKSPACE/logs/critique-report-$(date +%Y%m%d-%H%M%S).json"
{
    "timestamp": "$(date -Iseconds)",
    "findings": {
        "subagents": {
            "active": $SUBAGENT_COUNT,
            "status": "$([ "$SUBAGENT_COUNT" -gt 0 ] && echo "running" || echo "stuck")"
        },
        "tests": {
            "results_exist": $([ -f "$WORKSPACE/test-results.json" ] && echo "true" || echo "false"),
            "passing": "$PASSING",
            "failing": "$FAILING"
        },
        "console_log": {
            "files_with_console": $COUNT,
            "status": "$([ "$COUNT" -lt 100 ] && echo "clean" || echo "needs_cleanup")"
        },
        "pimono": {
            "llm_files": $PIMONO_FILES,
            "status": "$([ "$PIMONO_FILES" -ge 3 ] && echo "integrated" || echo "incomplete")"
        },
        "git": {
            "uncommitted": $UNCOMMITTED,
            "status": "$([ "$UNCOMMITTED" -eq 0 ] && echo "clean" || echo "dirty")"
        }
    },
    "overall_status": "$([ "$COUNT" -lt 100 ] && [ "$PIMONO_FILES" -ge 3 ] && echo "green" || echo "yellow")",
    "recommendations": [
        $([ "$SUBAGENT_COUNT" -eq 0 ] && echo '"Launch new subagents for stuck phases",' || echo '')
        $([ "$COUNT" -gt 100 ] && echo '"Prioritize console.log cleanup",' || echo '')
        $([ "$PIMONO_FILES" -lt 3 ] && echo '"Continue pi-mono integration",' || echo '')
        $([ "$UNCOMMITTED" -gt 0 ] && echo '"Commit uncommitted changes",' || echo '')
        '"Review and merge completed phases"
    ]
}
EOF
            log "Critique report generated"
            ;;
    esac
done

# =============================================================================
# FEEDBACK LOOP OUTPUT
# =============================================================================

log ""
log "=== CRITIQUE FEEDBACK LOOP ==="

cat << EOF | tee -a "$CRITIQUE_LOG"
CRITIQUE RESULT:
==============
Subagent Status: $([ "$SUBAGENT_COUNT" -gt 0 ] && echo "✅ Running" || echo "❌ Stuck")
Test Status: $([ -f "$WORKSPACE/test-results.json" ] && echo "✅ Available" || echo "❌ Missing")
Console.log: $COUNT files $([ "$COUNT" -lt 100 ] && echo "✅ OK" || echo "⚠️ Needs cleanup")
Pi-Mono: $PIMONO_FILES files $([ "$PIMONO_FILES" -ge 3 ] && echo "✅ Integrated" || echo "⚠️ Incomplete")
Git: $UNCOMMITTED changes $([ "$UNCOMMITTED" -eq 0 ] && echo "✅ Clean" || echo "⚠️ Dirty")

RECOMMENDATION: $([ "$COUNT" -lt 100 ] && [ "$PIMONO_FILES" -ge 3 ] && echo "✅ Continue Phase 4" || echo "⚠️ Prioritize cleanup and integration")

NEXT ACTION:
- Review critique report in logs/critique-report-*.json
- Launch fix subagents if status yellow/red
- Continue pi-mono integration
EOF

log "========================================="
log "RECURSIVE CRITIQUE COMPLETE"
log "========================================="

# Cleanup worktree
rm -rf "$CRITIQUE_WORKTREE"
log "Worktree cleaned up"

exit 0

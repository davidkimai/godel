#!/bin/bash
# sprint-launcher.sh - Launch 5 parallel 10-minute swarms

set -e

SPRINT_DIR=".claude-worktrees/sprint-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SPRINT_DIR"

echo "🚀 Launching 5 parallel 10-minute swarms..."
echo "📁 Worktrees: $SPRINT_DIR"
echo "⏱️  Target: Complete in 10 minutes"
echo ""

# Function to run a swarm
run_swarm() {
    local name=$1
    local task=$2
    local dir=$SPRINT_DIR/$name
    
    echo "🔨 $name: $task"
    
    git worktree add "$dir" origin/main 2>/dev/null || true
    cd "$dir"
    
    # Run with strict 10-min timebox and self-improvement
    timeout 600 kimi -p "$task

TIMELINE: Complete in 10 minutes or less!

Required actions:
1. Read relevant context files first (2 min)
2. Make your changes (5 min)
3. Run: npm run build (verify no errors)
4. Run: npm test (verify tests pass)
5. git add -A && git commit -m 'sprint: $task...'

SELF-IMPROVEMENT: After main task, identify 1 way to improve the codebase and make that change too.

Output to: OUTPUT.md and commit on completion." > /dev/null 2>&1 &
    
    echo "   ✅ $name launched"
}

# Launch 5 parallel swarms
run_swarm "code-refactor" "Refactor error handling in src/core/llm.ts - Add proper error types and better messages"
run_swarm "docs-update" "Update README with quick start guide and architecture overview"
run_swarm "test-add" "Add unit tests for src/core/autonomous-state.ts - Cover init, pause, resume"
run_swarm "research-piai" "Research pi-ai streaming API - Output 5-bullet summary + code example"
run_swarm "opt-build" "Optimize npm run build - Identify slowest step and improve it"

echo ""
echo "✅ 5 parallel swarms launched!"
echo "⏱️  Will complete in ~10 minutes"
echo ""
echo "📊 Monitor with:"
echo "   git log --oneline --since='10 minutes ago'"
echo "   ps aux | grep 'kimi -p'"
echo ""
echo "🧹 Cleanup when done:"
echo "   rm -rf $SPRINT_DIR"
echo "   git worktree prune"

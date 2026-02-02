#!/bin/bash
# Dash + Claude Code CLI Integration
# Use Claude Code CLI directly for self-improvement workstreams

set -e

DASH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DASH_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 Dash + Claude Code CLI Integration${NC}"
echo "======================================="

# Function to run Claude Code in a worktree
run_claude() {
    local task="$1"
    local worktree="${2:-main}"
    local output_file="${3:-claude-output.json}"
    
    echo -e "${YELLOW}Running Claude Code in $worktree...${NC}"
    
    cd "../dash-$worktree"
    claude --output-format json "$task" > "../mission-control/logs/$output_file" 2>&1
    echo -e "${GREEN}✓ Completed: $output_file${NC}"
}

# Function to run quick fix
quick_fix() {
    local prompt="$1"
    echo -e "${YELLOW}Quick fix: $prompt${NC}"
    claude "$prompt"
}

# Function to create worktree and run Claude
spawn_worktree() {
    local name="$1"
    local branch="$2"
    local task="$3"
    
    echo -e "${BLUE}Creating worktree '$name' for: $task${NC}"
    
    # Create worktree if it doesn't exist
    if [ ! -d "../dash-$name" ]; then
        git worktree add -b "$branch" "../dash-$name" main
    fi
    
    # Run Claude Code in the worktree
    cd "../dash-$name"
    claude "$task" > "../../mission-control/logs/claude-$name.log" 2>&1
    
    echo -e "${GREEN}✓ Worktree '$name' complete${NC}"
}

# Function to run parallel workstreams
run_parallel() {
    local tasks=("$@")
    
    echo -e "${BLUE}Running ${#tasks[@]} parallel workstreams...${NC}"
    
    for i in "${!tasks[@]}"; do
        local name="parallel-$i"
        local task="${tasks[$i]}"
        
        # Run in background
        spawn_worktree "$name" "claude-$name" "$task" &
        PIDS+=($!)
    done
    
    # Wait for all to complete
    for pid in "${PIDS[@]}"; do
        wait "$pid"
    done
    
    echo -e "${GREEN}✓ All parallel workstreams complete${NC}"
}

# Main usage info
usage() {
    echo "Usage: ./dash-claude-code.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  quick [prompt]        - Run quick Claude Code task"
    echo "  worktree [name] [branch] [task] - Create worktree and run Claude"
    echo "  parallel [task1] [task2] ... - Run multiple tasks in parallel"
    echo "  analyze [file]        - Analyze a file or directory"
    echo "  test [description]    - Write/improve tests"
    echo "  fix [description]     - Fix bugs or issues"
    echo "  refactor [description] - Refactor code"
    echo "  review [description]  - Code review"
    echo "  self-improve          - Run full self-improvement cycle"
    echo ""
    echo "Examples:"
    echo "  ./dash-claude-code.sh quick 'Fix the failing CI tests'"
    echo "  ./dash-claude-code.sh worktree quality quality-fix 'Fix all lint errors'"
    echo "  ./dash-claude-code.sh test 'Add tests for testing module'"
    echo "  ./dash-claude-code.sh self-improve"
}

# Self-improvement cycle
self_improve() {
    echo -e "${BLUE}🔄 Starting Dash Self-Improvement Cycle${NC}"
    echo "========================================="
    
    # Create logs directory
    mkdir -p logs
    
    # Phase 1: Quality Assessment
    echo -e "${YELLOW}Phase 1: Running quality assessment...${NC}"
    claude "Run 'npm run quality' and analyze the results. Identify the top 5 issues to fix. Output a summary of findings."
    
    # Phase 2: Quick Fixes
    echo -e "${YELLOW}Phase 2: Applying quick fixes...${NC}"
    claude "Fix all lint errors in src/ using 'npm run lint:fix'. Report what was fixed."
    
    # Phase 3: Test Improvements
    echo -e "${YELLOW}Phase 3: Improving test coverage...${NC}"
    claude "Analyze test coverage and identify the lowest coverage files. Add tests to improve coverage by 5%."
    
    # Phase 4: Documentation
    echo -e "${YELLOW}Phase 4: Updating documentation...${NC}"
    claude "Review recent changes and update CHANGELOG.md with the improvements made."
    
    # Phase 5: Commit
    echo -e "${YELLOW}Phase 5: Committing improvements...${NC}"
    git add -A
    git commit -m "feat(self-improve): Claude Code CLI self-improvement cycle $(date +%Y-%m-%d)"
    git push origin main
    
    echo -e "${GREEN}✅ Self-improvement cycle complete!${NC}"
}

# Parse command
case "${1:-}" in
    quick)
        shift
        quick_fix "$*"
        ;;
    worktree)
        shift
        spawn_worktree "$1" "$2" "$3"
        ;;
    parallel)
        shift
        run_parallel "$@"
        ;;
    analyze)
        shift
        claude "Analyze $1 thoroughly. Identify patterns, issues, and improvement opportunities."
        ;;
    test)
        shift
        claude "Write comprehensive tests for: $1. Aim for 70%+ coverage. Use existing test patterns."
        ;;
    fix)
        shift
        claude "Fix the following issue: $1. Run tests to verify the fix works."
        ;;
    refactor)
        shift
        claude "Refactor: $1. Focus on code quality, readability, and maintainability."
        ;;
    review)
        shift
        claude "Review: $1. Be critical. Identify issues, suggest improvements, and ensure code quality."
        ;;
    self-improve)
        self_improve
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

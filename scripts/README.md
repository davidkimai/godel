# Dash Scripts

This directory contains utility scripts for Dash self-improvement and orchestration.

## dash-claude-code.sh

**Purpose:** Integrate Claude Code CLI directly with Dash for parallel workstreams.

### Usage

```bash
# Run quick tasks
./scripts/dash-claude-code.sh quick "Fix the failing CI tests"

# Create worktree and run Claude
./scripts/dash-claude-code.sh worktree quality quality-fix "Fix all lint errors"

# Run parallel workstreams
./scripts/dash-claude-code.sh parallel \
  "Fix lint errors in src/cli" \
  "Add tests for testing module" \
  "Update documentation" \
  "Refactor context module"

# Self-improvement cycle
./scripts/dash-claude-code.sh self-improve
```

### Features

- **Quick fixes:** Fast Claude Code tasks without worktrees
- **Worktree spawning:** Creates git worktrees for focused Claude sessions
- **Parallel execution:** Run multiple tasks simultaneously
- **Self-improvement cycle:** Full assessment → fixes → tests → documentation → commit

### Integration

Claude Code CLI is installed at: `/Users/jasontang/.local/bin/claude`

This script orchestrates Claude Code to work with Dash's self-improvement loop:
1. Quality assessment via Claude Code
2. Automated fixes using Claude Code
3. Test coverage improvements
4. Documentation updates
5. Automated commits

### Benefits

- **Zero context switching:** Claude Code runs directly in worktrees
- **Parallel execution:** Multiple Claude sessions running simultaneously
- **Self-improving:** Dash uses Claude Code to improve itself
- **Audit trail:** All Claude Code outputs logged to `logs/` directory

### Examples

```bash
# Analyze a specific file
./scripts/dash-claude-code.sh analyze src/cli/main.ts

# Add tests for a module
./scripts/dash-claude-code.sh test "Add tests for quality module"

# Fix bugs
./scripts/dash-claude-code.sh fix "Fix type errors in dependencies.ts"

# Code review
./scripts/dash-claude-code.sh review "Review the event system for issues"

# Run full self-improvement cycle
./scripts/dash-claude-code.sh self-improve
```

### Output

All Claude Code outputs are saved to:
- `logs/claude-[worktree-name].log` - Worktree outputs
- `logs/claude-output.json` - JSON formatted outputs

### See Also

- `/Users/jasontang/clawd/HEARTBEAT_CLAUDE_CODE.md` - Orchestrator guide
- `/Users/jasontang/clawd/CLAUDE_CODE_QUICK_REF.md` - Quick reference
- https://github.com/anthropics/claude-code - Claude Code CLI repository

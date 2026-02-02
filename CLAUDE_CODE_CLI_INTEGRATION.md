# Claude Code CLI Integration for Dash

**Date:** 2026-02-01
**Status:** Active
**Repository:** https://github.com/anthropics/claude-code

## Overview

Dash now integrates directly with Claude Code CLI for enhanced self-improvement capabilities. This enables parallel workstreams, quick fixes, and automated quality improvements.

## Quick Start

```bash
# Check Claude Code is installed
which claude
# Output: /Users/jasontang/.local/bin/claude

# Run Dash self-improvement cycle
./scripts/dash-claude-code.sh self-improve

# Quick fix
./scripts/dash-claude-code.sh quick "Fix the failing CI tests"

# Parallel workstreams
./scripts/dash-claude-code.sh parallel \
  "Fix lint errors" \
  "Add tests" \
  "Update docs"
```

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dash (Main Session)                      │
│  - Orchestrates self-improvement cycles                     │
│  - Manages quality gates                                    │
│  - Coordinates subagents                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Claude Code CLI Integration                    │
│  - Direct Claude Code execution                             │
│  - Worktree spawning                                        │
│  - Parallel workstreams                                     │
│  - Zero context switching                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │Worktree A│ │Worktree B│ │Worktree C│
    │Claude    │ │Claude    │ │Claude    │
    │Session   │ │Session   │ │Session   │
    └──────────┘ └──────────┘ └──────────┘
```

## Available Commands

### Quick Tasks
```bash
./scripts/dash-claude-code.sh quick "Fix the failing CI tests"
./scripts/dash-claude-code.sh quick "Add error handling to main.ts"
```

### Worktree Spawning
```bash
# Create worktree and run Claude
./scripts/dash-claude-code.sh worktree quality quality-fix "Fix all lint errors"
./scripts/dash-claude-code.sh worktree tests test-coverage "Boost test coverage"
```

### Parallel Execution
```bash
./scripts/dash-claude-code.sh parallel \
  "Fix lint errors in src/cli" \
  "Add tests for testing module" \
  "Update CHANGELOG.md" \
  "Refactor context module"
```

### Specialized Tasks
```bash
./scripts/dash-claude-code.sh analyze src/cli/
./scripts/dash-claude-code.sh test "Add tests for quality gates"
./scripts/dash-claude-code.sh fix "Fix type errors in dependencies.ts"
./scripts/dash-claude-code.sh refactor "Refactor event system"
./scripts/dash-claude-code.sh review "Review CLI commands for issues"
```

### Self-Improvement Cycle
```bash
./scripts/dash-claude-code.sh self-improve
```

This runs:
1. Quality assessment
2. Quick fixes
3. Test improvements
4. Documentation updates
5. Automated commit

## Use Cases

### 1. Quick Bug Fixes
```bash
./scripts/dash-claude-code.sh quick "Fix the type error in context/dependencies.ts"
```

### 2. Parallel Development
```bash
# Terminal 1: Main development
cd mission-control
claude "Implement new feature"

# Terminal 2: Testing
cd ../dash-test
claude "Write comprehensive tests"

# Terminal 3: Documentation  
cd ../dash-docs
claude "Update documentation"

# Terminal 4: Review
cd ../dash-review
claude "Review implementation and suggest improvements"
```

### 3. Self-Improvement Loop
```bash
./scripts/dash-claude-code.sh self-improve
```

This automates:
- Quality gate assessment
- Automated fixes
- Test coverage improvements
- Documentation updates
- Git commit and push

## Benefits

### Zero Context Switching
Claude Code runs directly in worktrees without needing to switch contexts or copy code.

### Parallel Execution
Multiple Claude sessions running simultaneously for faster completion.

### Self-Improving
Dash uses Claude Code to improve itself - the ultimate feedback loop.

### Audit Trail
All Claude Code outputs logged to `logs/` directory for review.

## Configuration

### Shell Aliases
Add to `~/.zshrc` for quick access:
```bash
alias dqc='cd ~/clawd/projects/mission-control && ./scripts/dash-claude-code.sh'
alias dqc-fix='cd ~/clawd/projects/mission-control && ./scripts/dash-claude-code.sh quick'
alias dqc-test='cd ~/clawd/projects/mission-control && ./scripts/dash-claude-code.sh test'
alias dqc-improve='cd ~/clawd/projects/mission-control && ./scripts/dash-claude-code.sh self-improve'
```

### Worktree Setup
```bash
# Create worktrees for Claude Code
git worktree add -b quality ../dash-quality main
git worktree add -b tests ../dash-tests main
git worktree add -b docs ../dash-docs main
git worktree add -b review ../dash-review main
```

## Integration with OpenClaw

Claude Code CLI complements OpenClaw's subagent system:

| Tool | Use Case |
|------|----------|
| OpenClaw sessions_spawn | Orchestrate subagents in current session |
| Claude Code CLI | Parallel worktrees with isolated Claude sessions |
| Git worktrees | Create isolated environments for parallel work |

**Pattern:**
1. Use OpenClaw for main orchestration
2. Use Claude Code CLI for intensive parallel work
3. Use worktrees for context isolation

## Best Practices

### 1. One Worktree Per Task
Each worktree should focus on one task to maintain context cleanliness.

### 2. Commit Frequently
Claude Code changes should be committed regularly to maintain git trail.

### 3. Use Quality Gates
Always run `npm run quality` after Claude Code changes.

### 4. Review Outputs
Check `logs/` directory for Claude Code outputs and verify changes.

### 5. Document Lessons
Update AGENTS.md after corrections from Claude Code interactions.

## Troubleshooting

### Claude Code Not Found
```bash
# Check installation
which claude
# If not found, install via:
npm install -g @anthropic-ai/claude-code-cli
```

### Worktree Already Exists
```bash
# Remove and recreate
git worktree remove ../dash-worktree
./scripts/dash-claude-code.sh worktree worktree-name branch "Task"
```

### Permission Issues
```bash
# Make script executable
chmod +x ./scripts/dash-claude-code.sh
```

## References

- **Claude Code CLI:** https://github.com/anthropics/claude-code
- **Dash Repository:** https://github.com/davidkimai/dash
- **OpenClaw:** https://github.com/openclaw/openclaw
- **Worktree Documentation:** https://code.claude.com/docs/en/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees

## Future Enhancements

- [ ] MCP server integration for Slack, GitHub, databases
- [ ] Scheduled self-improvement cycles via cron
- [ ] Automated PR creation from Claude Code changes
- [ ] Integration with CI/CD pipelines
- [ ] Custom Claude Code prompts for Dash-specific tasks

---

**Status:** ✅ Active and Integrated
**Next Step:** Run `./scripts/dash-claude-code.sh self-improve` to test the loop
